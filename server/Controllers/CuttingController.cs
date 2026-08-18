using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/cutting-plans")]
[Authorize]
public class CuttingController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<CuttingPlanDto>(
            @"SELECT cp.CuttingPlanId, cp.PlanNo, cp.SalesOrderId, so.OrderNo, cp.PlanDate, cp.Status, cp.TotalSheets, cp.YieldPct, cp.WasteAreaSqft
              FROM Cutting.CuttingPlan cp LEFT JOIN Sales.SalesOrder so ON so.SalesOrderId = cp.SalesOrderId
              ORDER BY cp.CuttingPlanId DESC");
        return Ok(new { items = rows });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var plan = conn.QueryFirstOrDefault<CuttingPlanDto>(
            @"SELECT cp.CuttingPlanId, cp.PlanNo, cp.SalesOrderId, so.OrderNo, cp.PlanDate, cp.Status, cp.TotalSheets, cp.YieldPct, cp.WasteAreaSqft
              FROM Cutting.CuttingPlan cp LEFT JOIN Sales.SalesOrder so ON so.SalesOrderId = cp.SalesOrderId WHERE cp.CuttingPlanId = @id", new { id });
        if (plan is null) return NotFound();
        plan.Lines = conn.Query<CuttingPlanLineDto>(
            @"SELECT l.ProductId, p.Code AS ProductCode, l.RequiredLengthMm, l.RequiredWidthMm, l.Qty, l.Status
              FROM Cutting.CuttingPlanLine l JOIN Master.Product p ON p.ProductId = l.ProductId WHERE l.CuttingPlanId = @id", new { id }).ToList();
        return Ok(plan);
    }

    /// <summary>
    /// Simplified nesting summary (SDD 11.1): standard sheet assumed 3210x2250mm (Jumbo).
    /// Computes required piece area with a small kerf allowance and estimates sheets/yield/waste —
    /// a real guillotine/skyline placement solver is a future enhancement (ICuttingOptimizer interface point).
    /// </summary>
    [RequirePermission("CuttingPlan.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateCuttingPlanRequest req)
    {
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "A cutting plan needs at least one required piece." });

        const decimal kerfMm = 5m;
        const decimal sheetLengthMm = 3210m, sheetWidthMm = 2250m;
        decimal sheetAreaSqft = (sheetLengthMm * sheetWidthMm) / 92903.04m;

        decimal totalPieceAreaSqft = 0;
        int totalPieces = 0;
        foreach (var l in req.Lines)
        {
            decimal pieceAreaSqft = ((l.RequiredLengthMm + kerfMm) * (l.RequiredWidthMm + kerfMm)) / 92903.04m;
            totalPieceAreaSqft += pieceAreaSqft * l.Qty;
            totalPieces += l.Qty;
        }

        int estimatedSheets = Math.Max(1, (int)Math.Ceiling((double)(totalPieceAreaSqft / (sheetAreaSqft * 0.85m))));
        decimal usedAreaSqft = estimatedSheets * sheetAreaSqft;
        decimal yieldPct = usedAreaSqft > 0 ? Math.Round(totalPieceAreaSqft / usedAreaSqft * 100m, 2) : 0;
        decimal wasteAreaSqft = Math.Round(usedAreaSqft - totalPieceAreaSqft, 3);

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string planNo = DocNumbering.NextNumber(conn, tx, branchId, "CuttingPlan");

            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Cutting.CuttingPlan (PlanNo, SalesOrderId, Status, TotalSheets, YieldPct, WasteAreaSqft)
                  OUTPUT INSERTED.CuttingPlanId VALUES (@planNo, @SalesOrderId, 'Optimized', @estimatedSheets, @yieldPct, @wasteAreaSqft)",
                new { planNo, req.SalesOrderId, estimatedSheets, yieldPct, wasteAreaSqft }, tx);

            foreach (var l in req.Lines)
                conn.Execute(
                    @"INSERT INTO Cutting.CuttingPlanLine (CuttingPlanId, ProductId, RequiredLengthMm, RequiredWidthMm, Qty)
                      VALUES (@id, @ProductId, @RequiredLengthMm, @RequiredWidthMm, @Qty)",
                    new { id, l.ProductId, l.RequiredLengthMm, l.RequiredWidthMm, l.Qty }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'CuttingPlan', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/cutting-plans/{id}", new { cuttingPlanId = id, planNo, estimatedSheets, yieldPct, wasteAreaSqft, totalPieces });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Nothing references a cutting plan and it never touches stock (confirmed via
    /// sys.foreign_keys -- only its own CuttingPlanLine rows point at it), so this is always
    /// deletable, subject to permission.</summary>
    [RequirePermission("CuttingPlan.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Cutting.CuttingPlan WHERE CuttingPlanId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            var lines = conn.Query("SELECT * FROM Cutting.CuttingPlanLine WHERE CuttingPlanId = @id", new { id }, tx).ToList();

            conn.Execute("DELETE FROM Cutting.CuttingPlanLine WHERE CuttingPlanId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Cutting.CuttingPlan WHERE CuttingPlanId = @id", new { id }, tx);

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "CuttingPlan", id.ToString(), new { CuttingPlan = header, Lines = lines });
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
