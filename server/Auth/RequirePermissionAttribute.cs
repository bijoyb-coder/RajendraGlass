using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Auth;

/// <summary>
/// Action-level RBAC (SDD 8.2 / FRS 12.3 level 2): the caller's JWT must carry a "perm" claim
/// matching the given permission code (effective permissions are embedded at login — see
/// JwtTokenService). A caller missing it gets 403 PERM_DENIED, matching the API Specification.
/// Bypassed entirely while Security:RbacEnforced is false (see SecurityOptions) — the attribute
/// stays in place on every endpoint so re-enabling RBAC later needs only a config flip.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public class RequirePermissionAttribute(string code) : Attribute, IAsyncAuthorizationFilter
{
    public string Code { get; } = code;

    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var securityOptions = context.HttpContext.RequestServices.GetService<IOptions<SecurityOptions>>();
        if (securityOptions?.Value.RbacEnforced != true)
        {
            return Task.CompletedTask;
        }

        var user = context.HttpContext.User;
        if (user.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedResult();
            return Task.CompletedTask;
        }

        bool has = user.Claims.Any(c => c.Type == JwtTokenService.PermissionClaimType && c.Value == Code);
        if (!has)
        {
            context.Result = new ObjectResult(new ProblemResponse
            {
                Title = "Permission denied",
                Status = 403,
                ErrorCode = "PERM_DENIED",
                Detail = $"Your role does not have the '{Code}' permission.",
            })
            { StatusCode = 403 };
        }
        return Task.CompletedTask;
    }
}
