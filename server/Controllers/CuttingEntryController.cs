using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

/// <summary>
/// Cutting Entry: records glass pieces actually cut/sold against a saved Quotation, with a real,
/// auditable effect on inventory. Deliberately separate from Cutting.CuttingPlan
/// (CuttingController.cs, route "cutting-plans") -- that one is a pure nesting/waste estimate that
/// never touches stock; this one deducts Inventory.StockBalance and logs
/// Inventory.StockMovement/CuttingStockConsumption inside its own save transaction.
/// </summary>
[ApiController]
[Route("api/v1/cutting-entries")]
[Authorize]
public class CuttingEntryController(IDbConnectionFactory db) : ControllerBase
{
    private const string DocType = "CuttingEntry";

    private static readonly string LineSelect = @"
        SELECT l.CuttingEntryLineId, l.SerialNo, l.QuotationLineId, l.ProductId,
               p.Code AS ProductCode, p.Description AS ProductDescription,
               l.ActualHeight, l.ActualWidth, l.ActualHeightText, l.ActualWidthText, l.Pcs,
               l.ChargeableHeight, l.ChargeableWidth, l.Sqft, l.Rate, l.Amount,
               l.GodownId, g.Name AS GodownName, l.RackId, r.Name AS RackName
        FROM Cutting.CuttingEntryLine l
        JOIN Master.Product p ON p.ProductId = l.ProductId
        JOIN Company.Godown g ON g.GodownId = l.GodownId
        LEFT JOIN Company.Rack r ON r.RackId = l.RackId
        WHERE l.CuttingEntryId = @id
        ORDER BY l.SerialNo";

    [RequirePermission("CuttingEntry.View")]
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<CuttingEntryDto>(
            @"SELECT ce.CuttingEntryId, ce.CuttingNo, ce.CuttingDate, ce.QuotationId, q.QuotationNo, c.Name AS CustomerName,
                     ce.TotalPcs, ce.TotalSqft, ce.TotalGlassValue, ce.VanFair, ce.TotalBillAmount, ce.Status, ce.CreatedOn
              FROM Cutting.CuttingEntry ce
              JOIN Sales.Quotation q ON q.QuotationId = ce.QuotationId
              JOIN Master.Customer c ON c.CustomerId = q.CustomerId
              ORDER BY ce.CuttingEntryId DESC");
        return Ok(new { items = rows });
    }

    [RequirePermission("CuttingEntry.View")]
    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var entry = conn.QueryFirstOrDefault<CuttingEntryDto>(
            @"SELECT ce.CuttingEntryId, ce.CuttingNo, ce.CuttingDate, ce.QuotationId, q.QuotationNo, c.Name AS CustomerName,
                     ce.TotalPcs, ce.TotalSqft, ce.TotalGlassValue, ce.VanFair, ce.TotalBillAmount, ce.Status, ce.CreatedOn
              FROM Cutting.CuttingEntry ce
              JOIN Sales.Quotation q ON q.QuotationId = ce.QuotationId
              JOIN Master.Customer c ON c.CustomerId = q.CustomerId
              WHERE ce.CuttingEntryId = @id", new { id });
        if (entry is null) return NotFound();
        entry.Lines = conn.Query<CuttingEntryLineDto>(LineSelect, new { id }).ToList();
        return Ok(entry);
    }

    /// <summary>
    /// Saving is atomic: validate the quotation and every line against the server's own copy of
    /// the data (never the client's), recompute SQFT/Amount/totals server-side, re-check stock
    /// inside the same locked transaction the deduction happens in (so a concurrent save can't
    /// both pass the check), then insert header+lines and deduct stock together. Any failure rolls
    /// the whole thing back -- it is never possible for the entry to save without stock moving, or
    /// for stock to move without the entry saving.
    /// </summary>
    [RequirePermission("CuttingEntry.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateCuttingEntryRequest req)
    {
        if (req.QuotationId <= 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Quotation required", Status = 422, ErrorCode = "QUOTATION_REQUIRED", Detail = "Select a quotation." });
        if (req.CuttingDate == default)
            return UnprocessableEntity(new ProblemResponse { Title = "Cutting date required", Status = 422, ErrorCode = "DATE_REQUIRED", Detail = "Enter the cutting date." });
        if (req.VanFair < 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid van fair", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "Van Fair cannot be negative." });
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "A cutting entry must have at least one row." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var quotation = conn.QueryFirstOrDefault("SELECT QuotationId FROM Sales.Quotation WHERE QuotationId = @QuotationId", new { req.QuotationId }, tx);
            if (quotation is null)
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse { Title = "Quotation not found", Status = 422, ErrorCode = "QUOTATION_NOT_FOUND", Detail = "The selected quotation no longer exists." });
            }

            // Each row is re-derived from the server's own copy of the quoted line -- Product,
            // Rate and QuotationId all come from here, never from the request, so a tampered or
            // stale client payload can't smuggle in a different product or rate than what was
            // actually quoted (and a line from a *different* quotation is rejected outright).
            var resolved = new List<(CreateCuttingEntryLineRequest Req, int ProductId, string StockUnit, decimal Rate, decimal ActualHeight, decimal ActualWidth, decimal Sqft, decimal Amount)>();
            for (int i = 0; i < req.Lines.Count; i++)
            {
                var l = req.Lines[i];
                string where = $"Row {i + 1}";

                var line = conn.QueryFirstOrDefault(
                    "SELECT ql.QuotationId, ql.ProductId, ql.Rate, p.StockUnit FROM Sales.QuotationLine ql JOIN Master.Product p ON p.ProductId = ql.ProductId WHERE ql.QuotationLineId = @QuotationLineId",
                    new { l.QuotationLineId }, tx);
                if (line is null || (int)line.QuotationId != req.QuotationId || line.ProductId is null)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid line", Status = 422, ErrorCode = "QUOTATION_LINE_INVALID", Detail = $"{where}: this line does not belong to the selected quotation." });
                }

                if (!GlassDimensionParser.TryParse(l.ActualHeightText, out var actualHeight))
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid height", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"{where}: please enter a valid glass height, e.g. 20¼, 20 1/4 or 20.25." });
                }
                if (!GlassDimensionParser.TryParse(l.ActualWidthText, out var actualWidth))
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid width", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"{where}: please enter a valid glass width, e.g. 20¼, 20 1/4 or 20.25." });
                }
                if (l.Pcs <= 0)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid PCS", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"{where}: PCS must be a whole number greater than zero." });
                }
                if (l.ChargeableHeight <= 0 || l.ChargeableWidth <= 0)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid chargeable size", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"{where}: Chargeable Height and Chargeable Width are required and must be greater than zero." });
                }
                if (l.GodownId <= 0)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Godown required", Status = 422, ErrorCode = "GODOWN_REQUIRED", Detail = $"{where}: select a godown." });
                }

                var (chargeableHeight, chargeableWidth) = ChargeableSizeCalculator.Compute(actualHeight, actualWidth, l.ChargeableHeight, l.ChargeableWidth);
                var sizeProblem = ChargeableSizeCalculator.Validate(actualHeight, actualWidth, chargeableHeight, chargeableWidth);
                if (sizeProblem is not null)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid chargeable size", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"{where}: {sizeProblem}" });
                }

                // SQFT = Chargeable Height x Chargeable Width x PCS / 144 -- always recomputed here,
                // never trusted from the client.
                decimal sqft = Math.Round(chargeableHeight * chargeableWidth * l.Pcs / 144m, 3);
                decimal rate = line.Rate;
                decimal amount = Math.Round(sqft * rate, 2);

                resolved.Add((l, (int)line.ProductId, (string)line.StockUnit, rate, actualHeight, actualWidth, sqft, amount));
            }

            // Stock re-check, authoritatively, inside the same transaction the deduction happens
            // in -- no earlier React-loaded figure is trusted, and a concurrent save against the
            // same Product+Godown can't both pass this check (row lookups run against the live,
            // locked table for the duration of this transaction).
            foreach (var (l, productId, stockUnit, _, _, _, sqft, _) in resolved)
            {
                decimal requiredStockQty = StockUnitConversion.ToStockUnit(sqft, "SQFT", stockUnit);
                decimal free = CuttingStockConsumption.FreeStock(conn, tx, productId, l.GodownId);
                if (free < requiredStockQty)
                {
                    tx.Rollback();
                    var product = conn.QueryFirstOrDefault<string>("SELECT Code FROM Master.Product WHERE ProductId = @productId", new { productId }, tx);
                    return Conflict(new ProblemResponse
                    {
                        Title = "Insufficient Stock",
                        Status = 409,
                        ErrorCode = "STOCK_INSUFFICIENT",
                        Detail = $"{product}: available stock {free:0.###} {stockUnit}, required {requiredStockQty:0.###} {stockUnit}. Cutting cannot be completed.",
                    });
                }
            }

            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string cuttingNo = DocNumbering.NextNumber(conn, tx, branchId, DocType);

            int totalPcs = resolved.Sum(r => r.Req.Pcs);
            decimal totalSqft = resolved.Sum(r => r.Sqft);
            decimal totalGlassValue = resolved.Sum(r => r.Amount);
            decimal totalBillAmount = totalGlassValue + req.VanFair;

            var cuttingEntryId = conn.ExecuteScalar<int>(
                @"INSERT INTO Cutting.CuttingEntry (CuttingNo, CuttingDate, QuotationId, TotalPcs, TotalSqft, TotalGlassValue, VanFair, TotalBillAmount, Status)
                  OUTPUT INSERTED.CuttingEntryId
                  VALUES (@cuttingNo, @CuttingDate, @QuotationId, @totalPcs, @totalSqft, @totalGlassValue, @VanFair, @totalBillAmount, 'Booked')",
                new { cuttingNo, req.CuttingDate, req.QuotationId, totalPcs, totalSqft, totalGlassValue, req.VanFair, totalBillAmount }, tx);

            int serialNo = 0;
            foreach (var (l, productId, stockUnit, rate, actualHeight, actualWidth, sqft, amount) in resolved)
            {
                serialNo++;
                conn.Execute(
                    @"INSERT INTO Cutting.CuttingEntryLine
                        (CuttingEntryId, SerialNo, QuotationLineId, ProductId, ActualHeight, ActualWidth, ActualHeightText, ActualWidthText,
                         Pcs, ChargeableHeight, ChargeableWidth, Sqft, Rate, Amount, GodownId, RackId)
                      VALUES
                        (@cuttingEntryId, @serialNo, @QuotationLineId, @productId, @actualHeight, @actualWidth, @ActualHeightText, @ActualWidthText,
                         @Pcs, @ChargeableHeight, @ChargeableWidth, @sqft, @rate, @amount, @GodownId, @RackId)",
                    new
                    {
                        cuttingEntryId, serialNo, l.QuotationLineId, productId, actualHeight, actualWidth,
                        l.ActualHeightText, l.ActualWidthText, l.Pcs, l.ChargeableHeight, l.ChargeableWidth,
                        sqft, rate, amount, l.GodownId, l.RackId,
                    }, tx);

                decimal requiredStockQty = StockUnitConversion.ToStockUnit(sqft, "SQFT", stockUnit);
                CuttingStockConsumption.Deduct(conn, tx, productId, l.GodownId, l.RackId, requiredStockQty, DocType, cuttingEntryId);
            }

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'CuttingEntry', @id)", new { id = cuttingEntryId.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/cutting-entries/{cuttingEntryId}", new { cuttingEntryId, cuttingNo, totalPcs, totalSqft, totalGlassValue, totalBillAmount });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Cancel, not a hard delete -- Cutting Entry, like every other stock-affecting
    /// document in this app, treats a posted stock movement as immutable; correcting one means
    /// cancelling it (reversing the deduction) and entering a fresh one. Refuses with 409 if any of
    /// the stock it deducted has since moved on elsewhere.</summary>
    [RequirePermission("CuttingEntry.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Cancel(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT CuttingEntryId, Status FROM Cutting.CuttingEntry WHERE CuttingEntryId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }
            if ((string)header.Status == "Cancelled")
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Already cancelled", Status = 409, ErrorCode = "ALREADY_CANCELLED", Detail = "This cutting entry is already cancelled." });
            }

            var reverseProblem = CuttingStockConsumption.Reverse(conn, tx, DocType, id);
            if (reverseProblem is not null)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Stock already moved", Status = 409, ErrorCode = "CUTTINGENTRY_STOCK_CONSUMED", Detail = reverseProblem });
            }

            conn.Execute("UPDATE Cutting.CuttingEntry SET Status = 'Cancelled', ModifiedOn = SYSUTCDATETIME() WHERE CuttingEntryId = @id", new { id }, tx);
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Cancel', 'CuttingEntry', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }
}
