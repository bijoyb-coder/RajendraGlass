using System.Data;
using System.Security.Claims;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Integration;
using RajendraGlass.Api.Models;
using RajendraGlass.Api.Realtime;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/invoices")]
[Authorize]
public class InvoicesController(IDbConnectionFactory db, IEInvoiceGateway eInvoiceGateway, INotificationPublisher notifications) : ControllerBase
{
    [HttpGet]
    public IActionResult List([FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string? search = null)
    {
        using var conn = db.CreateConnection();
        var offset = (page - 1) * pageSize;
        var rows = conn.Query<InvoiceDto>(
            @"SELECT i.InvoiceId, i.InvoiceNo, i.BranchId, i.CustomerId, c.Name AS CustomerName, c.Gstin AS CustomerGstin,
                     i.InvoiceDate, i.PlaceOfSupply, i.CustomerOrderRef, i.TransporterId, t.Name AS TransporterName,
                     i.VehicleNo, i.Destination, i.BasicValue, i.DiscountValue, i.TaxableValue, i.CgstValue, i.SgstValue,
                     i.IgstValue, i.RoundOff, i.TotalValue, i.Status, i.EwayBillNo, i.Remarks,
                     i.IrnNo, i.IrnAckNo, i.IrnAckDate, i.EInvoiceStatus, i.SalesOrderId, o.OrderNo,
                     CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM Finance.Voucher v WHERE v.InvoiceId = i.InvoiceId)
                               AND NOT EXISTS (SELECT 1 FROM Sales.InvoicePayment ip WHERE ip.InvoiceId = i.InvoiceId)
                               AND NOT EXISTS (SELECT 1 FROM Dispatch.Waybill w WHERE w.InvoiceId = i.InvoiceId)
                               AND NOT EXISTS (SELECT 1 FROM CRM.Complaint cm WHERE cm.InvoiceId = i.InvoiceId)
                          THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Sales.Invoice i
              JOIN Master.Customer c ON c.CustomerId = i.CustomerId
              LEFT JOIN Master.Transporter t ON t.TransporterId = i.TransporterId
              LEFT JOIN Sales.SalesOrder o ON o.SalesOrderId = i.SalesOrderId
              WHERE (@search IS NULL OR i.InvoiceNo LIKE '%' + @search + '%' OR c.Name LIKE '%' + @search + '%')
              ORDER BY i.InvoiceId DESC
              OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY", new { search, offset, pageSize });

        var total = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.Invoice");
        return Ok(new { items = rows, total, page, pageSize });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var invoice = conn.QueryFirstOrDefault<InvoiceDto>(
            @"SELECT i.InvoiceId, i.InvoiceNo, i.BranchId, i.CustomerId, c.Name AS CustomerName, c.Gstin AS CustomerGstin,
                     c.BillingAddress AS CustomerAddress, i.InvoiceDate, i.PlaceOfSupply, i.CustomerOrderRef, i.TransporterId,
                     t.Name AS TransporterName, i.VehicleNo, i.Destination, i.BasicValue, i.DiscountValue, i.TaxableValue,
                     i.CgstValue, i.SgstValue, i.IgstValue, i.RoundOff, i.TotalValue, i.Status, i.EwayBillNo, i.Remarks,
                     i.IrnNo, i.IrnAckNo, i.IrnAckDate, i.IrnQrPayload, i.EInvoiceStatus, i.SalesOrderId, o.OrderNo
              FROM Sales.Invoice i
              JOIN Master.Customer c ON c.CustomerId = i.CustomerId
              LEFT JOIN Master.Transporter t ON t.TransporterId = i.TransporterId
              LEFT JOIN Sales.SalesOrder o ON o.SalesOrderId = i.SalesOrderId
              WHERE i.InvoiceId = @id", new { id });
        if (invoice is null) return NotFound();

        invoice.Lines = conn.Query<InvoiceLineDto>(
            @"SELECT l.InvoiceLineId, l.LineNumber, l.ProductId, p.Code AS ProductCode, l.Description, l.NoOfSheets,
                     l.Quantity, l.RatePerUnit, l.BasicValue, l.DiscountValue, l.NetValue, l.GstRatePct
              FROM Sales.InvoiceLine l JOIN Master.Product p ON p.ProductId = l.ProductId
              WHERE l.InvoiceId = @id ORDER BY l.LineNumber", new { id }).ToList();

        return Ok(invoice);
    }

    /// <summary>Deletable only while no payment has been recorded against this invoice yet (no
    /// Voucher, no Counter-Billing InvoicePayment) and no waybill or complaint references it —
    /// the same "nothing generated against it yet" rule used for Quotations and Sales Orders.</summary>
    [RequirePermission("Invoice.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Sales.Invoice WHERE InvoiceId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            var hasPayment = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Finance.Voucher WHERE InvoiceId = @id", new { id }, tx) > 0
                || conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.InvoicePayment WHERE InvoiceId = @id", new { id }, tx) > 0;
            if (hasPayment)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Invoice has a payment", Status = 409, ErrorCode = "INVOICE_HAS_PAYMENT", Detail = "A payment has already been recorded against this invoice; it cannot be deleted." });
            }
            var hasWaybill = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Dispatch.Waybill WHERE InvoiceId = @id", new { id }, tx) > 0;
            if (hasWaybill)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Invoice has a waybill", Status = 409, ErrorCode = "INVOICE_HAS_WAYBILL", Detail = "A waybill has already been generated against this invoice; it cannot be deleted." });
            }
            var hasComplaint = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM CRM.Complaint WHERE InvoiceId = @id", new { id }, tx) > 0;
            if (hasComplaint)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Invoice has a complaint", Status = 409, ErrorCode = "INVOICE_HAS_COMPLAINT", Detail = "A complaint is linked to this invoice; it cannot be deleted." });
            }

            var lines = conn.Query("SELECT * FROM Sales.InvoiceLine WHERE InvoiceId = @id", new { id }, tx).ToList();

            conn.Execute("DELETE FROM Sales.InvoiceLine WHERE InvoiceId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Sales.Invoice WHERE InvoiceId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Invoice", id.ToString(), new { Invoice = header, Lines = lines });
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("Invoice.Create")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateInvoiceRequest req)
    {
        if (req.Lines.Count == 0)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "No line items", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "An invoice must have at least one line item." });
        }

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            if (req.SalesOrderId.HasValue)
            {
                // Once an order carries a non-cancelled invoice, it's locked from being invoiced
                // again — mirrors the Quotation -> Sales Order 'Converted' guard.
                var existingInvoiceNo = conn.QueryFirstOrDefault<string>(
                    "SELECT InvoiceNo FROM Sales.Invoice WHERE SalesOrderId = @SalesOrderId AND Status <> 'Cancelled'",
                    new { req.SalesOrderId }, tx);
                if (existingInvoiceNo is not null)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Already invoiced", Status = 422, ErrorCode = "ORDER_ALREADY_INVOICED", Detail = $"This sales order has already been invoiced as {existingInvoiceNo}." });
                }
                var orderExists = conn.ExecuteScalar<int>(
                    "SELECT COUNT(*) FROM Sales.SalesOrder WHERE SalesOrderId = @SalesOrderId", new { req.SalesOrderId }, tx);
                if (orderExists == 0)
                {
                    tx.Rollback();
                    return NotFound(new ProblemResponse { Title = "Sales order not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The referenced sales order does not exist." });
                }
            }

            var branch = conn.QueryFirstOrDefault(
                "SELECT TOP 1 BranchId, StateCode FROM Company.Branch WHERE IsActive = 1", transaction: tx);
            if (branch is null)
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse { Title = "No branch configured", Status = 422, ErrorCode = "BRANCH_REQUIRED", Detail = "No active branch is configured." });
            }
            int branchId = branch.BranchId;
            string branchState = branch.StateCode ?? "19";

            var customer = conn.QueryFirstOrDefault(
                "SELECT StateCode, StateName, CreditLimit, CreditBlocked FROM Master.Customer WHERE CustomerId = @CustomerId",
                new { req.CustomerId }, transaction: tx);
            if (customer is null)
            {
                tx.Rollback();
                return NotFound(new ProblemResponse { Title = "Customer not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "Customer does not exist." });
            }
            if ((bool)customer.CreditBlocked)
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse { Title = "Credit blocked", Status = 422, ErrorCode = "CREDIT_BLOCK", Detail = "This customer is blocked for credit. Release the block before invoicing." });
            }
            string customerState = customer.StateCode ?? branchState;

            // Server-side pricing: re-derive from product master (never trust client rate blindly for min-price checks).
            decimal basic = 0, discount = 0;
            var lineRows = new List<(int ProductId, decimal? NoOfSheets, decimal Qty, decimal Rate, decimal Disc, decimal Net, decimal Gst)>();
            int lineNo = 1;
            foreach (var line in req.Lines)
            {
                var product = conn.QueryFirstOrDefault(
                    "SELECT Description, GstRatePct, MinSellingPrice FROM Master.Product WHERE ProductId = @ProductId AND IsActive = 1",
                    new { line.ProductId }, transaction: tx);
                if (product is null)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid product", Status = 422, ErrorCode = "PRODUCT_NOT_FOUND", Detail = $"Product {line.ProductId} not found or inactive." });
                }
                decimal? minPrice = product.MinSellingPrice;
                if (minPrice.HasValue && line.RatePerUnit < minPrice.Value)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Price below minimum", Status = 422, ErrorCode = "PRICE_BELOW_MIN", Detail = $"Rate {line.RatePerUnit} is below the minimum selling price {minPrice} for this product." });
                }
                decimal lineBasic = Math.Round(line.Quantity * line.RatePerUnit, 2);
                decimal lineNet = lineBasic - line.DiscountValue;
                basic += lineBasic;
                discount += line.DiscountValue;
                lineRows.Add((line.ProductId, line.NoOfSheets, line.Quantity, line.RatePerUnit, line.DiscountValue, lineNet, (decimal)product.GstRatePct));
                lineNo++;
            }

            decimal taxable = basic - discount;
            bool interState = !string.Equals(branchState, customerState, StringComparison.OrdinalIgnoreCase);
            decimal avgGst = lineRows.Count > 0 ? lineRows.Average(l => l.Gst) : 18m;
            decimal cgst = 0, sgst = 0, igst = 0;
            // Compute tax per-line for accuracy, using each line's own GST rate.
            decimal taxTotal = 0;
            foreach (var l in lineRows)
            {
                decimal lineTax = Math.Round(l.Net * l.Gst / 100m, 2);
                taxTotal += lineTax;
            }
            if (interState) igst = taxTotal; else { cgst = Math.Round(taxTotal / 2m, 2); sgst = taxTotal - cgst; }

            decimal totalBeforeRound = taxable + cgst + sgst + igst;
            decimal rounded = Math.Round(totalBeforeRound, 0, MidpointRounding.AwayFromZero);
            decimal roundOff = rounded - totalBeforeRound;

            // Unbroken document numbering per branch per FY, serialised with UPDLOCK/HOLDLOCK.
            var fy = FinancialYearFor(req.InvoiceDate ?? DateTime.Today);
            var series = conn.QueryFirstOrDefault(
                @"SELECT DocSeriesId, Prefix, NextNumber FROM Company.DocSeries WITH (UPDLOCK, HOLDLOCK)
                  WHERE BranchId = @branchId AND DocType = 'Invoice' AND FinancialYear = @fy",
                new { branchId, fy }, transaction: tx);
            if (series is null)
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse { Title = "Numbering series missing", Status = 422, ErrorCode = "DOC_SERIES_MISSING", Detail = $"No invoice numbering series configured for FY {fy}." });
            }
            int nextNumber = series.NextNumber;
            string invoiceNo = $"{series.Prefix}{nextNumber:D5}";
            conn.Execute("UPDATE Company.DocSeries SET NextNumber = NextNumber + 1 WHERE DocSeriesId = @id",
                new { id = (int)series.DocSeriesId }, transaction: tx);

            var invoiceId = conn.ExecuteScalar<int>(
                @"INSERT INTO Sales.Invoice
                    (InvoiceNo, BranchId, CustomerId, SalesOrderId, InvoiceDate, PlaceOfSupply, CustomerOrderRef, TransporterId, VehicleNo, Destination,
                     BasicValue, DiscountValue, TaxableValue, CgstValue, SgstValue, IgstValue, RoundOff, TotalValue, Status, Remarks)
                  OUTPUT INSERTED.InvoiceId
                  VALUES
                    (@invoiceNo, @branchId, @CustomerId, @SalesOrderId, @InvoiceDate, @PlaceOfSupply, @CustomerOrderRef, @TransporterId, @VehicleNo, @Destination,
                     @basic, @discount, @taxable, @cgst, @sgst, @igst, @roundOff, @rounded, 'Approved', @Remarks)",
                new
                {
                    invoiceNo,
                    branchId,
                    req.CustomerId,
                    req.SalesOrderId,
                    InvoiceDate = req.InvoiceDate ?? DateTime.Today,
                    PlaceOfSupply = req.PlaceOfSupply ?? customer.StateName,
                    req.CustomerOrderRef,
                    req.TransporterId,
                    req.VehicleNo,
                    req.Destination,
                    basic,
                    discount,
                    taxable,
                    cgst,
                    sgst,
                    igst,
                    roundOff,
                    rounded,
                    req.Remarks
                }, tx);

            int ln = 1;
            foreach (var l in lineRows)
            {
                conn.Execute(
                    @"INSERT INTO Sales.InvoiceLine (InvoiceId, LineNumber, ProductId, NoOfSheets, Quantity, RatePerUnit, BasicValue, DiscountValue, NetValue, GstRatePct)
                      VALUES (@invoiceId, @ln, @ProductId, @NoOfSheets, @Qty, @Rate, @LineBasic, @Disc, @Net, @Gst)",
                    new { invoiceId, ln, l.ProductId, l.NoOfSheets, l.Qty, l.Rate, LineBasic = Math.Round(l.Qty * l.Rate, 2), l.Disc, l.Net, l.Gst }, tx);
                ln++;
            }

            conn.Execute(@"INSERT INTO Security.AuditLog (Action, Entity, EntityId, AfterJson) VALUES ('Create', 'Invoice', @EntityId, @AfterJson)",
                new { EntityId = invoiceId.ToString(), AfterJson = System.Text.Json.JsonSerializer.Serialize(new { invoiceNo, rounded }) }, tx);

            tx.Commit();

            // Domain event fires only after the transaction actually commits (SDD 10.1) — a
            // rolled-back invoice must never notify anyone.
            await notifications.PublishToRoleAsync("Owner", "InvoiceCreated", $"New invoice {invoiceNo}",
                $"₹{rounded:N0}", $"/sales/invoices/{invoiceId}");

            var created = (Get(invoiceId) as OkObjectResult)?.Value;
            return CreatedAtAction(nameof(Get), new { id = invoiceId }, created);
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("Invoice.Cancel")]
    [HttpPost("{id:int}/cancel")]
    public IActionResult Cancel(int id, [FromBody] CancelRequest req)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Execute("UPDATE Sales.Invoice SET Status = 'Cancelled', Remarks = CONCAT(ISNULL(Remarks,''), ' | Cancelled: ', @Reason) WHERE InvoiceId = @id AND Status <> 'Cancelled'",
            new { id, req.Reason });
        return rows == 0 ? NotFound() : NoContent();
    }

    /// <summary>Generates an IRN for this invoice via the e-Invoice (IRP) gateway (SDD 10.2, API 9.4 /
    /// Section 18). Uses whichever IEInvoiceGateway is registered — Mock by default in this
    /// environment, or a real GSP once GstIntegration:Provider=Real is configured.</summary>
    [RequirePermission("Invoice.EInvoice")]
    [HttpPost("{id:int}/e-invoice")]
    public async Task<IActionResult> GenerateEInvoice(int id)
    {
        using var conn = db.CreateConnection();
        var invoice = conn.QueryFirstOrDefault(
            "SELECT InvoiceId, InvoiceNo, InvoiceDate, CustomerId, PlaceOfSupply, TaxableValue, CgstValue, SgstValue, IgstValue, TotalValue, Status, EInvoiceStatus FROM Sales.Invoice WHERE InvoiceId = @id", new { id });
        if (invoice is null) return NotFound();
        if ((string)invoice.Status == "Cancelled")
            return UnprocessableEntity(new ProblemResponse { Title = "Invoice cancelled", Status = 422, ErrorCode = "INVOICE_CANCELLED", Detail = "A cancelled invoice cannot be e-invoiced." });
        if ((string)invoice.EInvoiceStatus == "Generated")
            return Conflict(new ProblemResponse { Title = "Already generated", Status = 409, ErrorCode = "IRN_ALREADY_GENERATED", Detail = "This invoice already has an active IRN. Cancel it first to regenerate." });

        var company = conn.QueryFirstOrDefault("SELECT TOP 1 LegalName, Gstin, BusinessAddress FROM Company.Company");
        var branch = conn.QueryFirstOrDefault("SELECT TOP 1 StateCode FROM Company.Branch WHERE IsActive = 1");
        var customer = conn.QueryFirstOrDefault("SELECT Name, Gstin, BillingAddress, StateCode FROM Master.Customer WHERE CustomerId = @CustomerId", new { invoice.CustomerId });
        var lines = conn.Query(
            @"SELECT p.HsnCode, p.Description, l.Quantity, l.RatePerUnit, l.NetValue, l.GstRatePct
              FROM Sales.InvoiceLine l JOIN Master.Product p ON p.ProductId = l.ProductId WHERE l.InvoiceId = @id", new { id }).ToList();

        var req = new EInvoiceRequest
        {
            DocNo = invoice.InvoiceNo,
            DocDt = invoice.InvoiceDate,
            SellerGstin = company?.Gstin ?? "",
            SellerLglNm = company?.LegalName ?? "",
            SellerAddr1 = company?.BusinessAddress ?? "",
            SellerLoc = "Kolkata",
            SellerPin = "700056",
            SellerStcd = branch?.StateCode ?? "19",
            BuyerGstin = customer?.Gstin ?? "",
            BuyerLglNm = customer?.Name ?? "",
            BuyerPos = customer?.StateCode ?? branch?.StateCode ?? "19",
            BuyerAddr1 = customer?.BillingAddress ?? "",
            BuyerLoc = "",
            BuyerPin = "",
            BuyerStcd = customer?.StateCode ?? branch?.StateCode ?? "19",
            AssVal = invoice.TaxableValue,
            CgstVal = invoice.CgstValue,
            SgstVal = invoice.SgstValue,
            IgstVal = invoice.IgstValue,
            TotInvVal = invoice.TotalValue,
            ItemList = lines.Select((l, i) => new EInvoiceItemLine
            {
                SlNo = i + 1,
                HsnCd = l.HsnCode ?? "70051010",
                PrdDesc = l.Description ?? "",
                Qty = l.Quantity,
                UnitPrice = l.RatePerUnit,
                TotAmt = l.NetValue,
                AssAmt = l.NetValue,
                GstRt = l.GstRatePct,
                TotItemVal = l.NetValue * (1 + l.GstRatePct / 100m),
            }).ToList(),
        };

        var sw = System.Diagnostics.Stopwatch.StartNew();
        EInvoiceResult result;
        try
        {
            result = await eInvoiceGateway.GenerateIrnAsync(req);
        }
        catch (Exception ex)
        {
            result = new EInvoiceResult { Success = false, ErrorCode = "EXCEPTION", ErrorMessage = ex.Message };
        }
        sw.Stop();

        LogGatewayCall(conn, "EInvoice", "Generate", eInvoiceGateway.ProviderName, "Invoice", id, req, result, result.Success, result.ErrorMessage, (int)sw.ElapsedMilliseconds);

        if (!result.Success)
        {
            conn.Execute("UPDATE Sales.Invoice SET EInvoiceStatus = 'Failed' WHERE InvoiceId = @id", new { id });
            return UnprocessableEntity(new ProblemResponse { Title = "e-Invoice generation failed", Status = 422, ErrorCode = result.ErrorCode ?? "EINVOICE_FAILED", Detail = result.ErrorMessage ?? "The gateway rejected the request." });
        }

        conn.Execute(
            @"UPDATE Sales.Invoice SET IrnNo=@Irn, IrnAckNo=@AckNo, IrnAckDate=@AckDt, IrnQrPayload=@Qr, EInvoiceStatus='Generated' WHERE InvoiceId = @id",
            new { result.Irn, result.AckNo, result.AckDt, Qr = result.QrPayload, id });

        var currentUserId = int.Parse(User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)!);
        await notifications.PublishToUserAsync(currentUserId, "EInvoiceGenerated", "e-Invoice generated",
            $"IRN issued for invoice #{id}", $"/sales/invoices/{id}");

        return Ok(new { irn = result.Irn, ackNo = result.AckNo, ackDate = result.AckDt, qrPayload = result.QrPayload, provider = eInvoiceGateway.ProviderName });
    }

    [RequirePermission("Invoice.EInvoice")]
    [HttpPost("{id:int}/e-invoice/cancel")]
    public async Task<IActionResult> CancelEInvoice(int id, [FromBody] CancelRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Reason))
            return UnprocessableEntity(new ProblemResponse { Title = "Reason required", Status = 422, ErrorCode = "REASON_REQUIRED", Detail = "A cancellation reason is mandatory." });

        using var conn = db.CreateConnection();
        var invoice = conn.QueryFirstOrDefault("SELECT IrnNo, EInvoiceStatus FROM Sales.Invoice WHERE InvoiceId = @id", new { id });
        if (invoice is null) return NotFound();
        if ((string)invoice.EInvoiceStatus != "Generated" || invoice.IrnNo is null)
            return UnprocessableEntity(new ProblemResponse { Title = "No active IRN", Status = 422, ErrorCode = "NO_ACTIVE_IRN", Detail = "This invoice has no active e-Invoice to cancel." });

        var sw = System.Diagnostics.Stopwatch.StartNew();
        var result = await eInvoiceGateway.CancelIrnAsync((string)invoice.IrnNo, req.Reason);
        sw.Stop();

        LogGatewayCall(conn, "EInvoice", "Cancel", eInvoiceGateway.ProviderName, "Invoice", id, new { irn = invoice.IrnNo, req.Reason }, result, result.Success, result.ErrorMessage, (int)sw.ElapsedMilliseconds);

        if (!result.Success)
            return UnprocessableEntity(new ProblemResponse { Title = "Cancellation failed", Status = 422, ErrorCode = result.ErrorCode ?? "CANCEL_FAILED", Detail = result.ErrorMessage ?? "The gateway rejected the cancellation." });

        conn.Execute("UPDATE Sales.Invoice SET EInvoiceStatus = 'Cancelled' WHERE InvoiceId = @id", new { id });
        return NoContent();
    }

    private static void LogGatewayCall(IDbConnection conn, string gatewayType, string operation, string provider, string docType, int docId, object request, object response, bool success, string? error, int durationMs)
        => GatewayLogger.Log(conn, gatewayType, operation, provider, docType, docId, request, response, success, error, durationMs);

    private static string FinancialYearFor(DateTime date)
    {
        // Indian FY: 1 Apr - 31 Mar
        int startYear = date.Month >= 4 ? date.Year : date.Year - 1;
        return $"{startYear}-{startYear + 1}";
    }
}

public class CancelRequest
{
    public string Reason { get; set; } = "";
}
