using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/suppliers")]
[Authorize]
public class SuppliersController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List([FromQuery] string? search)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<SupplierDto>(
            @"SELECT SupplierId, Code, Name, Gstin, Phone, Mobile, Email, Address, StateName, CreditPeriodDays, IsActive
              FROM Master.Supplier
              WHERE IsActive = 1 AND (@search IS NULL OR Code LIKE '%' + @search + '%' OR Name LIKE '%' + @search + '%')
              ORDER BY Name", new { search });
        return Ok(new { items = rows });
    }

    [RequirePermission("Supplier.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] SupplierDto dto)
    {
        using var conn = db.CreateConnection();
        var id = conn.ExecuteScalar<int>(
            @"INSERT INTO Master.Supplier (Code, Name, Gstin, Phone, Mobile, Email, Address, StateName, CreditPeriodDays, IsActive)
              OUTPUT INSERTED.SupplierId
              VALUES (@Code, @Name, @Gstin, @Phone, @Mobile, @Email, @Address, @StateName, @CreditPeriodDays, 1)", dto);
        dto.SupplierId = id;
        return Created($"/api/v1/suppliers/{id}", dto);
    }
}

[ApiController]
[Route("api/v1/purchase-orders")]
[Authorize]
public class PurchaseOrdersController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<PurchaseOrderDto>(
            @"SELECT po.PurchaseOrderId, po.PoNo, po.SupplierId, s.Name AS SupplierName, po.PoDate, po.Status, po.TotalValue,
                     (SELECT COUNT(*) FROM Purchase.Grn g WHERE g.PurchaseOrderId = po.PurchaseOrderId) AS GrnCount,
                     CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM Purchase.Grn g WHERE g.PurchaseOrderId = po.PurchaseOrderId) THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Purchase.PurchaseOrder po JOIN Master.Supplier s ON s.SupplierId = po.SupplierId
              ORDER BY po.PurchaseOrderId DESC");
        return Ok(new { items = rows });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var po = conn.QueryFirstOrDefault<PurchaseOrderDto>(
            @"SELECT po.PurchaseOrderId, po.PoNo, po.SupplierId, s.Name AS SupplierName, po.PoDate, po.Status, po.TotalValue,
                     (SELECT COUNT(*) FROM Purchase.Grn g WHERE g.PurchaseOrderId = po.PurchaseOrderId) AS GrnCount,
                     CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM Purchase.Grn g WHERE g.PurchaseOrderId = po.PurchaseOrderId) THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Purchase.PurchaseOrder po JOIN Master.Supplier s ON s.SupplierId = po.SupplierId WHERE po.PurchaseOrderId = @id", new { id });
        if (po is null) return NotFound();
        po.Lines = conn.Query<PurchaseOrderLineDto>(
            @"SELECT l.ProductId, p.Code AS ProductCode, l.Qty, l.Rate, l.Value
              FROM Purchase.PurchaseOrderLine l JOIN Master.Product p ON p.ProductId = l.ProductId WHERE l.PurchaseOrderId = @id", new { id }).ToList();
        po.Grns = conn.Query<PoGrnRefDto>(
            "SELECT GrnId, GrnNo, GrnDate, Status FROM Purchase.Grn WHERE PurchaseOrderId = @id ORDER BY GrnId", new { id }).ToList();
        return Ok(po);
    }

    /// <summary>Deletable only while no GRN has been posted against this order — the order carries
    /// no stock effect itself, so nothing needs reversing.</summary>
    [RequirePermission("PurchaseOrder.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Purchase.PurchaseOrder WHERE PurchaseOrderId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            var hasGrn = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Purchase.Grn WHERE PurchaseOrderId = @id", new { id }, tx) > 0;
            if (hasGrn)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Order has a GRN", Status = 409, ErrorCode = "PO_HAS_GRN", Detail = "A GRN has already been posted against this purchase order; it cannot be deleted." });
            }

            var lines = conn.Query("SELECT * FROM Purchase.PurchaseOrderLine WHERE PurchaseOrderId = @id", new { id }, tx).ToList();

            conn.Execute("DELETE FROM Purchase.PurchaseOrderLine WHERE PurchaseOrderId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Purchase.PurchaseOrder WHERE PurchaseOrderId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "PurchaseOrder", id.ToString(), new { PurchaseOrder = header, Lines = lines });
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("PurchaseOrder.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreatePurchaseOrderRequest req)
    {
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "A purchase order must have at least one line." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string poNo = DocNumbering.NextNumber(conn, tx, branchId, "PurchaseOrder");
            decimal total = req.Lines.Sum(l => l.Qty * l.Rate);

            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Purchase.PurchaseOrder (PoNo, SupplierId, BranchId, Status, TotalValue)
                  OUTPUT INSERTED.PurchaseOrderId VALUES (@poNo, @SupplierId, @branchId, 'Approved', @total)",
                new { poNo, req.SupplierId, branchId, total }, tx);

            foreach (var l in req.Lines)
                conn.Execute("INSERT INTO Purchase.PurchaseOrderLine (PurchaseOrderId, ProductId, Qty, Rate) VALUES (@id, @ProductId, @Qty, @Rate)",
                    new { id, l.ProductId, l.Qty, l.Rate }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'PurchaseOrder', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/purchase-orders/{id}", new { purchaseOrderId = id, poNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }
}

[ApiController]
[Route("api/v1/grns")]
[Authorize]
public class GrnController(IDbConnectionFactory db) : ControllerBase
{
    private const string ListColumns =
        @"g.GrnId, g.GrnNo, g.PurchaseOrderId, po.PoNo, s.Name AS SupplierName, g.GrnDate, g.Status, pi.PurchaseInvoiceId, pi.InvoiceNo AS PurchaseInvoiceNo,
          CAST(CASE WHEN pi.PurchaseInvoiceId IS NULL THEN 1 ELSE 0 END AS BIT) AS CanDelete
          FROM Purchase.Grn g
          JOIN Purchase.PurchaseOrder po ON po.PurchaseOrderId = g.PurchaseOrderId
          JOIN Master.Supplier s ON s.SupplierId = po.SupplierId
          LEFT JOIN Purchase.PurchaseInvoice pi ON pi.GrnId = g.GrnId";

    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<GrnDto>($"SELECT {ListColumns} ORDER BY g.GrnId DESC");
        return Ok(new { items = rows });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var g = conn.QueryFirstOrDefault<GrnDto>($"SELECT {ListColumns} WHERE g.GrnId = @id", new { id });
        if (g is null) return NotFound();
        g.Lines = conn.Query<GrnLineDto>(
            @"SELECT l.ProductId, p.Code AS ProductCode, l.ReceivedQty, l.AcceptedQty, l.RejectedQty, l.BrokenQty, l.BatchNo
              FROM Purchase.GrnLine l JOIN Master.Product p ON p.ProductId = l.ProductId WHERE l.GrnId = @id", new { id }).ToList();
        return Ok(g);
    }

    [RequirePermission("Grn.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateGrnRequest req)
    {
        if (req.Lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "A GRN must have at least one line." });

        foreach (var l in req.Lines)
        {
            if (l.AcceptedQty + l.RejectedQty + l.BrokenQty > l.ReceivedQty)
                return UnprocessableEntity(new ProblemResponse { Title = "Quantity mismatch", Status = 422, ErrorCode = "GRN_QTY_MISMATCH", Detail = "Accepted + rejected + broken cannot exceed received quantity." });
        }

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var po = conn.QueryFirstOrDefault("SELECT PurchaseOrderId, Status FROM Purchase.PurchaseOrder WHERE PurchaseOrderId = @PurchaseOrderId", new { req.PurchaseOrderId }, tx);
            if (po is null || (string)po.Status == "Cancelled")
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse { Title = "PO not eligible", Status = 422, ErrorCode = "PO_NOT_APPROVED", Detail = "GRN can only be raised against an approved purchase order." });
            }

            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string grnNo = DocNumbering.NextNumber(conn, tx, branchId, "Grn");

            var grnId = conn.ExecuteScalar<int>(
                @"INSERT INTO Purchase.Grn (GrnNo, PurchaseOrderId, Status) OUTPUT INSERTED.GrnId VALUES (@grnNo, @PurchaseOrderId, 'Posted')",
                new { grnNo, req.PurchaseOrderId }, tx);

            var godownId = conn.QueryFirstOrDefault<int?>(
                "SELECT TOP 1 GodownId FROM Company.Godown WHERE (@code IS NULL OR Code = @code) AND IsActive = 1 ORDER BY CASE WHEN Code = 'MAIN' THEN 0 ELSE 1 END",
                new { code = req.GodownCode }, tx) ?? 1;

            foreach (var l in req.Lines)
            {
                conn.Execute(
                    @"INSERT INTO Purchase.GrnLine (GrnId, ProductId, ReceivedQty, AcceptedQty, RejectedQty, BrokenQty, BatchNo)
                      VALUES (@grnId, @ProductId, @ReceivedQty, @AcceptedQty, @RejectedQty, @BrokenQty, @BatchNo)",
                    new { grnId, l.ProductId, l.ReceivedQty, l.AcceptedQty, l.RejectedQty, l.BrokenQty, l.BatchNo }, tx);

                if (l.AcceptedQty > 0)
                {
                    var balance = conn.QueryFirstOrDefault("SELECT StockBalanceId FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @godownId",
                        new { l.ProductId, godownId }, tx);
                    if (balance is null)
                        conn.Execute("INSERT INTO Inventory.StockBalance (ProductId, GodownId, QtyOnHand) VALUES (@ProductId, @godownId, @AcceptedQty)",
                            new { l.ProductId, godownId, l.AcceptedQty }, tx);
                    else
                        conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand + @AcceptedQty WHERE StockBalanceId = @id",
                            new { l.AcceptedQty, id = (int)balance.StockBalanceId }, tx);

                    conn.Execute("INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty) VALUES (@ProductId, @godownId, 'Purchase', 'Grn', @grnId, @AcceptedQty)",
                        new { l.ProductId, godownId, grnId, l.AcceptedQty }, tx);
                }
            }

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'Grn', @id)", new { id = grnId.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/grns/{grnId}", new { grnId, grnNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>
    /// Deletable only while no purchase invoice has been booked against this GRN. Unlike a
    /// Quotation/SalesOrder/Invoice delete, a GRN's receipt already moved real stock in — so
    /// deleting it must reverse exactly what it added (found from its own Inventory.StockMovement
    /// rows, not recomputed), and is refused if any of that stock has since moved on elsewhere
    /// (sold, transferred, adjusted down) rather than silently taking a balance negative.
    /// </summary>
    [RequirePermission("Grn.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Purchase.Grn WHERE GrnId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            var hasInvoice = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Purchase.PurchaseInvoice WHERE GrnId = @id", new { id }, tx) > 0;
            if (hasInvoice)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "GRN has an invoice", Status = 409, ErrorCode = "GRN_HAS_INVOICE", Detail = "A purchase invoice has already been booked against this GRN; it cannot be deleted." });
            }

            var lines = conn.Query("SELECT * FROM Purchase.GrnLine WHERE GrnId = @id", new { id }, tx).ToList();

            // The exact stock this GRN added, per product/godown — read back from its own
            // movement rows rather than recomputed, since that's the authoritative record of
            // what actually happened (and the only place the receiving godown is recorded).
            var movements = conn.Query<(int ProductId, int GodownId, decimal Qty)>(
                "SELECT ProductId, GodownId, Qty FROM Inventory.StockMovement WHERE DocType = 'Grn' AND DocId = @id AND MovementType = 'Purchase'",
                new { id }, tx).ToList();

            foreach (var m in movements)
            {
                var qtyFree = conn.ExecuteScalar<decimal?>(
                    "SELECT QtyOnHand FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @GodownId",
                    new { m.ProductId, m.GodownId }, tx) ?? 0m;
                if (qtyFree < m.Qty)
                {
                    tx.Rollback();
                    var product = conn.QueryFirstOrDefault<string>("SELECT Code FROM Master.Product WHERE ProductId = @ProductId", new { m.ProductId }, tx);
                    return Conflict(new ProblemResponse
                    {
                        Title = "Stock already moved",
                        Status = 409,
                        ErrorCode = "GRN_STOCK_CONSUMED",
                        Detail = $"{product ?? $"Product {m.ProductId}"}: only {qtyFree} of the {m.Qty} received by this GRN is still on hand — the rest has already been sold, transferred or adjusted. This GRN cannot be deleted.",
                    });
                }
            }

            foreach (var m in movements)
            {
                conn.Execute(
                    "UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @Qty WHERE ProductId = @ProductId AND GodownId = @GodownId",
                    new { m.Qty, m.ProductId, m.GodownId }, tx);
            }
            conn.Execute("DELETE FROM Inventory.StockMovement WHERE DocType = 'Grn' AND DocId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Purchase.GrnLine WHERE GrnId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Purchase.Grn WHERE GrnId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Grn", id.ToString(), new { Grn = header, Lines = lines, ReversedStockMovements = movements });
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

[ApiController]
[Route("api/v1/purchase-invoices")]
[Authorize]
public class PurchaseInvoicesController(IDbConnectionFactory db) : ControllerBase
{
    private const string ListColumns =
        @"pi.PurchaseInvoiceId, pi.InvoiceNo, pi.GrnId, g.GrnNo, s.Name AS SupplierName, pi.SupplierInvoiceNo, pi.InvoiceDate, pi.TotalValue, pi.Status
          FROM Purchase.PurchaseInvoice pi
          JOIN Purchase.Grn g ON g.GrnId = pi.GrnId
          JOIN Purchase.PurchaseOrder po ON po.PurchaseOrderId = g.PurchaseOrderId
          JOIN Master.Supplier s ON s.SupplierId = po.SupplierId";

    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<PurchaseInvoiceDto>($"SELECT {ListColumns} ORDER BY pi.PurchaseInvoiceId DESC");
        return Ok(new { items = rows });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var pi = conn.QueryFirstOrDefault<PurchaseInvoiceDto>($"SELECT {ListColumns} WHERE pi.PurchaseInvoiceId = @id", new { id });
        return pi is null ? NotFound() : Ok(pi);
    }

    [RequirePermission("PurchaseInvoice.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreatePurchaseInvoiceRequest req)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var grn = conn.QueryFirstOrDefault("SELECT GrnId, Status FROM Purchase.Grn WHERE GrnId = @GrnId", new { req.GrnId }, tx);
            if (grn is null)
            {
                tx.Rollback();
                return UnprocessableEntity(new ProblemResponse { Title = "GRN required", Status = 422, ErrorCode = "GRN_REQUIRED", Detail = "A purchase invoice must reference a posted GRN." });
            }

            var existing = conn.QueryFirstOrDefault<int?>("SELECT PurchaseInvoiceId FROM Purchase.PurchaseInvoice WHERE GrnId = @GrnId", new { req.GrnId }, tx);
            if (existing.HasValue)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Duplicate", Status = 409, ErrorCode = "DUPLICATE_DOC", Detail = $"An invoice already exists for this GRN (id {existing})." });
            }

            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string invoiceNo = DocNumbering.NextNumber(conn, tx, branchId, "PurchaseInvoice");

            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Purchase.PurchaseInvoice (InvoiceNo, GrnId, SupplierInvoiceNo, TotalValue, Status)
                  OUTPUT INSERTED.PurchaseInvoiceId VALUES (@invoiceNo, @GrnId, @SupplierInvoiceNo, @TotalValue, 'Booked')",
                new { invoiceNo, req.GrnId, req.SupplierInvoiceNo, req.TotalValue }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'PurchaseInvoice', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/purchase-invoices/{id}", new { purchaseInvoiceId = id, invoiceNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Unlike the Purchase Order and GRN it derives from, a booked purchase invoice can
    /// always be corrected — this is the "fix a wrong entry" path.</summary>
    [RequirePermission("PurchaseInvoice.Edit")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] UpdatePurchaseInvoiceRequest req)
    {
        if (req.TotalValue <= 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid value", Status = 422, ErrorCode = "AMOUNT_INVALID", Detail = "Invoice value must be greater than zero." });

        using var conn = db.CreateConnection();
        var rows = conn.Execute(
            @"UPDATE Purchase.PurchaseInvoice SET
                SupplierInvoiceNo = @SupplierInvoiceNo, TotalValue = @TotalValue,
                InvoiceDate = ISNULL(@InvoiceDate, InvoiceDate)
              WHERE PurchaseInvoiceId = @id",
            new { id, req.SupplierInvoiceNo, req.TotalValue, req.InvoiceDate });
        if (rows == 0) return NotFound();

        conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Update', 'PurchaseInvoice', @id)", new { id = id.ToString() });
        return NoContent();
    }

    /// <summary>Nothing references a purchase invoice (confirmed via sys.foreign_keys — supplier
    /// payments are a generic Finance.Voucher tied only to SupplierId), so this is always
    /// deletable, subject to permission — same as VoucherDto.CanDelete.</summary>
    [RequirePermission("PurchaseInvoice.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Purchase.PurchaseInvoice WHERE PurchaseInvoiceId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            conn.Execute("DELETE FROM Purchase.PurchaseInvoice WHERE PurchaseInvoiceId = @id", new { id }, tx);

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "PurchaseInvoice", id.ToString(), header);
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
