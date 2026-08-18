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
    [HttpGet]
    public IActionResult List([FromQuery] string? search, [FromQuery] bool activeOnly = true)
    {
        using var conn = db.CreateConnection();
        var sql = @"SELECT CustomerId, Code, Name, CustomerType, Gstin, Pan, Phone, Mobile, Email, BillingAddress, DeliveryAddress,
                            StateCode, StateName, CreditLimit, CreditPeriodDays, CreditBlocked, IsActive
                     FROM Master.Customer
                     WHERE (@activeOnly = 0 OR IsActive = 1)
                       AND (@search IS NULL OR Code LIKE '%' + @search + '%' OR Name LIKE '%' + @search + '%')
                     ORDER BY Name";
        var customers = conn.Query<CustomerDto>(sql, new { search, activeOnly });
        return Ok(new { items = customers, total = customers.Count() });
    }

    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        using var conn = db.CreateConnection();
        var customer = conn.QueryFirstOrDefault<CustomerDto>(
            @"SELECT CustomerId, Code, Name, CustomerType, Gstin, Pan, Phone, Mobile, Email, BillingAddress, DeliveryAddress,
                     StateCode, StateName, CreditLimit, CreditPeriodDays, CreditBlocked, IsActive
              FROM Master.Customer WHERE CustomerId = @id", new { id });
        return customer is null ? NotFound() : Ok(customer);
    }

    [RequirePermission("Customer.Create")]
    [HttpPost]
    public IActionResult Create([FromBody] CustomerDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Mobile))
            return UnprocessableEntity(new ProblemResponse { Title = "Phone number required", Status = 422, ErrorCode = "PHONE_REQUIRED", Detail = "A phone number is mandatory for every customer." });

        using var conn = db.CreateConnection();
        var existing = conn.QueryFirstOrDefault<int?>(
            "SELECT CustomerId FROM Master.Customer WHERE Gstin = @Gstin AND @Gstin IS NOT NULL", new { dto.Gstin });
        if (existing.HasValue)
        {
            return Conflict(new ProblemResponse { Title = "Duplicate party", Status = 409, ErrorCode = "DUPLICATE_PARTY", Detail = $"A customer with this GSTIN already exists (id {existing})." });
        }

        var id = conn.ExecuteScalar<int>(
            @"INSERT INTO Master.Customer (Code, Name, CustomerType, Gstin, Pan, Phone, Mobile, Email, BillingAddress, DeliveryAddress, StateCode, StateName, CreditLimit, CreditPeriodDays, IsActive)
              OUTPUT INSERTED.CustomerId
              VALUES (@Code, @Name, @CustomerType, @Gstin, @Pan, @Phone, @Mobile, @Email, @BillingAddress, @DeliveryAddress, @StateCode, @StateName, @CreditLimit, @CreditPeriodDays, 1)",
            dto);
        dto.CustomerId = id;
        return CreatedAtAction(nameof(Get), new { id }, dto);
    }

    [RequirePermission("Customer.Create")]
    [HttpPut("{id:int}")]
    public IActionResult Update(int id, [FromBody] CustomerDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Mobile))
            return UnprocessableEntity(new ProblemResponse { Title = "Phone number required", Status = 422, ErrorCode = "PHONE_REQUIRED", Detail = "A phone number is mandatory for every customer." });

        using var conn = db.CreateConnection();
        var rows = conn.Execute(
            @"UPDATE Master.Customer SET Name=@Name, CustomerType=@CustomerType, Gstin=@Gstin, Pan=@Pan, Phone=@Phone, Mobile=@Mobile, Email=@Email,
                     BillingAddress=@BillingAddress, DeliveryAddress=@DeliveryAddress, StateCode=@StateCode, StateName=@StateName,
                     CreditLimit=@CreditLimit, CreditPeriodDays=@CreditPeriodDays
              WHERE CustomerId=@id",
            new { id, dto.Name, dto.CustomerType, dto.Gstin, dto.Pan, dto.Phone, dto.Mobile, dto.Email, dto.BillingAddress, dto.DeliveryAddress, dto.StateCode, dto.StateName, dto.CreditLimit, dto.CreditPeriodDays });
        return rows == 0 ? NotFound() : NoContent();
    }

    [RequirePermission("Customer.CreditBlock")]
    [HttpPost("{id:int}/credit-block")]
    public IActionResult CreditBlock(int id, [FromBody] CreditBlockRequest req)
    {
        using var conn = db.CreateConnection();
        conn.Execute("UPDATE Master.Customer SET CreditBlocked = @Blocked WHERE CustomerId = @id", new { id, req.Blocked });
        return NoContent();
    }
}

public class CreditBlockRequest
{
    public bool Blocked { get; set; }
    public string? Reason { get; set; }
}
