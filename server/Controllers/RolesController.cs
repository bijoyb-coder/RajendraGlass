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
public class RolesController(IDbConnectionFactory db, PermissionService permissionService) : ControllerBase
{
    [HttpGet("permissions")]
    [RequirePermission("Role.View")]
    public IActionResult ListPermissionCatalogue()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<PermissionDto>("SELECT PermissionId, Code, Module, Description FROM Security.Permission ORDER BY Module, Code");
        return Ok(new { items = rows });
    }

    [HttpGet("roles")]
    [RequirePermission("Role.View")]
    public IActionResult ListRoles()
    {
        using var conn = db.CreateConnection();
        var roles = conn.Query<RoleDto>("SELECT RoleId, Name, Description, IsActive, IsMfaRequired FROM Security.Role ORDER BY Name").ToList();
        var grants = conn.Query<(int RoleId, string Code)>(
            "SELECT rp.RoleId, p.Code FROM Security.RolePermission rp JOIN Security.Permission p ON p.PermissionId = rp.PermissionId").ToList();
        foreach (var role in roles)
            role.Permissions = grants.Where(g => g.RoleId == role.RoleId).Select(g => g.Code).OrderBy(c => c).ToList();
        return Ok(new { items = roles });
    }

    [HttpPut("roles/{id:int}/permissions")]
    [RequirePermission("Role.Edit")]
    public IActionResult UpdateRolePermissions(int id, [FromBody] UpdateRolePermissionsRequest req)
    {
        using var conn = db.CreateConnection();
        var role = conn.QueryFirstOrDefault("SELECT RoleId, Name FROM Security.Role WHERE RoleId = @id", new { id });
        if (role is null) return NotFound();

        // No role can be granted the ability to approve its own documents beyond what's sane here —
        // full self-approval detection lives in the approval-workflow engine (not yet built); this
        // endpoint enforces the simpler rule that Role.Edit itself can never be revoked from Owner.
        if ((string)role.Name == "Owner" && !req.PermissionCodes.Contains("Role.Edit"))
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Cannot restrict Owner", Status = 422, ErrorCode = "OWNER_PROTECTED", Detail = "The Owner role must always retain Role.Edit." });
        }

        using var tx = conn.BeginTransaction();
        try
        {
            conn.Execute("DELETE FROM Security.RolePermission WHERE RoleId = @id", new { id }, tx);
            if (req.PermissionCodes.Count > 0)
            {
                conn.Execute(
                    @"INSERT INTO Security.RolePermission (RoleId, PermissionId)
                      SELECT @id, PermissionId FROM Security.Permission WHERE Code IN @codes",
                    new { id, codes = req.PermissionCodes }, tx);
            }
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId, AfterJson) VALUES ('UpdatePermissions', 'Role', @id, @json)",
                new { id = id.ToString(), json = System.Text.Json.JsonSerializer.Serialize(req.PermissionCodes) }, tx);
            tx.Commit();
        }
        catch
        {
            tx.Rollback();
            throw;
        }

        // Every currently-cached user in this role must pick up the change — cheapest correct option
        // at this scale is to drop the whole permission cache rather than track role→user fan-out.
        permissionService.InvalidateAll();
        return NoContent();
    }
}
