using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/dashboard")]
[Authorize]
public class DashboardController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet("summary")]
    public IActionResult Summary()
    {
        using var conn = db.CreateConnection();

        var today = conn.QueryFirstOrDefault<TotalCount>(
            "SELECT ISNULL(SUM(TotalValue),0) AS Total, COUNT(*) AS Count FROM Sales.Invoice WHERE CAST(InvoiceDate AS DATE) = CAST(SYSUTCDATETIME() AS DATE) AND Status <> 'Cancelled'")
            ?? new TotalCount();

        var month = conn.QueryFirstOrDefault<TotalCount>(
            "SELECT ISNULL(SUM(TotalValue),0) AS Total, COUNT(*) AS Count FROM Sales.Invoice WHERE MONTH(InvoiceDate) = MONTH(SYSUTCDATETIME()) AND YEAR(InvoiceDate) = YEAR(SYSUTCDATETIME()) AND Status <> 'Cancelled'")
            ?? new TotalCount();

        var activeCustomers = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Master.Customer WHERE IsActive = 1");
        var activeProducts = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Master.Product WHERE IsActive = 1");
        var pendingWaybills = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Dispatch.Waybill WHERE Status = 'Generated'");

        var recent = conn.Query<InvoiceDto>(
            @"SELECT TOP 5 i.InvoiceId, i.InvoiceNo, i.CustomerId, c.Name AS CustomerName, i.InvoiceDate, i.TotalValue, i.Status
              FROM Sales.Invoice i JOIN Master.Customer c ON c.CustomerId = i.CustomerId
              ORDER BY i.InvoiceId DESC").ToList();

        return Ok(new DashboardSummaryDto
        {
            TodaySalesValue = today.Total,
            TodayInvoiceCount = today.Count,
            MonthSalesValue = month.Total,
            MonthInvoiceCount = month.Count,
            ActiveCustomers = activeCustomers,
            ActiveProducts = activeProducts,
            PendingWaybills = pendingWaybills,
            RecentInvoices = recent
        });
    }

    private class TotalCount
    {
        public decimal Total { get; set; }
        public int Count { get; set; }
    }
}
