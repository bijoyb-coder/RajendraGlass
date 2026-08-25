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
    /// <summary>A GRN is never checked directly — every GRN traces back through its own Purchase
    /// Order, whose SupplierId is NOT NULL, so the PurchaseOrder check below already covers it.
    /// Voucher/EwayBill are real foreign keys into Master.Supplier too, so they're included here
    /// even though the user only asked about PO/Invoice/GRN — otherwise DELETE would fail with a
    /// raw constraint error for a supplier that's only ever been paid or had an e-Way Bill logged.
    /// </summary>
    private const string CanDeleteSql =
        @"CAST(CASE WHEN
            NOT EXISTS (SELECT 1 FROM Purchase.PurchaseOrder po WHERE po.SupplierId = s.SupplierId)
            AND NOT EXISTS (SELECT 1 FROM Purchase.PurchaseInvoice pi WHERE pi.SupplierId = s.SupplierId)
            AND NOT EXISTS (SELECT 1 FROM Finance.Voucher v WHERE v.SupplierId = s.SupplierId)
            AND NOT EXISTS (SELECT 1 FROM Purchase.EwayBill eb WHERE eb.SupplierId = s.SupplierId)
          THEN 1 ELSE 0 END AS BIT)";

    [HttpGet]
    public IActionResult List([FromQuery] string? search)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<SupplierDto>(
            $@"SELECT s.SupplierId, s.Code, s.Name, s.Gstin, s.Phone, s.Mobile, s.Email, s.Address, s.StateName, s.CreditPeriodDays, s.IsActive,
                      {CanDeleteSql} AS CanDelete
              FROM Master.Supplier s
              WHERE s.IsActive = 1 AND (@search IS NULL OR s.Code LIKE '%' + @search + '%' OR s.Name LIKE '%' + @search + '%')
              ORDER BY s.Name", new { search });
        return Ok(new { items = rows });
    }

    [RequirePermission("Supplier.Create")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] SupplierDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Code))
            return UnprocessableEntity(new ProblemResponse { Title = "Code required", Status = 422, ErrorCode = "CODE_REQUIRED", Detail = "Supplier code is required." });
        if (string.IsNullOrWhiteSpace(dto.Name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Supplier name is required." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>(
            "SELECT SupplierId FROM Master.Supplier WHERE Code = @Code AND SupplierId <> @id", new { dto.Code, id });
        if (existing.HasValue)
        {
            return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A supplier with code '{dto.Code}' already exists." });
        }

        try
        {
            var rows = conn.Execute(
                @"UPDATE Master.Supplier SET Code=@Code, Name=@Name, Gstin=@Gstin, Phone=@Phone, Mobile=@Mobile, Email=@Email,
                         Address=@Address, StateName=@StateName, CreditPeriodDays=@CreditPeriodDays
                  WHERE SupplierId=@id",
                new { id, dto.Code, dto.Name, dto.Gstin, dto.Phone, dto.Mobile, dto.Email, dto.Address, dto.StateName, dto.CreditPeriodDays });
            return rows == 0 ? NotFound() : NoContent();
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    [RequirePermission("Supplier.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] SupplierDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Code))
            return UnprocessableEntity(new ProblemResponse { Title = "Code required", Status = 422, ErrorCode = "CODE_REQUIRED", Detail = "Supplier code is required." });
        if (string.IsNullOrWhiteSpace(dto.Name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Supplier name is required." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>(
            "SELECT SupplierId FROM Master.Supplier WHERE Code = @Code", new { dto.Code });
        if (existing.HasValue)
        {
            return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A supplier with code '{dto.Code}' already exists." });
        }

        try
        {
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Master.Supplier (Code, Name, Gstin, Phone, Mobile, Email, Address, StateName, CreditPeriodDays, IsActive)
                  OUTPUT INSERTED.SupplierId
                  VALUES (@Code, @Name, @Gstin, @Phone, @Mobile, @Email, @Address, @StateName, @CreditPeriodDays, 1)", dto);
            dto.SupplierId = id;
            return Created($"/api/v1/suppliers/{id}", dto);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    /// <summary>Deletable only while nothing has ever been booked against this supplier — see
    /// CanDeleteSql above for exactly which references are checked and why.</summary>
    [RequirePermission("Supplier.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var supplier = conn.QueryFirstOrDefault("SELECT * FROM Master.Supplier WHERE SupplierId = @id", new { id }, tx);
            if (supplier is null) { tx.Rollback(); return NotFound(); }

            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Purchase.PurchaseOrder WHERE SupplierId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Supplier has a Purchase Order", Status = 409, ErrorCode = "SUPPLIER_HAS_PURCHASE_ORDER", Detail = "A Purchase Order (and any GRN posted against it) already exists for this supplier; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Purchase.PurchaseInvoice WHERE SupplierId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Supplier has a Purchase Invoice", Status = 409, ErrorCode = "SUPPLIER_HAS_PURCHASE_INVOICE", Detail = "A Purchase Invoice has already been booked against this supplier; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Finance.Voucher WHERE SupplierId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Supplier has a payment", Status = 409, ErrorCode = "SUPPLIER_HAS_VOUCHER", Detail = "A payment voucher has already been recorded against this supplier; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Purchase.EwayBill WHERE SupplierId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Supplier has an e-Way Bill", Status = 409, ErrorCode = "SUPPLIER_HAS_EWAYBILL", Detail = "An e-Way Bill entry has already been logged for this supplier; it cannot be deleted." });
            }

            conn.Execute("DELETE FROM Master.Supplier WHERE SupplierId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Supplier", id.ToString(), supplier);
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
[Route("api/v1/eway-bills")]
[Authorize]
public class EwayBillsController(IDbConnectionFactory db) : ControllerBase
{
    /// <summary>Entered once off the supplier's e-Way Bill slip/QR printout, then picked from a
    /// dropdown when booking the matching Purchase Invoice, instead of re-typing the number by
    /// hand. <c>IsUsed</c>/<c>CanDelete</c> are the same idea from two ends: once linked to an
    /// invoice it drops out of the "available" dropdown and can no longer be deleted (delete the
    /// invoice first, which frees it back up automatically).</summary>
    private const string ListColumns =
        @"e.EwayBillId, e.EwayBillNo, e.SupplierId, s.Name AS SupplierName, e.EwayBillDate, e.ValidUpto,
          e.VehicleNo, e.DocumentNo, e.GoodsValue, e.IsUsed, pi.PurchaseInvoiceId, pi.InvoiceNo AS PurchaseInvoiceNo,
          CAST(CASE WHEN e.IsUsed = 0 THEN 1 ELSE 0 END AS BIT) AS CanDelete
          FROM Purchase.EwayBill e
          JOIN Master.Supplier s ON s.SupplierId = e.SupplierId
          LEFT JOIN Purchase.PurchaseInvoice pi ON pi.EwayBillId = e.EwayBillId";

    /// <summary>?supplierId= narrows to one supplier's e-Way Bills; ?availableOnly=true (used by the
    /// Purchase Invoice Entry dropdown) excludes ones already linked to another invoice.</summary>
    [HttpGet]
    public IActionResult List([FromQuery] int? supplierId, [FromQuery] bool availableOnly = false)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<EwayBillDto>(
            $@"SELECT {ListColumns}
               WHERE (@supplierId IS NULL OR e.SupplierId = @supplierId)
                 AND (@availableOnly = 0 OR e.IsUsed = 0)
               ORDER BY e.EwayBillId DESC", new { supplierId, availableOnly });
        return Ok(new { items = rows });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var e = conn.QueryFirstOrDefault<EwayBillDto>($"SELECT {ListColumns} WHERE e.EwayBillId = @id", new { id });
        if (e is null) return NotFound();
        return Ok(e);
    }

    [RequirePermission("EwayBill.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateEwayBillRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.EwayBillNo))
            return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "e-Way Bill No. is required." });
        // Checked here, not just left to the DB's column widths, so an overlong value gets a clear
        // field-level message instead of a raw SQL truncation error.
        if (req.EwayBillNo.Length > 30)
            return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "e-Way Bill No. cannot be more than 30 characters." });
        if (req.VehicleNo?.Length > 50)
            return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "Vehicle No. cannot be more than 50 characters." });
        if (req.DocumentNo?.Length > 50)
            return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = "Document No. cannot be more than 50 characters." });

        using var conn = db.CreateConnection();
        var supplier = conn.QueryFirstOrDefault("SELECT SupplierId FROM Master.Supplier WHERE SupplierId = @SupplierId AND IsActive = 1", new { req.SupplierId });
        if (supplier is null)
            return UnprocessableEntity(new ProblemResponse { Title = "Supplier required", Status = 422, ErrorCode = "SUPPLIER_REQUIRED", Detail = "Select an active supplier." });

        if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Purchase.EwayBill WHERE EwayBillNo = @EwayBillNo", new { req.EwayBillNo }) > 0)
            return Conflict(new ProblemResponse { Title = "Duplicate e-Way Bill", Status = 409, ErrorCode = "EWAYBILL_DUPLICATE", Detail = "This e-Way Bill No. has already been entered." });

        var id = conn.ExecuteScalar<int>(
            @"INSERT INTO Purchase.EwayBill (EwayBillNo, SupplierId, EwayBillDate, ValidUpto, VehicleNo, DocumentNo, GoodsValue)
              OUTPUT INSERTED.EwayBillId
              VALUES (@EwayBillNo, @SupplierId, @EwayBillDate, @ValidUpto, @VehicleNo, @DocumentNo, @GoodsValue)", req);

        conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'EwayBill', @id)", new { id = id.ToString() });
        return Created($"/api/v1/eway-bills/{id}", new { ewayBillId = id });
    }

    /// <summary>Only while not yet linked to a Purchase Invoice — same idea as GRN/Purchase Invoice
    /// delete, but simpler here since an unused e-Way Bill entry has no stock or ledger effect at
    /// all, only a link that hasn't been made yet.</summary>
    [RequirePermission("EwayBill.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        var e = conn.QueryFirstOrDefault("SELECT EwayBillId, IsUsed FROM Purchase.EwayBill WHERE EwayBillId = @id", new { id });
        if (e is null) return NotFound();
        if ((bool)e.IsUsed)
            return Conflict(new ProblemResponse { Title = "e-Way Bill in use", Status = 409, ErrorCode = "EWAYBILL_IN_USE", Detail = "This e-Way Bill is already linked to a purchase invoice; delete that invoice first to free it up." });

        conn.Execute("DELETE FROM Purchase.EwayBill WHERE EwayBillId = @id", new { id });
        conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Delete', 'EwayBill', @id)", new { id = id.ToString() });
        return NoContent();
    }
}

[ApiController]
[Route("api/v1/purchase-invoices")]
[Authorize]
public class PurchaseInvoicesController(IDbConnectionFactory db) : ControllerBase
{
    /// <summary>Entered directly off the supplier's paper tax invoice — Local (CGST+SGST) or
    /// Inter-State (IGST), picked by the operator, not auto-detected. PO/GRN are optional
    /// cross-references only; the invoice adds stock itself (see Create) rather than depending on
    /// a GRN to have already done so.</summary>
    private const string ListColumns =
        @"pi.PurchaseInvoiceId, pi.InvoiceNo, pi.SupplierId, s.Name AS SupplierName,
          pi.PurchaseOrderId, po.PoNo, pi.GrnId, g.GrnNo, pi.GodownId, gd.Name AS GodownName,
          pi.SupplierInvoiceNo, pi.InvoiceDate, pi.EwayBillNo, pi.EwayBillId, pi.IsInterState,
          pi.BasicValue, pi.ChargesTotal, pi.GstPct, pi.TaxableValue, pi.CgstValue, pi.SgstValue, pi.IgstValue,
          pi.RoundOffEnabled, pi.RoundOff, pi.TotalValue, pi.Status
          FROM Purchase.PurchaseInvoice pi
          LEFT JOIN Master.Supplier s ON s.SupplierId = pi.SupplierId
          LEFT JOIN Purchase.PurchaseOrder po ON po.PurchaseOrderId = pi.PurchaseOrderId
          LEFT JOIN Purchase.Grn g ON g.GrnId = pi.GrnId
          LEFT JOIN Company.Godown gd ON gd.GodownId = pi.GodownId";

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
        if (pi is null) return NotFound();
        pi.Lines = conn.Query<PurchaseInvoiceLineDto>(
            @"SELECT l.ProductId, p.Code AS ProductCode, p.Description AS ProductDescription, l.Description,
                     l.ThicknessMm, l.WidthCm, l.LengthCm, l.NoOfCrates, l.SheetsPerCrate,
                     l.Qty, l.Area, l.Rate, l.BasicValue,
                     l.HolesQty, l.HolesRate, l.HolesAmount, l.CutoutQty, l.CutoutRate, l.CutoutAmount,
                     l.TaxableValue, l.CgstAmount, l.SgstAmount, l.IgstAmount, l.NetValue
              FROM Purchase.PurchaseInvoiceLine l JOIN Master.Product p ON p.ProductId = l.ProductId
              WHERE l.PurchaseInvoiceId = @id", new { id }).ToList();
        pi.Charges = conn.Query<PurchaseInvoiceChargeDto>(
            @"SELECT Label, Basis, Value, Amount FROM Purchase.PurchaseInvoiceCharge
              WHERE PurchaseInvoiceId = @id ORDER BY SeqNo", new { id }).ToList();
        return Ok(pi);
    }

    /// <summary>Books a supplier's tax invoice directly — Local or Inter-State, matching the two
    /// paper formats — and adds the stock it represents in one step (the way a GRN used to be the
    /// only thing that added stock; a GRN is now purely an optional reference, not a requirement).
    /// </summary>
    [RequirePermission("PurchaseInvoice.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreatePurchaseInvoiceRequest req)
    {
        var validation = ValidateLines(req.Lines) ?? ValidateCharges(req.Charges);
        if (validation is not null) return validation;

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var supplier = conn.QueryFirstOrDefault("SELECT SupplierId FROM Master.Supplier WHERE SupplierId = @SupplierId AND IsActive = 1", new { req.SupplierId }, tx);
            if (supplier is null)
                return UnprocessableEntity(new ProblemResponse { Title = "Supplier required", Status = 422, ErrorCode = "SUPPLIER_REQUIRED", Detail = "Select an active supplier." });

            // Godown isn't something the operator has to pick — same fallback GrnController.Create
            // already uses: prefer 'MAIN', else any active godown, else GodownId 1 as a last resort.
            // A caller that does pass one is still checked, so a stale/inactive id is still refused.
            int godownId;
            if (req.GodownId.HasValue)
            {
                var godown = conn.QueryFirstOrDefault("SELECT GodownId FROM Company.Godown WHERE GodownId = @GodownId AND IsActive = 1", new { req.GodownId }, tx);
                if (godown is null)
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid godown", Status = 422, ErrorCode = "GODOWN_INVALID", Detail = "The selected godown is not active." });
                godownId = req.GodownId.Value;
            }
            else
            {
                godownId = conn.QueryFirstOrDefault<int?>(
                    "SELECT TOP 1 GodownId FROM Company.Godown WHERE IsActive = 1 ORDER BY CASE WHEN Code = 'MAIN' THEN 0 ELSE 1 END",
                    transaction: tx) ?? 1;
            }

            // e-Way Bill is optional (a Local invoice often has none) and, when given, must be a
            // real unused entry from the Purchase > E-way Bill Entry master -- selected via
            // dropdown rather than typed, so EwayBillNo below is just a denormalized snapshot.
            string? ewayBillNo = null;
            if (req.EwayBillId.HasValue)
            {
                var eb = conn.QueryFirstOrDefault("SELECT EwayBillNo, IsUsed FROM Purchase.EwayBill WHERE EwayBillId = @EwayBillId", new { req.EwayBillId }, tx);
                if (eb is null)
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid e-Way Bill", Status = 422, ErrorCode = "EWAYBILL_INVALID", Detail = "The selected e-Way Bill does not exist." });
                if ((bool)eb.IsUsed)
                    return Conflict(new ProblemResponse { Title = "e-Way Bill in use", Status = 409, ErrorCode = "EWAYBILL_IN_USE", Detail = "The selected e-Way Bill is already linked to another purchase invoice." });
                ewayBillNo = (string)eb.EwayBillNo;
            }

            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string invoiceNo = DocNumbering.NextNumber(conn, tx, branchId, "PurchaseInvoice");

            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Purchase.PurchaseInvoice
                    (InvoiceNo, SupplierId, PurchaseOrderId, GrnId, GodownId, SupplierInvoiceNo, InvoiceDate, EwayBillNo, EwayBillId, IsInterState, Status)
                  OUTPUT INSERTED.PurchaseInvoiceId
                  VALUES (@invoiceNo, @SupplierId, @PurchaseOrderId, @GrnId, @godownId, @SupplierInvoiceNo, ISNULL(@InvoiceDate, CAST(SYSUTCDATETIME() AS DATE)), @ewayBillNo, @EwayBillId, @IsInterState, 'Booked')",
                new { invoiceNo, req.SupplierId, req.PurchaseOrderId, req.GrnId, godownId, req.SupplierInvoiceNo, req.InvoiceDate, ewayBillNo, req.EwayBillId, req.IsInterState }, tx);

            if (req.EwayBillId.HasValue)
                conn.Execute("UPDATE Purchase.EwayBill SET IsUsed = 1 WHERE EwayBillId = @EwayBillId", new { req.EwayBillId }, tx);

            var lineTotals = PriceInsertLinesAndMoveStock(conn, tx, id, godownId, req.Lines);
            ApplyChargesAndTax(conn, tx, id, lineTotals, req.Charges, req.GstPct, req.IsInterState, req.RoundOffEnabled, req.RoundOffValue);

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

    /// <summary>Per-line field validation shared by Create and Update — every line now needs the
    /// same fields regardless of Local/Inter-State, matching the unified entry format.</summary>
    private IActionResult? ValidateLines(List<CreatePurchaseInvoiceLineRequest> lines)
    {
        if (lines.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No lines", Status = 422, ErrorCode = "LINES_REQUIRED", Detail = "A purchase invoice must have at least one line." });

        for (int i = 0; i < lines.Count; i++)
        {
            var l = lines[i];
            if (l.ProductId <= 0)
                return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"Line {i + 1}: Select a product." });
            if (l.Area <= 0)
                return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"Line {i + 1}: Area must be greater than zero." });
            if (l.Rate <= 0)
                return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"Line {i + 1}: Rate must be greater than zero." });
        }
        return null;
    }

    /// <summary>Header charges validation shared by Create and Update.</summary>
    private IActionResult? ValidateCharges(List<CreatePurchaseInvoiceChargeRequest> charges)
    {
        for (int i = 0; i < charges.Count; i++)
        {
            var c = charges[i];
            if (string.IsNullOrWhiteSpace(c.Label))
                return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"Charge {i + 1}: Label is required." });
            if (c.Basis != "Percent" && c.Basis != "Flat")
                return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "VALIDATION_ERROR", Detail = $"Charge {i + 1}: Basis must be 'Percent' or 'Flat'." });
        }
        return null;
    }

    /// <summary>Prices every line (BasicValue = Area x Rate, plus HolesQty x HolesRate and
    /// CutoutQty x CutoutRate) — the same shape whether the invoice is Local or Inter-State — and
    /// inserts the PurchaseInvoiceLine rows, and moves stock for each (the exact upsert-then-
    /// movement pattern GrnController.Create uses). Shared by Create and Update (the line-edit path)
    /// so the two can never drift apart. Returns each line's own contribution to the invoice's
    /// Basic Amount (its own id and TaxableValue = BasicValue+HolesAmount+CutoutAmount), which
    /// ApplyChargesAndTax needs for the per-line informational tax/charges split.</summary>
    private static List<(int LineId, decimal LineTotal)> PriceInsertLinesAndMoveStock(
        System.Data.IDbConnection conn, System.Data.IDbTransaction tx, int invoiceId, int godownId, List<CreatePurchaseInvoiceLineRequest> lines)
    {
        var result = new List<(int LineId, decimal LineTotal)>();
        foreach (var l in lines)
        {
            decimal area = Math.Round(l.Area, 9);
            decimal rate = Math.Round(l.Rate, 5);
            decimal basicValue = Math.Round(area * rate, 2);
            decimal holesAmount = Math.Round((l.HolesQty ?? 0) * (l.HolesRate ?? 0), 2);
            decimal cutoutAmount = Math.Round((l.CutoutQty ?? 0) * (l.CutoutRate ?? 0), 2);
            decimal lineTotal = basicValue + holesAmount + cutoutAmount;

            var lineId = conn.ExecuteScalar<int>(
                @"INSERT INTO Purchase.PurchaseInvoiceLine
                    (PurchaseInvoiceId, ProductId, Description, Qty, Area, Rate, BasicValue,
                     HolesQty, HolesRate, HolesAmount, CutoutQty, CutoutRate, CutoutAmount, TaxableValue, NetValue)
                  OUTPUT INSERTED.PurchaseInvoiceLineId
                  VALUES
                    (@invoiceId, @ProductId, @Description, @Qty, @area, @rate, @basicValue,
                     @HolesQty, @HolesRate, @holesAmount, @CutoutQty, @CutoutRate, @cutoutAmount, @lineTotal, @lineTotal)",
                new
                {
                    invoiceId, l.ProductId, l.Description, Qty = l.Qty ?? 0, area, rate, basicValue,
                    l.HolesQty, l.HolesRate, holesAmount, l.CutoutQty, l.CutoutRate, cutoutAmount, lineTotal,
                }, tx);
            result.Add((lineId, lineTotal));

            // Same upsert-then-movement pattern GrnController.Create uses for stock.
            var balance = conn.QueryFirstOrDefault("SELECT StockBalanceId FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @godownId",
                new { l.ProductId, godownId }, tx);
            if (balance is null)
                conn.Execute("INSERT INTO Inventory.StockBalance (ProductId, GodownId, QtyOnHand) VALUES (@ProductId, @godownId, @area)",
                    new { l.ProductId, godownId, area }, tx);
            else
                conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand + @area WHERE StockBalanceId = @id",
                    new { area, id = (int)balance.StockBalanceId }, tx);

            conn.Execute("INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty, Rate) VALUES (@ProductId, @godownId, 'Purchase', 'PurchaseInvoice', @invoiceId, @area, @rate)",
                new { l.ProductId, godownId, invoiceId, area, rate }, tx);
        }
        return result;
    }

    /// <summary>Applies the ordered header Charges (each 'Percent' charge computed against the
    /// running subtotal at that point — Basic Amount plus every charge entered before it, not the
    /// raw Basic Amount) and then GST once, on the final Assessable Value — replacing the old
    /// per-line GST computation. Also writes an informational, exactly-tying-out proportional split
    /// of the header charges/tax back onto each line (CgstAmount/SgstAmount/IgstAmount/NetValue),
    /// purely for the on-screen item-wise display added in PR #13-#15 — this does not change any
    /// money actually charged, only how it's broken out per line.</summary>
    private static void ApplyChargesAndTax(
        System.Data.IDbConnection conn, System.Data.IDbTransaction tx, int invoiceId,
        List<(int LineId, decimal LineTotal)> lineTotals, List<CreatePurchaseInvoiceChargeRequest> charges, decimal gstPct, bool isInterState,
        bool roundOffEnabled = false, decimal roundOffValue = 0m)
    {
        decimal basicAmountTotal = lineTotals.Sum(l => l.LineTotal);

        decimal runningSubtotal = basicAmountTotal;
        for (int i = 0; i < charges.Count; i++)
        {
            var c = charges[i];
            decimal amount = c.Basis == "Percent" ? Math.Round(runningSubtotal * c.Value / 100m, 2) : c.Value;
            runningSubtotal += amount;
            conn.Execute(
                "INSERT INTO Purchase.PurchaseInvoiceCharge (PurchaseInvoiceId, SeqNo, Label, Basis, Value, Amount) VALUES (@invoiceId, @seq, @Label, @Basis, @Value, @amount)",
                new { invoiceId, seq = i, c.Label, c.Basis, c.Value, amount }, tx);
        }
        decimal chargesTotal = runningSubtotal - basicAmountTotal;
        decimal assessableValue = runningSubtotal;

        decimal tax = Math.Round(assessableValue * gstPct / 100m, 2);
        decimal cgstValue = 0, sgstValue = 0, igstValue = 0;
        if (isInterState) igstValue = tax; else { cgstValue = Math.Round(tax / 2m, 2); sgstValue = tax - cgstValue; }

        decimal totalBeforeRound = assessableValue + tax;
        // The operator always types the round-off figure. "Round On" adds it to the total;
        // "Round Off" subtracts it.
        decimal roundOff = roundOffEnabled ? roundOffValue : -roundOffValue;
        decimal rounded = Math.Round(totalBeforeRound + roundOff, 2);

        conn.Execute(
            @"UPDATE Purchase.PurchaseInvoice SET
                BasicValue = @basicAmountTotal, ChargesTotal = @chargesTotal, TaxableValue = @assessableValue, GstPct = @gstPct,
                CgstValue = @cgstValue, SgstValue = @sgstValue, IgstValue = @igstValue,
                RoundOffEnabled = @roundOffEnabled, RoundOff = @roundOff, TotalValue = @rounded
              WHERE PurchaseInvoiceId = @invoiceId",
            new { invoiceId, basicAmountTotal, chargesTotal, assessableValue, gstPct, cgstValue, sgstValue, igstValue, roundOffEnabled, roundOff, rounded }, tx);

        // Per-line NetValue is left exactly as inserted — BasicValue + HolesAmount + CutoutAmount,
        // the line's own price with no proportional share of header Charges/GST folded in. Charges
        // and GST are shown only in the invoice-level totals now (see #40), so there is nothing to
        // reconcile per line here.
    }

    /// <summary>Reverses the stock this invoice's lines added so far, refusing with 409 if any of
    /// it has since moved on elsewhere — the same check GrnController.Delete and this controller's
    /// own Delete already make, reused here because editing lines has to undo the old ones' stock
    /// effect before applying the new ones'. Returns null on success, or the Conflict to return.
    /// </summary>
    private IActionResult? ReverseStockMovements(System.Data.IDbConnection conn, System.Data.IDbTransaction tx, int invoiceId)
    {
        var movements = conn.Query<(int ProductId, int GodownId, decimal Qty)>(
            "SELECT ProductId, GodownId, Qty FROM Inventory.StockMovement WHERE DocType = 'PurchaseInvoice' AND DocId = @invoiceId AND MovementType = 'Purchase'",
            new { invoiceId }, tx).ToList();

        foreach (var m in movements)
        {
            var qtyFree = conn.ExecuteScalar<decimal?>(
                "SELECT QtyOnHand FROM Inventory.StockBalance WHERE ProductId = @ProductId AND GodownId = @GodownId",
                new { m.ProductId, m.GodownId }, tx) ?? 0m;
            if (qtyFree < m.Qty)
            {
                var product = conn.QueryFirstOrDefault<string>("SELECT Code FROM Master.Product WHERE ProductId = @ProductId", new { m.ProductId }, tx);
                return Conflict(new ProblemResponse
                {
                    Title = "Stock already moved",
                    Status = 409,
                    ErrorCode = "PURCHASEINVOICE_STOCK_CONSUMED",
                    Detail = $"{product ?? $"Product {m.ProductId}"}: only {qtyFree} of the {m.Qty} added by this invoice is still on hand — the rest has already been sold, transferred or adjusted. The lines cannot be changed.",
                });
            }
        }

        foreach (var m in movements)
        {
            conn.Execute(
                "UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @Qty WHERE ProductId = @ProductId AND GodownId = @GodownId",
                new { m.Qty, m.ProductId, m.GodownId }, tx);
        }
        conn.Execute("DELETE FROM Inventory.StockMovement WHERE DocType = 'PurchaseInvoice' AND DocId = @invoiceId", new { invoiceId }, tx);
        conn.Execute("DELETE FROM Purchase.PurchaseInvoiceLine WHERE PurchaseInvoiceId = @invoiceId", new { invoiceId }, tx);
        conn.Execute("DELETE FROM Purchase.PurchaseInvoiceCharge WHERE PurchaseInvoiceId = @invoiceId", new { invoiceId }, tx);
        return null;
    }

    /// <summary>Fixes a wrong supplier reference number, e-Way Bill selection or date, and — unlike
    /// most other documents in this app — the line items themselves. Pass <c>Lines</c> (together
    /// with <c>Charges</c> and <c>GstPct</c> — all three travel together, since editing lines
    /// without recomputing charges/tax would leave the invoice's totals inconsistent) to replace
    /// them entirely: the stock this invoice previously added is reversed first (refused with 409
    /// if any of it has already moved on elsewhere, same rule Delete enforces), then the new lines
    /// are priced and their stock applied, exactly as at Create time. Omit <c>Lines</c> to leave
    /// them untouched and only patch the header fields below.</summary>
    [RequirePermission("PurchaseInvoice.Edit")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] UpdatePurchaseInvoiceRequest req)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var current = conn.QueryFirstOrDefault("SELECT EwayBillId, IsInterState, GodownId FROM Purchase.PurchaseInvoice WHERE PurchaseInvoiceId = @id", new { id }, tx);
            if (current is null) { tx.Rollback(); return NotFound(); }
            int? currentEwayBillId = (int?)current.EwayBillId;

            if (req.Lines is not null)
            {
                var validation = ValidateLines(req.Lines) ?? ValidateCharges(req.Charges ?? new List<CreatePurchaseInvoiceChargeRequest>());
                if (validation is not null) { tx.Rollback(); return validation; }
                if (req.GstPct is null)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "GST % required", Status = 422, ErrorCode = "GSTPCT_REQUIRED", Detail = "Send GstPct together with Lines — editing lines requires the invoice's tax to be recomputed." });
                }

                var reverseResult = ReverseStockMovements(conn, tx, id);
                if (reverseResult is not null) { tx.Rollback(); return reverseResult; }

                bool isInterState = (bool)current.IsInterState;
                int godownId = (int)current.GodownId;
                var lineTotals = PriceInsertLinesAndMoveStock(conn, tx, id, godownId, req.Lines);
                ApplyChargesAndTax(conn, tx, id, lineTotals, req.Charges ?? new List<CreatePurchaseInvoiceChargeRequest>(), req.GstPct.Value, isInterState, req.RoundOffEnabled, req.RoundOffValue);
            }

            // Only touch the e-Way Bill link if the caller actually sent something -- either a new
            // EwayBillId to switch to, or ClearEwayBill=true to unlink. Omitting both leaves the
            // existing link (if any) untouched, same as SupplierInvoiceNo/InvoiceDate below.
            string? newEwayBillNo = null;
            int? newEwayBillId = currentEwayBillId;
            bool touchingEwayBill = req.EwayBillId.HasValue || req.ClearEwayBill;

            if (req.EwayBillId.HasValue && req.EwayBillId != currentEwayBillId)
            {
                var eb = conn.QueryFirstOrDefault("SELECT EwayBillNo, IsUsed FROM Purchase.EwayBill WHERE EwayBillId = @EwayBillId", new { req.EwayBillId }, tx);
                if (eb is null)
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid e-Way Bill", Status = 422, ErrorCode = "EWAYBILL_INVALID", Detail = "The selected e-Way Bill does not exist." });
                if ((bool)eb.IsUsed)
                    return Conflict(new ProblemResponse { Title = "e-Way Bill in use", Status = 409, ErrorCode = "EWAYBILL_IN_USE", Detail = "The selected e-Way Bill is already linked to another purchase invoice." });
                newEwayBillNo = (string)eb.EwayBillNo;
                newEwayBillId = req.EwayBillId;
            }
            else if (req.ClearEwayBill)
            {
                newEwayBillId = null;
            }
            else if (currentEwayBillId.HasValue)
            {
                newEwayBillNo = conn.ExecuteScalar<string?>("SELECT EwayBillNo FROM Purchase.EwayBill WHERE EwayBillId = @currentEwayBillId", new { currentEwayBillId }, tx);
            }

            var rows = conn.Execute(
                touchingEwayBill
                    ? @"UPDATE Purchase.PurchaseInvoice SET
                          SupplierInvoiceNo = @SupplierInvoiceNo,
                          EwayBillNo = @newEwayBillNo,
                          EwayBillId = @newEwayBillId,
                          InvoiceDate = ISNULL(@InvoiceDate, InvoiceDate)
                        WHERE PurchaseInvoiceId = @id"
                    : @"UPDATE Purchase.PurchaseInvoice SET
                          SupplierInvoiceNo = @SupplierInvoiceNo,
                          InvoiceDate = ISNULL(@InvoiceDate, InvoiceDate)
                        WHERE PurchaseInvoiceId = @id",
                new { id, req.SupplierInvoiceNo, req.InvoiceDate, newEwayBillNo, newEwayBillId }, tx);
            if (rows == 0) { tx.Rollback(); return NotFound(); }

            if (touchingEwayBill && currentEwayBillId.HasValue && currentEwayBillId != newEwayBillId)
                conn.Execute("UPDATE Purchase.EwayBill SET IsUsed = 0 WHERE EwayBillId = @currentEwayBillId", new { currentEwayBillId }, tx);
            if (touchingEwayBill && newEwayBillId.HasValue && currentEwayBillId != newEwayBillId)
                conn.Execute("UPDATE Purchase.EwayBill SET IsUsed = 1 WHERE EwayBillId = @newEwayBillId", new { newEwayBillId }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Update', 'PurchaseInvoice', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Unlike the old flat-total booking, this invoice adds real stock on Create (see
    /// above) — so deleting it must reverse exactly what it added, refusing if any of that stock
    /// has since moved on, the same rule GrnController.Delete already enforces for the same
    /// reason.</summary>
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

            var lines = conn.Query("SELECT * FROM Purchase.PurchaseInvoiceLine WHERE PurchaseInvoiceId = @id", new { id }, tx).ToList();

            var movements = conn.Query<(int ProductId, int GodownId, decimal Qty)>(
                "SELECT ProductId, GodownId, Qty FROM Inventory.StockMovement WHERE DocType = 'PurchaseInvoice' AND DocId = @id AND MovementType = 'Purchase'",
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
                        ErrorCode = "PURCHASEINVOICE_STOCK_CONSUMED",
                        Detail = $"{product ?? $"Product {m.ProductId}"}: only {qtyFree} of the {m.Qty} added by this invoice is still on hand — the rest has already been sold, transferred or adjusted. This invoice cannot be deleted.",
                    });
                }
            }

            foreach (var m in movements)
            {
                conn.Execute(
                    "UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @Qty WHERE ProductId = @ProductId AND GodownId = @GodownId",
                    new { m.Qty, m.ProductId, m.GodownId }, tx);
            }
            conn.Execute("DELETE FROM Inventory.StockMovement WHERE DocType = 'PurchaseInvoice' AND DocId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Purchase.PurchaseInvoiceLine WHERE PurchaseInvoiceId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Purchase.PurchaseInvoiceCharge WHERE PurchaseInvoiceId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Purchase.PurchaseInvoice WHERE PurchaseInvoiceId = @id", new { id }, tx);

            // Free the linked e-Way Bill back up so it can be selected for another invoice.
            int? ewayBillId = (int?)header.EwayBillId;
            if (ewayBillId.HasValue)
                conn.Execute("UPDATE Purchase.EwayBill SET IsUsed = 0 WHERE EwayBillId = @ewayBillId", new { ewayBillId }, tx);

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "PurchaseInvoice", id.ToString(), new { PurchaseInvoice = header, Lines = lines, ReversedStockMovements = movements });
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
