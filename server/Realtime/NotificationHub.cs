using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace RajendraGlass.Api.Realtime;

/// <summary>
/// Live notification push (SDD 10.1). On connect, the client is placed into a group per user id
/// and one per role, so an event fans out only to those entitled to see it — mirroring the same
/// scoping RBAC already applies to REST calls. With more than one API node, a Redis backplane
/// (services.AddSignalR().AddStackExchangeRedis(...)) would be added here; single-node in this
/// environment needs none.
/// </summary>
[Authorize]
public class NotificationHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.User?.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (userId is not null)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
        }

        foreach (var role in Context.User?.FindAll(ClaimTypes.Role).Select(c => c.Value) ?? Enumerable.Empty<string>())
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"role:{role}");
        }

        await base.OnConnectedAsync();
    }
}
