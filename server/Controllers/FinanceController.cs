using System.Security.Claims;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

/// <summary>
/// Receipt/Payment vouchers — also the backend for the "Payment Transaction" screen under
/// Sales &amp; Dispatch, which is a Receipt-only, invoice-linkable, editable view onto this same
/// table (kept as one table, not a parallel ledger, so Finance's Receivables total never
/// disagrees with what that screen shows).
/// </summary>
[ApiController]
[Route("api/v1/vouchers")]
[Authorize]
public class VouchersController(IDbConnectionFactory db) : ControllerBase
{
    private const string SelectColumns =
        @"v.VoucherId, v.VoucherNo, v.VoucherType, v.VoucherDate, v.CustomerId, c.Name AS CustomerName,
          v.SupplierId, s.Name AS SupplierName, v.InvoiceId, i.InvoiceNo, v.PaymentType, v.ReferenceNo,
          v.Amount, v.Mode, v.Narration, v.ModifiedOn, v.SplitGroupId
          FROM Finance.Voucher v
          LEFT JOIN Master.Customer c ON c.CustomerId = v.CustomerId
          LEFT JOIN Master.Supplier s ON s.SupplierId = v.SupplierId
          LEFT JOIN Sales.Invoice i ON i.InvoiceId = v.InvoiceId";

    [HttpGet]
    public IActionResult List([FromQuery] string? voucherType = null)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<VoucherDto>(
            $@"SELECT {SelectColumns}
               WHERE (@voucherType IS NULL OR v.VoucherType = @voucherType)
               ORDER BY v.VoucherId DESC", new { voucherType });
        return Ok(new { items = rows });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var v = conn.QueryFirstOrDefault<VoucherDto>($@"SELECT {SelectColumns} WHERE v.VoucherId = @id", new { id });
        return v is null ? NotFound() : Ok(v);
    }

    [RequirePermission("Voucher.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateVoucherRequest req)
    {
        if (req.Amount <= 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid amount", Status = 422, ErrorCode = "AMOUNT_INVALID", Detail = "Voucher amount must be greater than zero." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var invoiceProblem = ValidateInvoiceLink(conn, tx, req.InvoiceId, req.CustomerId);
            if (invoiceProblem is not null) { tx.Rollback(); return invoiceProblem; }

            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string voucherNo = DocNumbering.NextNumber(conn, tx, branchId, "Voucher");
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Finance.Voucher (VoucherNo, VoucherType, VoucherDate, CustomerId, SupplierId, InvoiceId, PaymentType, ReferenceNo, Amount, Mode, Narration)
                  OUTPUT INSERTED.VoucherId
                  VALUES (@voucherNo, @VoucherType, ISNULL(@VoucherDate, CAST(SYSUTCDATETIME() AS DATE)), @CustomerId, @SupplierId, @InvoiceId, @PaymentType, @ReferenceNo, @Amount, @Mode, @Narration)",
                new { voucherNo, req.VoucherType, req.VoucherDate, req.CustomerId, req.SupplierId, req.InvoiceId, req.PaymentType, req.ReferenceNo, req.Amount, req.Mode, req.Narration }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'Voucher', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return Created($"/api/v1/vouchers/{id}", new { voucherId = id, voucherNo });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>
    /// Records one payment as several methods at once — e.g. Cash 20 + UPI 50 + Cheque 30 for a
    /// ₹100 receipt. Every share must add up to exactly the total; each share becomes its own
    /// voucher row (so it can still be edited individually, same as any other voucher), tied
    /// together by a shared SplitGroupId purely so the list can show them as one transaction.
    /// </summary>
    [RequirePermission("Voucher.Create")]
    [HttpPost("split")]
    public IActionResult CreateSplit([FromBody] CreateVoucherSplitRequest req)
    {
        if (req.Splits.Count == 0)
            return UnprocessableEntity(new ProblemResponse { Title = "No payment", Status = 422, ErrorCode = "PAYMENT_REQUIRED", Detail = "Add at least one payment method." });

        for (int i = 0; i < req.Splits.Count; i++)
        {
            var s = req.Splits[i];
            if (s.Amount <= 0)
                return UnprocessableEntity(new ProblemResponse { Title = "Invalid amount", Status = 422, ErrorCode = "AMOUNT_INVALID", Detail = $"Payment {i + 1}: amount must be greater than zero." });
            if ((s.Mode == "Cheque" || s.Mode == "UPI") && string.IsNullOrWhiteSpace(s.ReferenceNo))
                return UnprocessableEntity(new ProblemResponse { Title = "Reference required", Status = 422, ErrorCode = "REFERENCE_REQUIRED", Detail = $"Payment {i + 1}: enter the {(s.Mode == "Cheque" ? "cheque number" : "UPI transaction reference")}." });
        }

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var invoiceProblem = ValidateInvoiceLink(conn, tx, req.InvoiceId, req.CustomerId);
            if (invoiceProblem is not null) { tx.Rollback(); return invoiceProblem; }

            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            // Only tag a SplitGroupId when there's actually more than one method — a lone payment
            // stays an ordinary voucher, indistinguishable from one created the old way.
            Guid? splitGroupId = req.Splits.Count > 1 ? Guid.NewGuid() : null;

            var created = new List<(int VoucherId, string VoucherNo)>();
            foreach (var s in req.Splits)
            {
                string voucherNo = DocNumbering.NextNumber(conn, tx, branchId, "Voucher");
                var id = conn.ExecuteScalar<int>(
                    @"INSERT INTO Finance.Voucher (VoucherNo, VoucherType, VoucherDate, CustomerId, SupplierId, InvoiceId, PaymentType, ReferenceNo, Amount, Mode, Narration, SplitGroupId)
                      OUTPUT INSERTED.VoucherId
                      VALUES (@voucherNo, @VoucherType, ISNULL(@VoucherDate, CAST(SYSUTCDATETIME() AS DATE)), @CustomerId, @SupplierId, @InvoiceId, @PaymentType, @referenceNo, @Amount, @Mode, @Narration, @splitGroupId)",
                    new { voucherNo, req.VoucherType, req.VoucherDate, req.CustomerId, req.SupplierId, req.InvoiceId, req.PaymentType, referenceNo = s.ReferenceNo, s.Amount, s.Mode, req.Narration, splitGroupId }, tx);
                conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Create', 'Voucher', @id)", new { id = id.ToString() }, tx);
                created.Add((id, voucherNo));
            }

            tx.Commit();
            return StatusCode(201, new { splitGroupId, vouchers = created.Select(c => new { voucherId = c.VoucherId, voucherNo = c.VoucherNo }) });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    [RequirePermission("Voucher.Edit")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] UpdateVoucherRequest req)
    {
        if (req.Amount <= 0)
            return UnprocessableEntity(new ProblemResponse { Title = "Invalid amount", Status = 422, ErrorCode = "AMOUNT_INVALID", Detail = "Voucher amount must be greater than zero." });

        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var exists = conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Finance.Voucher WHERE VoucherId = @id", new { id }, tx);
            if (exists == 0) { tx.Rollback(); return NotFound(); }

            var invoiceProblem = ValidateInvoiceLink(conn, tx, req.InvoiceId, req.CustomerId);
            if (invoiceProblem is not null) { tx.Rollback(); return invoiceProblem; }

            int? modifiedBy = int.TryParse(User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub), out var uid) ? uid : null;

            conn.Execute(
                @"UPDATE Finance.Voucher SET
                    CustomerId = @CustomerId, SupplierId = @SupplierId, InvoiceId = @InvoiceId,
                    PaymentType = @PaymentType, ReferenceNo = @ReferenceNo, Amount = @Amount, Mode = @Mode,
                    VoucherDate = ISNULL(@VoucherDate, VoucherDate), Narration = @Narration,
                    ModifiedBy = @modifiedBy, ModifiedOn = SYSUTCDATETIME()
                  WHERE VoucherId = @id",
                new { id, req.CustomerId, req.SupplierId, req.InvoiceId, req.PaymentType, req.ReferenceNo, req.Amount, req.Mode, req.VoucherDate, req.Narration, modifiedBy }, tx);

            conn.Execute("INSERT INTO Security.AuditLog (Action, Entity, EntityId) VALUES ('Update', 'Voucher', @id)", new { id = id.ToString() }, tx);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>Unlike Quotation/SalesOrder/Invoice, nothing is ever generated from a voucher —
    /// no table references Finance.Voucher — so a wrong entry can simply be deleted, same as it
    /// can already be corrected in place via Update.</summary>
    [RequirePermission("Voucher.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var header = conn.QueryFirstOrDefault("SELECT * FROM Finance.Voucher WHERE VoucherId = @id", new { id }, tx);
            if (header is null) { tx.Rollback(); return NotFound(); }

            conn.Execute("DELETE FROM Finance.Voucher WHERE VoucherId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Voucher", id.ToString(), header);
            tx.Commit();
            return NoContent();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    /// <summary>When a receipt is tied to a specific invoice, the invoice must exist and — if a
    /// customer was also given — must actually belong to that customer.</summary>
    private static ObjectResult? ValidateInvoiceLink(System.Data.IDbConnection conn, System.Data.IDbTransaction tx, int? invoiceId, int? customerId)
    {
        if (!invoiceId.HasValue) return null;
        var invoiceCustomerId = conn.QueryFirstOrDefault<int?>(
            "SELECT CustomerId FROM Sales.Invoice WHERE InvoiceId = @invoiceId", new { invoiceId }, tx);
        if (invoiceCustomerId is null)
            return new NotFoundObjectResult(new ProblemResponse { Title = "Invoice not found", Status = 404, ErrorCode = "NOT_FOUND", Detail = "The referenced sales invoice does not exist." });
        if (customerId.HasValue && customerId.Value != invoiceCustomerId.Value)
            return new UnprocessableEntityObjectResult(new ProblemResponse { Title = "Customer mismatch", Status = 422, ErrorCode = "INVOICE_CUSTOMER_MISMATCH", Detail = "This invoice belongs to a different customer." });
        return null;
    }
}

[ApiController]
[Route("api/v1/expenses")]
[Authorize]
public class ExpensesController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult List()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<ExpenseDto>(
            "SELECT ExpenseId, ExpenseNo, ExpenseDate, Category, Amount, PaidTo, Narration, Status FROM Finance.Expense ORDER BY ExpenseId DESC");
        return Ok(new { items = rows });
    }

    [RequirePermission("Expense.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CreateExpenseRequest req)
    {
        bool needsApproval = req.Amount > 25000;
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            int branchId = DocNumbering.DefaultBranchId(conn, tx);
            string expenseNo = DocNumbering.NextNumber(conn, tx, branchId, "Expense");
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Finance.Expense (ExpenseNo, Category, Amount, PaidTo, Narration, Status)
                  OUTPUT INSERTED.ExpenseId VALUES (@expenseNo, @Category, @Amount, @PaidTo, @Narration, @status)",
                new { expenseNo, req.Category, req.Amount, req.PaidTo, req.Narration, status = needsApproval ? "Draft" : "Approved" }, tx);
            tx.Commit();
            return Created($"/api/v1/expenses/{id}", new { expenseId = id, expenseNo, needsApproval });
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }
}

[ApiController]
[Route("api/v1/ledgers")]
[Authorize]
public class LedgersController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet("receivables")]
    public IActionResult Receivables()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<CustomerOutstandingDto>(
            @"SELECT c.CustomerId, c.Name AS CustomerName, c.CreditLimit,
                     ISNULL((SELECT SUM(i.TotalValue) FROM Sales.Invoice i WHERE i.CustomerId = c.CustomerId AND i.Status = 'Approved'), 0) AS TotalInvoiced,
                     ISNULL((SELECT SUM(v.Amount) FROM Finance.Voucher v WHERE v.CustomerId = c.CustomerId AND v.VoucherType = 'Receipt'), 0) AS TotalReceived
              FROM Master.Customer c WHERE c.IsActive = 1 ORDER BY c.Name");
        foreach (var r in rows) r.Outstanding = r.TotalInvoiced - r.TotalReceived;
        return Ok(new { items = rows });
    }
}
