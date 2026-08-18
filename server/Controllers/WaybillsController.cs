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
[Route("api/v1/waybills")]
[Authorize]
public class WaybillsController(IDbConnectionFactory db, IEwayBillGateway ewayBillGateway, INotificationPublisher notifications) : ControllerBase
{
    [HttpGet]
    public IActionResult List([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        using var conn = db.CreateConnection();
        var offset = (page - 1) * pageSize;
        var rows = conn.Query<WaybillDto>(
            @"SELECT w.WaybillId, w.WaybillNo, w.InvoiceId, i.InvoiceNo, c.Name AS CustomerName, i.TotalValue AS InvoiceTotal,
                     w.GeneratedDate, w.ValidUntil, w.SupplyType, w.SubType, w.FromAddress, w.ToAddress, w.TransporterId,
                     t.Name AS TransporterName, w.VehicleNo, w.DistanceKm, w.TransportMode, w.Status,
                     w.EwbNo, w.EwbAckDate, w.EwbValidUpto, w.EwayBillStatus,
                     CAST(CASE WHEN w.EwayBillStatus <> 'Generated' THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Dispatch.Waybill w
              JOIN Sales.Invoice i ON i.InvoiceId = w.InvoiceId
              JOIN Master.Customer c ON c.CustomerId = i.CustomerId
              LEFT JOIN Master.Transporter t ON t.TransporterId = w.TransporterId
              ORDER BY w.WaybillId DESC
              OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY", new { offset, pageSize });
        var total = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Dispatch.Waybill");
        return Ok(new { items = rows, total, page, pageSize });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var waybill = conn.QueryFirstOrDefault<WaybillDto>(
            @"SELECT w.WaybillId, w.WaybillNo, w.InvoiceId, i.InvoiceNo, c.Name AS CustomerName, i.TotalValue AS InvoiceTotal,
                     w.GeneratedDate, w.ValidUntil, w.SupplyType, w.SubType, w.FromAddress, w.ToAddress, w.TransporterId,
                     t.Name AS TransporterName, w.VehicleNo, w.DistanceKm, w.TransportMode, w.Status,
                     w.EwbNo, w.EwbAckDate, w.EwbValidUpto, w.EwbQrPayload, w.EwayBillStatus,
                     CAST(CASE WHEN w.EwayBillStatus <> 'Generated' THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Dispatch.Waybill w
              JOIN Sales.Invoice i ON i.InvoiceId = w.InvoiceId
              JOIN Master.Customer c ON c.CustomerId = i.CustomerId
              LEFT JOIN Master.Transporter t ON t.TransporterId = w.TransporterId
              WHERE w.WaybillId = @id", new { id });
        return waybill is null ? NotFound() : Ok(waybill);
    }

    [RequirePermission("Waybill.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateWaybillRequest req)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var invoice = conn.QueryFirstOrDefault(
                "SELECT InvoiceId, InvoiceNo, TotalValue, Destination FROM Sales.Invoice WHERE InvoiceId = @InvoiceId AND Status = 'Approved'",
                new { req.InvoiceId }, transaction: tx);
            if (invoice is null)
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse { Title = "Invoice not eligible", Status = 422, ErrorCode = "INVOICE_NOT_APPROVED", Detail = "Waybill can only be generated for an approved invoice." });
            }

            var existing = conn.QueryFirstOrDefault<int?>(
                "SELECT WaybillId FROM Dispatch.Waybill WHERE InvoiceId = @InvoiceId AND Status <> 'Cancelled'", new { req.InvoiceId }, transaction: tx);
            if (existing.HasValue)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Waybill exists", Status = 409, ErrorCode = "DUPLICATE_DOC", Detail = $"An active waybill already exists for this invoice (id {existing})." });
            }

            var branch = conn.QueryFirstOrDefault("SELECT TOP 1 BranchId, Address FROM Company.Branch WHERE IsActive = 1", transaction: tx);
            int branchId = branch.BranchId;

            var series = conn.QueryFirstOrDefault(
                @"SELECT DocSeriesId, Prefix, NextNumber FROM Company.DocSeries WITH (UPDLOCK, HOLDLOCK)
                  WHERE BranchId = @branchId AND DocType = 'Waybill' AND FinancialYear = @fy",
                new { branchId, fy = FinancialYearFor(DateTime.Today) }, transaction: tx);
            if (series is null)
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse { Title = "Numbering series missing", Status = 422, ErrorCode = "DOC_SERIES_MISSING", Detail = "No waybill numbering series configured." });
            }
            string waybillNo = $"{series.Prefix}{(int)series.NextNumber:D6}";
            conn.Execute("UPDATE Company.DocSeries SET NextNumber = NextNumber + 1 WHERE DocSeriesId = @id", new { id = (int)series.DocSeriesId }, tx);

            var validUntil = DateTime.UtcNow.AddDays(1); // internal transport-doc validity; the government EWB validity is set separately on generation
            var waybillId = conn.ExecuteScalar<int>(
                @"INSERT INTO Dispatch.Waybill (WaybillNo, InvoiceId, ValidUntil, SupplyType, SubType, FromAddress, ToAddress, TransporterId, VehicleNo, DistanceKm, TransportMode, Status)
                  OUTPUT INSERTED.WaybillId
                  VALUES (@waybillNo, @InvoiceId, @validUntil, 'Outward', @SubType, @fromAddress, @ToAddress, @TransporterId, @VehicleNo, @DistanceKm, @TransportMode, 'Generated')",
                new { waybillNo, req.InvoiceId, validUntil, req.SubType, fromAddress = (string)branch.Address, req.ToAddress, req.TransporterId, req.VehicleNo, req.DistanceKm, req.TransportMode }, tx);

            conn.Execute(@"INSERT INTO Security.AuditLog (Action, Entity, EntityId, AfterJson) VALUES ('Create', 'Waybill', @EntityId, @AfterJson)",
                new { EntityId = waybillId.ToString(), AfterJson = System.Text.Json.JsonSerializer.Serialize(new { waybillNo }) }, tx);

            tx.Commit();
            var created = (Get(waybillId) as OkObjectResult)?.Value;
            return CreatedAtAction(nameof(Get), new { id = waybillId }, created);
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("Waybill.Cancel")]
    [HttpPost("{id:int}/cancel")]
    public IActionResult Cancel(int id, [FromBody] CancelRequest req)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Execute("UPDATE Dispatch.Waybill SET Status = 'Cancelled' WHERE WaybillId = @id AND Status <> 'Cancelled'", new { id });
        return rows == 0 ? NotFound() : NoContent();
    }

    /// <summary>Deletable while no *active* e-Way Bill is registered against this waybill. Unlike
    /// every other doc in this delete-feature series, nothing else in our own database references
    /// a waybill -- the risk here is external: an EwayBillStatus of 'Generated' means a real e-Way
    /// Bill exists in the government's GST system, and deleting the local record at that point
    /// would orphan a live government-side document. Cancel the e-Way Bill first (existing
    /// endpoint), then the waybill becomes deletable.</summary>
    [RequirePermission("Waybill.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Dispatch.Waybill WHERE WaybillId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            if ((string)header.EwayBillStatus == "Generated")
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Active e-Way Bill", Status = 409, ErrorCode = "WAYBILL_HAS_ACTIVE_EWB", Detail = "This waybill has an active e-Way Bill registered with the government; cancel the e-Way Bill first." });
            }

            conn.Execute("DELETE FROM Dispatch.Waybill WHERE WaybillId = @id", new { id }, tx);

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Waybill", id.ToString(), header);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Generates the government e-Way Bill number for this transport document (SDD 10.2,
    /// FRS: mandatory above the consignment-value threshold, API 12.2).</summary>
    [RequirePermission("Waybill.EwayBill")]
    [HttpPost("{id:int}/e-way-bill")]
    public async Task<IActionResult> GenerateEwayBill(int id)
    {
        using var conn = db.CreateConnection();
        var w = conn.QueryFirstOrDefault(
            @"SELECT w.WaybillId, w.WaybillNo, w.ToAddress, w.VehicleNo, w.DistanceKm, w.Status, w.EwayBillStatus,
                     i.InvoiceId, i.InvoiceNo, i.InvoiceDate, i.TotalValue, i.TaxableValue, i.CgstValue, i.SgstValue, i.IgstValue,
                     c.Name AS CustomerName, c.Gstin AS CustomerGstin, c.StateCode AS CustomerStateCode,
                     t.Name AS TransporterName
              FROM Dispatch.Waybill w
              JOIN Sales.Invoice i ON i.InvoiceId = w.InvoiceId
              JOIN Master.Customer c ON c.CustomerId = i.CustomerId
              LEFT JOIN Master.Transporter t ON t.TransporterId = w.TransporterId
              WHERE w.WaybillId = @id", new { id });
        if (w is null) return NotFound();
        if ((string)w.Status == "Cancelled")
            return UnprocessableEntity(new ProblemResponse { Title = "Waybill cancelled", Status = 422, ErrorCode = "WAYBILL_CANCELLED", Detail = "A cancelled waybill cannot get an e-Way Bill." });
        if ((string)w.EwayBillStatus == "Generated")
            return Conflict(new ProblemResponse { Title = "Already generated", Status = 409, ErrorCode = "EWB_ALREADY_GENERATED", Detail = "This waybill already has an active e-Way Bill." });

        var company = conn.QueryFirstOrDefault("SELECT TOP 1 LegalName, Gstin, BusinessAddress FROM Company.Company");
        var branch = conn.QueryFirstOrDefault("SELECT TOP 1 StateCode FROM Company.Branch WHERE IsActive = 1");
        var lines = conn.Query(
            @"SELECT p.HsnCode, p.Description, l.NetValue, l.GstRatePct
              FROM Sales.InvoiceLine l JOIN Master.Product p ON p.ProductId = l.ProductId WHERE l.InvoiceId = @InvoiceId", new { InvoiceId = (int)w.InvoiceId }).ToList();

        var req = new EwayBillRequest
        {
            DocNo = w.InvoiceNo,
            DocDate = w.InvoiceDate,
            FromGstin = company?.Gstin ?? "",
            FromTrdName = company?.LegalName ?? "",
            FromAddr = company?.BusinessAddress ?? "",
            FromPlace = "Kolkata",
            FromStateCode = branch?.StateCode ?? "19",
            ToGstin = w.CustomerGstin,
            ToTrdName = w.CustomerName,
            ToAddr = w.ToAddress ?? "",
            ToPlace = w.ToAddress ?? "",
            ToStateCode = w.CustomerStateCode ?? branch?.StateCode ?? "19",
            TotalValue = w.TotalValue,
            TaxableAmount = w.TaxableValue,
            CgstValue = w.CgstValue,
            SgstValue = w.SgstValue,
            IgstValue = w.IgstValue,
            TransDistanceKm = w.DistanceKm ?? 0,
            TransporterName = w.TransporterName,
            VehicleNo = w.VehicleNo,
            ItemList = lines.Select(l => new EwayBillItemLine
            {
                HsnCode = l.HsnCode ?? "70051010",
                ProductName = l.Description ?? "",
                TaxableAmount = l.NetValue,
                CgstRate = w.IgstValue > 0 ? 0 : l.GstRatePct / 2m,
                SgstRate = w.IgstValue > 0 ? 0 : l.GstRatePct / 2m,
                IgstRate = w.IgstValue > 0 ? l.GstRatePct : 0,
            }).ToList(),
        };

        var sw = System.Diagnostics.Stopwatch.StartNew();
        EwayBillResult result;
        try { result = await ewayBillGateway.GenerateEwbAsync(req); }
        catch (Exception ex) { result = new EwayBillResult { Success = false, ErrorCode = "EXCEPTION", ErrorMessage = ex.Message }; }
        sw.Stop();

        GatewayLogger.Log(conn, "EwayBill", "Generate", ewayBillGateway.ProviderName, "Waybill", id, req, result, result.Success, result.ErrorMessage, (int)sw.ElapsedMilliseconds);

        if (!result.Success)
        {
            conn.Execute("UPDATE Dispatch.Waybill SET EwayBillStatus = 'Failed' WHERE WaybillId = @id", new { id });
            return UnprocessableEntity(new ProblemResponse { Title = "e-Way Bill generation failed", Status = 422, ErrorCode = result.ErrorCode ?? "EWB_FAILED", Detail = result.ErrorMessage ?? "The gateway rejected the request." });
        }

        conn.Execute(
            @"UPDATE Dispatch.Waybill SET EwbNo=@EwbNo, EwbAckDate=@EwbDate, EwbValidUpto=@ValidUpto, EwbQrPayload=@Qr, EwayBillStatus='Generated' WHERE WaybillId = @id",
            new { result.EwbNo, result.EwbDate, result.ValidUpto, Qr = result.QrPayload, id });
        conn.Execute("UPDATE Sales.Invoice SET EwayBillNo = @EwbNo WHERE InvoiceId = @InvoiceId", new { result.EwbNo, InvoiceId = (int)w.InvoiceId });

        var currentUserId = int.Parse(User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)!);
        await notifications.PublishToUserAsync(currentUserId, "EwayBillGenerated", "e-Way Bill generated",
            $"EWB {result.EwbNo} for waybill #{id}", $"/dispatch/waybills/{id}");

        return Ok(new { ewbNo = result.EwbNo, ewbDate = result.EwbDate, validUpto = result.ValidUpto, qrPayload = result.QrPayload, provider = ewayBillGateway.ProviderName });
    }

    [RequirePermission("Waybill.EwayBill")]
    [HttpPost("{id:int}/e-way-bill/cancel")]
    public async Task<IActionResult> CancelEwayBill(int id, [FromBody] CancelRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Reason))
            return UnprocessableEntity(new ProblemResponse { Title = "Reason required", Status = 422, ErrorCode = "REASON_REQUIRED", Detail = "A cancellation reason is mandatory." });

        using var conn = db.CreateConnection();
        var w = conn.QueryFirstOrDefault("SELECT EwbNo, EwayBillStatus FROM Dispatch.Waybill WHERE WaybillId = @id", new { id });
        if (w is null) return NotFound();
        if ((string)w.EwayBillStatus != "Generated" || w.EwbNo is null)
            return UnprocessableEntity(new ProblemResponse { Title = "No active e-Way Bill", Status = 422, ErrorCode = "NO_ACTIVE_EWB", Detail = "This waybill has no active e-Way Bill to cancel." });

        var sw = System.Diagnostics.Stopwatch.StartNew();
        var result = await ewayBillGateway.CancelEwbAsync((string)w.EwbNo, req.Reason);
        sw.Stop();

        GatewayLogger.Log(conn, "EwayBill", "Cancel", ewayBillGateway.ProviderName, "Waybill", id, new { ewbNo = w.EwbNo, req.Reason }, result, result.Success, result.ErrorMessage, (int)sw.ElapsedMilliseconds);

        if (!result.Success)
            return UnprocessableEntity(new ProblemResponse { Title = "Cancellation failed", Status = 422, ErrorCode = result.ErrorCode ?? "CANCEL_FAILED", Detail = result.ErrorMessage ?? "The gateway rejected the cancellation." });

        conn.Execute("UPDATE Dispatch.Waybill SET EwayBillStatus = 'Cancelled' WHERE WaybillId = @id", new { id });
        return NoContent();
    }

    private static string FinancialYearFor(DateTime date)
    {
        int startYear = date.Month >= 4 ? date.Year : date.Year - 1;
        return $"{startYear}-{startYear + 1}";
    }
}
