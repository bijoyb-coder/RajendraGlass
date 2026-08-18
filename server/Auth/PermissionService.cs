using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using RajendraGlass.Api.Data;

namespace RajendraGlass.Api.Auth;

/// <summary>
/// Resolves a user's effective permission set — the union of every role they hold — with a short
/// server-side cache (SDD 8.2: "a server-side cache"). Permissions are also embedded in the access
/// token at login, so a role change takes effect on next login/refresh, not mid-session.
/// </summary>
public class PermissionService(IDbConnectionFactory db, IMemoryCache cache, IOptions<SecurityOptions> securityOptions)
{
    // Bumping the generation invalidates every cached entry at once (IMemoryCache has no native
    // "clear all", so the generation number is folded into the cache key instead).
    private static int _generation = 0;

    private static string CacheKey(int userId) => $"perms:{_generation}:{userId}";

    public void InvalidateAll() => Interlocked.Increment(ref _generation);

    public List<string> GetEffectivePermissions(int userId)
    {
        // RBAC enforcement is a global config switch (Security:RbacEnforced) — off by default per
        // current request. While off, everyone effectively has every permission (nav, RequirePermission
        // checks, and field-level gates all key off this list), so behavior collapses to "no RBAC" without
        // touching the role/permission tables or any [RequirePermission] attribute already in place.
        if (!securityOptions.Value.RbacEnforced)
        {
            return cache.GetOrCreate("perms:all-codes", entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
                using var conn = db.CreateConnection();
                return conn.Query<string>("SELECT Code FROM Security.Permission").ToList();
            }) ?? new List<string>();
        }

        return cache.GetOrCreate(CacheKey(userId), entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
            using var conn = db.CreateConnection();
            return conn.Query<string>(
                @"SELECT DISTINCT p.Code
                  FROM Security.UserRole ur
                  JOIN Security.RolePermission rp ON rp.RoleId = ur.RoleId
                  JOIN Security.Permission p ON p.PermissionId = rp.PermissionId
                  WHERE ur.UserId = @userId",
                new { userId }).ToList();
        }) ?? new List<string>();
    }

    public void Invalidate(int userId) => cache.Remove(CacheKey(userId));
}
