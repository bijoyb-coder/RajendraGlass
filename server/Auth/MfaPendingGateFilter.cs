using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Auth;

/// <summary>
/// Global gate: an MFA-pending token (see JwtTokenService.GenerateMfaPendingToken) may only reach
/// actions marked [AllowMfaPending] — everything else is refused, so a login that hasn't cleared
/// MFA yet cannot be used to reach real data.
/// </summary>
public class MfaPendingGateFilter : IAsyncAuthorizationFilter
{
    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var isPending = context.HttpContext.User.Claims
            .Any(c => c.Type == JwtTokenService.MfaPendingClaimType && c.Value == "true");
        if (!isPending) return Task.CompletedTask;

        var descriptor = context.ActionDescriptor as ControllerActionDescriptor;
        var allowed = descriptor is not null &&
            (descriptor.MethodInfo.GetCustomAttributes(typeof(AllowMfaPendingAttribute), true).Length > 0 ||
             descriptor.ControllerTypeInfo.GetCustomAttributes(typeof(AllowMfaPendingAttribute), true).Length > 0);

        if (!allowed)
        {
            context.Result = new Microsoft.AspNetCore.Mvc.ObjectResult(new ProblemResponse
            {
                Title = "MFA required",
                Status = 403,
                ErrorCode = "MFA_INCOMPLETE",
                Detail = "Complete multi-factor authentication before accessing this resource.",
            })
            { StatusCode = 403 };
        }
        return Task.CompletedTask;
    }
}
