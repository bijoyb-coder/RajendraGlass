using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

/// <summary>Sub-Category Master -- same List/Create/Update/Delete shape as SuppliersController
/// (server/Controllers/PurchaseController.cs), the closest existing simple Code+Name master. This
/// same List endpoint is what CategoryController's Create/Update reuses for its database-driven
/// Sub-Category dropdown -- there is deliberately no separate "/active" endpoint, matching how
/// e.g. /customers already serves both the Customers master page and every dropdown that needs a
/// customer list.</summary>
[ApiController]
[Route("api/v1/subcategories")]
[Authorize]
public class SubCategoriesController(IDbConnectionFactory db) : ControllerBase
{
    /// <summary>Deletable only while no Category currently references this Sub-Category.</summary>
    private const string CanDeleteSql =
        @"CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM Master.Category x WHERE x.SubCategoryId = sc.SubCategoryId)
          THEN 1 ELSE 0 END AS BIT)";

    [HttpGet]
    public IActionResult List([FromQuery] string? search)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<SubCategoryDto>(
            $@"SELECT sc.SubCategoryId, sc.Code, sc.Name, sc.IsActive, {CanDeleteSql} AS CanDelete
               FROM Master.SubCategory sc
               WHERE sc.IsActive = 1 AND (@search IS NULL OR sc.Code LIKE '%' + @search + '%' OR sc.Name LIKE '%' + @search + '%')
               ORDER BY sc.Code", new { search });
        return Ok(new { items = rows });
    }

    /// <summary>Renaming Code/Name here is always safe -- Category links to a Sub-Category by its
    /// surrogate SubCategoryId, never by the Code string, so nothing can be orphaned by a rename
    /// (see the migration's own doc comment). Both fields stay freely editable, same as
    /// SuppliersController.Update.</summary>
    [RequirePermission("SubCategory.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] SubCategoryDto dto)
    {
        var code = dto.Code?.Trim() ?? "";
        var name = dto.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(code))
            return UnprocessableEntity(new ProblemResponse { Title = "Code required", Status = 422, ErrorCode = "CODE_REQUIRED", Detail = "Sub-Category Code is required." });
        if (string.IsNullOrWhiteSpace(name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Sub-Category Name is required." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>("SELECT SubCategoryId FROM Master.SubCategory WHERE Code = @code", new { code });
        if (existing.HasValue)
            return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A sub-category with code '{code}' already exists." });

        try
        {
            var id = conn.ExecuteScalar<int>(
                "INSERT INTO Master.SubCategory (Code, Name, IsActive) OUTPUT INSERTED.SubCategoryId VALUES (@code, @name, 1)",
                new { code, name });
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'SubCategory', @id)", new { id = id.ToString() });
            dto.SubCategoryId = id;
            dto.Code = code;
            dto.Name = name;
            dto.IsActive = true;
            return Created($"/api/v1/subcategories/{id}", dto);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    [RequirePermission("SubCategory.Create")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] SubCategoryDto dto)
    {
        var code = dto.Code?.Trim() ?? "";
        var name = dto.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(code))
            return UnprocessableEntity(new ProblemResponse { Title = "Code required", Status = 422, ErrorCode = "CODE_REQUIRED", Detail = "Sub-Category Code is required." });
        if (string.IsNullOrWhiteSpace(name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Sub-Category Name is required." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>("SELECT SubCategoryId FROM Master.SubCategory WHERE Code = @code AND SubCategoryId <> @id", new { code, id });
        if (existing.HasValue)
            return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A sub-category with code '{code}' already exists." });

        try
        {
            var rows = conn.Execute("UPDATE Master.SubCategory SET Code = @code, Name = @name WHERE SubCategoryId = @id", new { id, code, name });
            if (rows == 0) return NotFound(new ProblemResponse { Title = "Sub-Category not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The selected sub-category does not exist." });
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Update', 'SubCategory', @id)", new { id = id.ToString() });
            return NoContent();
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    /// <summary>Deletable only while no Category references it -- see CanDeleteSql above.</summary>
    [RequirePermission("SubCategory.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var subCategory = conn.QueryFirstOrDefault("SELECT * FROM Master.SubCategory WHERE SubCategoryId = @id", new { id }, tx);
            if (subCategory is null) { tx.Rollback(); return NotFound(); }

            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Master.Category WHERE SubCategoryId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse
                {
                    Title = "Sub-Category is mapped",
                    Status = 409,
                    ErrorCode = "SUBCATEGORY_HAS_CATEGORY",
                    Detail = "Cannot delete this Sub-Category because it is mapped to one or more Categories.",
                });
            }

            conn.Execute("DELETE FROM Master.SubCategory WHERE SubCategoryId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "SubCategory", id.ToString(), subCategory);
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

/// <summary>Category Master -- SubCategoryId is a real foreign key into Master.SubCategory (see the
/// migration's own doc comment); SubCategoryCode/SubCategoryName are always joined fresh, never
/// trusted from the client and never stored a second time here.</summary>
[ApiController]
[Route("api/v1/categories")]
[Authorize]
public class CategoriesController(IDbConnectionFactory db) : ControllerBase
{
    /// <summary>Deletable only while no Product currently references this Category (see
    /// db/52_product_category_link.sql, Master.Product.CategoryId).</summary>
    private const string CanDeleteSql =
        @"CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM Master.Product x WHERE x.CategoryId = c.CategoryId)
          THEN 1 ELSE 0 END AS BIT)";
    private const string SelectColumns =
        $@"c.CategoryId, c.Code, c.Name, c.SubCategoryId, sc.Code AS SubCategoryCode, sc.Name AS SubCategoryName, c.IsActive,
          {CanDeleteSql} AS CanDelete";

    [HttpGet]
    public IActionResult List([FromQuery] string? search)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<CategoryDto>(
            $@"SELECT {SelectColumns}
               FROM Master.Category c JOIN Master.SubCategory sc ON sc.SubCategoryId = c.SubCategoryId
               WHERE c.IsActive = 1
                 AND (@search IS NULL OR c.Code LIKE '%' + @search + '%' OR c.Name LIKE '%' + @search + '%'
                      OR sc.Code LIKE '%' + @search + '%' OR sc.Name LIKE '%' + @search + '%')
               ORDER BY c.Code", new { search });
        return Ok(new { items = rows });
    }

    [RequirePermission("Category.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CategoryDto dto)
    {
        var code = dto.Code?.Trim() ?? "";
        var name = dto.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(code))
            return UnprocessableEntity(new ProblemResponse { Title = "Code required", Status = 422, ErrorCode = "CODE_REQUIRED", Detail = "Category Code is required." });
        if (string.IsNullOrWhiteSpace(name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Category Name is required." });
        if (dto.SubCategoryId <= 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Sub-Category required", Status = 422, ErrorCode = "SUBCATEGORY_REQUIRED", Detail = "Please select a Sub-Category." });

        using var conn = db.CreateConnection();

        var subCategory = conn.QueryFirstOrDefault("SELECT Code, Name FROM Master.SubCategory WHERE SubCategoryId = @id AND IsActive = 1", new { id = dto.SubCategoryId });
        if (subCategory is null)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid Sub-Category", Status = 422, ErrorCode = "SUBCATEGORY_NOT_FOUND", Detail = "The selected sub-category does not exist or is inactive." });

        var existingCode = conn.QueryFirstOrDefault<int?>("SELECT CategoryId FROM Master.Category WHERE Code = @code", new { code });
        if (existingCode.HasValue)
            return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A category with code '{code}' already exists." });

        try
        {
            var id = conn.ExecuteScalar<int>(
                "INSERT INTO Master.Category (Code, Name, SubCategoryId, IsActive) OUTPUT INSERTED.CategoryId VALUES (@code, @name, @SubCategoryId, 1)",
                new { code, name, dto.SubCategoryId });
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'Category', @id)", new { id = id.ToString() });

            dto.CategoryId = id;
            dto.Code = code;
            dto.Name = name;
            dto.SubCategoryCode = subCategory.Code;
            dto.SubCategoryName = subCategory.Name;
            dto.IsActive = true;
            return Created($"/api/v1/categories/{id}", dto);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    [RequirePermission("Category.Create")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] CategoryDto dto)
    {
        var code = dto.Code?.Trim() ?? "";
        var name = dto.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(code))
            return UnprocessableEntity(new ProblemResponse { Title = "Code required", Status = 422, ErrorCode = "CODE_REQUIRED", Detail = "Category Code is required." });
        if (string.IsNullOrWhiteSpace(name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Category Name is required." });
        if (dto.SubCategoryId <= 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Sub-Category required", Status = 422, ErrorCode = "SUBCATEGORY_REQUIRED", Detail = "Please select a Sub-Category." });

        using var conn = db.CreateConnection();

        var subCategory = conn.QueryFirstOrDefault("SELECT Code, Name FROM Master.SubCategory WHERE SubCategoryId = @id AND IsActive = 1", new { id = dto.SubCategoryId });
        if (subCategory is null)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid Sub-Category", Status = 422, ErrorCode = "SUBCATEGORY_NOT_FOUND", Detail = "The selected sub-category does not exist or is inactive." });

        var existingCode = conn.QueryFirstOrDefault<int?>("SELECT CategoryId FROM Master.Category WHERE Code = @code AND CategoryId <> @id", new { code, id });
        if (existingCode.HasValue)
            return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A category with code '{code}' already exists." });

        try
        {
            var rows = conn.Execute(
                "UPDATE Master.Category SET Code = @code, Name = @name, SubCategoryId = @SubCategoryId WHERE CategoryId = @id",
                new { id, code, name, dto.SubCategoryId });
            if (rows == 0) return NotFound(new ProblemResponse { Title = "Category not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The selected category does not exist." });
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Update', 'Category', @id)", new { id = id.ToString() });
            return NoContent();
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    [RequirePermission("Category.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var category = conn.QueryFirstOrDefault("SELECT * FROM Master.Category WHERE CategoryId = @id", new { id }, tx);
            if (category is null) { tx.Rollback(); return NotFound(); }

            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Master.Product WHERE CategoryId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse
                {
                    Title = "Category is mapped",
                    Status = 409,
                    ErrorCode = "CATEGORY_HAS_PRODUCT",
                    Detail = "Cannot delete this Category because it is mapped to one or more Products.",
                });
            }

            conn.Execute("DELETE FROM Master.Category WHERE CategoryId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Category", id.ToString(), category);
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
