using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/customers")]
[Authorize]
public class CustomersController(IDbConnectionFactory db) : ControllerBase
{
    /// <summary>Every real foreign key into Master.Customer -- Quotation, Sales Order, Sales
    /// Invoice (Counter Billing posts into the same table), a payment Voucher, and a CRM
    /// Complaint -- so a customer stays editable forever but only becomes deletable once none of
    /// these exist for it.</summary>
    private const string CanDeleteSql =
        @"CAST(CASE WHEN
            NOT EXISTS (SELECT 1 FROM Sales.Quotation x WHERE x.CustomerId = c.CustomerId)
            AND NOT EXISTS (SELECT 1 FROM Sales.SalesOrder x WHERE x.CustomerId = c.CustomerId)
            AND NOT EXISTS (SELECT 1 FROM Sales.Invoice x WHERE x.CustomerId = c.CustomerId)
            AND NOT EXISTS (SELECT 1 FROM Finance.Voucher x WHERE x.CustomerId = c.CustomerId)
            AND NOT EXISTS (SELECT 1 FROM CRM.Complaint x WHERE x.CustomerId = c.CustomerId)
          THEN 1 ELSE 0 END AS BIT)";

    [HttpGet]
    public IActionResult List([FromQuery] string? search, [FromQuery] bool activeOnly = true)
    {
        using var conn = db.CreateConnection();
        var sql = $@"SELECT c.CustomerId, c.Code, c.Name, c.CustomerType, c.Gstin, c.Pan, c.Phone, c.Mobile, c.Email, c.BillingAddress, c.DeliveryAddress,
                            c.StateCode, c.StateName, c.CreditLimit, c.CreditPeriodDays, c.CreditBlocked, c.IsActive,
                            {CanDeleteSql} AS CanDelete
                     FROM Master.Customer c
                     WHERE (@activeOnly = 0 OR c.IsActive = 1)
                       AND (@search IS NULL OR c.Code LIKE '%' + @search + '%' OR c.Name LIKE '%' + @search + '%')
                     ORDER BY c.Name";
        var customers = conn.Query<CustomerDto>(sql, new { search, activeOnly });
        return Ok(new { items = customers, total = customers.Count() });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var customer = conn.QueryFirstOrDefault<CustomerDto>(
            $@"SELECT c.CustomerId, c.Code, c.Name, c.CustomerType, c.Gstin, c.Pan, c.Phone, c.Mobile, c.Email, c.BillingAddress, c.DeliveryAddress,
                     c.StateCode, c.StateName, c.CreditLimit, c.CreditPeriodDays, c.CreditBlocked, c.IsActive,
                     {CanDeleteSql} AS CanDelete
              FROM Master.Customer c WHERE c.CustomerId = @id", new { id });
        return customer is null ? NotFound() : Ok(customer);
    }

    [RequirePermission("Customer.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CustomerDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Code))
            return UnprocessableEntity(new ProblemResponse { Title = "Code required", Status = 422, ErrorCode = "CODE_REQUIRED", Detail = "Customer code is required." });
        if (string.IsNullOrWhiteSpace(dto.Name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Customer name is required." });
        if (string.IsNullOrWhiteSpace(dto.Mobile))
            return UnprocessableEntity(new ProblemResponse { Title = "Phone number required", Status = 422, ErrorCode = "PHONE_REQUIRED", Detail = "A phone number is mandatory for every customer." });

        using var conn = db.CreateConnection();
        var existingCode = conn.QueryFirstOrDefault<int?>("SELECT CustomerId FROM Master.Customer WHERE Code = @Code", new { dto.Code });
        if (existingCode.HasValue)
        {
            return Conflict(new ProblemResponse { Title = "Duplicate code", Status = 409, ErrorCode = "DUPLICATE_CODE", Detail = $"A customer with code '{dto.Code}' already exists." });
        }
        var existing = conn.QueryFirstOrDefault<int?>(
            "SELECT CustomerId FROM Master.Customer WHERE Gstin = @Gstin AND @Gstin IS NOT NULL", new { dto.Gstin });
        if (existing.HasValue)
        {
            return Conflict(new ProblemResponse { Title = "Duplicate party", Status = 409, ErrorCode = "DUPLICATE_PARTY", Detail = $"A customer with this GSTIN already exists (id {existing})." });
        }

        try
        {
            var id = conn.ExecuteScalar<int>(
                @"INSERT INTO Master.Customer (Code, Name, CustomerType, Gstin, Pan, Phone, Mobile, Email, BillingAddress, DeliveryAddress, StateCode, StateName, CreditLimit, CreditPeriodDays, IsActive)
                  OUTPUT INSERTED.CustomerId
                  VALUES (@Code, @Name, @CustomerType, @Gstin, @Pan, @Phone, @Mobile, @Email, @BillingAddress, @DeliveryAddress, @StateCode, @StateName, @CreditLimit, @CreditPeriodDays, 1)",
                dto);
            dto.CustomerId = id;
            return CreatedAtAction(nameof(Get), new { id }, dto);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    [RequirePermission("Customer.Create")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] CustomerDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return UnprocessableEntity(new ProblemResponse { Title = "Name required", Status = 422, ErrorCode = "NAME_REQUIRED", Detail = "Customer name is required." });
        if (string.IsNullOrWhiteSpace(dto.Mobile))
            return UnprocessableEntity(new ProblemResponse { Title = "Phone number required", Status = 422, ErrorCode = "PHONE_REQUIRED", Detail = "A phone number is mandatory for every customer." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>(
            "SELECT CustomerId FROM Master.Customer WHERE Gstin = @Gstin AND @Gstin IS NOT NULL AND CustomerId <> @id", new { dto.Gstin, id });
        if (existing.HasValue)
        {
            return Conflict(new ProblemResponse { Title = "Duplicate party", Status = 409, ErrorCode = "DUPLICATE_PARTY", Detail = $"A customer with this GSTIN already exists (id {existing})." });
        }

        try
        {
            var rows = conn.Execute(
                @"UPDATE Master.Customer SET Name=@Name, CustomerType=@CustomerType, Gstin=@Gstin, Pan=@Pan, Phone=@Phone, Mobile=@Mobile, Email=@Email,
                         BillingAddress=@BillingAddress, DeliveryAddress=@DeliveryAddress, StateCode=@StateCode, StateName=@StateName,
                         CreditLimit=@CreditLimit, CreditPeriodDays=@CreditPeriodDays
                  WHERE CustomerId=@id",
                new { id, dto.Name, dto.CustomerType, dto.Gstin, dto.Pan, dto.Phone, dto.Mobile, dto.Email, dto.BillingAddress, dto.DeliveryAddress, dto.StateCode, dto.StateName, dto.CreditLimit, dto.CreditPeriodDays });
            return rows == 0 ? NotFound() : NoContent();
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            return UnprocessableEntity(new ProblemResponse { Title = "Could not save", Status = 422, ErrorCode = "SAVE_FAILED", Detail = ex.Message });
        }
    }

    [RequirePermission("Customer.CreditBlock")]
    [HttpPost("{id:int}/credit-block")]
    public IActionResult CreditBlock(int id, [FromBody] CreditBlockRequest req)
    {
        using var conn = db.CreateConnection();
        conn.Execute("UPDATE Master.Customer SET CreditBlocked = @Blocked WHERE CustomerId = @id", new { id, req.Blocked });
        return NoContent();
    }

    /// <summary>Deletable only while nothing has ever transacted against this customer -- see
    /// CanDeleteSql above for exactly which references are checked and why.</summary>
    [RequirePermission("Customer.Delete")]
    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        using var conn = db.CreateConnection();
        using var tx = conn.BeginTransaction();
        try
        {
            var customer = conn.QueryFirstOrDefault("SELECT * FROM Master.Customer WHERE CustomerId = @id", new { id }, tx);
            if (customer is null) { tx.Rollback(); return NotFound(); }

            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.Quotation WHERE CustomerId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Customer has a Quotation", Status = 409, ErrorCode = "CUSTOMER_HAS_QUOTATION", Detail = "A Quotation already exists for this customer; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.SalesOrder WHERE CustomerId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Customer has a Sales Order", Status = 409, ErrorCode = "CUSTOMER_HAS_SALES_ORDER", Detail = "A Sales Order already exists for this customer; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Sales.Invoice WHERE CustomerId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Customer has a Sales Invoice", Status = 409, ErrorCode = "CUSTOMER_HAS_INVOICE", Detail = "A Sales Invoice (or Counter Bill) already exists for this customer; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM Finance.Voucher WHERE CustomerId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Customer has a payment", Status = 409, ErrorCode = "CUSTOMER_HAS_VOUCHER", Detail = "A payment voucher has already been recorded against this customer; it cannot be deleted." });
            }
            if (conn.ExecuteScalar<int>("SELECT COUNT(*) FROM CRM.Complaint WHERE CustomerId = @id", new { id }, tx) > 0)
            {
                tx.Rollback();
                return Conflict(new ProblemResponse { Title = "Customer has a complaint", Status = 409, ErrorCode = "CUSTOMER_HAS_COMPLAINT", Detail = "A complaint is linked to this customer; it cannot be deleted." });
            }

            conn.Execute("DELETE FROM Master.Customer WHERE CustomerId = @id", new { id }, tx);
            AuditLogger.LogDelete(conn, tx, User, HttpContext, "Customer", id.ToString(), customer);
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

public class CreditBlockRequest
{
    public bool Blocked { get; set; }
    public string? Reason { get; set; }
}
