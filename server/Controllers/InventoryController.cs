using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1")]
[Authorize]
public class InventoryController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet("godowns")]
    public IActionResult ListGodowns()
    {
        using var conn = db.CreateConnection();
        var godowns = conn.Query<GodownDto>(
            @"SELECT g.GodownId, g.BranchId, g.Code, g.Name, g.Location,
                     (SELECT COUNT(*) FROM Company.Rack r WHERE r.GodownId = g.GodownId AND r.IsActive = 1) AS RackCount
              FROM Company.Godown g WHERE g.IsActive = 1 ORDER BY g.Name");
        return Ok(new { items = godowns });
    }

    /// <summary>Godown master-detail: the godown plus its racks, for the combined Godown screen.
    /// Racks are a detail of the godown, not a separate master — there is no standalone Rack list page.</summary>
    [HttpGet("godowns/{id:int}")]
    public IActionResult GetGodown(int id)
    {
        using var conn = db.CreateConnection();
        var godown = conn.QueryFirstOrDefault<GodownDetailDto>(
            "SELECT GodownId, Code, Name, Location FROM Company.Godown WHERE GodownId = @id AND IsActive = 1", new { id });
        if (godown is null)
            return NotFound(new ProblemResponse { Title = "Godown not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The selected godown does not exist." });

        godown.Racks = conn.Query<RackDto>(
            @"SELECT r.RackId, r.GodownId, g.Name AS GodownName, r.Name, r.Code, r.IsActive
              FROM Company.Rack r JOIN Company.Godown g ON g.GodownId = r.GodownId
              WHERE r.IsActive = 1 AND r.GodownId = @id ORDER BY r.Name", new { id }).ToList();
        return Ok(godown);
    }

    [RequirePermission("Godown.Create")]
    [HttpPost("godowns")]
    public IActionResult CreateGodown([FromBody] CreateGodownRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "Enter a godown name." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            var code = string.IsNullOrWhiteSpace(req.Code) ? req.Name.Trim().ToUpperInvariant().Replace(" ", "-") : req.Code.Trim();

            var existing = conn.QueryFirstOrDefault<int?>("SELECT GodownId FROM Company.Godown WHERE Code = @code", new { code }, tx);
            if (existing.HasValue)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A godown with code '{code}' already exists." });
            }

            var id = conn.ExecuteScalar<int>(
                "INSERT INTO Company.Godown (BranchId, Code, Name, Location, IsActive) OUTPUT INSERTED.GodownId VALUES (@branchId, @code, @Name, @Location, 1)",
                new { branchId, code, req.Name, req.Location }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'Godown', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/godowns/{id}", new { godownId = id, code });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("Godown.Edit")]
    [HttpPut("godowns/{id:int}")]
    public IActionResult UpdateGodown(int id, [FromBody] UpdateGodownRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "Enter a godown name." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var exists = conn.QueryFirstOrDefault<int?>("SELECT GodownId FROM Company.Godown WHERE GodownId = @id AND IsActive = 1", new { id }, tx);
            if (!exists.HasValue)
            {
                tx.Rollback();
                return NotFound(new ProblemResponse { Title = "Godown not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The selected godown does not exist." });
            }

            conn.Execute("UPDATE Company.Godown SET Name = @Name, Location = @Location WHERE GodownId = @id", new { id, req.Name, req.Location }, tx);
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Update', 'Godown', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    // ---------------- Racks (detail of a Godown — no standalone Rack master screen) ----------------
    [HttpGet("racks")]
    public IActionResult ListRacks([FromQuery] int? godownId)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<RackDto>(
            @"SELECT r.RackId, r.GodownId, g.Name AS GodownName, r.Name, r.Code, r.IsActive
              FROM Company.Rack r JOIN Company.Godown g ON g.GodownId = r.GodownId
              WHERE r.IsActive = 1 AND (@godownId IS NULL OR r.GodownId = @godownId)
              ORDER BY g.Name, r.Name", new { godownId });
        return Ok(new { items = rows });
    }

    [RequirePermission("Rack.Create")]
    [HttpPost("racks")]
    public IActionResult CreateRack([FromBody] CreateRackRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "Enter a rack name." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var godown = conn.QueryFirstOrDefault("SELECT GodownId, Name FROM Company.Godown WHERE GodownId = @GodownId", new { req.GodownId }, tx);
            if (godown is null)
            {
                tx.Rollback();
                return NotFound(new ProblemResponse { Title = "Godown not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The selected godown does not exist." });
            }

            string rackName = req.Name.Trim();
            // The one rule the user asked for: the rack's code is never typed, only ever
            // derived — "<GodownName>_<RackName>", e.g. "Godown1_Rack1".
            string godownName = ((string)godown.Name).Replace(" ", "");
            string code = $"{godownName}_{rackName}";

            var dupe = conn.QueryFirstOrDefault<int?>(
                "SELECT RackId FROM Company.Rack WHERE GodownId = @GodownId AND Name = @rackName", new { req.GodownId, rackName }, tx);
            if (dupe.HasValue)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Duplicate rack", Status = 409, ErrorCode = "DUPLICATE_RACK", Detail = $"This godown already has a rack named '{rackName}'." });
            }

            var id = conn.ExecuteScalar<int>(
                "INSERT INTO Company.Rack (GodownId, Name, Code, IsActive) OUTPUT INSERTED.RackId VALUES (@GodownId, @rackName, @code, 1)",
                new { req.GodownId, rackName, code }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'Rack', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/racks/{id}", new { rackId = id, code });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("Rack.Edit")]
    [HttpPut("racks/{id:int}")]
    public IActionResult UpdateRack(int id, [FromBody] UpdateRackRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "Enter a rack name." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var rack = conn.QueryFirstOrDefault("SELECT RackId, GodownId FROM Company.Rack WHERE RackId = @id AND IsActive = 1", new { id }, tx);
            if (rack is null)
            {
                tx.Rollback();
                return NotFound(new ProblemResponse { Title = "Rack not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The selected rack does not exist." });
            }
            int godownId = rack.GodownId;
            var godown = conn.QueryFirstOrDefault("SELECT Name FROM Company.Godown WHERE GodownId = @godownId", new { godownId }, tx);

            string rackName = req.Name.Trim();
            string godownName = ((string)godown.Name).Replace(" ", "");
            string code = $"{godownName}_{rackName}";

            var dupe = conn.QueryFirstOrDefault<int?>(
                "SELECT RackId FROM Company.Rack WHERE GodownId = @godownId AND Name = @rackName AND RackId <> @id", new { godownId, rackName, id }, tx);
            if (dupe.HasValue)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Duplicate rack", Status = 409, ErrorCode = "DUPLICATE_RACK", Detail = $"This godown already has a rack named '{rackName}'." });
            }

            conn.Execute("UPDATE Company.Rack SET Name = @rackName, Code = @code WHERE RackId = @id", new { id, rackName, code }, tx);
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Update', 'Rack', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    // ---------------- Rack Stock (physical location ledger) ----------------
    [HttpGet("rack-stock")]
    public IActionResult ListRackStock([FromQuery] int? godownId, [FromQuery] int? rackId, [FromQuery] int? productId)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<RackStockDto>(
            @"SELECT rs.RackStockId, rs.ProductId, p.Code AS ProductCode, p.Description AS ProductDescription,
                     rs.RackId, r.Code AS RackCode, r.GodownId, g.Name AS GodownName, rs.QtyOnHand, p.StockUnit AS Unit, rs.ModifiedOn
              FROM Inventory.RackStock rs
              JOIN Master.Product p ON p.ProductId = rs.ProductId
              JOIN Company.Rack r ON r.RackId = rs.RackId
              JOIN Company.Godown g ON g.GodownId = r.GodownId
              WHERE (@godownId IS NULL OR r.GodownId = @godownId)
                AND (@rackId IS NULL OR rs.RackId = @rackId)
                AND (@productId IS NULL OR rs.ProductId = @productId)
              ORDER BY g.Name, r.Name, p.Description", new { godownId, rackId, productId });
        return Ok(new { items = rows });
    }

    /// <summary>Always allowed -- RackStock is a second, independent ledger from the godown-level
    /// StockBalance (reconciled by comparison, never a shared row) and nothing downstream ever
    /// references a RackStockId, so removing a row never touches StockBalance/StockMovement; it
    /// simply means this rack no longer carries a tracked quantity for that product.</summary>
    [RequirePermission("RackStock.Delete")]
    [HttpDelete("rack-stock/{id:int}")]
    public IActionResult DeleteRackStock(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var row = conn.QueryFirstOrDefault("SELECT * FROM Inventory.RackStock WHERE RackStockId = @id", new { id }, tx);
            if (row is null) { tx.Rollback(); return NotFound(); }

            conn.Execute("DELETE FROM Inventory.RackStock WHERE RackStockId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "RackStock", id.ToString(), row);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Records what was physically counted at a rack — the rack-level equivalent of a
    /// Stock Adjustment. Never touches the godown-level StockBalance: that book figure is exactly
    /// what a rack count is meant to be compared against, not overwritten by.</summary>
    [RequirePermission("RackStock.Adjust")]
    [HttpPost("rack-stock/adjust")]
    public IActionResult AdjustRackStock([FromBody] AdjustRackStockRequest req)
    {
        if (req.ActualQty < 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid quantity", Status = 422, ErrorCode = "QTY_INVALID", Detail = "Counted quantity cannot be negative." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var rack = conn.QueryFirstOrDefault("SELECT RackId FROM Company.Rack WHERE RackId = @RackId AND IsActive = 1", new { req.RackId }, tx);
            if (rack is null)
            {
                tx.Rollback();
                return NotFound(new ProblemResponse { Title = "Rack not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The selected rack does not exist." });
            }

            var existing = conn.QueryFirstOrDefault(
                "SELECT RackStockId, QtyOnHand FROM Inventory.RackStock WHERE ProductId = @ProductId AND RackId = @RackId", new { req.ProductId, req.RackId }, tx);
            if (existing is null)
                conn.Execute("INSERT INTO Inventory.RackStock (ProductId, RackId, QtyOnHand) VALUES (@ProductId, @RackId, @ActualQty)", req, tx);
            else
                conn.Execute("UPDATE Inventory.RackStock SET QtyOnHand = @ActualQty, ModifiedOn = SYSUTCDATETIME() WHERE RackStockId = @id",
                    new { req.ActualQty, id = (int)existing.RackStockId }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Adjust', 'RackStock', @id)",
                new { id = $"{req.ProductId}/{req.RackId}" }, tx);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Shifts stock from one rack to another. Same godown: only the rack ledger moves.
    /// Different godown: the rack ledger moves *and* the existing godown-level StockBalance /
    /// StockMovement move with it, exactly like a Stock Transfer, so the free-stock figure the
    /// rest of the app relies on (e.g. the quotation shortage check) stays correct.</summary>
    [RequirePermission("RackStock.Transfer")]
    [HttpPost("rack-stock/transfer")]
    public IActionResult TransferRackStock([FromBody] TransferRackStockRequest req)
    {
        if (req.Qty <= 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid quantity", Status = 422, ErrorCode = "QTY_INVALID", Detail = "Transfer quantity must be greater than zero." });
        if (req.FromRackId == req.ToRackId)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid transfer", Status = 422, ErrorCode = "SAME_RACK", Detail = "Source and destination rack must differ." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var fromRack = conn.QueryFirstOrDefault("SELECT RackId, GodownId FROM Company.Rack WHERE RackId = @FromRackId AND IsActive = 1", new { req.FromRackId }, tx);
            var toRack = conn.QueryFirstOrDefault("SELECT RackId, GodownId FROM Company.Rack WHERE RackId = @ToRackId AND IsActive = 1", new { req.ToRackId }, tx);
            if (fromRack is null || toRack is null)
            {
                tx.Rollback();
                return NotFound(new ProblemResponse { Title = "Rack not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "Source or destination rack does not exist." });
            }

            var fromStock = conn.QueryFirstOrDefault(
                "SELECT RackStockId, QtyOnHand FROM Inventory.RackStock WHERE ProductId = @ProductId AND RackId = @FromRackId", new { req.ProductId, req.FromRackId }, tx);
            decimal onHand = fromStock?.QtyOnHand ?? 0m;
            if (onHand < req.Qty)
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse { Title = "Insufficient rack stock", Status = 422, ErrorCode = "RACK_STOCK_INSUFFICIENT", Detail = $"Only {onHand} available in the source rack for this product." });
            }

            conn.Execute("UPDATE Inventory.RackStock SET QtyOnHand = QtyOnHand - @Qty, ModifiedOn = SYSUTCDATETIME() WHERE RackStockId = @id",
                new { req.Qty, id = (int)fromStock!.RackStockId }, tx);

            var toStock = conn.QueryFirstOrDefault(
                "SELECT RackStockId FROM Inventory.RackStock WHERE ProductId = @ProductId AND RackId = @ToRackId", new { req.ProductId, req.ToRackId }, tx);
            if (toStock is null)
                conn.Execute("INSERT INTO Inventory.RackStock (ProductId, RackId, QtyOnHand) VALUES (@ProductId, @ToRackId, @Qty)", req, tx);
            else
                conn.Execute("UPDATE Inventory.RackStock SET QtyOnHand = QtyOnHand + @Qty, ModifiedOn = SYSUTCDATETIME() WHERE RackStockId = @id",
                    new { req.Qty, id = (int)toStock.RackStockId }, tx);

            int fromGodownId = fromRack.GodownId;
            int toGodownId = toRack.GodownId;
            if (fromGodownId != toGodownId)
            {
                // Cross-godown: mirror the move into the godown-level ledger, same as Stock Transfer.
                var fromBalance = conn.QueryFirstOrDefault(
                    "SELECT StockBalanceId, QtyOnHand FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @fromGodownId", new { req.ProductId, fromGodownId }, tx);
                decimal godownOnHand = fromBalance?.QtyOnHand ?? 0m;
                if (godownOnHand < req.Qty)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Insufficient godown stock", Status = 422, ErrorCode = "STOCK_INSUFFICIENT", Detail = $"Only {godownOnHand} available for this product at the source godown." });
                }
                conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @Qty WHERE StockBalanceId = @id",
                    new { req.Qty, id = (int)fromBalance!.StockBalanceId }, tx);

                var toBalance = conn.QueryFirstOrDefault(
                    "SELECT StockBalanceId FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @toGodownId", new { req.ProductId, toGodownId }, tx);
                if (toBalance is null)
                    conn.Execute("INSERT INTO Inventory.StockBalance (ProductId, GodownId, QtyOnHand) VALUES (@ProductId, @toGodownId, @Qty)", new { req.ProductId, toGodownId, req.Qty }, tx);
                else
                    conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand + @Qty WHERE StockBalanceId = @id", new { req.Qty, id = (int)toBalance.StockBalanceId }, tx);

                conn.Execute("INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, Qty) VALUES (@ProductId, @fromGodownId, 'TransferOut', 'RackTransfer', @negQty)",
                    new { req.ProductId, fromGodownId, negQty = -req.Qty }, tx);
                conn.Execute("INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, Qty) VALUES (@ProductId, @toGodownId, 'TransferIn', 'RackTransfer', @Qty)",
                    new { req.ProductId, toGodownId, req.Qty }, tx);
            }

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Transfer', 'RackStock', @id)",
                new { id = $"{req.ProductId}/{req.FromRackId}->{req.ToRackId}" }, tx);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [HttpGet("stock")]
    public IActionResult StockEnquiry([FromQuery] int? godownId, [FromQuery] string? search)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<StockBalanceDto>(
            @"SELECT sb.StockBalanceId, sb.ProductId, p.Code AS ProductCode, p.Description AS ProductDescription,
                     CONCAT(ISNULL(CAST(p.ThicknessMm AS NVARCHAR(10)),'—'), ' mm / ', ISNULL(p.Colour,'—')) AS ThicknessAndColour,
                     sb.GodownId, g.Name AS GodownName, sb.QtyOnHand, sb.QtyReserved, sb.QtyBlocked, sb.QtyDamaged,
                     (sb.QtyOnHand - sb.QtyReserved - sb.QtyBlocked - sb.QtyDamaged) AS QtyFree, sb.AvgRate, p.StockUnit AS Unit
              FROM Inventory.StockBalance sb
              JOIN Master.Product p ON p.ProductId = sb.ProductId
              JOIN Company.Godown g ON g.GodownId = sb.GodownId
              WHERE (@godownId IS NULL OR sb.GodownId = @godownId)
                AND (@search IS NULL OR p.Code LIKE '%' + @search + '%' OR p.Description LIKE '%' + @search + '%')
              ORDER BY p.Description", new { godownId, search });
        return Ok(new { items = rows, total = rows.Count() });
    }

    // ---------------- Stock Opening ----------------
    [HttpGet("stock-openings")]
    public IActionResult ListStockOpenings()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<StockOpeningDto>(
            @"SELECT o.StockOpeningId, o.OpeningNo, o.GodownId, g.Name AS GodownName, o.OpeningDate, o.Status, o.Remarks
              FROM Inventory.StockOpening o JOIN Company.Godown g ON g.GodownId = o.GodownId
              ORDER BY o.StockOpeningId DESC");
        return Ok(new { items = rows });
    }

    /// <summary>Inbound-only, unlike Stock Adjustment (which sets book qty to a counted actual and
    /// can move the balance either way) -- Stock Opening always adds the entered quantity, the same
    /// way a Purchase/GRN increases stock, so it's the right tool for recording pre-existing stock
    /// a product had before it was tracked in this system.</summary>
    [RequirePermission("StockOpening.Create")]
    [HttpPost("stock-openings")]
    public IActionResult CreateStockOpening([FromBody] CreateStockOpeningRequest req)
    {
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "Add at least one product with an opening quantity." });
        var badLine = req.Lines.FirstOrDefault(l => l.Qty <= 0);
        if (badLine is not null)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid quantity", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "Opening quantity must be greater than zero for every line." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string openingNo = DocNumbering.NextNumber(conn, tx, branchId, "StockOpening");

            var openingId = conn.ExecuteScalar<int>(
                @"INSERT INTO Inventory.StockOpening (OpeningNo, GodownId, Remarks, Status)
                  OUTPUT INSERTED.StockOpeningId
                  VALUES (@openingNo, @GodownId, @Remarks, 'Posted')", new { openingNo, req.GodownId, req.Remarks }, tx);

            foreach (var line in req.Lines)
            {
                conn.Execute(
                    "INSERT INTO Inventory.StockOpeningLine (StockOpeningId, ProductId, Qty) VALUES (@openingId, @ProductId, @Qty)",
                    new { openingId, line.ProductId, line.Qty }, tx);

                var balance = conn.QueryFirstOrDefault(
                    "SELECT StockBalanceId FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @GodownId",
                    new { line.ProductId, req.GodownId }, transaction: tx);
                if (balance is null)
                    conn.Execute("INSERT INTO Inventory.StockBalance (ProductId, GodownId, QtyOnHand) VALUES (@ProductId, @GodownId, @Qty)",
                        new { line.ProductId, req.GodownId, line.Qty }, tx);
                else
                    conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand + @Qty WHERE StockBalanceId = @id",
                        new { line.Qty, id = (int)balance.StockBalanceId }, tx);

                conn.Execute(
                    @"INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty)
                      VALUES (@ProductId, @GodownId, 'Opening', 'StockOpening', @openingId, @Qty)",
                    new { line.ProductId, req.GodownId, openingId, line.Qty }, tx);
            }

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'StockOpening', @id)", new { id = openingId.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/stock-openings/{openingId}", new { stockOpeningId = openingId, openingNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Same "stock already moved on" guard as StockAdjustment.Delete/GrnController.Delete
    /// -- reverses exactly what this entry added (read back from its own Inventory.StockMovement
    /// rows) and refuses if any of it has since moved on elsewhere.</summary>
    [RequirePermission("StockOpening.Delete")]
    [HttpDelete("stock-openings/{id:int}")]
    public IActionResult DeleteStockOpening(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Inventory.StockOpening WHERE StockOpeningId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            var lines = conn.Query("SELECT * FROM Inventory.StockOpeningLine WHERE StockOpeningId = @id", new { id }, tx).ToList();

            var movements = conn.Query<(int ProductId, int GodownId, decimal Qty)>(
                "SELECT ProductId, GodownId, Qty FROM Inventory.StockMovement WHERE DocType = 'StockOpening' AND DocId = @id AND MovementType = 'Opening'",
                new { id }, tx).ToList();

            foreach (var m in movements)
            {
                var current = conn.ExecuteScalar<decimal?>(
                    "SELECT QtyOnHand FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @GodownId",
                    new { m.ProductId, m.GodownId }, tx) ?? 0m;
                if (current - m.Qty < 0)
                {
                    tx.Rollback();
                    var product = conn.QueryFirstOrDefault<string>("SELECT Code FROM Master.Product WHERE ProductId = @ProductId", new { m.ProductId }, tx);
                    return Conflict(new ProblemResponse
                    {
                        Title = "Stock already moved",
                        Status = 409,
                        ErrorCode = "OPENING_STOCK_MOVED",
                        Detail = $"{product ?? $"Product {m.ProductId}"}: stock has moved on since this opening entry (only {current} now on hand); reversing it would take the balance negative. This entry cannot be deleted.",
                    });
                }
            }

            foreach (var m in movements)
            {
                conn.Execute(
                    "UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @Qty WHERE ProductId = @ProductId AND GodownId = @GodownId",
                    new { m.Qty, m.ProductId, m.GodownId }, tx);
            }
            conn.Execute("DELETE FROM Inventory.StockMovement WHERE DocType = 'StockOpening' AND DocId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Inventory.StockOpeningLine WHERE StockOpeningId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Inventory.StockOpening WHERE StockOpeningId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "StockOpening", id.ToString(), new { Opening = header, Lines = lines, ReversedStockMovements = movements });
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    // ---------------- Stock Adjustment ----------------
    [HttpGet("stock-adjustments")]
    public IActionResult ListAdjustments()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<StockAdjustmentDto>(
            @"SELECT a.StockAdjustmentId, a.AdjustmentNo, a.GodownId, g.Name AS GodownName, a.AdjustmentDate, a.Status, a.Reason
              FROM Inventory.StockAdjustment a JOIN Company.Godown g ON g.GodownId = a.GodownId
              ORDER BY a.StockAdjustmentId DESC");
        return Ok(new { items = rows });
    }

    [RequirePermission("StockAdjustment.Create")]
    [HttpPost("stock-adjustments")]
    public IActionResult CreateAdjustment([FromBody] CreateStockAdjustmentRequest req)
    {
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "Add at least one product to adjust." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string adjNo = DocNumbering.NextNumber(conn, tx, branchId, "StockAdjustment");

            var adjustmentId = conn.ExecuteScalar<int>(
                @"INSERT INTO Inventory.StockAdjustment (AdjustmentNo, GodownId, Reason, Status)
                  OUTPUT INSERTED.StockAdjustmentId
                  VALUES (@adjNo, @GodownId, @Reason, 'Approved')", new { adjNo, req.GodownId, req.Reason }, tx);

            foreach (var line in req.Lines)
            {
                var balance = conn.QueryFirstOrDefault(
                    "SELECT StockBalanceId, QtyOnHand FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @GodownId",
                    new { line.ProductId, req.GodownId }, transaction: tx);
                decimal bookQty = balance?.QtyOnHand ?? 0m;
                decimal diff = line.ActualQty - bookQty;

                conn.Execute(
                    @"INSERT INTO Inventory.StockAdjustmentLine (StockAdjustmentId, ProductId, BookQty, ActualQty)
                      VALUES (@adjustmentId, @ProductId, @bookQty, @ActualQty)",
                    new { adjustmentId, line.ProductId, bookQty, line.ActualQty }, tx);

                if (balance is null)
                {
                    conn.Execute("INSERT INTO Inventory.StockBalance (ProductId, GodownId, QtyOnHand) VALUES (@ProductId, @GodownId, @ActualQty)",
                        new { line.ProductId, req.GodownId, line.ActualQty }, tx);
                }
                else
                {
                    conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = @ActualQty WHERE StockBalanceId = @id",
                        new { line.ActualQty, id = (int)balance.StockBalanceId }, tx);
                }

                if (diff != 0)
                {
                    conn.Execute(
                        @"INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty)
                          VALUES (@ProductId, @GodownId, 'Adjustment', 'StockAdjustment', @adjustmentId, @diff)",
                        new { line.ProductId, req.GodownId, adjustmentId, diff }, tx);
                }
            }

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'StockAdjustment', @id)", new { id = adjustmentId.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/stock-adjustments/{adjustmentId}", new { stockAdjustmentId = adjustmentId, adjustmentNo = adjNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Nothing downstream ever references a Stock Adjustment, so it's always offered for
    /// delete -- but it already moved real stock in, so deleting it must reverse exactly what it
    /// moved (read back from its own Inventory.StockMovement rows, not recomputed) and is refused
    /// if any of that stock has since moved on elsewhere, the same "stock already moved on" rule
    /// GrnController.Delete already enforces for the same reason.</summary>
    [RequirePermission("StockAdjustment.Delete")]
    [HttpDelete("stock-adjustments/{id:int}")]
    public IActionResult DeleteAdjustment(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Inventory.StockAdjustment WHERE StockAdjustmentId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            var lines = conn.Query("SELECT * FROM Inventory.StockAdjustmentLine WHERE StockAdjustmentId = @id", new { id }, tx).ToList();

            var movements = conn.Query<(int ProductId, int GodownId, decimal Qty)>(
                "SELECT ProductId, GodownId, Qty FROM Inventory.StockMovement WHERE DocType = 'StockAdjustment' AND DocId = @id AND MovementType = 'Adjustment'",
                new { id }, tx).ToList();

            foreach (var m in movements)
            {
                var current = conn.ExecuteScalar<decimal?>(
                    "SELECT QtyOnHand FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @GodownId",
                    new { m.ProductId, m.GodownId }, tx) ?? 0m;
                if (current - m.Qty < 0)
                {
                    tx.Rollback();
                    var product = conn.QueryFirstOrDefault<string>("SELECT Code FROM Master.Product WHERE ProductId = @ProductId", new { m.ProductId }, tx);
                    return Conflict(new ProblemResponse
                    {
                        Title = "Stock already moved",
                        Status = 409,
                        ErrorCode = "ADJUSTMENT_STOCK_MOVED",
                        Detail = $"{product ?? $"Product {m.ProductId}"}: stock has moved on since this adjustment (only {current} now on hand); reversing it would take the balance negative. This adjustment cannot be deleted.",
                    });
                }
            }

            foreach (var m in movements)
            {
                conn.Execute(
                    "UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @Qty WHERE ProductId = @ProductId AND GodownId = @GodownId",
                    new { m.Qty, m.ProductId, m.GodownId }, tx);
            }
            conn.Execute("DELETE FROM Inventory.StockMovement WHERE DocType = 'StockAdjustment' AND DocId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Inventory.StockAdjustmentLine WHERE StockAdjustmentId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Inventory.StockAdjustment WHERE StockAdjustmentId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "StockAdjustment", id.ToString(), new { Adjustment = header, Lines = lines, ReversedStockMovements = movements });
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    // ---------------- Stock Transfer ----------------
    [HttpGet("stock-transfers")]
    public IActionResult ListTransfers()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<StockTransferDto>(
            @"SELECT t.StockTransferId, t.TransferNo, t.FromGodownId, fg.Name AS FromGodownName, t.ToGodownId, tg.Name AS ToGodownName,
                     t.TransferDate, t.Status
              FROM Inventory.StockTransfer t
              JOIN Company.Godown fg ON fg.GodownId = t.FromGodownId
              JOIN Company.Godown tg ON tg.GodownId = t.ToGodownId
              ORDER BY t.StockTransferId DESC");
        return Ok(new { items = rows });
    }

    [RequirePermission("StockTransfer.Create")]
    [HttpPost("stock-transfers")]
    public IActionResult CreateTransfer([FromBody] CreateStockTransferRequest req)
    {
        if (req.FromGodownId == req.ToGodownId)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid transfer", Status = 422, ErrorCode = "SAME_GODOWN", Detail = "Source and destination godown must differ." });
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "Add at least one product to transfer." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string transferNo = DocNumbering.NextNumber(conn, tx, branchId, "StockTransfer");

            var transferId = conn.ExecuteScalar<int>(
                @"INSERT INTO Inventory.StockTransfer (TransferNo, FromGodownId, ToGodownId, Status)
                  OUTPUT INSERTED.StockTransferId VALUES (@transferNo, @FromGodownId, @ToGodownId, 'Received')",
                new { transferNo, req.FromGodownId, req.ToGodownId }, tx);

            foreach (var line in req.Lines)
            {
                var fromBalance = conn.QueryFirstOrDefault(
                    "SELECT StockBalanceId, QtyOnHand FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @FromGodownId",
                    new { line.ProductId, req.FromGodownId }, transaction: tx);
                decimal onHand = fromBalance?.QtyOnHand ?? 0m;
                if (onHand < line.Qty)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Insufficient stock", Status = 422, ErrorCode = "STOCK_INSUFFICIENT", Detail = $"Only {onHand} available for product {line.ProductId} at the source godown." });
                }

                conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @Qty WHERE StockBalanceId = @id",
                    new { line.Qty, id = (int)fromBalance!.StockBalanceId }, tx);

                var toBalance = conn.QueryFirstOrDefault(
                    "SELECT StockBalanceId FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @ToGodownId",
                    new { line.ProductId, req.ToGodownId }, transaction: tx);
                if (toBalance is null)
                    conn.Execute("INSERT INTO Inventory.StockBalance (ProductId, GodownId, QtyOnHand) VALUES (@ProductId, @ToGodownId, @Qty)",
                        new { line.ProductId, req.ToGodownId, line.Qty }, tx);
                else
                    conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand + @Qty WHERE StockBalanceId = @id",
                        new { line.Qty, id = (int)toBalance.StockBalanceId }, tx);

                conn.Execute("INSERT INTO Inventory.StockTransferLine (StockTransferId, ProductId, Qty) VALUES (@transferId, @ProductId, @Qty)",
                    new { transferId, line.ProductId, line.Qty }, tx);

                conn.Execute("INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty) VALUES (@ProductId, @FromGodownId, 'TransferOut', 'StockTransfer', @transferId, @negQty)",
                    new { line.ProductId, req.FromGodownId, transferId, negQty = -line.Qty }, tx);
                conn.Execute("INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty) VALUES (@ProductId, @ToGodownId, 'TransferIn', 'StockTransfer', @transferId, @Qty)",
                    new { line.ProductId, req.ToGodownId, transferId, line.Qty }, tx);
            }

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'StockTransfer', @id)", new { id = transferId.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/stock-transfers/{transferId}", new { stockTransferId = transferId, transferNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    // ---------------- Offcuts ----------------
    [HttpGet("offcuts")]
    public IActionResult ListOffcuts([FromQuery] int? productId, [FromQuery] string status = "Available")
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<OffcutDto>(
            @"SELECT o.OffcutId, o.OffcutCode, o.ProductId, p.Code AS ProductCode, o.LengthMm, o.WidthMm, o.AreaSqft,
                     o.AreaInStockUnit, o.StockUnit, o.SourceDocType, o.SourceDocId, o.ConsumedByDocType, o.ConsumedByDocId,
                     o.GodownId, g.Name AS GodownName, o.Status, o.CreatedOn,
                     CAST(CASE WHEN o.Status = 'Available' THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Inventory.Offcut o JOIN Master.Product p ON p.ProductId = o.ProductId JOIN Company.Godown g ON g.GodownId = o.GodownId
              WHERE (@productId IS NULL OR o.ProductId = @productId) AND (@status IS NULL OR o.Status = @status)
              ORDER BY o.CreatedOn DESC", new { productId, status });
        return Ok(new { items = rows });
    }

    [HttpGet("offcuts/search")]
    public IActionResult SearchOffcuts([FromQuery] int productId, [FromQuery] decimal lengthMm, [FromQuery] decimal widthMm)
    {
        using var conn = db.CreateConnection();
        // Best fit first (least wasted area), then oldest first — SDD 11.2.
        var rows = conn.Query<OffcutDto>(
            @"SELECT TOP 10 o.OffcutId, o.OffcutCode, o.ProductId, p.Code AS ProductCode, o.LengthMm, o.WidthMm, o.AreaSqft,
                     o.AreaInStockUnit, o.StockUnit, o.SourceDocType, o.SourceDocId, o.ConsumedByDocType, o.ConsumedByDocId,
                     o.GodownId, g.Name AS GodownName, o.Status, o.CreatedOn,
                     CAST(CASE WHEN o.Status = 'Available' THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Inventory.Offcut o JOIN Master.Product p ON p.ProductId = o.ProductId JOIN Company.Godown g ON g.GodownId = o.GodownId
              WHERE o.ProductId = @productId AND o.Status = 'Available' AND o.LengthMm >= @lengthMm AND o.WidthMm >= @widthMm
              ORDER BY (o.LengthMm * o.WidthMm - @lengthMm * @widthMm) ASC, o.CreatedOn ASC", new { productId, lengthMm, widthMm });
        return Ok(new { items = rows });
    }

    [RequirePermission("Offcut.Create")]
    [HttpPost("offcuts")]
    public IActionResult CreateOffcut([FromBody] CreateOffcutRequest req)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var stockUnit = conn.ExecuteScalar<string?>("SELECT StockUnit FROM Master.Product WHERE ProductId = @ProductId", new { req.ProductId }, tx);
            decimal areaSqft = Math.Round(req.LengthMm * req.WidthMm / 92903.04m, 3);
            decimal areaInStockUnit = StockUnitConversion.ToStockUnit(areaSqft, "SQFT", stockUnit);

            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string code = DocNumbering.NextNumber(conn, tx, branchId, "Offcut");
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Inventory.Offcut (OffcutCode, ProductId, LengthMm, WidthMm, GodownId, Status, AreaInStockUnit, StockUnit)
                  OUTPUT INSERTED.OffcutId VALUES (@code, @ProductId, @LengthMm, @WidthMm, @GodownId, 'Available', @areaInStockUnit, @stockUnit)",
                new { code, req.ProductId, req.LengthMm, req.WidthMm, req.GodownId, areaInStockUnit, stockUnit }, tx);
            tx.Commit();
            return Created($"/api/v1/offcuts/{id}", new { offcutId = id, offcutCode = code });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [HttpPost("offcuts/{id:int}/use")]
    public IActionResult UseOffcut(int id)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Execute("UPDATE Inventory.Offcut SET Status = 'Used' WHERE OffcutId = @id AND Status = 'Available'", new { id });
        return rows == 0 ? NotFound() : NoContent();
    }

    /// <summary>Deletable only while still 'Available' -- a 'Used' offcut is tied to the real sale
    /// that consumed it (ConsumedByDocType/ConsumedByDocId) and that history shouldn't be silently
    /// erased. An offcut's area was never counted separately in Inventory.StockBalance (it was
    /// already deducted from the parent sheet when the offcut was logged — see
    /// OffcutAllocation.DeductStockAndLogOffcut), so removing an available one needs no stock
    /// reversal; it simply discards that leftover piece from the reuse ledger.</summary>
    [RequirePermission("Offcut.Delete")]
    [HttpDelete("offcuts/{id:int}")]
    public IActionResult DeleteOffcut(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var offcut = conn.QueryFirstOrDefault("SELECT * FROM Inventory.Offcut WHERE OffcutId = @id", new { id }, tx);
            if (offcut is null) { tx.Rollback(); return NotFound(); }

            if ((string)offcut.Status != "Available")
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Offcut already used", Status = 409, ErrorCode = "OFFCUT_ALREADY_USED", Detail = "This offcut has already been consumed by a sale; it cannot be deleted." });
            }

            conn.Execute("DELETE FROM Inventory.Offcut WHERE OffcutId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Offcut", id.ToString(), offcut);
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
