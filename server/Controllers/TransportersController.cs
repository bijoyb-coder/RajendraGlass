using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/transporters")]
[Authorize]
public class TransportersController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var transporters = conn.Query<TransporterDto>(
            "SELECT TransporterId, Code, Name, Gstin, Phone FROM Master.Transporter WHERE IsActive = 1 ORDER BY Name");
        return Ok(new { items = transporters });
    }

    [HttpGet("{id:int}/vehicles")]
    public IActionResult Vehicles(int id)
    {
        using var conn = db.CreateConnection();
        var vehicles = conn.Query<VehicleDto>(
            "SELECT VehicleId, TransporterId, VehicleNo, DriverName, DriverMobile FROM Master.Vehicle WHERE TransporterId = @id AND IsActive = 1", new { id });
        return Ok(new { items = vehicles });
    }
}
