using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Auth;

public class JwtTokenService(IConfiguration configuration)
{
    public const string MfaPendingClaimType = "mfa_pending";
    public const string PermissionClaimType = "perm";

    /// <summary>Full session token: roles + effective permission codes embedded (SDD 8.2 — "loads the user's
    /// effective permission set ... into the JWT claims").</summary>
    public (string token, DateTime expiresOn) GenerateAccessToken(UserProfileDto user, IEnumerable<string> permissions)
    {
        var jwtSection = configuration.GetSection("Jwt");
        var minutes = int.Parse(jwtSection["AccessTokenMinutes"] ?? "30");
        var expires = DateTime.UtcNow.AddMinutes(minutes);

        var claims = BaseClaims(user);
        claims.AddRange(user.Roles.Select(r => new Claim(ClaimTypes.Role, r)));
        claims.AddRange(permissions.Select(p => new Claim(PermissionClaimType, p)));

        return (Sign(claims, expires), expires);
    }

    /// <summary>Short-lived token issued between "password OK" and "MFA satisfied". Carries no role/permission
    /// claims and is rejected everywhere except endpoints explicitly marked [AllowMfaPending].</summary>
    public (string token, DateTime expiresOn) GenerateMfaPendingToken(int userId, string username)
    {
        var expires = DateTime.UtcNow.AddMinutes(10);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new("username", username),
            new(MfaPendingClaimType, "true"),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        return (Sign(claims, expires), expires);
    }

    private List<Claim> BaseClaims(UserProfileDto user) => new()
    {
        new Claim(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
        new Claim("username", user.Username),
        new Claim("fullName", user.FullName),
        new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
    };

    private string Sign(List<Claim> claims, DateTime expires)
    {
        var jwtSection = configuration.GetSection("Jwt");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSection["Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: jwtSection["Issuer"],
            audience: jwtSection["Audience"],
            claims: claims,
            expires: expires,
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
