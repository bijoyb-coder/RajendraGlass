using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace RajendraGlass.Api.Controllers;

/// <summary>
/// Unauthenticated reachability probe used by the client's connectivity watcher
/// (navigator.onLine alone is unreliable — it only reflects the local network adapter).
/// </summary>
[ApiController]
[Route("api/v1/ping")]
[AllowAnonymous]
public class PingController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok", serverTime = DateTime.UtcNow });
}
