using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/notifications")]
[Authorize]
public class NotificationsController(IDbConnectionFactory db) : ControllerBase
{
    private int CurrentUserId => int.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)!);

    [HttpGet]
    public IActionResult List([FromQuery] int page = 1, [FromQuery] int pageSize = 30)
    {
        using var conn = db.CreateConnection();
        var userId = CurrentUserId;
        var offset = (page - 1) * pageSize;

        var rows = conn.Query<NotificationDto>(
            @"SELECT n.NotificationId, n.Type, n.Title, n.Message, n.Link, n.IsRead, n.CreatedOn
              FROM Security.Notification n
              WHERE n.UserId = @userId
                 OR n.Role IN (SELECT r.Name FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId WHERE ur.UserId = @userId)
              ORDER BY n.NotificationId DESC
              OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY", new { userId, offset, pageSize });

        var unreadCount = conn.ExecuteScalar<int>(
            @"SELECT COUNT(*) FROM Security.Notification n
              WHERE n.IsRead = 0 AND (n.UserId = @userId
                 OR n.Role IN (SELECT r.Name FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId WHERE ur.UserId = @userId))",
            new { userId });

        return Ok(new { items = rows, unreadCount });
    }

    [HttpPost("{id:long}/read")]
    public IActionResult MarkRead(long id)
    {
        using var conn = db.CreateConnection();
        conn.Execute("UPDATE Security.Notification SET IsRead = 1 WHERE NotificationId = @id", new { id });
        return NoContent();
    }

    [HttpPost("read-all")]
    public IActionResult MarkAllRead()
    {
        using var conn = db.CreateConnection();
        var userId = CurrentUserId;
        conn.Execute(
            @"UPDATE Security.Notification SET IsRead = 1
              WHERE IsRead = 0 AND (UserId = @userId
                 OR Role IN (SELECT r.Name FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId WHERE ur.UserId = @userId))",
            new { userId });
        return NoContent();
    }

    /// <summary>Nothing references a notification, so this is always deletable -- and unlike every
    /// other document in this delete-feature series, a notification is a personal inbox item, not
    /// an RBAC-gated business document, so (matching this controller's other endpoints) there is no
    /// [RequirePermission] here: any authenticated user may delete a notification, scoped to the
    /// ones visible to them (their own UserId, or a role they hold) so one user can't delete
    /// another's by guessing an id.</summary>
    [HttpDelete("{id:long}")]
    public IActionResult Delete(long id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var userId = CurrentUserId;
            var header = conn.QueryFirstOrDefault(
                @"SELECT n.* FROM Security.Notification n
                  WHERE n.NotificationId = @id
                    AND (n.UserId = @userId
                         OR n.Role IN (SELECT r.Name FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId WHERE ur.UserId = @userId))",
                new { id, userId }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            conn.Execute("DELETE FROM Security.Notification WHERE NotificationId = @id", new { id }, tx);

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Notification", id.ToString(), header);
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
