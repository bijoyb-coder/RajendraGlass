using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

/// <summary>Type Master -- deliberately just TypeId + TypeName, no Code column (see
/// server/Models/ModelsType.cs). A Type already used by a Product is never physically deletable
/// (Products keep referencing it by TypeId forever), so the only lifecycle action is
/// Activate/Deactivate -- exactly the "safe deletion mechanism" the task spec calls for.</summary>
[ApiController]
[Route("api/v1/types")]
[Authorize]
public class TypeController(IDbConnectionFactory db) : ControllerBase
{
    private const string CanDeactivateSql =
        @"CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM Master.Product x WHERE x.TypeId = t.TypeId)
          THEN 1 ELSE 0 END AS BIT)";

    [HttpGet]
    public IActionResult List([FromQuery] string? search)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<TypeDto>(
            $@"SELECT t.TypeId, t.Name, t.IsActive, {CanDeactivateSql} AS CanDelete
               FROM Master.Type t
               WHERE (@search IS NULL OR t.Name LIKE '%' + @search + '%')
               ORDER BY t.Name", new { search });
        return Ok(new { items = rows });
    }

    /// <summary>Active types only -- what Product Master's Type dropdown loads (per the task spec's
    /// own suggested route, GET /api/types/active).</summary>
    [HttpGet("active")]
    public IActionResult ListActive()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<TypeDto>("SELECT TypeId, Name, IsActive FROM Master.Type WHERE IsActive = 1 ORDER BY Name");
        return Ok(new { items = rows });
    }

    [RequirePermission("Type.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] TypeDto dto)
    {
        var name = dto.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Type Name is required." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>("SELECT TypeId FROM Master.Type WHERE Name = @name", new { name });
        if (existing.HasValue)
            return Conflict(new ProblemResponse { Title = "Duplicate name", Status = 409, ErrorCode = "DUPLICATE_NAME", Detail = "Type Name already exists." });

        try
        {
            var id = conn.ExecuteScalar<int>(
                "INSERT INTO Master.Type (Name, IsActive) OUTPUT INSERTED.TypeId VALUES (@name, 1)", new { name });
            dto.TypeId = id;
            dto.Name = name;
            dto.IsActive = true;
            return Created($"/api/v1/types/{id}", dto);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    [RequirePermission("Type.Create")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] TypeDto dto)
    {
        var name = dto.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Type Name is required." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>("SELECT TypeId FROM Master.Type WHERE Name = @name AND TypeId <> @id", new { name, id });
        if (existing.HasValue)
            return Conflict(new ProblemResponse { Title = "Duplicate name", Status = 409, ErrorCode = "DUPLICATE_NAME", Detail = "Type Name already exists." });

        try
        {
            var rows = conn.Execute("UPDATE Master.Type SET Name = @name WHERE TypeId = @id", new { id, name });
            if (rows == 0) return NotFound(new ProblemResponse { Title = "Type not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The selected type does not exist." });
            return NoContent();
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    /// <summary>Toggles IsActive -- never a hard delete, so Products that already reference this
    /// Type keep a valid, resolvable TypeId forever. Deactivating is refused only in the sense that
    /// it simply stops the Type from appearing in the active-only Product dropdown; existing
    /// Products keep showing it until reassigned.</summary>
    [RequirePermission("Type.Delete")]
    [HttpPost("{id:int}/deactivate")]
    public IActionResult Deactivate(int id)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Execute("UPDATE Master.Type SET IsActive = 0 WHERE TypeId = @id", new { id });
        return rows == 0 ? NotFound() : NoContent();
    }

    [RequirePermission("Type.Create")]
    [HttpPost("{id:int}/activate")]
    public IActionResult Activate(int id)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Execute("UPDATE Master.Type SET IsActive = 1 WHERE TypeId = @id", new { id });
        return rows == 0 ? NotFound() : NoContent();
    }
}
