using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/products")]
[Authorize]
public class ProductsController(IDbConnectionFactory db) : ControllerBase
{
    /// <summary>Field-level RBAC (SDD 8.2 / FRS 12.3 level 4): purchase cost is omitted, not just
    /// hidden client-side, for any role lacking View.Cost.</summary>
    private bool CanViewCost => User.Claims.Any(c => c.Type == JwtTokenService.PermissionClaimType && c.Value == "View.Cost");

    private void ApplyCostVisibility(IEnumerable<ProductDto> products)
    {
        if (CanViewCost) return;
        foreach (var p in products) p.PurchaseRate = null;
    }

    /// <summary>Every real foreign key into Master.Product across purchase, sale, quotation,
    /// cutting/production, and inventory-movement documents -- deleting a product with any
    /// transaction history behind it would either fail on a raw FK constraint or silently orphan
    /// that history, so a product stays editable forever but only becomes deletable once none of
    /// these exist for it.</summary>
    private const string CanDeleteSql =
        @"CAST(CASE WHEN
            NOT EXISTS (SELECT 1 FROM Purchase.PurchaseOrderLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Purchase.GrnLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Purchase.PurchaseInvoiceLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Sales.QuotationLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Sales.SalesOrderLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Sales.InvoiceLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Cutting.CuttingPlanLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Production.JobCard x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Inventory.StockMovement x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Inventory.StockBalance x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Inventory.StockAdjustmentLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Inventory.StockTransferLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Inventory.Offcut x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Inventory.RackStock x WHERE x.ProductId = p.ProductId)
          THEN 1 ELSE 0 END AS BIT)";

    [HttpGet]
    public IActionResult List([FromQuery] string? search, [FromQuery] bool activeOnly = true)
    {
        using var conn = db.CreateConnection();
        var sql = $@"SELECT p.ProductId, p.Code, p.Description, p.Category, p.Brand, p.ThicknessMm, p.Colour, p.HsnCode, p.GstRatePct,
                            p.StockUnit, p.SellingUnit, p.StandardSheetLengthMm, p.StandardSheetWidthMm, p.PurchaseRate, p.SellingRate, p.MinSellingPrice, p.IsActive,
                            {CanDeleteSql} AS CanDelete
                     FROM Master.Product p
                     WHERE (@activeOnly = 0 OR p.IsActive = 1)
                       AND (@search IS NULL OR p.Code LIKE '%' + @search + '%' OR p.Description LIKE '%' + @search + '%')
                     ORDER BY p.Description";
        var products = conn.Query<ProductDto>(sql, new { search, activeOnly }).ToList();
        ApplyCostVisibility(products);
        return Ok(new { items = products, total = products.Count });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var product = conn.QueryFirstOrDefault<ProductDto>(
            $@"SELECT p.ProductId, p.Code, p.Description, p.Category, p.Brand, p.ThicknessMm, p.Colour, p.HsnCode, p.GstRatePct,
                     p.StockUnit, p.SellingUnit, p.StandardSheetLengthMm, p.StandardSheetWidthMm, p.PurchaseRate, p.SellingRate, p.MinSellingPrice, p.IsActive,
                     {CanDeleteSql} AS CanDelete
              FROM Master.Product p WHERE p.ProductId = @id", new { id });
        if (product is null) return NotFound();
        if (!CanViewCost) product.PurchaseRate = null;
        return Ok(product);
    }

    [HttpPost]
    [RequirePermission("Product.Create")]
    public IActionResult Create([FromBody] ProductDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Code))
            return UnprocessableEntity(new ProblemResponse { Title = "Code required", Status = 422, ErrorCode = "CODE_REQUIRED", Detail = "Product code is required." });
        if (string.IsNullOrWhiteSpace(dto.Description))
            return UnprocessableEntity(new ProblemResponse { Title = "Description required", Status = 422, ErrorCode = "DESCRIPTION_REQUIRED", Detail = "Product description is required." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>("SELECT ProductId FROM Master.Product WHERE Code = @Code", new { dto.Code });
        if (existing.HasValue)
        {
            return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A product with code '{dto.Code}' already exists." });
        }

        try
        {
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Master.Product (Code, Description, Category, Brand, ThicknessMm, Colour, HsnCode, GstRatePct, StockUnit, SellingUnit, StandardSheetLengthMm, StandardSheetWidthMm, PurchaseRate, SellingRate, MinSellingPrice, IsActive)
                  OUTPUT INSERTED.ProductId
                  VALUES (@Code, @Description, @Category, @Brand, @ThicknessMm, @Colour, @HsnCode, @GstRatePct, @StockUnit, @SellingUnit, @StandardSheetLengthMm, @StandardSheetWidthMm, @PurchaseRate, @SellingRate, @MinSellingPrice, 1)",
                dto);
            dto.ProductId = id;
            return CreatedAtAction(nameof(Get), new { id }, dto);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    [HttpPut("{id:int}")]
    [RequirePermission("Product.Create")]
    public IActionResult Update(int id, [FromBody] ProductDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Description))
            return UnprocessableEntity(new ProblemResponse { Title = "Description required", Status = 422, ErrorCode = "DESCRIPTION_REQUIRED", Detail = "Product description is required." });

        using var conn = db.CreateConnection();
        try
        {
            var rows = conn.Execute(
                @"UPDATE Master.Product SET Description=@Description, Category=@Category, Brand=@Brand, ThicknessMm=@ThicknessMm,
                         Colour=@Colour, HsnCode=@HsnCode, GstRatePct=@GstRatePct, StockUnit=@StockUnit, SellingUnit=@SellingUnit,
                         StandardSheetLengthMm=@StandardSheetLengthMm, StandardSheetWidthMm=@StandardSheetWidthMm,
                         PurchaseRate=@PurchaseRate, SellingRate=@SellingRate, MinSellingPrice=@MinSellingPrice
                  WHERE ProductId=@id", new { id, dto.Description, dto.Category, dto.Brand, dto.ThicknessMm, dto.Colour, dto.HsnCode, dto.GstRatePct, dto.StockUnit, dto.SellingUnit, dto.StandardSheetLengthMm, dto.StandardSheetWidthMm, dto.PurchaseRate, dto.SellingRate, dto.MinSellingPrice });
            return rows == 0 ? NotFound() : NoContent();
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    [HttpPost("{id:int}/deactivate")]
    [RequirePermission("Product.Create")]
    public IActionResult Deactivate(int id)
    {
        using var conn = db.CreateConnection();
        conn.Execute("UPDATE Master.Product SET IsActive = 0 WHERE ProductId = @id", new { id });
        return NoContent();
    }

    /// <summary>Deletable only while nothing has ever transacted against this product -- see
    /// CanDeleteSql above for exactly which references are checked and why.</summary>
    [HttpDelete("{id:int}")]
    [RequirePermission("Product.Delete")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var product = conn.QueryFirstOrDefault("SELECT * FROM Master.Product WHERE ProductId = @id", new { id }, tx);
            if (product is null) { tx.Rollback(); return NotFound(); }

            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Purchase.PurchaseOrderLine WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a Purchase Order", Status = 409, ErrorCode = "PRODUCT_HAS_PURCHASE_ORDER", Detail = "A Purchase Order already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Purchase.GrnLine WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a GRN", Status = 409, ErrorCode = "PRODUCT_HAS_GRN", Detail = "A GRN already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Purchase.PurchaseInvoiceLine WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a Purchase Invoice", Status = 409, ErrorCode = "PRODUCT_HAS_PURCHASE_INVOICE", Detail = "A Purchase Invoice already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.QuotationLine WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a Quotation", Status = 409, ErrorCode = "PRODUCT_HAS_QUOTATION", Detail = "A Quotation already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.SalesOrderLine WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a Sales Order", Status = 409, ErrorCode = "PRODUCT_HAS_SALES_ORDER", Detail = "A Sales Order already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.InvoiceLine WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a Sales Invoice", Status = 409, ErrorCode = "PRODUCT_HAS_INVOICE", Detail = "A Sales Invoice (or Counter Bill) already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Cutting.CuttingPlanLine WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a Cutting Plan", Status = 409, ErrorCode = "PRODUCT_HAS_CUTTING_PLAN", Detail = "A Cutting Plan already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Production.JobCard WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a Job Card", Status = 409, ErrorCode = "PRODUCT_HAS_JOBCARD", Detail = "A Job Card already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Inventory.StockMovement WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product has stock movements", Status = 409, ErrorCode = "PRODUCT_HAS_STOCK_MOVEMENT", Detail = "This product already has recorded stock movements; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Inventory.StockBalance WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product has stock on hand", Status = 409, ErrorCode = "PRODUCT_HAS_STOCK_BALANCE", Detail = "This product already has a stock balance recorded; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Inventory.StockAdjustmentLine WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a Stock Adjustment", Status = 409, ErrorCode = "PRODUCT_HAS_STOCK_ADJUSTMENT", Detail = "A Stock Adjustment already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Inventory.StockTransferLine WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product used in a Stock Transfer", Status = 409, ErrorCode = "PRODUCT_HAS_STOCK_TRANSFER", Detail = "A Stock Transfer already references this product; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Inventory.Offcut WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product has offcuts", Status = 409, ErrorCode = "PRODUCT_HAS_OFFCUT", Detail = "This product already has offcut records; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Inventory.RackStock WHERE ProductId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product is placed on a rack", Status = 409, ErrorCode = "PRODUCT_HAS_RACK_STOCK", Detail = "This product already has rack stock recorded; it cannot be deleted." });
            }

            conn.Execute("DELETE FROM Master.Product WHERE ProductId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Product", id.ToString(), product);
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
