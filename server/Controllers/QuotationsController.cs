using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/quotations")]
[Authorize]
public class QuotationsController(IDbConnectionFactory db) : ControllerBase
{
    private ObjectResult Invalid(string where, string detail) =>
        UnprocessableEntity(new ProblemResponse
        {
            Title = "Validation failed",
            Status = 422,
            ErrorCode = "VALIDATION_ERROR",
            Detail = $"{where}: {detail}",
        });

    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<QuotationDto>(
            @"SELECT q.QuotationId, q.QuotationNo, q.CustomerId, c.Name AS CustomerName, q.QuotationDate, q.ValidUntil, q.Status, q.TotalValue, q.RoundOff,
                     CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM Sales.SalesOrder o WHERE o.QuotationId = q.QuotationId) THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Sales.Quotation q JOIN Master.Customer c ON c.CustomerId = q.CustomerId ORDER BY q.QuotationId DESC");
        return Ok(new { items = rows });
    }

    /// <summary>Deletable only while no sales order has been generated against this quotation —
    /// the moment one exists, the quotation is a permanent record of what that order was priced
    /// from and must stay in place, same as the edit lock on a converted quotation.</summary>
    [RequirePermission("Quotation.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Sales.Quotation WHERE QuotationId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            var hasOrder = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.SalesOrder WHERE QuotationId = @id", new { id }, tx) > 0;
            if (hasOrder)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Quotation has an order", Status = 409, ErrorCode = "QUOTATION_HAS_ORDER", Detail = "A sales order has already been generated against this quotation; it cannot be deleted." });
            }

            // Snapshot the full record — header and every line — before it's gone, so the audit
            // trail can show exactly what was deleted, not just that something was.
            var lines = conn.Query("SELECT * FROM Sales.QuotationLine WHERE QuotationId = @id", new { id }, tx).ToList();

            conn.Execute("DELETE FROM Sales.QuotationLine WHERE QuotationId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Sales.Quotation WHERE QuotationId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Quotation", id.ToString(), new { Quotation = header, Lines = lines });
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var q = conn.QueryFirstOrDefault<QuotationDto>(
            @"SELECT q.QuotationId, q.QuotationNo, q.CustomerId, c.Name AS CustomerName,
                     c.CustomerType, c.BillingAddress AS CustomerAddress, c.Gstin AS CustomerGstin,
                     c.Mobile AS CustomerMobile, c.StateName AS CustomerStateName,
                     q.QuotationDate, q.ValidUntil, q.Status, q.TotalValue, q.RoundOff, q.RoundOffEnabled,
                     q.HoleRate, q.BHoleRate, q.CutoutRate, q.BCutoutRate,
                     CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM Sales.SalesOrder o WHERE o.QuotationId = q.QuotationId) THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Sales.Quotation q JOIN Master.Customer c ON c.CustomerId = q.CustomerId WHERE q.QuotationId = @id", new { id });
        if (q is null) return NotFound();
        q.Lines = conn.Query<QuotationLineDto>(
            @"SELECT l.ProductId, p.Code AS ProductCode, p.Description AS ProductDescription, l.Description,
                     l.Length, l.Width, l.DimensionUnit, l.Qty, l.Rate, l.RateUnit,
                     l.ApplyThickness, l.ChargeRoundingInch, l.GstPct, l.DiscountPct,
                     l.ManualArea, l.ManualBasicAmount,
                     l.ThicknessMm, l.HeightInch AS LengthInch, l.WidthInch,
                     l.ChargeHeightInch AS ChargeLengthInch, l.ChargeWidthInch,
                     l.CalculatedArea, l.Area, l.AreaUnit, l.EffectiveRate,
                     l.CalculatedBasicAmount, l.ChargeableAmount AS BasicAmount,
                     l.DiscountAmount, l.TaxableAmount, l.GstAmount, l.Amount,
                     l.CalculationMethod, l.IsAreaManualOverride, l.IsAmountManualOverride,
                     l.HoleQty, l.BHoleQty, l.CutoutQty, l.BCutoutQty
              FROM Sales.QuotationLine l
              LEFT JOIN Master.Product p ON p.ProductId = l.ProductId
              WHERE l.QuotationId = @id", new { id }).ToList();

        q.TotalHoleQty = q.Lines.Sum(l => l.HoleQty);
        q.TotalBHoleQty = q.Lines.Sum(l => l.BHoleQty);
        q.TotalCutoutQty = q.Lines.Sum(l => l.CutoutQty);
        q.TotalBCutoutQty = q.Lines.Sum(l => l.BCutoutQty);
        q.HolesCutoutAmount = q.TotalHoleQty * q.HoleRate + q.TotalBHoleQty * q.BHoleRate + q.TotalCutoutQty * q.CutoutRate + q.TotalBCutoutQty * q.BCutoutRate;
        return Ok(q);
    }

    /// <summary>Feeds the Cutting Entry product picker (client/src/features/cutting/CuttingEntryCreatePage.tsx)
    /// -- only this quotation's own lines, never the full product master, and only area-rated ones
    /// (PER_SQFT/PER_SQM), since a PER_PIECE line has no per-square-foot rate for Cutting's SQFT
    /// billing to use. QuotationLineId is exposed here (unlike QuotationLineDto above) because
    /// Cutting Entry must pin to the exact quoted line, not just the product -- the same product
    /// can appear more than once in a quotation at different rates.</summary>
    [HttpGet("{id:int}/cutting-products")]
    public IActionResult GetCuttingProducts(int id)
    {
        using var conn = db.CreateConnection();
        var exists = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.Quotation WHERE QuotationId = @id", new { id });
        if (exists == 0) return NotFound();

        var rows = conn.Query<QuotationCuttingProductDto>(
            @"SELECT l.QuotationLineId, l.ProductId, p.Code AS ProductCode, p.Description AS ProductDescription, l.Rate, l.RateUnit
              FROM Sales.QuotationLine l
              JOIN Master.Product p ON p.ProductId = l.ProductId
              WHERE l.QuotationId = @id AND l.RateUnit IN ('PER_SQFT', 'PER_SQM')
              ORDER BY l.QuotationLineId", new { id });
        return Ok(new { items = rows });
    }

    [RequirePermission("Quotation.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateQuotationRequest req)
    {
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "A quotation must have at least one line." });
        if (req.CustomerId <= 0 && req.NewCustomer is null)
            return UnprocessableEntity(new ProblemResponse { Title = "No customer", Status = 422, ErrorCode = "CUSTOMER_REQUIRED", Detail = "Select an existing customer or supply new customer details." });
        var holesCutoutProblem = ValidateHolesCutout(req.Lines, req.HoleRate, req.BHoleRate, req.CutoutRate, req.BCutoutRate);
        if (holesCutoutProblem is not null) return Invalid("Holes / Cutout", holesCutoutProblem);

        // Quotations don't carry GST -- enforced here, not just hidden client-side, so a direct
        // API call can't smuggle a nonzero rate in.
        foreach (var l in req.Lines) l.GstPct = 0;

        // Server-side validation: the frontend validates for a fast response, but the server
        // must never accept a line it cannot price correctly.
        for (int i = 0; i < req.Lines.Count; i++)
        {
            var l = req.Lines[i];
            var problem = SalesLinePricing.Validate(l.Length, l.Width, l.DimensionUnit, l.Qty, l.Rate,
                l.RateUnit, l.GstPct, l.DiscountPct, l.ChargeRoundingInch, l.ThicknessMm,
                l.ManualArea, l.ManualBasicAmount);
            if (problem is not null) return Invalid($"Line {i + 1}", problem);
        }

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            // Stock is checked once more, authoritatively, before anything is written — the
            // frontend's live per-row badge is only advisory while the operator is typing; a
            // quotation short on stock must be refused outright, not merely flagged.
            var shortageProblem = CheckStockShortage(conn, tx, req.Lines);
            if (shortageProblem is not null) { tx.Rollback(); return shortageProblem; }

            // Walk-in customer captured on the quotation screen: create the master record first,
            // inside the same transaction, so a failed quotation doesn't leave an orphan customer.
            int customerId = req.CustomerId;
            if (customerId <= 0 && req.NewCustomer is not null)
            {
                var nc = req.NewCustomer;
                if (string.IsNullOrWhiteSpace(nc.Name))
                    return UnprocessableEntity(new ProblemResponse { Title = "Customer name required", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "New customer needs a name." });
                if (string.IsNullOrWhiteSpace(nc.Mobile))
                    return UnprocessableEntity(new ProblemResponse { Title = "Phone number required", Status = 422, ErrorCode = "PHONE_REQUIRED", Detail = "A phone number is mandatory for every customer." });

                var code = string.IsNullOrWhiteSpace(nc.Code)
                    ? "C" + DateTime.UtcNow.ToString("yyMMddHHmmss")
                    : nc.Code.Trim();

                customerId = conn.ExecuteScalar<int>(
                    @"INSERT INTO Master.Customer (Code, Name, CustomerType, Gstin, Mobile, Email, BillingAddress, StateCode, StateName, IsActive)
                      OUTPUT INSERTED.CustomerId
                      VALUES (@code, @Name, @CustomerType, @Gstin, @Mobile, @Email, @BillingAddress, @StateCode, @StateName, 1)",
                    new { code, nc.Name, nc.CustomerType, nc.Gstin, nc.Mobile, nc.Email, nc.BillingAddress, nc.StateCode, nc.StateName }, tx);
            }

            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string qNo = DocNumbering.NextNumber(conn, tx, branchId, "Quotation");

            decimal total = 0;
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Sales.Quotation (QuotationNo, CustomerId, BranchId, ValidUntil, Status, TotalValue, HoleRate, BHoleRate, CutoutRate, BCutoutRate, RoundOffEnabled)
                  OUTPUT INSERTED.QuotationId VALUES (@qNo, @customerId, @branchId, @ValidUntil, 'Sent', 0, @HoleRate, @BHoleRate, @CutoutRate, @BCutoutRate, @RoundOffEnabled)",
                new { qNo, customerId, branchId, req.ValidUntil, req.HoleRate, req.BHoleRate, req.CutoutRate, req.BCutoutRate, req.RoundOffEnabled }, tx);

            var thicknessByProduct = ThicknessByProduct(conn, tx, req.Lines);
            foreach (var l in req.Lines)
                total += InsertLine(conn, tx, id, l, thicknessByProduct);

            // Item-wise hole/cutout quantities, summed across every line and priced at the
            // document's own rates -- added into the basic total right alongside every line's own
            // amount, before the round-to-nearest-rupee step below.
            total += HolesCutoutAmount(req.Lines, req.HoleRate, req.BHoleRate, req.CutoutRate, req.BCutoutRate);

            // Rounded to the nearest whole rupee only while the operator's Round Off checkbox is
            // on (same convention Invoice always applies); the delta is kept in RoundOff so the
            // printed total reconciles with the lines either way.
            decimal rounded = req.RoundOffEnabled ? Math.Round(total, 0, MidpointRounding.AwayFromZero) : Math.Round(total, 2, MidpointRounding.AwayFromZero);
            decimal roundOff = rounded - total;
            conn.Execute("UPDATE Sales.Quotation SET TotalValue = @rounded, RoundOff = @roundOff WHERE QuotationId = @id", new { rounded, roundOff, id }, tx);
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'Quotation', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/quotations/{id}", new { quotationId = id, quotationNo = qNo, customerId });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("Quotation.Create")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] UpdateQuotationRequest req)
    {
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "A quotation must have at least one line." });
        if (req.CustomerId <= 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No customer", Status = 422, ErrorCode = "CUSTOMER_REQUIRED", Detail = "Select a customer." });
        var holesCutoutProblem = ValidateHolesCutout(req.Lines, req.HoleRate, req.BHoleRate, req.CutoutRate, req.BCutoutRate);
        if (holesCutoutProblem is not null) return Invalid("Holes / Cutout", holesCutoutProblem);
        foreach (var l in req.Lines) l.GstPct = 0;

        for (int i = 0; i < req.Lines.Count; i++)
        {
            var l = req.Lines[i];
            var problem = SalesLinePricing.Validate(l.Length, l.Width, l.DimensionUnit, l.Qty, l.Rate,
                l.RateUnit, l.GstPct, l.DiscountPct, l.ChargeRoundingInch, l.ThicknessMm,
                l.ManualArea, l.ManualBasicAmount);
            if (problem is not null) return Invalid($"Line {i + 1}", problem);
        }

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var status = conn.QueryFirstOrDefault<string>(
                "SELECT Status FROM Sales.Quotation WHERE QuotationId = @id", new { id }, tx);
            if (status is null) return NotFound();
            // Once converted, a sales order already carries its own copy of the pricing —
            // editing the quotation afterwards would silently disconnect them.
            if (status == "Converted")
                return Invalid("Quotation", "This quotation has already been converted to a sales order and can no longer be edited.");

            var shortageProblem = CheckStockShortage(conn, tx, req.Lines);
            if (shortageProblem is not null) { tx.Rollback(); return shortageProblem; }

            conn.Execute("DELETE FROM Sales.QuotationLine WHERE QuotationId = @id", new { id }, tx);

            decimal total = 0;
            var thicknessByProduct = ThicknessByProduct(conn, tx, req.Lines);
            foreach (var l in req.Lines)
                total += InsertLine(conn, tx, id, l, thicknessByProduct);
            total += HolesCutoutAmount(req.Lines, req.HoleRate, req.BHoleRate, req.CutoutRate, req.BCutoutRate);

            decimal rounded = req.RoundOffEnabled ? Math.Round(total, 0, MidpointRounding.AwayFromZero) : Math.Round(total, 2, MidpointRounding.AwayFromZero);
            decimal roundOff = rounded - total;
            conn.Execute(
                @"UPDATE Sales.Quotation SET CustomerId = @CustomerId, ValidUntil = @ValidUntil, TotalValue = @rounded, RoundOff = @roundOff,
                         HoleRate = @HoleRate, BHoleRate = @BHoleRate, CutoutRate = @CutoutRate, BCutoutRate = @BCutoutRate, RoundOffEnabled = @RoundOffEnabled
                  WHERE QuotationId = @id",
                new { req.CustomerId, req.ValidUntil, rounded, roundOff, id, req.HoleRate, req.BHoleRate, req.CutoutRate, req.BCutoutRate, req.RoundOffEnabled }, tx);
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Update', 'Quotation', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return Ok(new { quotationId = id });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>
    /// Refuses to save when any line's required stock exceeds what's free across every godown —
    /// the same "area x qty in the product's stock unit" figure the frontend's live shortage
    /// badge shows (client/src/features/sales/SalesLineGrid.tsx getLineStockShortage), checked
    /// once more here so a direct API call can't bypass what the UI already blocks.
    /// </summary>
    private static ObjectResult? CheckStockShortage(
        System.Data.IDbConnection conn, System.Data.IDbTransaction tx, List<QuotationLineDto> lines)
    {
        var productIds = lines.Where(l => l.ProductId.HasValue).Select(l => l.ProductId!.Value).Distinct().ToArray();
        if (productIds.Length == 0) return null;

        var products = conn.Query<(int ProductId, string Code, string? StockUnit, decimal? ThicknessMm)>(
            "SELECT ProductId, Code, StockUnit, ThicknessMm FROM Master.Product WHERE ProductId IN @ids",
            new { ids = productIds }, tx)
            .ToDictionary(r => r.ProductId, r => r);

        var freeByProduct = conn.Query<(int ProductId, decimal QtyFree)>(
            @"SELECT ProductId, SUM(QtyOnHand - QtyReserved - QtyBlocked - QtyDamaged) AS QtyFree
              FROM Inventory.StockBalance WHERE ProductId IN @ids GROUP BY ProductId",
            new { ids = productIds }, tx)
            .ToDictionary(r => r.ProductId, r => r.QtyFree);

        var shortages = new List<string>();
        foreach (var l in lines)
        {
            if (!l.ProductId.HasValue || !products.TryGetValue(l.ProductId.Value, out var product)) continue;

            var calc = QuotationCalculator.Calculate(new LineCalcInput
            {
                Length = l.Length,
                Width = l.Width,
                DimensionUnit = l.DimensionUnit,
                Qty = l.Qty,
                Rate = l.Rate,
                RateUnit = l.RateUnit,
                ThicknessMm = l.ThicknessMm ?? product.ThicknessMm ?? 0m,
                ApplyThickness = l.ApplyThickness,
                ChargeRoundingInch = l.ChargeRoundingInch,
                GstPct = l.GstPct,
                DiscountPct = l.DiscountPct,
                ManualArea = l.ManualArea,
                ManualBasicAmount = l.ManualBasicAmount,
            });

            decimal required = StockUnitConversion.RequiredQty(calc, product.StockUnit);
            if (required <= 0) continue;

            decimal free = freeByProduct.TryGetValue(l.ProductId.Value, out var f) ? f : 0m;
            decimal shortfall = required - free;
            if (shortfall > 0.0001m)
            {
                string unit = product.StockUnit ?? calc.AreaUnit;
                shortages.Add($"{product.Code}: short {shortfall:0.##} {unit}");
            }
        }

        if (shortages.Count == 0) return null;
        return new UnprocessableEntityObjectResult(new ProblemResponse
        {
            Title = "Stock is short",
            Status = 422,
            ErrorCode = "STOCK_INSUFFICIENT",
            Detail = "This quotation cannot be saved — stock is short for: " + string.Join("; ", shortages),
        });
    }

    /// <summary>Item-wise Hole/B-Hole/Cutout/B-Cutout quantities are summed across every line and
    /// priced at the document's own rate for that type -- not a per-line rate, since the same
    /// hole/cutout charge applies uniformly across the whole quotation.</summary>
    private static decimal HolesCutoutAmount(List<QuotationLineDto> lines, decimal holeRate, decimal bHoleRate, decimal cutoutRate, decimal bCutoutRate) =>
        lines.Sum(l => l.HoleQty) * holeRate +
        lines.Sum(l => l.BHoleQty) * bHoleRate +
        lines.Sum(l => l.CutoutQty) * cutoutRate +
        lines.Sum(l => l.BCutoutQty) * bCutoutRate;

    private static string? ValidateHolesCutout(List<QuotationLineDto> lines, decimal holeRate, decimal bHoleRate, decimal cutoutRate, decimal bCutoutRate)
    {
        if (holeRate < 0 || bHoleRate < 0 || cutoutRate < 0 || bCutoutRate < 0)
            return "Hole/B-Hole/Cutout/B-Cutout rates cannot be negative.";
        for (int i = 0; i < lines.Count; i++)
        {
            var l = lines[i];
            if (l.HoleQty < 0 || l.BHoleQty < 0 || l.CutoutQty < 0 || l.BCutoutQty < 0)
                return $"Line {i + 1}: Hole/B-Hole/Cutout/B-Cutout quantities cannot be negative.";
        }
        return null;
    }

    // Thickness defaults from the product master, but a line may override it — Sheet3's THICK
    // column is typed per row (row 116 is 3.2mm, rows 20-25 leave it blank), so it is entered
    // data, not purely a product attribute.
    private static Dictionary<int, decimal> ThicknessByProduct(
        System.Data.IDbConnection conn, System.Data.IDbTransaction tx, List<QuotationLineDto> lines)
    {
        var productIds = lines.Where(l => l.ProductId.HasValue).Select(l => l.ProductId!.Value).Distinct().ToArray();
        return productIds.Length == 0
            ? new Dictionary<int, decimal>()
            : conn.Query<(int ProductId, decimal? ThicknessMm)>(
                "SELECT ProductId, ThicknessMm FROM Master.Product WHERE ProductId IN @ids",
                new { ids = productIds }, tx)
                .ToDictionary(r => r.ProductId, r => r.ThicknessMm ?? 0m);
    }

    /// <summary>Prices and inserts one line, returning its final amount for the header total.</summary>
    private static decimal InsertLine(
        System.Data.IDbConnection conn, System.Data.IDbTransaction tx, int quotationId,
        QuotationLineDto l, Dictionary<int, decimal> thicknessByProduct)
    {
        // Use the thickness on the line when supplied; fall back to the product master.
        decimal thickness = l.ThicknessMm
            ?? (l.ProductId.HasValue && thicknessByProduct.TryGetValue(l.ProductId.Value, out var t) ? t : 0m);

        // The server recalculates from the entered figures every time. Anything the client
        // computed for its live preview is discarded — only ManualArea / ManualBasicAmount let
        // an operator deliberately override a computed value.
        var calc = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = l.Length,
            Width = l.Width,
            DimensionUnit = l.DimensionUnit,
            Qty = l.Qty,
            Rate = l.Rate,
            RateUnit = l.RateUnit,
            ThicknessMm = thickness,
            ApplyThickness = l.ApplyThickness,
            ChargeRoundingInch = l.ChargeRoundingInch,
            GstPct = l.GstPct,
            DiscountPct = l.DiscountPct,
            ManualArea = l.ManualArea,
            ManualBasicAmount = l.ManualBasicAmount,
        });

        var metadata = System.Text.Json.JsonSerializer.Serialize(new
        {
            entered = new { l.Length, l.Width, unit = calc.DimensionUnit, l.Qty, l.Rate, rateUnit = calc.RateUnit },
            rules = new { l.ApplyThickness, l.ChargeRoundingInch, thicknessMm = thickness, l.GstPct, l.DiscountPct },
            overrides = new { l.ManualArea, l.ManualBasicAmount },
            computed = new { calc.CalculatedArea, calc.CalculatedBasicAmount, calc.EffectiveRate },
            calc.CalculationMethod,
        });

        conn.Execute(
            @"INSERT INTO Sales.QuotationLine
                (QuotationId, ProductId, Description, Qty, Rate,
                 Length, Width, DimensionUnit, RateUnit, ApplyThickness, ChargeRoundingInch,
                 UnitOfMeasure, ChargeType,
                 HeightInch, WidthInch, ChargeHeightInch, ChargeWidthInch,
                 HeightFt, WidthFt, AreaSqft,
                 CalculatedArea, Area, AreaUnit, EffectiveRate,
                 ThicknessMm, CalculatedBasicAmount, ChargeableAmount,
                 DiscountPct, DiscountAmount, TaxableAmount, GstPct, GstAmount, Amount,
                 ManualArea, ManualBasicAmount, IsAreaManualOverride, IsAmountManualOverride,
                 CalculationMethod, CalculationMetadata,
                 HoleQty, BHoleQty, CutoutQty, BCutoutQty)
              VALUES
                (@quotationId, @ProductId, @Description, @Qty, @Rate,
                 @Length, @Width, @DimensionUnit, @RateUnit, @ApplyThickness, @ChargeRoundingInch,
                 @DimensionUnit, @ChargeRoundingInch,
                 @LengthInch, @WidthInch, @ChargeLengthInch, @ChargeWidthInch,
                 @HeightFt, @WidthFt, @AreaSqft,
                 @CalculatedArea, @Area, @AreaUnit, @EffectiveRate,
                 @ThicknessMm, @CalculatedBasicAmount, @BasicAmount,
                 @DiscountPct, @DiscountAmount, @TaxableAmount, @GstPct, @GstAmount, @FinalAmount,
                 @ManualArea, @ManualBasicAmount, @IsAreaManualOverride, @IsAmountManualOverride,
                 @CalculationMethod, @metadata,
                 @HoleQty, @BHoleQty, @CutoutQty, @BCutoutQty)",
            new
            {
                quotationId,
                l.ProductId,
                l.Description,
                calc.Qty,
                calc.Rate,
                calc.Length,
                calc.Width,
                calc.DimensionUnit,
                calc.RateUnit,
                l.ApplyThickness,
                l.ChargeRoundingInch,
                calc.LengthInch,
                calc.WidthInch,
                calc.ChargeLengthInch,
                calc.ChargeWidthInch,
                // Legacy columns, kept populated so older reads keep working.
                HeightFt = calc.ChargeLengthInch / 12m,
                WidthFt = calc.ChargeWidthInch / 12m,
                AreaSqft = calc.AreaUnit == "SQFT" ? calc.Area : 0m,
                calc.CalculatedArea,
                calc.Area,
                calc.AreaUnit,
                calc.EffectiveRate,
                ThicknessMm = thickness,
                calc.CalculatedBasicAmount,
                calc.BasicAmount,
                l.DiscountPct,
                calc.DiscountAmount,
                calc.TaxableAmount,
                calc.GstPct,
                calc.GstAmount,
                calc.FinalAmount,
                l.ManualArea,
                l.ManualBasicAmount,
                calc.IsAreaManualOverride,
                calc.IsAmountManualOverride,
                calc.CalculationMethod,
                metadata,
                l.HoleQty,
                l.BHoleQty,
                l.CutoutQty,
                l.BCutoutQty,
            }, tx);

        return calc.FinalAmount;
    }
}

[ApiController]
[Route("api/v1/sales-orders")]
[Authorize]
public class SalesOrdersController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<SalesOrderDto>(
            @"SELECT o.SalesOrderId, o.OrderNo, o.CustomerId, c.Name AS CustomerName, o.QuotationId, o.OrderDate, o.Status,
                     o.BasicValue, o.GstValue, o.TotalValue, o.RoundOff, i.InvoiceId, i.InvoiceNo,
                     CAST(CASE WHEN i.InvoiceId IS NULL
                               AND NOT EXISTS (SELECT 1 FROM Cutting.CuttingPlan cp WHERE cp.SalesOrderId = o.SalesOrderId)
                               AND NOT EXISTS (SELECT 1 FROM Production.WorkOrder wo WHERE wo.SalesOrderId = o.SalesOrderId)
                          THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Sales.SalesOrder o
              JOIN Master.Customer c ON c.CustomerId = o.CustomerId
              OUTER APPLY (
                  SELECT TOP 1 InvoiceId, InvoiceNo FROM Sales.Invoice
                  WHERE SalesOrderId = o.SalesOrderId AND Status <> 'Cancelled'
                  ORDER BY InvoiceId DESC
              ) i
              ORDER BY o.SalesOrderId DESC");
        return Ok(new { items = rows });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var o = conn.QueryFirstOrDefault<SalesOrderDto>(
            @"SELECT o.SalesOrderId, o.OrderNo, o.CustomerId, c.Name AS CustomerName,
                     c.CustomerType, c.BillingAddress AS CustomerAddress, c.Gstin AS CustomerGstin,
                     c.Mobile AS CustomerMobile, c.StateName AS CustomerStateName,
                     o.QuotationId, q.QuotationNo, o.OrderDate, o.Status,
                     o.BasicValue, o.GstValue, o.TotalValue, o.RoundOff, i.InvoiceId, i.InvoiceNo,
                     CAST(CASE WHEN i.InvoiceId IS NULL
                               AND NOT EXISTS (SELECT 1 FROM Cutting.CuttingPlan cp WHERE cp.SalesOrderId = o.SalesOrderId)
                               AND NOT EXISTS (SELECT 1 FROM Production.WorkOrder wo WHERE wo.SalesOrderId = o.SalesOrderId)
                          THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Sales.SalesOrder o
              JOIN Master.Customer c ON c.CustomerId = o.CustomerId
              LEFT JOIN Sales.Quotation q ON q.QuotationId = o.QuotationId
              OUTER APPLY (
                  SELECT TOP 1 InvoiceId, InvoiceNo FROM Sales.Invoice
                  WHERE SalesOrderId = o.SalesOrderId AND Status <> 'Cancelled'
                  ORDER BY InvoiceId DESC
              ) i
              WHERE o.SalesOrderId = @id", new { id });
        if (o is null) return NotFound();
        o.Lines = conn.Query<SalesOrderLineDto>(
            @"SELECT l.ProductId, p.Code AS ProductCode, p.Description AS ProductDescription, l.Description,
                     l.Length, l.Width, l.DimensionUnit, l.Qty, l.Rate, l.RateUnit,
                     l.ApplyThickness, l.ChargeRoundingInch, l.GstPct, l.DiscountPct, l.ThicknessMm,
                     l.ManualArea, l.ManualBasicAmount,
                     l.LengthInch, l.WidthInch, l.ChargeLengthInch, l.ChargeWidthInch,
                     l.CalculatedArea, l.Area, l.AreaUnit, l.EffectiveRate,
                     l.CalculatedBasicAmount, l.BasicAmount, l.DiscountAmount, l.TaxableAmount,
                     l.GstAmount, l.Amount, l.Value,
                     l.CalculationMethod, l.IsAreaManualOverride, l.IsAmountManualOverride
              FROM Sales.SalesOrderLine l
              LEFT JOIN Master.Product p ON p.ProductId = l.ProductId
              WHERE l.SalesOrderId = @id", new { id }).ToList();
        return Ok(o);
    }

    /// <summary>Deletable only while no sales invoice (and no cutting plan / work order) has been
    /// raised against this order — mirrors the invoice-lock condition already enforced elsewhere.</summary>
    [RequirePermission("SalesOrder.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Sales.SalesOrder WHERE SalesOrderId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            var hasInvoice = conn.ExecuteScalar<int>(
                "SELECT COUNT(*) FROM Sales.Invoice WHERE SalesOrderId = @id AND Status <> 'Cancelled'", new { id }, tx) > 0;
            if (hasInvoice)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Order has an invoice", Status = 409, ErrorCode = "ORDER_HAS_INVOICE", Detail = "A sales invoice has already been generated against this order; it cannot be deleted." });
            }
            var hasProductionDocs = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Cutting.CuttingPlan WHERE SalesOrderId = @id", new { id }, tx) > 0
                || conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Production.WorkOrder WHERE SalesOrderId = @id", new { id }, tx) > 0;
            if (hasProductionDocs)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Order has production documents", Status = 409, ErrorCode = "ORDER_HAS_PRODUCTION_DOCS", Detail = "A cutting plan or work order has already been generated against this order; it cannot be deleted." });
            }

            var lines = conn.Query("SELECT * FROM Sales.SalesOrderLine WHERE SalesOrderId = @id", new { id }, tx).ToList();

            conn.Execute("DELETE FROM Sales.SalesOrderLine WHERE SalesOrderId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Sales.SalesOrder WHERE SalesOrderId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "SalesOrder", id.ToString(), new { SalesOrder = header, Lines = lines });
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("SalesOrder.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateSalesOrderRequest req)
    {
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "A sales order must have at least one line." });

        // Same rules as a quotation line — an order must not be able to hold a price the
        // quotation screen would have rejected.
        for (int i = 0; i < req.Lines.Count; i++)
        {
            var l = req.Lines[i];
            var problem = SalesLinePricing.Validate(l.Length, l.Width, l.DimensionUnit, l.Qty, l.Rate,
                l.RateUnit, l.GstPct, l.DiscountPct, l.ChargeRoundingInch, l.ThicknessMm,
                l.ManualArea, l.ManualBasicAmount);
            if (problem is not null)
                return UnprocessableEntity(new ProblemResponse
                {
                    Title = "Validation failed",
                    Status = 422,
                    ErrorCode = "VALIDATION_ERROR",
                    Detail = $"Line {i + 1}: {problem}",
                });
        }

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string orderNo = DocNumbering.NextNumber(conn, tx, branchId, "SalesOrder");

            var productIds = req.Lines.Where(l => l.ProductId.HasValue).Select(l => l.ProductId!.Value).Distinct().ToArray();
            var thicknessByProduct = productIds.Length == 0
                ? new Dictionary<int, decimal>()
                : conn.Query<(int ProductId, decimal? ThicknessMm)>(
                    "SELECT ProductId, ThicknessMm FROM Master.Product WHERE ProductId IN @ids",
                    new { ids = productIds }, tx)
                    .ToDictionary(r => r.ProductId, r => r.ThicknessMm ?? 0m);

            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Sales.SalesOrder (OrderNo, CustomerId, BranchId, QuotationId, Status, BasicValue, GstValue, TotalValue)
                  OUTPUT INSERTED.SalesOrderId VALUES (@orderNo, @CustomerId, @branchId, @QuotationId, 'Approved', 0, 0, 0)",
                new { orderNo, req.CustomerId, branchId, req.QuotationId }, tx);

            decimal basicTotal = 0, gstTotal = 0, total = 0;
            foreach (var l in req.Lines)
            {
                decimal masterThickness = l.ProductId.HasValue && thicknessByProduct.TryGetValue(l.ProductId.Value, out var t) ? t : 0m;
                var calc = SalesLinePricing.Price(l.Length, l.Width, l.DimensionUnit, l.Qty, l.Rate,
                    l.RateUnit, l.ApplyThickness, l.ChargeRoundingInch, l.GstPct, l.DiscountPct,
                    l.ThicknessMm, masterThickness, l.ManualArea, l.ManualBasicAmount);

                basicTotal += calc.BasicAmount;
                gstTotal += calc.GstAmount;
                total += calc.FinalAmount;

                conn.Execute(
                    @"INSERT INTO Sales.SalesOrderLine
                        (SalesOrderId, ProductId, Description, Qty, Rate, Value,
                         Length, Width, DimensionUnit, RateUnit, ApplyThickness, ChargeRoundingInch, ThicknessMm,
                         LengthInch, WidthInch, ChargeLengthInch, ChargeWidthInch,
                         CalculatedArea, Area, AreaUnit, EffectiveRate,
                         CalculatedBasicAmount, BasicAmount, DiscountPct, DiscountAmount, TaxableAmount,
                         GstPct, GstAmount, Amount,
                         ManualArea, ManualBasicAmount, IsAreaManualOverride, IsAmountManualOverride,
                         CalculationMethod, CalculationMetadata)
                      VALUES
                        (@id, @ProductId, @Description, @Qty, @Rate, @BasicAmount,
                         @Length, @Width, @DimensionUnit, @RateUnit, @ApplyThickness, @ChargeRoundingInch, @ThicknessMm,
                         @LengthInch, @WidthInch, @ChargeLengthInch, @ChargeWidthInch,
                         @CalculatedArea, @Area, @AreaUnit, @EffectiveRate,
                         @CalculatedBasicAmount, @BasicAmount, @DiscountPct, @DiscountAmount, @TaxableAmount,
                         @GstPct, @GstAmount, @FinalAmount,
                         @ManualArea, @ManualBasicAmount, @IsAreaManualOverride, @IsAmountManualOverride,
                         @CalculationMethod, @metadata)",
                    new
                    {
                        id,
                        l.ProductId,
                        l.Description,
                        calc.Qty,
                        calc.Rate,
                        calc.Length,
                        calc.Width,
                        calc.DimensionUnit,
                        calc.RateUnit,
                        l.ApplyThickness,
                        l.ChargeRoundingInch,
                        ThicknessMm = calc.ThicknessMm,
                        calc.LengthInch,
                        calc.WidthInch,
                        calc.ChargeLengthInch,
                        calc.ChargeWidthInch,
                        calc.CalculatedArea,
                        calc.Area,
                        calc.AreaUnit,
                        calc.EffectiveRate,
                        calc.CalculatedBasicAmount,
                        calc.BasicAmount,
                        l.DiscountPct,
                        calc.DiscountAmount,
                        calc.TaxableAmount,
                        calc.GstPct,
                        calc.GstAmount,
                        calc.FinalAmount,
                        l.ManualArea,
                        l.ManualBasicAmount,
                        calc.IsAreaManualOverride,
                        calc.IsAmountManualOverride,
                        calc.CalculationMethod,
                        metadata = SalesLinePricing.Metadata(calc, calc.ThicknessMm, l.ManualArea, l.ManualBasicAmount, l.DiscountPct),
                    }, tx);
            }

            // Total is always rounded to the nearest whole rupee, same convention Invoice already
            // uses; the delta is kept in RoundOff so the printed total reconciles with the lines.
            decimal rounded = Math.Round(total, 0, MidpointRounding.AwayFromZero);
            decimal roundOff = rounded - total;
            conn.Execute(
                "UPDATE Sales.SalesOrder SET BasicValue = @basicTotal, GstValue = @gstTotal, TotalValue = @rounded, RoundOff = @roundOff WHERE SalesOrderId = @id",
                new { basicTotal, gstTotal, rounded, roundOff, id }, tx);

            if (req.QuotationId.HasValue)
                conn.Execute("UPDATE Sales.Quotation SET Status = 'Converted' WHERE QuotationId = @QuotationId", new { req.QuotationId }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'SalesOrder', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/sales-orders/{id}", new { salesOrderId = id, orderNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }
}
