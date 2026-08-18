using System.Security.Claims;
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Http;

namespace RajendraGlass.Api.Data;

/// <summary>
/// Every delete must be traceable — who deleted it, when, and exactly what the record looked
/// like beforehand — so this is the one place that writes a Delete row to Security.AuditLog.
/// CreatedOn defaults to SYSUTCDATETIME() at the database, so only who/what/before need supplying.
/// </summary>
public static class AuditLogger
{
    /// <param name="beforeRecord">The full record (and any child rows, e.g. line items) as it
    /// existed immediately before deletion — serialized as-is, so pass an anonymous object
    /// combining the header and its lines when the document has them.</param>
    public static void LogDelete(
        System.Data.IDbConnection conn, System.Data.IDbTransaction tx,
        ClaimsPrincipal user, HttpContext? httpContext,
        string entity, string entityId, object? beforeRecord)
    {
        int? userId = int.TryParse(user.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub), out var uid) ? uid : null;
        string? ip = httpContext?.Connection.RemoteIpAddress?.ToString();
        string? beforeJson = beforeRecord is null ? null : JsonSerializer.Serialize(beforeRecord);

        conn.Execute(
            @"INSERT INTO Security.AuditLog (UserId, Action, Entity, EntityId, BeforeJson, IpAddress)
              VALUES (@userId, 'Delete', @entity, @entityId, @beforeJson, @ip)",
            new { userId, entity, entityId, beforeJson, ip }, tx);
    }
}
