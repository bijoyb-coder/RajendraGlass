using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Integration;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/integration")]
[Authorize]
public class IntegrationController(IDbConnectionFactory db, IEInvoiceGateway eInvoiceGateway, IEwayBillGateway ewayBillGateway) : ControllerBase
{
    [HttpGet("logs")]
    [RequirePermission("Integration.View")]
    public IActionResult Logs([FromQuery] string? docType, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        using var conn = db.CreateConnection();
        var offset = (page - 1) * pageSize;
        var rows = conn.Query<GatewayLogDto>(
            @"SELECT GatewayLogId, GatewayType, Operation, Provider, DocType, DocId, Status, ErrorMessage, DurationMs, CreatedOn
              FROM Integration.GatewayLog
              WHERE (@docType IS NULL OR DocType = @docType)
              ORDER BY GatewayLogId DESC
              OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY", new { docType, offset, pageSize });
        var total = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Integration.GatewayLog WHERE (@docType IS NULL OR DocType = @docType)", new { docType });
        return Ok(new { items = rows, total, page, pageSize, eInvoiceProvider = eInvoiceGateway.ProviderName, ewayBillProvider = ewayBillGateway.ProviderName });
    }

    [HttpGet("logs/{id:int}")]
    [RequirePermission("Integration.View")]
    public IActionResult LogDetail(int id)
    {
        using var conn = db.CreateConnection();
        var row = conn.QueryFirstOrDefault<GatewayLogDetailDto>(
            "SELECT GatewayLogId, GatewayType, Operation, Provider, DocType, DocId, RequestJson, ResponseJson, Status, ErrorMessage, DurationMs, CreatedOn FROM Integration.GatewayLog WHERE GatewayLogId = @id", new { id });
        return row is null ? NotFound() : Ok(row);
    }
}
