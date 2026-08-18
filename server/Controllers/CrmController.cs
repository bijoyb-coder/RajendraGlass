using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;
using RajendraGlass.Api.Realtime;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/complaints")]
[Authorize]
public class ComplaintsController(IDbConnectionFactory db, INotificationPublisher notifications) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<ComplaintDto>(
            @"SELECT cp.ComplaintId, cp.ComplaintNo, cp.CustomerId, c.Name AS CustomerName, cp.InvoiceId, i.InvoiceNo,
                     cp.Subject, cp.Description, cp.Category, cp.Status, cp.AssignedTo, cp.TargetDate, cp.Resolution, cp.CreatedOn
              FROM CRM.Complaint cp JOIN Master.Customer c ON c.CustomerId = cp.CustomerId
              LEFT JOIN Sales.Invoice i ON i.InvoiceId = cp.InvoiceId
              ORDER BY cp.ComplaintId DESC");
        return Ok(new { items = rows });
    }

    [RequirePermission("Complaint.Create")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateComplaintRequest req)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string complaintNo = DocNumbering.NextNumber(conn, tx, branchId, "Complaint");
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO CRM.Complaint (ComplaintNo, CustomerId, InvoiceId, Subject, Description, Category, AssignedTo, TargetDate, Status)
                  OUTPUT INSERTED.ComplaintId VALUES (@complaintNo, @CustomerId, @InvoiceId, @Subject, @Description, @Category, @AssignedTo, @TargetDate, 'Open')",
                new { complaintNo, req.CustomerId, req.InvoiceId, req.Subject, req.Description, req.Category, req.AssignedTo, req.TargetDate }, tx);
            tx.Commit();

            await notifications.PublishToRoleAsync("Sales Manager", "ComplaintCreated", $"New complaint: {req.Subject}",
                $"{req.Category} — {complaintNo}", "/crm/complaints");

            return Created($"/api/v1/complaints/{id}", new { complaintId = id, complaintNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("Complaint.Resolve")]
    [HttpPost("{id:int}/resolve")]
    public IActionResult Resolve(int id, [FromBody] ResolveComplaintRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Resolution))
            return UnprocessableEntity(new ProblemResponse { Title = "Resolution required", Status = 422, ErrorCode = "RESOLUTION_REQUIRED", Detail = "A complaint cannot be closed without a resolution note." });

        using var conn = db.CreateConnection();
        var rows = conn.Execute("UPDATE CRM.Complaint SET Status = 'Resolved', Resolution = @Resolution WHERE ComplaintId = @id", new { req.Resolution, id });
        return rows == 0 ? NotFound() : NoContent();
    }

    /// <summary>Nothing references a complaint and it never touches stock (confirmed via
    /// sys.foreign_keys), so this is always deletable, subject to permission.</summary>
    [RequirePermission("Complaint.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM CRM.Complaint WHERE ComplaintId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            conn.Execute("DELETE FROM CRM.Complaint WHERE ComplaintId = @id", new { id }, tx);

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Complaint", id.ToString(), header);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }
}
