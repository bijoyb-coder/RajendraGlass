using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using OtpNet;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController(IDbConnectionFactory db, JwtTokenService jwt, PermissionService permissions, IConfiguration configuration, IOptions<SecurityOptions> securityOptions) : ControllerBase
{
    private const string RefreshCookieName = "rgc_refresh";
    private static readonly DateTime IndefiniteLock = new(9999, 12, 31);

    [HttpPost("login")]
    [AllowAnonymous]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new ProblemResponse { Title = "Validation failed", Status = 400, ErrorCode = "VALIDATION_ERROR", Detail = "Username and password are required." });
        }

        using var conn = db.CreateConnection();
        var user = conn.QueryFirstOrDefault<UserRecord>(
            "SELECT UserId, Username, FullName, Email, PasswordHash, IsActive, FailedAttempts, LockedUntil, MfaEnabled, MfaSecret FROM Security.[User] WHERE Username = @Username",
            new { request.Username });

        if (user is null)
            return Unauthorized(new ProblemResponse { Title = "Invalid credentials", Status = 401, ErrorCode = "AUTH_INVALID", Detail = "Username or password is incorrect." });

        if (!user.IsActive)
            return Unauthorized(new ProblemResponse { Title = "Account inactive", Status = 401, ErrorCode = "AUTH_INACTIVE", Detail = "This account has been deactivated." });

        if (user.LockedUntil.HasValue && user.LockedUntil.Value > DateTime.UtcNow)
            return StatusCode(423, new ProblemResponse { Title = "Account locked", Status = 423, ErrorCode = "AUTH_LOCKED", Detail = "Too many failed attempts. Only an Administrator can unlock this account." });

        bool validPassword;
        try { validPassword = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash); }
        catch { validPassword = false; }

        if (!validPassword)
        {
            var attempts = user.FailedAttempts + 1;
            DateTime? lockUntil = attempts >= 5 ? IndefiniteLock : null;
            conn.Execute("UPDATE Security.[User] SET FailedAttempts = @attempts, LockedUntil = @lockUntil WHERE UserId = @UserId",
                new { attempts, lockUntil, user.UserId });
            if (lockUntil.HasValue)
                return StatusCode(423, new ProblemResponse { Title = "Account locked", Status = 423, ErrorCode = "AUTH_LOCKED", Detail = "Five failed attempts reached. Only an Administrator can unlock this account." });
            return Unauthorized(new ProblemResponse { Title = "Invalid credentials", Status = 401, ErrorCode = "AUTH_INVALID", Detail = "Username or password is incorrect." });
        }

        var roles = conn.Query<string>(
            "SELECT r.Name FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId WHERE ur.UserId = @UserId", new { user.UserId }).ToList();

        // MFA enforcement is a global config switch (Security:MfaEnforced) — off by default per
        // current request. Everything underneath (enrollment, TOTP verification) stays intact and
        // just goes dormant while the switch is off, so flipping it back on needs no code changes.
        if (securityOptions.Value.MfaEnforced)
        {
            bool roleRequiresMfa = conn.QueryFirstOrDefault<bool>(
                @"SELECT CASE WHEN EXISTS (
                    SELECT 1 FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId
                    WHERE ur.UserId = @UserId AND r.IsMfaRequired = 1
                  ) THEN 1 ELSE 0 END", new { user.UserId });

            // MFA mandated by role but not yet enrolled: hand back a pending token scoped to /auth/mfa/* only.
            if (roleRequiresMfa && !user.MfaEnabled)
            {
                var (pendingToken, pendingExpiry) = jwt.GenerateMfaPendingToken(user.UserId, user.Username);
                return Ok(new LoginResponse
                {
                    AccessToken = pendingToken,
                    ExpiresOn = pendingExpiry,
                    MfaSetupRequired = true,
                    User = new UserProfileDto { UserId = user.UserId, Username = user.Username, FullName = user.FullName, Email = user.Email, Roles = roles },
                });
            }

            // MFA enabled: caller must resubmit with the code (stateless — no separate pending step needed
            // since credentials were already validated above and are simply resent by the login form).
            if (user.MfaEnabled)
            {
                if (string.IsNullOrWhiteSpace(request.MfaCode))
                {
                    return Ok(new LoginResponse { MfaRequired = true, User = new UserProfileDto { UserId = user.UserId, Username = user.Username, FullName = user.FullName, Roles = roles } });
                }
                var totp = new Totp(Base32Encoding.ToBytes(user.MfaSecret));
                if (!totp.VerifyTotp(request.MfaCode.Trim(), out _, new VerificationWindow(1, 1)))
                {
                    return Unauthorized(new ProblemResponse { Title = "Invalid code", Status = 401, ErrorCode = "MFA_INVALID", Detail = "The authenticator code is incorrect or has expired." });
                }
            }
        }

        return IssueFullSession(conn, user.UserId, user.Username, user.FullName, user.Email, roles);
    }

    private IActionResult IssueFullSession(IDbConnection conn, int userId, string username, string fullName, string? email, List<string> roles)
    {
        // One active session per user (FRS 12.2): a new login revokes any earlier refresh tokens.
        conn.Execute("UPDATE Security.RefreshToken SET RevokedOn = SYSUTCDATETIME() WHERE UserId = @userId AND RevokedOn IS NULL", new { userId });
        conn.Execute("UPDATE Security.[User] SET FailedAttempts = 0, LockedUntil = NULL, LastLoginOn = SYSUTCDATETIME() WHERE UserId = @userId", new { userId });

        var effectivePermissions = permissions.GetEffectivePermissions(userId);
        var mfaEnabled = conn.QueryFirstOrDefault<bool>("SELECT MfaEnabled FROM Security.[User] WHERE UserId = @userId", new { userId });

        var profile = new UserProfileDto { UserId = userId, Username = username, FullName = fullName, Email = email, Roles = roles, Permissions = effectivePermissions, MfaEnabled = mfaEnabled };
        var (accessToken, expiresOn) = jwt.GenerateAccessToken(profile, effectivePermissions);

        IssueRefreshCookie(conn, userId);

        conn.Execute("INSERT INTO Security.AuditLog (UserId, Action, Entity, EntityId) VALUES (@userId, 'Login', 'User', @EntityId)", new { userId, EntityId = userId.ToString() });

        return Ok(new LoginResponse { AccessToken = accessToken, ExpiresOn = expiresOn, User = profile });
    }

    private void IssueRefreshCookie(IDbConnection conn, int userId)
    {
        var days = int.Parse(configuration["Jwt:RefreshTokenDays"] ?? "7");
        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var tokenHash = Convert.ToBase64String(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(rawToken)));
        var expiresOn = DateTime.UtcNow.AddDays(days);

        conn.Execute("INSERT INTO Security.RefreshToken (UserId, TokenHash, ExpiresOn) VALUES (@userId, @tokenHash, @expiresOn)",
            new { userId, tokenHash, expiresOn });

        Response.Cookies.Append(RefreshCookieName, rawToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = false, // dev over HTTP; set true behind HTTPS in production
            SameSite = SameSiteMode.Lax,
            Expires = expiresOn,
            Path = "/api/v1/auth",
        });
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public IActionResult Refresh()
    {
        if (!Request.Cookies.TryGetValue(RefreshCookieName, out var rawToken) || string.IsNullOrEmpty(rawToken))
            return Unauthorized(new ProblemResponse { Title = "No session", Status = 401, ErrorCode = "AUTH_INVALID", Detail = "No refresh token present." });

        var tokenHash = Convert.ToBase64String(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(rawToken)));
        using var conn = db.CreateConnection();
        var record = conn.QueryFirstOrDefault(
            "SELECT TokenId, UserId FROM Security.RefreshToken WHERE TokenHash = @tokenHash AND RevokedOn IS NULL AND ExpiresOn > SYSUTCDATETIME()",
            new { tokenHash });

        if (record is null)
        {
            Response.Cookies.Delete(RefreshCookieName, new CookieOptions { Path = "/api/v1/auth" });
            return Unauthorized(new ProblemResponse { Title = "Session expired", Status = 401, ErrorCode = "AUTH_INVALID", Detail = "Your session has expired or was revoked. Please log in again." });
        }

        int userId = record.UserId;
        var user = conn.QueryFirstOrDefault<UserRecord>("SELECT UserId, Username, FullName, Email, IsActive, MfaEnabled FROM Security.[User] WHERE UserId = @userId", new { userId });
        if (user is null || !user.IsActive)
        {
            conn.Execute("UPDATE Security.RefreshToken SET RevokedOn = SYSUTCDATETIME() WHERE TokenId = @id", new { id = (int)record.TokenId });
            return Unauthorized(new ProblemResponse { Title = "Account inactive", Status = 401, ErrorCode = "AUTH_INACTIVE", Detail = "This account is no longer active." });
        }

        // Rotate: revoke the used token, issue a new one.
        conn.Execute("UPDATE Security.RefreshToken SET RevokedOn = SYSUTCDATETIME() WHERE TokenId = @id", new { id = (int)record.TokenId });
        var roles = conn.Query<string>("SELECT r.Name FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId WHERE ur.UserId = @userId", new { userId }).ToList();
        var effectivePermissions = permissions.GetEffectivePermissions(userId);
        var profile = new UserProfileDto { UserId = userId, Username = user.Username, FullName = user.FullName, Email = user.Email, Roles = roles, Permissions = effectivePermissions, MfaEnabled = user.MfaEnabled };
        var (accessToken, expiresOn) = jwt.GenerateAccessToken(profile, effectivePermissions);
        IssueRefreshCookie(conn, userId);

        return Ok(new LoginResponse { AccessToken = accessToken, ExpiresOn = expiresOn, User = profile });
    }

    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout()
    {
        if (Request.Cookies.TryGetValue(RefreshCookieName, out var rawToken) && !string.IsNullOrEmpty(rawToken))
        {
            var tokenHash = Convert.ToBase64String(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(rawToken)));
            using var conn = db.CreateConnection();
            conn.Execute("UPDATE Security.RefreshToken SET RevokedOn = SYSUTCDATETIME() WHERE TokenHash = @tokenHash AND RevokedOn IS NULL", new { tokenHash });
        }
        Response.Cookies.Delete(RefreshCookieName, new CookieOptions { Path = "/api/v1/auth" });
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        var userId = int.Parse(User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)!);
        using var conn = db.CreateConnection();
        var user = conn.QueryFirstOrDefault<UserRecord>(
            "SELECT UserId, Username, FullName, Email, IsActive, MfaEnabled FROM Security.[User] WHERE UserId = @userId", new { userId });
        if (user is null) return NotFound();

        var roles = conn.Query<string>(
            "SELECT r.Name FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId WHERE ur.UserId = @userId", new { userId }).ToList();

        return Ok(new UserProfileDto
        {
            UserId = user.UserId, Username = user.Username, FullName = user.FullName, Email = user.Email,
            Roles = roles, Permissions = permissions.GetEffectivePermissions(userId), MfaEnabled = user.MfaEnabled,
        });
    }

    [HttpPost("change-password")]
    [Authorize]
    public IActionResult ChangePassword([FromBody] ChangePasswordRequest req)
    {
        var userId = int.Parse(User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)!);
        using var conn = db.CreateConnection();
        var user = conn.QueryFirstOrDefault<UserRecord>("SELECT PasswordHash FROM Security.[User] WHERE UserId = @userId", new { userId });
        if (user is null || !BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
            return UnprocessableEntity(new ProblemResponse { Title = "Incorrect password", Status = 422, ErrorCode = "PASSWORD_POLICY", Detail = "Current password is incorrect." });
        if (req.NewPassword.Length < 8)
            return UnprocessableEntity(new ProblemResponse { Title = "Weak password", Status = 422, ErrorCode = "PASSWORD_POLICY", Detail = "New password must be at least 8 characters." });

        var newHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        conn.Execute("UPDATE Security.[User] SET PasswordHash = @newHash, PasswordChangedOn = SYSUTCDATETIME() WHERE UserId = @userId", new { newHash, userId });
        return NoContent();
    }

    // ---------------- MFA ----------------

    [HttpPost("mfa/setup")]
    [Authorize]
    [AllowMfaPending]
    public IActionResult MfaSetup()
    {
        var userId = int.Parse(User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)!);
        using var conn = db.CreateConnection();
        var username = conn.QueryFirstOrDefault<string>("SELECT Username FROM Security.[User] WHERE UserId = @userId", new { userId });
        if (username is null) return NotFound();

        var secretBytes = KeyGeneration.GenerateRandomKey(20);
        var secret = Base32Encoding.ToString(secretBytes);
        conn.Execute("UPDATE Security.[User] SET MfaSecret = @secret WHERE UserId = @userId", new { secret, userId });

        var issuer = Uri.EscapeDataString("Rajendra Glass Centre");
        var label = Uri.EscapeDataString(username);
        var otpauth = $"otpauth://totp/{issuer}:{label}?secret={secret}&issuer={issuer}&digits=6&period=30";

        return Ok(new MfaSetupResponse { Secret = secret, OtpAuthUri = otpauth });
    }

    [HttpPost("mfa/enable")]
    [Authorize]
    [AllowMfaPending]
    public IActionResult MfaEnable([FromBody] MfaEnableRequest req)
    {
        var userId = int.Parse(User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)!);
        using var conn = db.CreateConnection();
        var user = conn.QueryFirstOrDefault<UserRecord>("SELECT Username, FullName, Email, MfaSecret FROM Security.[User] WHERE UserId = @userId", new { userId });
        if (user?.MfaSecret is null)
            return UnprocessableEntity(new ProblemResponse { Title = "No setup in progress", Status = 422, ErrorCode = "MFA_NOT_SETUP", Detail = "Call /auth/mfa/setup first to generate a secret." });

        var totp = new Totp(Base32Encoding.ToBytes(user.MfaSecret));
        if (!totp.VerifyTotp(req.Code.Trim(), out _, new VerificationWindow(1, 1)))
            return Unauthorized(new ProblemResponse { Title = "Invalid code", Status = 401, ErrorCode = "MFA_INVALID", Detail = "The authenticator code is incorrect or has expired." });

        conn.Execute("UPDATE Security.[User] SET MfaEnabled = 1 WHERE UserId = @userId", new { userId });
        conn.Execute("INSERT INTO Security.AuditLog (UserId, Action, Entity, EntityId) VALUES (@userId, 'MfaEnable', 'User', @EntityId)", new { userId, EntityId = userId.ToString() });

        // Setup just completed the login that was blocked on MFA — hand back a full session immediately.
        var roles = conn.Query<string>("SELECT r.Name FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId WHERE ur.UserId = @userId", new { userId }).ToList();
        return IssueFullSession(conn, userId, user.Username, user.FullName, user.Email, roles);
    }

    [HttpPost("mfa/disable")]
    [Authorize]
    public IActionResult MfaDisable()
    {
        var userId = int.Parse(User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)!);
        using var conn = db.CreateConnection();
        var roleRequiresMfa = conn.QueryFirstOrDefault<bool>(
            @"SELECT CASE WHEN EXISTS (
                SELECT 1 FROM Security.UserRole ur JOIN Security.Role r ON r.RoleId = ur.RoleId
                WHERE ur.UserId = @userId AND r.IsMfaRequired = 1
              ) THEN 1 ELSE 0 END", new { userId });
        if (roleRequiresMfa)
            return UnprocessableEntity(new ProblemResponse { Title = "MFA mandatory", Status = 422, ErrorCode = "MFA_MANDATORY", Detail = "Your role requires MFA to remain enabled." });

        conn.Execute("UPDATE Security.[User] SET MfaEnabled = 0, MfaSecret = NULL WHERE UserId = @userId", new { userId });
        return NoContent();
    }

    // ---------------- Admin: unlock ----------------

    [HttpPost("unlock/{userId:int}")]
    [Authorize]
    [RequirePermission("User.Unlock")]
    public IActionResult Unlock(int userId)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Execute("UPDATE Security.[User] SET FailedAttempts = 0, LockedUntil = NULL WHERE UserId = @userId", new { userId });
        if (rows == 0) return NotFound();
        conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Unlock', 'User', @EntityId)", new { EntityId = userId.ToString() });
        return NoContent();
    }
}

public class ChangePasswordRequest
{
    public string CurrentPassword { get; set; } = "";
    public string NewPassword { get; set; } = "";
}
