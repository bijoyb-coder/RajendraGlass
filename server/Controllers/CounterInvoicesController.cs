using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;
using RajendraGlass.Api.Realtime;

namespace RajendraGlass.Api.Controllers;

/// <summary>
/// Counter Billing (Fast Invoice) — SDD 4.7 offline path, API 9.3.
/// Supports Idempotency-Key so a request replayed from the client's offline sync queue
/// is de-duplicated and the original result returned rather than creating a second invoice.
///
/// Lines are priced through <see cref="SalesLinePricing"/> — the exact same engine the
/// Quotation screen uses — so a walk-in sale never totals differently than a quotation would
/// for the same size, rate basis and thickness. Payment is captured as Cash, Cheque or UPI.
/// </summary>
[ApiController]
[Route("api/v1/counter-invoices")]
[Authorize]
public class CounterInvoicesController(IDbConnectionFactory db, INotificationPublisher notifications) : ControllerBase
{
    private const string EndpointName = "counter-invoices";

    [HttpGet]
    public IActionResult List([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        using var conn = db.CreateConnection();
        var offset = (page - 1) * pageSize;
        var rows = conn.Query<CounterInvoiceDto>(
            @"SELECT i.InvoiceId, i.InvoiceNo, i.CustomerId, c.Name AS CustomerName, i.InvoiceDate,
                     i.TaxableValue, (i.CgstValue + i.SgstValue + i.IgstValue) AS TaxValue, i.TotalValue,
                     i.PaymentType, i.ReferenceNo, i.Status, i.SyncedFromOffline
              FROM Sales.Invoice i LEFT JOIN Master.Customer c ON c.CustomerId = i.CustomerId
              WHERE i.Channel = 'Counter'
              ORDER BY i.InvoiceId DESC
              OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY", new { offset, pageSize }).ToList();
        var total = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.Invoice WHERE Channel = 'Counter'");

        if (rows.Count > 0)
        {
            var paymentRows = conn.Query<(int InvoiceId, string PaymentType, decimal Amount, string? ReferenceNo)>(
                @"SELECT InvoiceId, PaymentType, Amount, ReferenceNo FROM Sales.InvoicePayment
                  WHERE InvoiceId IN @ids ORDER BY InvoicePaymentId",
                new { ids = rows.Select(r => r.InvoiceId) })
                .ToLookup(p => p.InvoiceId);
            foreach (var r in rows)
                r.Payments = paymentRows[r.InvoiceId]
                    .Select(p => new CounterInvoicePaymentDto { PaymentType = p.PaymentType, Amount = p.Amount, ReferenceNo = p.ReferenceNo })
                    .ToList();
        }

        return Ok(new { items = rows, total, page, pageSize });
    }

    [RequirePermission("CounterInvoice.Create")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCounterInvoiceRequest req, [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey)
    {
        using var conn = db.CreateConnection();

        // --- Idempotency replay check (API 2.7 / SDD 4.7: the offline queue flush must be safe to retry) ---
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var existing = conn.QueryFirstOrDefault(
                @"SELECT StatusCode, ResponseJson FROM Security.IdempotencyKey
                  WHERE IdempotencyKey = @idempotencyKey AND Endpoint = @EndpointName AND ExpiresOn > SYSUTCDATETIME()",
                new { idempotencyKey, EndpointName });
            if (existing is not null)
            {
                var cached = JsonSerializer.Deserialize<CounterInvoiceDto>((string)existing.ResponseJson);
                return StatusCode((int)existing.StatusCode, cached);
            }
        }

        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No line items", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "A counter invoice must have at least one line item." });

        // --- Split-payment validation: the bill may be settled across several methods (Cash +
        // Cheque + UPI in any combination); every one of them must be valid, and together they
        // must add up to exactly the invoice total (checked again below, once the total is known). ---
        if (req.Payments.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No payment", Status = 422, ErrorCode = "PAYMENT_REQUIRED", Detail = "Record at least one payment method." });
        for (int i = 0; i < req.Payments.Count; i++)
        {
            var pay = req.Payments[i];
            if (!PaymentTypes.IsValid(pay.PaymentType))
                return UnprocessableEntity(new ProblemResponse { Title = "Invalid payment type", Status = 422, ErrorCode = "INVALID_PAYMENT_TYPE", Detail = $"Payment {i + 1}: type must be Cash, Cheque or UPI." });
            if (pay.Amount <= 0)
                return UnprocessableEntity(new ProblemResponse { Title = "Invalid amount", Status = 422, ErrorCode = "AMOUNT_INVALID", Detail = $"Payment {i + 1}: amount must be greater than zero." });
            if (!string.Equals(pay.PaymentType, PaymentTypes.Cash, StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(pay.ReferenceNo))
                return UnprocessableEntity(new ProblemResponse { Title = "Reference required", Status = 422, ErrorCode = "REFERENCE_REQUIRED", Detail = $"Payment {i + 1}: enter the {pay.PaymentType} reference number." });
        }

        // Server-side validation: the frontend validates for a fast response, but the server
        // must never accept a line it cannot price correctly. Identical rules to a Quotation line.
        for (int i = 0; i < req.Lines.Count; i++)
        {
            var l = req.Lines[i];
            var problem = SalesLinePricing.Validate(l.Length, l.Width, l.DimensionUnit, l.Qty, l.Rate,
                l.RateUnit, l.GstPct, l.DiscountPct, l.ChargeRoundingInch, l.ThicknessMm,
                l.ManualArea, l.ManualBasicAmount);
            if (problem is not null)
                return UnprocessableEntity(new ProblemResponse { Title = $"Line {i + 1}", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = problem });
        }

        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            var branch = conn.QueryFirstOrDefault("SELECT StateCode FROM Company.Branch WHERE BranchId = @branchId", new { branchId }, tx);
            string branchState = branch?.StateCode ?? "19";

            var godownId = conn.QueryFirstOrDefault<int?>(
                "SELECT TOP 1 GodownId FROM Company.Godown WHERE Code = 'MAIN' AND IsActive = 1", transaction: tx) ?? 1;

            string? customerState = null;
            if (req.CustomerId.HasValue)
            {
                var customer = conn.QueryFirstOrDefault("SELECT StateCode, CreditBlocked FROM Master.Customer WHERE CustomerId = @CustomerId", new { req.CustomerId }, tx);
                if (customer is not null)
                {
                    customerState = customer.StateCode ?? branchState;
                    if ((bool)customer.CreditBlocked)
                    {
                        tx.Rollback();
                        return UnprocessableEntity(new ProblemResponse { Title = "Credit blocked", Status = 422, ErrorCode = "CREDIT_BLOCK", Detail = "This customer is blocked for credit." });
                    }
                }
            }
            customerState ??= branchState;

            // --- Price every line through the same engine a Quotation uses, then re-check stock
            // against the quantity that pricing actually implies (area x qty for area-rated lines,
            // not the raw "qty" the operator typed) — the "stock conflict" the cashier must be told
            // about (SDD 4.7). ---
            decimal basicTotal = 0, discountTotal = 0, taxableTotal = 0, gstTotal = 0;
            var priced = new List<(CreateCounterInvoiceLineRequest Line, LineCalcResult Calc, string ProductCode, decimal RequiredQty, string? StockUnit)>();

            foreach (var line in req.Lines)
            {
                var product = conn.QueryFirstOrDefault(
                    "SELECT Code, Description, ThicknessMm, StockUnit FROM Master.Product WHERE ProductId = @ProductId AND IsActive = 1",
                    new { line.ProductId }, tx);
                if (product is null)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid product", Status = 422, ErrorCode = "PRODUCT_NOT_FOUND", Detail = $"Product {line.ProductId} not found or inactive." });
                }

                decimal thicknessFromProduct = product.ThicknessMm ?? 0m;
                var calc = SalesLinePricing.Price(line.Length, line.Width, line.DimensionUnit, line.Qty, line.Rate,
                    line.RateUnit, line.ApplyThickness, line.ChargeRoundingInch, line.GstPct, line.DiscountPct,
                    line.ThicknessMm, thicknessFromProduct, line.ManualArea, line.ManualBasicAmount);

                string? stockUnit = product.StockUnit;
                decimal required = StockUnitConversion.RequiredQty(calc, stockUnit);

                var balance = conn.QueryFirstOrDefault(
                    "SELECT (QtyOnHand - QtyReserved - QtyBlocked - QtyDamaged) AS QtyFree FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @godownId",
                    new { line.ProductId, godownId }, tx);
                decimal qtyFree = balance?.QtyFree ?? 0m;
                if (qtyFree < required)
                {
                    tx.Rollback();
                    return Conflict(new ProblemResponse
                    {
                        Title = "Stock conflict",
                        Status = 409,
                        ErrorCode = "STOCK_INSUFFICIENT",
                        Detail = $"Only {qtyFree} {stockUnit} of {product.Code} is available; {required} {stockUnit} was billed at the counter. Resolve this sale manually."
                    });
                }

                basicTotal += calc.BasicAmount;
                discountTotal += calc.DiscountAmount;
                taxableTotal += calc.TaxableAmount;
                gstTotal += calc.GstAmount;

                priced.Add((line, calc, (string)product.Code, required, stockUnit));
            }

            bool interState = !string.Equals(branchState, customerState, StringComparison.OrdinalIgnoreCase);
            decimal cgst = 0, sgst = 0, igst = 0;
            if (interState) igst = gstTotal; else { cgst = Math.Round(gstTotal / 2m, 2); sgst = gstTotal - cgst; }

            decimal totalBeforeRound = taxableTotal + cgst + sgst + igst;
            decimal rounded = Math.Round(totalBeforeRound, 0, MidpointRounding.AwayFromZero);

            // Every payment method's share must add up to exactly the total — no more, no less
            // (a 1 paisa rounding slack is allowed for the sum of several decimal shares).
            decimal paidTotal = req.Payments.Sum(p => p.Amount);
            if (Math.Abs(paidTotal - rounded) > 0.01m)
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse
                {
                    Title = "Amount mismatch",
                    Status = 422,
                    ErrorCode = "AMOUNT_MISMATCH",
                    Detail = paidTotal < rounded
                        ? $"Payments total {paidTotal} but the invoice total is {rounded} — {rounded - paidTotal} is still unaccounted for."
                        : $"Payments total {paidTotal}, which is {paidTotal - rounded} more than the invoice total {rounded}."
                });
            }

            // A single method keeps the invoice's PaymentType as that method (Cash/Cheque/UPI,
            // same as before split payments existed); more than one is summarised as "Split" —
            // the true breakdown is in Sales.InvoicePayment.
            string paymentType = req.Payments.Count == 1
                ? PaymentTypes.All.First(p => string.Equals(p, req.Payments[0].PaymentType, StringComparison.OrdinalIgnoreCase))
                : PaymentTypes.Split;
            string? headerReferenceNo = req.Payments.Count == 1 ? req.Payments[0].ReferenceNo : null;

            string invoiceNo = DocNumbering.NextNumber(conn, tx, branchId, "CounterInvoice");

            var invoiceId = conn.ExecuteScalar<int>(
                @"INSERT INTO Sales.Invoice
                    (InvoiceNo, BranchId, CustomerId, InvoiceDate, BasicValue, DiscountValue, TaxableValue, CgstValue, SgstValue, IgstValue,
                     RoundOff, TotalValue, Status, Channel, TenderedCash, ChangeDue, PaymentType, ReferenceNo, SyncedFromOffline, Remarks)
                  OUTPUT INSERTED.InvoiceId
                  VALUES
                    (@invoiceNo, @branchId, @CustomerId, CAST(SYSUTCDATETIME() AS DATE), @basicTotal, @discountTotal, @taxableTotal, @cgst, @sgst, @igst,
                     @roundOff, @rounded, 'Approved', 'Counter', @rounded, 0, @paymentType, @headerReferenceNo, @synced, @remarks)",
                new
                {
                    invoiceNo, branchId, req.CustomerId, basicTotal, discountTotal, taxableTotal, cgst, sgst, igst,
                    roundOff = rounded - totalBeforeRound, rounded, paymentType,
                    headerReferenceNo = string.IsNullOrWhiteSpace(headerReferenceNo) ? null : headerReferenceNo.Trim(),
                    synced = req.OriginalCapturedOn.HasValue,
                    remarks = req.WalkInCustomerName is { Length: > 0 } n ? $"Walk-in: {n}" : (string?)null
                }, tx);

            var paymentDtos = new List<CounterInvoicePaymentDto>();
            foreach (var pay in req.Payments)
            {
                string method = PaymentTypes.All.First(p => string.Equals(p, pay.PaymentType, StringComparison.OrdinalIgnoreCase));
                string? refNo = string.IsNullOrWhiteSpace(pay.ReferenceNo) ? null : pay.ReferenceNo.Trim();
                conn.Execute(
                    "INSERT INTO Sales.InvoicePayment (InvoiceId, PaymentType, Amount, ReferenceNo) VALUES (@invoiceId, @method, @Amount, @refNo)",
                    new { invoiceId, method, pay.Amount, refNo }, tx);
                paymentDtos.Add(new CounterInvoicePaymentDto { PaymentType = method, Amount = pay.Amount, ReferenceNo = refNo });
            }

            int ln = 1;
            foreach (var p in priced)
            {
                var l = p.Line;
                var calc = p.Calc;
                var metadata = SalesLinePricing.Metadata(calc, calc.ThicknessMm, l.ManualArea, l.ManualBasicAmount, l.DiscountPct);

                conn.Execute(
                    @"INSERT INTO Sales.InvoiceLine
                        (InvoiceId, LineNumber, ProductId, Description, Quantity, RatePerUnit, BasicValue, DiscountValue, NetValue, GstRatePct,
                         Length, Width, DimensionUnit, RateUnit, ApplyThickness, ChargeRoundingInch, ThicknessMm, DiscountPct,
                         ManualArea, ManualBasicAmount, CalculatedArea, Area, AreaUnit, EffectiveRate, CalculationMethod, CalculationMetadata)
                      VALUES
                        (@invoiceId, @ln, @ProductId, @Description, @Qty, @Rate, @BasicAmount, @DiscountAmount, @TaxableAmount, @GstPct,
                         @Length, @Width, @DimensionUnit, @RateUnit, @ApplyThickness, @ChargeRoundingInch, @ThicknessMm, @DiscountPct,
                         @ManualArea, @ManualBasicAmount, @CalculatedArea, @Area, @AreaUnit, @EffectiveRate, @CalculationMethod, @metadata)",
                    new
                    {
                        invoiceId,
                        ln,
                        l.ProductId,
                        l.Description,
                        calc.Qty,
                        calc.Rate,
                        BasicAmount = calc.BasicAmount,
                        DiscountAmount = calc.DiscountAmount,
                        TaxableAmount = calc.TaxableAmount,
                        calc.GstPct,
                        calc.Length,
                        calc.Width,
                        calc.DimensionUnit,
                        calc.RateUnit,
                        l.ApplyThickness,
                        l.ChargeRoundingInch,
                        calc.ThicknessMm,
                        l.DiscountPct,
                        l.ManualArea,
                        l.ManualBasicAmount,
                        calc.CalculatedArea,
                        calc.Area,
                        calc.AreaUnit,
                        calc.EffectiveRate,
                        calc.CalculationMethod,
                        metadata,
                    }, tx);

                conn.Execute(
                    "UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @Qty WHERE ProductId = @ProductId AND GodownId = @godownId",
                    new { Qty = p.RequiredQty, l.ProductId, godownId }, tx);
                conn.Execute(
                    @"INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty)
                      VALUES (@ProductId, @godownId, 'Sale', 'CounterInvoice', @invoiceId, @negQty)",
                    new { l.ProductId, godownId, invoiceId, negQty = -p.RequiredQty }, tx);
                ln++;
            }

            var customerName = req.CustomerId.HasValue
                ? conn.QueryFirstOrDefault<string>("SELECT Name FROM Master.Customer WHERE CustomerId = @CustomerId", new { req.CustomerId }, tx)
                : req.WalkInCustomerName;

            var dto = new CounterInvoiceDto
            {
                InvoiceId = invoiceId,
                InvoiceNo = invoiceNo,
                CustomerId = req.CustomerId,
                CustomerName = customerName ?? "Walk-in Customer",
                InvoiceDate = DateTime.UtcNow.Date,
                TaxableValue = taxableTotal,
                TaxValue = gstTotal,
                TotalValue = rounded,
                PaymentType = paymentType,
                ReferenceNo = headerReferenceNo,
                Payments = paymentDtos,
                Status = "Approved",
                SyncedFromOffline = req.OriginalCapturedOn.HasValue,
            };

            if (!string.IsNullOrWhiteSpace(idempotencyKey))
            {
                conn.Execute(
                    @"INSERT INTO Security.IdempotencyKey (IdempotencyKey, Endpoint, StatusCode, ResponseJson)
                      VALUES (@idempotencyKey, @EndpointName, 201, @json)",
                    new { idempotencyKey, EndpointName, json = JsonSerializer.Serialize(dto) }, tx);
            }

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId, AfterJson) VALUES ('Create', 'CounterInvoice', @id, @json)",
                new { id = invoiceId.ToString(), json = JsonSerializer.Serialize(new { invoiceNo, rounded, paymentType }) }, tx);

            tx.Commit();

            if (dto.SyncedFromOffline)
            {
                await notifications.PublishToRoleAsync("Owner", "OfflineSaleSynced", $"Offline counter sale synced: {invoiceNo}",
                    $"₹{rounded:N0}", "/sales/counter-billing");
            }

            return StatusCode(201, dto);
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }
}
