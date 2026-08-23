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

    [HttpGet]
    public IActionResult List([FromQuery] string? search, [FromQuery] bool activeOnly = true)
    {
        using var conn = db.CreateConnection();
        var sql = @"SELECT ProductId, Code, Description, Category, Brand, ThicknessMm, Colour, HsnCode, GstRatePct,
                            StockUnit, SellingUnit, StandardSheetLengthMm, StandardSheetWidthMm, PurchaseRate, SellingRate, MinSellingPrice, IsActive
                     FROM Master.Product
                     WHERE (@activeOnly = 0 OR IsActive = 1)
                       AND (@search IS NULL OR Code LIKE '%' + @search + '%' OR Description LIKE '%' + @search + '%')
                     ORDER BY Description";
        var products = conn.Query<ProductDto>(sql, new { search, activeOnly }).ToList();
        ApplyCostVisibility(products);
        return Ok(new { items = products, total = products.Count });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var product = conn.QueryFirstOrDefault<ProductDto>(
            @"SELECT ProductId, Code, Description, Category, Brand, ThicknessMm, Colour, HsnCode, GstRatePct,
                     StockUnit, SellingUnit, StandardSheetLengthMm, StandardSheetWidthMm, PurchaseRate, SellingRate, MinSellingPrice, IsActive
              FROM Master.Product WHERE ProductId = @id", new { id });
        if (product is null) return NotFound();
        if (!CanViewCost) product.PurchaseRate = null;
        return Ok(product);
    }

    [HttpPost]
    [RequirePermission("Product.Create")]
    public IActionResult Create([FromBody] ProductDto dto)
    {
        using var conn = db.CreateConnection();
        var id = conn.ExecuteScalar<int>(
            @"INSERT INTO Master.Product (Code, Description, Category, Brand, ThicknessMm, Colour, HsnCode, GstRatePct, StockUnit, SellingUnit, StandardSheetLengthMm, StandardSheetWidthMm, PurchaseRate, SellingRate, MinSellingPrice, IsActive)
              OUTPUT INSERTED.ProductId
              VALUES (@Code, @Description, @Category, @Brand, @ThicknessMm, @Colour, @HsnCode, @GstRatePct, @StockUnit, @SellingUnit, @StandardSheetLengthMm, @StandardSheetWidthMm, @PurchaseRate, @SellingRate, @MinSellingPrice, 1)",
            dto);
        dto.ProductId = id;
        return CreatedAtAction(nameof(Get), new { id }, dto);
    }

    [HttpPut("{id:int}")]
    [RequirePermission("Product.Create")]
    public IActionResult Update(int id, [FromBody] ProductDto dto)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Execute(
            @"UPDATE Master.Product SET Description=@Description, Category=@Category, Brand=@Brand, ThicknessMm=@ThicknessMm,
                     Colour=@Colour, HsnCode=@HsnCode, GstRatePct=@GstRatePct, StockUnit=@StockUnit, SellingUnit=@SellingUnit,
                     StandardSheetLengthMm=@StandardSheetLengthMm, StandardSheetWidthMm=@StandardSheetWidthMm,
                     PurchaseRate=@PurchaseRate, SellingRate=@SellingRate, MinSellingPrice=@MinSellingPrice
              WHERE ProductId=@id", new { id, dto.Description, dto.Category, dto.Brand, dto.ThicknessMm, dto.Colour, dto.HsnCode, dto.GstRatePct, dto.StockUnit, dto.SellingUnit, dto.StandardSheetLengthMm, dto.StandardSheetWidthMm, dto.PurchaseRate, dto.SellingRate, dto.MinSellingPrice });
        return rows == 0 ? NotFound() : NoContent();
    }

    [HttpPost("{id:int}/deactivate")]
    [RequirePermission("Product.Create")]
    public IActionResult Deactivate(int id)
    {
        using var conn = db.CreateConnection();
        conn.Execute("UPDATE Master.Product SET IsActive = 0 WHERE ProductId = @id", new { id });
        return NoContent();
    }
}
