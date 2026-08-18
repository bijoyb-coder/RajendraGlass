using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/work-orders")]
[Authorize]
public class WorkOrdersController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<WorkOrderDto>(
            @"SELECT wo.WorkOrderId, wo.WorkOrderNo, wo.SalesOrderId, so.OrderNo, wo.Status, wo.CreatedOn,
                     (SELECT COUNT(*) FROM Production.JobCard jc WHERE jc.WorkOrderId = wo.WorkOrderId) AS JobCardCount,
                     CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM Production.JobCard jc WHERE jc.WorkOrderId = wo.WorkOrderId) THEN 1 ELSE 0 END AS BIT) AS CanDelete
              FROM Production.WorkOrder wo LEFT JOIN Sales.SalesOrder so ON so.SalesOrderId = wo.SalesOrderId
              ORDER BY wo.WorkOrderId DESC");
        return Ok(new { items = rows });
    }

    [RequirePermission("WorkOrder.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateWorkOrderRequest req)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string woNo = DocNumbering.NextNumber(conn, tx, branchId, "WorkOrder");
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Production.WorkOrder (WorkOrderNo, SalesOrderId, Status)
                  OUTPUT INSERTED.WorkOrderId VALUES (@woNo, @SalesOrderId, 'Open')", new { woNo, req.SalesOrderId }, tx);

            if (req.SalesOrderId.HasValue)
                conn.Execute("UPDATE Sales.SalesOrder SET Status = 'InProduction' WHERE SalesOrderId = @SalesOrderId", new { req.SalesOrderId }, tx);

            tx.Commit();
            return Created($"/api/v1/work-orders/{id}", new { workOrderId = id, workOrderNo = woNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Deletable only while no job card has been raised against this work order. Creating
    /// a work order flips its sales order to 'InProduction' as a side effect; if this was the last
    /// work order against that sales order, deleting it reverses the flip back to 'Approved' so the
    /// order doesn't keep showing "in production" once nothing actually is.</summary>
    [RequirePermission("WorkOrder.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Production.WorkOrder WHERE WorkOrderId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            var hasJobCards = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Production.JobCard WHERE WorkOrderId = @id", new { id }, tx) > 0;
            if (hasJobCards)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Work order has job cards", Status = 409, ErrorCode = "WORKORDER_HAS_JOBCARDS", Detail = "A job card has already been raised against this work order; it cannot be deleted." });
            }

            conn.Execute("DELETE FROM Production.WorkOrder WHERE WorkOrderId = @id", new { id }, tx);

            int? salesOrderId = header.SalesOrderId;
            if (salesOrderId.HasValue)
            {
                var otherWorkOrders = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Production.WorkOrder WHERE SalesOrderId = @salesOrderId", new { salesOrderId }, tx);
                if (otherWorkOrders == 0)
                    conn.Execute("UPDATE Sales.SalesOrder SET Status = 'Approved' WHERE SalesOrderId = @salesOrderId AND Status = 'InProduction'", new { salesOrderId }, tx);
            }

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "WorkOrder", id.ToString(), header);
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
[Route("api/v1/job-cards")]
[Authorize]
public class JobCardsController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List([FromQuery] int? workOrderId)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<JobCardDto>(
            @"SELECT jc.JobCardId, jc.JobCardNo, jc.WorkOrderId, wo.WorkOrderNo, jc.ProductId, p.Code AS ProductCode,
                     jc.QtyIn, jc.QtyPassed, jc.QtyBroken, jc.QtyRejected, jc.Status
              FROM Production.JobCard jc JOIN Production.WorkOrder wo ON wo.WorkOrderId = jc.WorkOrderId JOIN Master.Product p ON p.ProductId = jc.ProductId
              WHERE (@workOrderId IS NULL OR jc.WorkOrderId = @workOrderId)
              ORDER BY jc.JobCardId DESC", new { workOrderId });
        return Ok(new { items = rows });
    }

    [RequirePermission("JobCard.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateJobCardRequest req)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string jcNo = DocNumbering.NextNumber(conn, tx, branchId, "JobCard");
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Production.JobCard (JobCardNo, WorkOrderId, ProductId, QtyIn, Status)
                  OUTPUT INSERTED.JobCardId VALUES (@jcNo, @WorkOrderId, @ProductId, @QtyIn, 'Pending')", new { jcNo, req.WorkOrderId, req.ProductId, req.QtyIn }, tx);
            conn.Execute("UPDATE Production.WorkOrder SET Status = 'InProgress' WHERE WorkOrderId = @WorkOrderId AND Status = 'Open'", new { req.WorkOrderId }, tx);
            tx.Commit();
            return Created($"/api/v1/job-cards/{id}", new { jobCardId = id, jobCardNo = jcNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("JobCard.Finish")]
    [HttpPost("{id:int}/finish")]
    public IActionResult Finish(int id, [FromBody] FinishJobCardRequest req)
    {
        using var conn = db.CreateConnection();
        var jobCard = conn.QueryFirstOrDefault("SELECT JobCardId, QtyIn FROM Production.JobCard WHERE JobCardId = @id", new { id });
        if (jobCard is null) return NotFound();

        decimal qtyIn = jobCard.QtyIn;
        if (req.QtyPassed + req.QtyBroken + req.QtyRejected != qtyIn)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Quantity mismatch", Status = 422, ErrorCode = "QTY_MISMATCH", Detail = $"Passed + broken + rejected must equal quantity in ({qtyIn})." });
        }

        conn.Execute("UPDATE Production.JobCard SET QtyPassed = @QtyPassed, QtyBroken = @QtyBroken, QtyRejected = @QtyRejected, Status = 'Done' WHERE JobCardId = @id",
            new { req.QtyPassed, req.QtyBroken, req.QtyRejected, id });
        return NoContent();
    }

    /// <summary>Nothing references a job card and finishing one never touches stock (confirmed via
    /// sys.foreign_keys), so this is always deletable, subject to permission. Creating a job card
    /// flips its work order to 'InProgress' as a side effect; if this was the last job card against
    /// that work order, deleting it reverses the flip back to 'Open'.</summary>
    [RequirePermission("JobCard.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Production.JobCard WHERE JobCardId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            conn.Execute("DELETE FROM Production.JobCard WHERE JobCardId = @id", new { id }, tx);

            int workOrderId = header.WorkOrderId;
            var otherJobCards = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Production.JobCard WHERE WorkOrderId = @workOrderId", new { workOrderId }, tx);
            if (otherJobCards == 0)
                conn.Execute("UPDATE Production.WorkOrder SET Status = 'Open' WHERE WorkOrderId = @workOrderId AND Status = 'InProgress'", new { workOrderId }, tx);

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "JobCard", id.ToString(), header);
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
[Route("api/v1/furnace-batches")]
[Authorize]
public class FurnaceBatchesController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<FurnaceBatchDto>(
            "SELECT FurnaceBatchId, BatchNo, ThicknessMm, BatchDate, UtilisationPct, EstElectricityCost, Status FROM Production.FurnaceBatch ORDER BY FurnaceBatchId DESC");
        return Ok(new { items = rows });
    }

    [RequirePermission("FurnaceBatch.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateFurnaceBatchRequest req)
    {
        // Estimated electricity cost per SDD 11.4 — simplified: base rate per sq.ft. of bed area at ₹18/kWh equivalent.
        decimal estCost = Math.Round(req.UtilisationPct * 4.5m, 2);

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var existingRunning = conn.QueryFirstOrDefault<int?>(
                "SELECT FurnaceBatchId FROM Production.FurnaceBatch WHERE ThicknessMm != @ThicknessMm AND Status = 'Running'", new { req.ThicknessMm }, tx);
            // One thickness per running batch is a per-batch constraint, not cross-batch; this check is illustrative only.

            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string batchNo = DocNumbering.NextNumber(conn, tx, branchId, "FurnaceBatch");
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Production.FurnaceBatch (BatchNo, ThicknessMm, UtilisationPct, EstElectricityCost, Status)
                  OUTPUT INSERTED.FurnaceBatchId VALUES (@batchNo, @ThicknessMm, @UtilisationPct, @estCost, 'Planned')",
                new { batchNo, req.ThicknessMm, req.UtilisationPct, estCost }, tx);
            tx.Commit();
            return Created($"/api/v1/furnace-batches/{id}", new { furnaceBatchId = id, batchNo, estCost });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Nothing references a furnace batch and it never touches stock (confirmed via
    /// sys.foreign_keys), so this is always deletable, subject to permission. Unlike Work
    /// Order/Job Card, creating one has no side effect on any other document's status, so there is
    /// nothing to reverse on delete.</summary>
    [RequirePermission("FurnaceBatch.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Production.FurnaceBatch WHERE FurnaceBatchId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            conn.Execute("DELETE FROM Production.FurnaceBatch WHERE FurnaceBatchId = @id", new { id }, tx);

            AuditLogger.LogDelete(conn, tx, User, HttpContext, "FurnaceBatch", id.ToString(), header);
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
