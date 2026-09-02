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
    /// these exist for it. StockBalance/RackStock are ledger rows, not transactions -- a godown or
    /// rack can carry a zero-quantity row for a product that was set up but never actually moved
    /// (e.g. seeded at zero, or fully consumed and left at 0), so those two only count as "in use"
    /// once they actually hold a nonzero quantity; every other table here is a real document line,
    /// so its mere existence is enough.</summary>
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
            AND NOT EXISTS (SELECT 1 FROM Inventory.StockBalance x WHERE x.ProductId = p.ProductId AND (x.QtyOnHand <> 0 OR x.QtyReserved <> 0 OR x.QtyBlocked <> 0 OR x.QtyDamaged <> 0))
            AND NOT EXISTS (SELECT 1 FROM Inventory.StockAdjustmentLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Inventory.StockTransferLine x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Inventory.Offcut x WHERE x.ProductId = p.ProductId)
            AND NOT EXISTS (SELECT 1 FROM Inventory.RackStock x WHERE x.ProductId = p.ProductId AND x.QtyOnHand <> 0)
          THEN 1 ELSE 0 END AS BIT)";

    /// <summary>Every Product row's Select shares this shape -- Category/Sub-Category/Type are
    /// always re-joined for display (never trusted from a stored free-text copy), and CurrentStock
    /// is the live sum across every Godown, kept deliberately separate from OpeningBalance (which
    /// never changes after Create).</summary>
    private const string SelectColumns =
        @"p.ProductId, p.Code, p.Description, p.Category, p.Brand, p.ThicknessMm, p.Colour, p.HsnCode, p.GstRatePct,
          p.StockUnit, p.SellingUnit, p.StandardSheetLengthMm, p.StandardSheetWidthMm, p.PurchaseRate, p.SellingRate, p.MinSellingPrice, p.IsActive,
          p.CategoryId, c.Code AS CategoryCode, c.Name AS CategoryName,
          p.SubCategoryId, sc.Code AS SubCategoryCode, sc.Name AS SubCategoryName,
          p.TypeId, t.Name AS TypeName,
          p.OpeningBalance,
          (SELECT SUM(sb.QtyOnHand) FROM Inventory.StockBalance sb WHERE sb.ProductId = p.ProductId) AS CurrentStock";

    private const string Joins =
        @"LEFT JOIN Master.Category c ON c.CategoryId = p.CategoryId
          LEFT JOIN Master.SubCategory sc ON sc.SubCategoryId = p.SubCategoryId
          LEFT JOIN Master.Type t ON t.TypeId = p.TypeId";

    [HttpGet]
    public IActionResult List([FromQuery] string? search, [FromQuery] bool activeOnly = true)
    {
        using var conn = db.CreateConnection();
        var sql = $@"SELECT {SelectColumns}, {CanDeleteSql} AS CanDelete
                     FROM Master.Product p
                     {Joins}
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
            $@"SELECT {SelectColumns}, {CanDeleteSql} AS CanDelete
              FROM Master.Product p
              {Joins}
              WHERE p.ProductId = @id", new { id });
        if (product is null) return NotFound();
        if (!CanViewCost) product.PurchaseRate = null;
        return Ok(product);
    }

    /// <summary>Validates CategoryId/SubCategoryId/TypeId exactly as the client's own cascading
    /// dropdowns would have constrained them -- never trusts a raw id sent from the browser. Returns
    /// a ProblemResponse to short-circuit with, or null when everything checks out.</summary>
    private ProblemResponse? ValidateCategoryLinks(System.Data.IDbConnection conn, System.Data.IDbTransaction? tx, ProductDto dto)
    {
        if (dto.CategoryId.HasValue)
        {
            var category = conn.QueryFirstOrDefault("SELECT CategoryId FROM Master.Category WHERE CategoryId = @id AND IsActive = 1", new { id = dto.CategoryId.Value }, tx);
            if (category is null)
                return new ProblemResponse { Title = "Invalid Category", Status = 422, ErrorCode = "CATEGORY_NOT_FOUND", Detail = "The selected category does not exist or is inactive." };
        }
        if (dto.SubCategoryId.HasValue)
        {
            var subCategory = conn.QueryFirstOrDefault("SELECT CategoryId FROM Master.SubCategory WHERE SubCategoryId = @id AND IsActive = 1", new { id = dto.SubCategoryId.Value }, tx);
            if (subCategory is null)
                return new ProblemResponse { Title = "Invalid Sub-Category", Status = 422, ErrorCode = "SUBCATEGORY_NOT_FOUND", Detail = "The selected sub-category does not exist or is inactive." };
            // The sub-category must belong to the selected category -- a mismatched combo can only
            // reach here via a direct API call (the UI's cascading dropdown never offers one), but it
            // must still be rejected.
            if (!dto.CategoryId.HasValue || (int)subCategory.CategoryId != dto.CategoryId.Value)
                return new ProblemResponse { Title = "Category mismatch", Status = 422, ErrorCode = "SUBCATEGORY_MISMATCH", Detail = "Selected Sub-Category does not belong to the selected Category." };
        }
        if (dto.TypeId.HasValue)
        {
            var type = conn.QueryFirstOrDefault("SELECT TypeId FROM Master.Type WHERE TypeId = @id AND IsActive = 1", new { id = dto.TypeId.Value }, tx);
            if (type is null)
                return new ProblemResponse { Title = "Invalid Type", Status = 422, ErrorCode = "TYPE_NOT_FOUND", Detail = "The selected type does not exist or is inactive." };
        }
        return null;
    }

    [HttpPost]
    [RequirePermission("Product.Create")]
    public IActionResult Create([FromBody] ProductDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Code))
            return UnprocessableEntity(new ProblemResponse { Title = "Code required", Status = 422, ErrorCode = "CODE_REQUIRED", Detail = "Product code is required." });
        if (string.IsNullOrWhiteSpace(dto.Description))
            return UnprocessableEntity(new ProblemResponse { Title = "Description required", Status = 422, ErrorCode = "DESCRIPTION_REQUIRED", Detail = "Product description is required." });
        if (dto.OpeningBalance.HasValue && dto.OpeningBalance.Value < 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid Opening Balance", Status = 422, ErrorCode = "OPENING_BALANCE_NEGATIVE", Detail = "Opening Balance cannot be negative." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>("SELECT ProductId FROM Master.Product WHERE Code = @Code", new { dto.Code });
        if (existing.HasValue)
        {
            return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A product with code '{dto.Code}' already exists." });
        }

        var linkError = ValidateCategoryLinks(conn, null, dto);
        if (linkError is not null) return UnprocessableEntity(linkError);

        // A nonzero Opening Balance must land somewhere real -- it drives an actual
        // Inventory.StockOpening document (see below), which needs a Godown.
        bool hasOpeningBalance = dto.OpeningBalance.HasValue && dto.OpeningBalance.Value > 0;
        if (hasOpeningBalance && !dto.OpeningBalanceGodownId.HasValue)
            return UnprocessableEntity(new ProblemResponse { Title = "Godown required", Status = 422, ErrorCode = "OPENING_BALANCE_GODOWN_REQUIRED", Detail = "Please select a Godown for the Opening Balance." });

        using var tx = conn.BeginTransaction();
        try
        {
            if (hasOpeningBalance)
            {
                var godown = conn.QueryFirstOrDefault("SELECT GodownId FROM Company.Godown WHERE GodownId = @id AND IsActive = 1", new { id = dto.OpeningBalanceGodownId!.Value }, tx);
                if (godown is null)
                {
                    tx.Rollback();
                    return UnprocessableEntity(new ProblemResponse { Title = "Invalid Godown", Status = 422, ErrorCode = "GODOWN_NOT_FOUND", Detail = "The selected godown does not exist or is inactive." });
                }
            }

            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Master.Product (Code, Description, Category, CategoryId, SubCategoryId, TypeId, OpeningBalance, Brand, ThicknessMm, Colour, HsnCode, GstRatePct, StockUnit, SellingUnit, StandardSheetLengthMm, StandardSheetWidthMm, PurchaseRate, SellingRate, MinSellingPrice, IsActive)
                  OUTPUT INSERTED.ProductId
                  VALUES (@Code, @Description, @Category, @CategoryId, @SubCategoryId, @TypeId, @OpeningBalance, @Brand, @ThicknessMm, @Colour, @HsnCode, @GstRatePct, @StockUnit, @SellingUnit, @StandardSheetLengthMm, @StandardSheetWidthMm, @PurchaseRate, @SellingRate, @MinSellingPrice, 1)",
                dto, tx);

            // Post the Opening Balance through the exact same mechanism as every other opening-stock
            // entry in this app (InventoryController.CreateStockOpening) -- one StockOpening
            // document, one StockBalance increment, one StockMovement row. Product.OpeningBalance
            // itself is never separately summed into StockBalance, so this can never double-count.
            if (hasOpeningBalance)
            {
                int godownId = dto.OpeningBalanceGodownId!.Value;
                int branchId = DocNumbering.DefaultBranchId(conn, tx);
                string openingNo = DocNumbering.NextNumber(conn, tx, branchId, "StockOpening");
                var qty = dto.OpeningBalance!.Value;

                var openingId = conn.ExecuteScalar<int>(
                    @"INSERT INTO Inventory.StockOpening (OpeningNo, GodownId, Remarks, Status)
                      OUTPUT INSERTED.StockOpeningId
                      VALUES (@openingNo, @godownId, @remarks, 'Posted')",
                    new { openingNo, godownId, remarks = $"Opening balance recorded for product {dto.Code}" }, tx);

                conn.Execute(
                    "INSERT INTO Inventory.StockOpeningLine (StockOpeningId, ProductId, Qty, AreaSqm) VALUES (@openingId, @productId, @qty, @qty)",
                    new { openingId, productId = id, qty }, tx);

                var balance = conn.QueryFirstOrDefault(
                    "SELECT StockBalanceId FROM Inventory.StockBalance WHERE ProductId = @productId AND GodownId = @godownId",
                    new { productId = id, godownId }, transaction: tx);
                if (balance is null)
                    conn.Execute("INSERT INTO Inventory.StockBalance (ProductId, GodownId, QtyOnHand) VALUES (@productId, @godownId, @qty)", new { productId = id, godownId, qty }, tx);
                else
                    conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand + @qty WHERE StockBalanceId = @id", new { qty, id = (int)balance.StockBalanceId }, tx);

                conn.Execute(
                    @"INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty)
                      VALUES (@productId, @godownId, 'Opening', 'StockOpening', @openingId, @qty)",
                    new { productId = id, godownId, openingId, qty }, tx);
            }

            tx.Commit();
            dto.ProductId = id;
            return CreatedAtAction(nameof(Get), new { id }, dto);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            tx.Rollback();
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    /// <summary>Never touches OpeningBalance or triggers any stock movement -- Opening Balance is an
    /// initial stock value set once at Create, not a continuously editable quantity. Correcting a
    /// product's actual stock on hand goes through the existing Stock Adjustment feature
    /// (InventoryController.CreateStockAdjustment), which carries its own audit trail; Product
    /// Master's Edit form only ever changes descriptive fields.</summary>
    [HttpPut("{id:int}")]
    [RequirePermission("Product.Create")]
    public IActionResult Update(int id, [FromBody] ProductDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Description))
            return UnprocessableEntity(new ProblemResponse { Title = "Description required", Status = 422, ErrorCode = "DESCRIPTION_REQUIRED", Detail = "Product description is required." });

        using var conn = db.CreateConnection();

        var linkError = ValidateCategoryLinks(conn, null, dto);
        if (linkError is not null) return UnprocessableEntity(linkError);

        try
        {
            var rows = conn.Execute(
                @"UPDATE Master.Product SET Description=@Description, Category=@Category, CategoryId=@CategoryId, SubCategoryId=@SubCategoryId, TypeId=@TypeId, Brand=@Brand, ThicknessMm=@ThicknessMm,
                         Colour=@Colour, HsnCode=@HsnCode, GstRatePct=@GstRatePct, StockUnit=@StockUnit, SellingUnit=@SellingUnit,
                         StandardSheetLengthMm=@StandardSheetLengthMm, StandardSheetWidthMm=@StandardSheetWidthMm,
                         PurchaseRate=@PurchaseRate, SellingRate=@SellingRate, MinSellingPrice=@MinSellingPrice
                  WHERE ProductId=@id", new { id, dto.Description, dto.Category, dto.CategoryId, dto.SubCategoryId, dto.TypeId, dto.Brand, dto.ThicknessMm, dto.Colour, dto.HsnCode, dto.GstRatePct, dto.StockUnit, dto.SellingUnit, dto.StandardSheetLengthMm, dto.StandardSheetWidthMm, dto.PurchaseRate, dto.SellingRate, dto.MinSellingPrice });
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
            // StockBalance/RackStock are ledger rows, not transactions — a zero-quantity row (e.g.
            // seeded at zero, or fully consumed and left at 0) doesn't mean the product was ever
            // actually used, so only a nonzero one blocks delete; see CanDeleteSql above.
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Inventory.StockBalance WHERE ProductId = @id AND (QtyOnHand <> 0 OR QtyReserved <> 0 OR QtyBlocked <> 0 OR QtyDamaged <> 0)", new { id }, tx) > 0)
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
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Inventory.RackStock WHERE ProductId = @id AND QtyOnHand <> 0", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Product is placed on a rack", Status = 409, ErrorCode = "PRODUCT_HAS_RACK_STOCK", Detail = "This product already has rack stock recorded; it cannot be deleted." });
            }

            // Any StockBalance/RackStock rows left at this point are zero-quantity placeholders
            // (already proven above) — clean them up so they don't fail the product's FK
            // constraint; there's no real inventory in them to lose.
            conn.Execute("DELETE FROM Inventory.StockBalance WHERE ProductId = @id", new { id }, tx);
            conn.Execute("DELETE FROM Inventory.RackStock WHERE ProductId = @id", new { id }, tx);

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
