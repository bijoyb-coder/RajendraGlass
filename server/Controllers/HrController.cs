using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/employees")]
[Authorize]
public class EmployeesController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<EmployeeDto>(
            "SELECT EmployeeId, Code, FullName, Designation, Department, Phone, Email, DateOfJoining, DateOfLeaving, IsActive FROM HR.Employee WHERE IsActive = 1 ORDER BY FullName");
        return Ok(new { items = rows });
    }

    [RequirePermission("Employee.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateEmployeeRequest req)
    {
        using var conn = db.CreateConnection();
        var id = conn.ExecuteScalar<int>(
            @"INSERT INTO HR.Employee (Code, FullName, Designation, Department, Phone, Email, DateOfJoining, IsActive)
              OUTPUT INSERTED.EmployeeId VALUES (@Code, @FullName, @Designation, @Department, @Phone, @Email, @DateOfJoining, 1)", req);
        return Created($"/api/v1/employees/{id}", new { employeeId = id });
    }

    [RequirePermission("Employee.Deactivate")]
    [HttpPost("{id:int}/deactivate")]
    public IActionResult Deactivate(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            // Deactivating an employee immediately disables the linked login (FRS 12.7).
            conn.Execute("UPDATE HR.Employee SET IsActive = 0, DateOfLeaving = CAST(SYSUTCDATETIME() AS DATE) WHERE EmployeeId = @id", new { id }, tx);
            conn.Execute(
                @"UPDATE u SET u.IsActive = 0 FROM Security.[User] u JOIN HR.Employee e ON e.UserId = u.UserId WHERE e.EmployeeId = @id",
                new { id }, tx);
            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Deactivate', 'Employee', @id)", new { id = id.ToString() }, tx);
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

[ApiController]
[Route("api/v1/attendance")]
[Authorize]
public class AttendanceController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List([FromQuery] DateTime? date)
    {
        using var conn = db.CreateConnection();
        var d = (date ?? DateTime.Today).Date;
        var rows = conn.Query<AttendanceDto>(
            @"SELECT a.AttendanceId, a.EmployeeId, e.FullName AS EmployeeName, a.AttendanceDate, a.Status
              FROM HR.Attendance a JOIN HR.Employee e ON e.EmployeeId = a.EmployeeId
              WHERE a.AttendanceDate = @d ORDER BY e.FullName", new { d });
        return Ok(new { items = rows });
    }

    [RequirePermission("Attendance.Mark")]
    [HttpPost]
    public IActionResult Mark([FromBody] MarkAttendanceRequest req)
    {
        if (req.AttendanceDate.Date > DateTime.Today)
            return UnprocessableEntity(new ProblemResponse { Title = "Future date", Status = 422, ErrorCode = "FUTURE_DATE", Detail = "Attendance cannot be marked for a future date." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>(
            "SELECT AttendanceId FROM HR.Attendance WHERE EmployeeId = @EmployeeId AND AttendanceDate = @AttendanceDate",
            new { req.EmployeeId, AttendanceDate = req.AttendanceDate.Date });
        if (existing.HasValue)
            return Conflict(new ProblemResponse { Title = "Already marked", Status = 409, ErrorCode = "DUPLICATE_ATTENDANCE", Detail = "Attendance for this employee and date is already recorded." });

        var id = conn.ExecuteScalar<int>(
            "INSERT INTO HR.Attendance (EmployeeId, AttendanceDate, Status) OUTPUT INSERTED.AttendanceId VALUES (@EmployeeId, @AttendanceDate, @Status)",
            new { req.EmployeeId, AttendanceDate = req.AttendanceDate.Date, req.Status });
        return Created($"/api/v1/attendance/{id}", new { attendanceId = id });
    }

    /// <summary>Nothing references an attendance record and marking one has no side effect on any
    /// other document (confirmed via sys.foreign_keys), so this is always deletable, subject to
    /// permission.</summary>
    [RequirePermission("Attendance.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM HR.Attendance WHERE AttendanceId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            conn.Execute("DELETE FROM HR.Attendance WHERE AttendanceId = @id", new { id }, tx);

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Attendance", id.ToString(), header);
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
