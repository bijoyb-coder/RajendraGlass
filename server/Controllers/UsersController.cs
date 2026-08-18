using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/users")]
[Authorize]
public class UsersController(IDbConnectionFactory db, PermissionService permissionService) : ControllerBase
{
    [HttpGet]
    [RequirePermission("User.View")]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var users = conn.Query(
            @"SELECT UserId, Username, FullName, Email, IsActive, MfaEnabled, FailedAttempts, LockedUntil, LastLoginOn
              FROM Security.[User] ORDER BY FullName").ToList();
        var roleRows = conn.Query<(int UserId, string Name)>(
            "SELECT ur.UserId, r.Name FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId").ToList();

        var result = users.Select(u => new AdminUserDto
        {
            UserId = u.UserId,
            Username = u.Username,
            FullName = u.FullName,
            Email = u.Email,
            IsActive = u.IsActive,
            MfaEnabled = u.MfaEnabled,
            FailedAttempts = u.FailedAttempts,
            IsLocked = u.LockedUntil != null && u.LockedUntil > DateTime.UtcNow,
            LastLoginOn = u.LastLoginOn,
            Roles = roleRows.Where(r => r.UserId == u.UserId).Select(r => r.Name).ToList(),
        });
        return Ok(new { items = result });
    }

    [HttpPost]
    [RequirePermission("User.Create")]
    public IActionResult Create([FromBody] CreateUserRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Validation failed", Status = 422, ErrorCode = "PASSWORD_POLICY", Detail = "Username is required and password must be at least 8 characters." });
        }

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>("SELECT UserId FROM Security.[User] WHERE Username = @Username", new { req.Username });
        if (existing.HasValue)
            return Conflict(new ProblemResponse { Title = "Duplicate username", Status = 409, ErrorCode = "DUPLICATE_USER", Detail = "This username is already taken." });

        using var tx = conn.BeginTransaction();
        try
        {
            var hash = BCrypt.Net.BCrypt.HashPassword(req.Password);
            var userId = conn.ExecuteScalar<int>(
                @"INSERT INTO Security.[User] (Username, FullName, Email, PasswordHash, IsActive)
                  OUTPUT INSERTED.UserId VALUES (@Username, @FullName, @Email, @hash, 1)",
                new { req.Username, req.FullName, req.Email, hash }, tx);

            foreach (var roleId in req.RoleIds.Distinct())
                conn.Execute("INSERT INTO Security.UserRole (UserId, RoleId) VALUES (@userId, @roleId)", new { userId, roleId }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'User', @id)", new { id = userId.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/users/{userId}", new { userId });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [HttpPut("{id:int}/roles")]
    [RequirePermission("User.Create")]
    public IActionResult UpdateRoles(int id, [FromBody] List<int> roleIds)
    {
        using var conn = db.CreateConnection();
        var exists = conn.QueryFirstOrDefault<int?>("SELECT UserId FROM Security.[User] WHERE UserId = @id", new { id });
        if (exists is null) return NotFound();

        using var tx = conn.BeginTransaction();
        try
        {
            conn.Execute("DELETE FROM Security.UserRole WHERE UserId = @id", new { id }, tx);
            foreach (var roleId in roleIds.Distinct())
                conn.Execute("INSERT INTO Security.UserRole (UserId, RoleId) VALUES (@id, @roleId)", new { id, roleId }, tx);
            tx.Commit();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
        permissionService.InvalidateAll();
        return NoContent();
    }

    [HttpPost("{id:int}/deactivate")]
    [RequirePermission("User.Deactivate")]
    public IActionResult Deactivate(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            conn.Execute("UPDATE Security.[User] SET IsActive = 0 WHERE UserId = @id", new { id }, tx);
            conn.Execute("UPDATE Security.RefreshToken SET RevokedOn = SYSUTCDATETIME() WHERE UserId = @id AND RevokedOn IS NULL", new { id }, tx);
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Deactivate', 'User', @EntityId)", new { EntityId = id.ToString() }, tx);
            tx.Commit();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
        return NoContent();
    }

    [HttpPost("{id:int}/activate")]
    [RequirePermission("User.Deactivate")]
    public IActionResult Activate(int id)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Execute("UPDATE Security.[User] SET IsActive = 1 WHERE UserId = @id", new { id });
        return rows == 0 ? NotFound() : NoContent();
    }
}
