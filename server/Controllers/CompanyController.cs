using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/company")]
[Authorize]
public class CompanyController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        using var conn = db.CreateConnection();
        var company = conn.QueryFirstOrDefault<CompanyDto>(
            @"SELECT TOP 1 CompanyId, LegalName, TradeName, RegisteredAddress, BusinessAddress, Gstin, Pan, Phone, Mobile, Email, Website,
                     BankName, AccountNumber, Ifsc, BankBranch, AuthSignatoryName, InvoiceFooterNote
              FROM Company.Company");
        return company is null ? NotFound() : Ok(company);
    }

    [RequirePermission("Company.Edit")]
    [HttpPut]
    public IActionResult Update([FromBody] CompanyDto dto)
    {
        using var conn = db.CreateConnection();
        conn.Execute(@"UPDATE Company.Company SET
                LegalName=@LegalName, TradeName=@TradeName, RegisteredAddress=@RegisteredAddress, BusinessAddress=@BusinessAddress,
                Gstin=@Gstin, Pan=@Pan, Phone=@Phone, Mobile=@Mobile, Email=@Email, Website=@Website,
                BankName=@BankName, AccountNumber=@AccountNumber, Ifsc=@Ifsc, BankBranch=@BankBranch,
                AuthSignatoryName=@AuthSignatoryName, InvoiceFooterNote=@InvoiceFooterNote
              WHERE CompanyId=@CompanyId", dto);
        return NoContent();
    }
}
