namespace RajendraGlass.Api.Models;

// ---------- Auth ----------
public class LoginRequest
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string? MfaCode { get; set; }
}

public class UserProfileDto
{
    public int UserId { get; set; }
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? Email { get; set; }
    public List<string> Roles { get; set; } = new();
    public List<string> Permissions { get; set; } = new();
    public bool MfaEnabled { get; set; }
}

public class LoginResponse
{
    public string AccessToken { get; set; } = "";
    public DateTime ExpiresOn { get; set; }
    public UserProfileDto User { get; set; } = new();

    /// <summary>True when the account's role mandates MFA (FRS 12.2) but it isn't enrolled yet.
    /// AccessToken in this case is a short-lived MFA-pending token usable only for /auth/mfa/*.</summary>
    public bool MfaSetupRequired { get; set; }

    /// <summary>True when MFA is enabled and the request omitted (or had a wrong) mfaCode. No token
    /// is issued in this case — resubmit /auth/login with the code.</summary>
    public bool MfaRequired { get; set; }
}

public class UserRecord
{
    public int UserId { get; set; }
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? Email { get; set; }
    public string PasswordHash { get; set; } = "";
    public bool IsActive { get; set; }
    public int FailedAttempts { get; set; }
    public DateTime? LockedUntil { get; set; }
    public bool MfaEnabled { get; set; }
    public string? MfaSecret { get; set; }
}

// ---------- MFA ----------
public class MfaSetupResponse
{
    public string Secret { get; set; } = "";
    public string OtpAuthUri { get; set; } = "";
}

public class MfaEnableRequest
{
    public string Code { get; set; } = "";
}

// ---------- RBAC admin ----------
public class PermissionDto
{
    public int PermissionId { get; set; }
    public string Code { get; set; } = "";
    public string Module { get; set; } = "";
    public string? Description { get; set; }
}

public class RoleDto
{
    public int RoleId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public bool IsMfaRequired { get; set; }
    public List<string> Permissions { get; set; } = new();
}

public class UpdateRolePermissionsRequest
{
    public List<string> PermissionCodes { get; set; } = new();
}

public class AdminUserDto
{
    public int UserId { get; set; }
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? Email { get; set; }
    public bool IsActive { get; set; }
    public bool MfaEnabled { get; set; }
    public int FailedAttempts { get; set; }
    public bool IsLocked { get; set; }
    public DateTime? LastLoginOn { get; set; }
    public List<string> Roles { get; set; } = new();
}

public class CreateUserRequest
{
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? Email { get; set; }
    public string Password { get; set; } = "";
    public List<int> RoleIds { get; set; } = new();
}

// ---------- Company ----------
public class CompanyDto
{
    public int CompanyId { get; set; }
    public string LegalName { get; set; } = "";
    public string? TradeName { get; set; }
    public string? RegisteredAddress { get; set; }
    public string? BusinessAddress { get; set; }
    public string? Gstin { get; set; }
    public string? Pan { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }
    public string? BankName { get; set; }
    public string? AccountNumber { get; set; }
    public string? Ifsc { get; set; }
    public string? BankBranch { get; set; }
    public string? AuthSignatoryName { get; set; }
    public string? InvoiceFooterNote { get; set; }
}

// ---------- Master data ----------
public class ProductDto
{
    public int ProductId { get; set; }
    public string Code { get; set; } = "";
    public string Description { get; set; } = "";
    public string? Category { get; set; }
    public string? Brand { get; set; }
    public decimal? ThicknessMm { get; set; }
    public string? Colour { get; set; }
    public string? HsnCode { get; set; }
    public decimal GstRatePct { get; set; }
    public string StockUnit { get; set; } = "Sqm";
    public string SellingUnit { get; set; } = "Sqm";
    public decimal? PurchaseRate { get; set; }
    public decimal? SellingRate { get; set; }
    public decimal? MinSellingPrice { get; set; }
    /// <summary>The size a full sheet of this product is normally stocked in — optional; when set,
    /// drives the "≈ N sheets" report readout and lets a sale that cuts a fresh sheet automatically
    /// log the remainder as a reusable offcut (see OffcutAllocation.DeductStockAndLogOffcut).</summary>
    public decimal? StandardSheetLengthMm { get; set; }
    public decimal? StandardSheetWidthMm { get; set; }
    public bool IsActive { get; set; }
}

public class CustomerDto
{
    public int CustomerId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>"Wholesale" or "Retail" — drives which rate card the counter/quotation screens use.</summary>
    public string CustomerType { get; set; } = "Retail";
    public string? Gstin { get; set; }
    public string? Pan { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Email { get; set; }
    public string? BillingAddress { get; set; }
    public string? DeliveryAddress { get; set; }
    public string? StateCode { get; set; }
    public string? StateName { get; set; }
    public decimal CreditLimit { get; set; }
    public int CreditPeriodDays { get; set; }
    public bool CreditBlocked { get; set; }
    public bool IsActive { get; set; }
}

public class TransporterDto
{
    public int TransporterId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Gstin { get; set; }
    public string? Phone { get; set; }
}

public class VehicleDto
{
    public int VehicleId { get; set; }
    public int? TransporterId { get; set; }
    public string VehicleNo { get; set; } = "";
    public string? DriverName { get; set; }
    public string? DriverMobile { get; set; }
}

// ---------- Sales ----------
public class InvoiceLineDto
{
    public int InvoiceLineId { get; set; }
    public int LineNumber { get; set; }
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? Description { get; set; }
    public decimal? NoOfSheets { get; set; }
    public decimal Quantity { get; set; }
    public decimal RatePerUnit { get; set; }
    public decimal BasicValue { get; set; }
    public decimal DiscountValue { get; set; }
    public decimal NetValue { get; set; }
    public decimal GstRatePct { get; set; }
}

public class InvoiceDto
{
    public int InvoiceId { get; set; }
    public string? InvoiceNo { get; set; }
    public int BranchId { get; set; }
    public int CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerGstin { get; set; }
    public string? CustomerAddress { get; set; }
    public DateTime InvoiceDate { get; set; }
    public string? PlaceOfSupply { get; set; }
    public string? CustomerOrderRef { get; set; }
    public int? SalesOrderId { get; set; }
    public string? OrderNo { get; set; }
    public int? TransporterId { get; set; }
    public string? TransporterName { get; set; }
    public string? VehicleNo { get; set; }
    public string? Destination { get; set; }
    public decimal BasicValue { get; set; }
    public decimal DiscountValue { get; set; }
    public decimal TaxableValue { get; set; }
    public decimal CgstValue { get; set; }
    public decimal SgstValue { get; set; }
    public decimal IgstValue { get; set; }
    public decimal RoundOff { get; set; }
    public decimal TotalValue { get; set; }
    public string Status { get; set; } = "Draft";
    public string? EwayBillNo { get; set; }
    public string? Remarks { get; set; }
    public string? IrnNo { get; set; }
    public string? IrnAckNo { get; set; }
    public DateTime? IrnAckDate { get; set; }
    public string? IrnQrPayload { get; set; }
    public string EInvoiceStatus { get; set; } = "NotGenerated";
    /// <summary>True while no payment, waybill or complaint references this invoice yet — the
    /// same condition the server re-checks in DELETE.</summary>
    public bool CanDelete { get; set; }
    public List<InvoiceLineDto> Lines { get; set; } = new();
}

public class CreateInvoiceLineRequest
{
    public int ProductId { get; set; }
    public decimal? NoOfSheets { get; set; }
    public decimal Quantity { get; set; }
    public decimal RatePerUnit { get; set; }
    public decimal DiscountValue { get; set; }
}

public class CreateInvoiceRequest
{
    public int CustomerId { get; set; }
    /// <summary>When set, this invoice is generated against a sales order — the order is
    /// carried through as a back-reference and, once linked, the order can no longer be
    /// invoiced again (see InvoicesController.Create).</summary>
    public int? SalesOrderId { get; set; }
    public DateTime? InvoiceDate { get; set; }
    public string? PlaceOfSupply { get; set; }
    public string? CustomerOrderRef { get; set; }
    public int? TransporterId { get; set; }
    public string? VehicleNo { get; set; }
    public string? Destination { get; set; }
    public string? Remarks { get; set; }
    public List<CreateInvoiceLineRequest> Lines { get; set; } = new();
}

// ---------- Dispatch ----------
public class WaybillDto
{
    public int WaybillId { get; set; }
    public string? WaybillNo { get; set; }
    public int InvoiceId { get; set; }
    public string? InvoiceNo { get; set; }
    public string? CustomerName { get; set; }
    public decimal? InvoiceTotal { get; set; }
    public DateTime GeneratedDate { get; set; }
    public DateTime? ValidUntil { get; set; }
    public string SupplyType { get; set; } = "Outward";
    public string SubType { get; set; } = "Supply";
    public string? FromAddress { get; set; }
    public string? ToAddress { get; set; }
    public int? TransporterId { get; set; }
    public string? TransporterName { get; set; }
    public string? VehicleNo { get; set; }
    public decimal? DistanceKm { get; set; }
    public string TransportMode { get; set; } = "Road";
    public string Status { get; set; } = "Generated";
    public string? EwbNo { get; set; }
    public DateTime? EwbAckDate { get; set; }
    public DateTime? EwbValidUpto { get; set; }
    public string? EwbQrPayload { get; set; }
    public string EwayBillStatus { get; set; } = "NotGenerated";
    /// <summary>True while no active e-Way Bill (EwayBillStatus = 'Generated') is registered
    /// against this waybill -- deleting it while one is active would orphan a live government-side
    /// document. Cancel the e-Way Bill first, then the waybill becomes deletable.</summary>
    public bool CanDelete { get; set; }
}

public class CreateWaybillRequest
{
    public int InvoiceId { get; set; }
    public string? ToAddress { get; set; }
    public int? TransporterId { get; set; }
    public string? VehicleNo { get; set; }
    public decimal? DistanceKm { get; set; }
    public string TransportMode { get; set; } = "Road";
    public string SubType { get; set; } = "Supply";
}

// ---------- Dashboard ----------
public class DashboardSummaryDto
{
    public decimal TodaySalesValue { get; set; }
    public int TodayInvoiceCount { get; set; }
    public decimal MonthSalesValue { get; set; }
    public int MonthInvoiceCount { get; set; }
    public int ActiveCustomers { get; set; }
    public int ActiveProducts { get; set; }
    public int PendingWaybills { get; set; }
    public List<InvoiceDto> RecentInvoices { get; set; } = new();
}

public class ProblemResponse
{
    public string Title { get; set; } = "";
    public int Status { get; set; }
    public string ErrorCode { get; set; } = "";
    public string Detail { get; set; } = "";
    public Dictionary<string, string[]>? Errors { get; set; }
}
