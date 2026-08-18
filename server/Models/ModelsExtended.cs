using RajendraGlass.Api.Data;

namespace RajendraGlass.Api.Models;

// ---------- Company / Inventory ----------
public class GodownDto
{
    public int GodownId { get; set; }
    public int BranchId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Location { get; set; }
    /// <summary>Count of racks set up under this godown — populated by the List/Get endpoints.</summary>
    public int RackCount { get; set; }
}

/// <summary>Godown master-detail: the godown plus its full rack list, for the combined
/// Godown master screen (racks are entered/edited as details of a godown, not a separate master).</summary>
public class GodownDetailDto
{
    public int GodownId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Location { get; set; }
    public List<RackDto> Racks { get; set; } = new();
}

public class CreateGodownRequest
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Location { get; set; }
}

public class UpdateGodownRequest
{
    public string Name { get; set; } = "";
    public string? Location { get; set; }
}

/// <summary>A physical storage location inside a godown. Code is auto-derived from the godown's
/// name and the short name the user types — never entered directly.</summary>
public class RackDto
{
    public int RackId { get; set; }
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public string Name { get; set; } = "";
    public string Code { get; set; } = "";
    public bool IsActive { get; set; } = true;
}

public class CreateRackRequest
{
    public int GodownId { get; set; }
    public string Name { get; set; } = "";
}

public class UpdateRackRequest
{
    public string Name { get; set; } = "";
}

/// <summary>Current physical quantity of a product sitting in one rack.</summary>
public class RackStockDto
{
    public int RackStockId { get; set; }
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductDescription { get; set; }
    public int RackId { get; set; }
    public string? RackCode { get; set; }
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public decimal QtyOnHand { get; set; }
    public string? Unit { get; set; }
    public DateTime ModifiedOn { get; set; }
}

/// <summary>Records a physical count against one rack — sets that rack's ledger to the counted
/// quantity, the rack-level equivalent of a Stock Adjustment.</summary>
public class AdjustRackStockRequest
{
    public int RackId { get; set; }
    public int ProductId { get; set; }
    public decimal ActualQty { get; set; }
}

/// <summary>Shifts a quantity from one rack to another — same godown (rack ledger only) or a
/// different godown (rack ledger *and* the godown-level StockBalance/StockMovement, so the
/// existing free-stock figure used everywhere else stays correct).</summary>
public class TransferRackStockRequest
{
    public int ProductId { get; set; }
    public int FromRackId { get; set; }
    public int ToRackId { get; set; }
    public decimal Qty { get; set; }
}

public class GodownStockSummaryRow
{
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductDescription { get; set; }
    public decimal QtyOnHand { get; set; }
    public decimal QtyFree { get; set; }
    public string? Unit { get; set; }
}

/// <summary>Godown/Rack-wise detail, with the rack ledger's total for the product set against the
/// godown's own book quantity so a variance is visible at a glance.</summary>
public class RackStockDetailRow
{
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public int RackId { get; set; }
    public string? RackCode { get; set; }
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductDescription { get; set; }
    public decimal RackQty { get; set; }
    public decimal GodownBookQty { get; set; }
    public string? Unit { get; set; }
}

public class StockBalanceDto
{
    public int StockBalanceId { get; set; }
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductDescription { get; set; }
    public string? ThicknessAndColour { get; set; }
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public decimal QtyOnHand { get; set; }
    public decimal QtyReserved { get; set; }
    public decimal QtyBlocked { get; set; }
    public decimal QtyDamaged { get; set; }
    public decimal QtyFree { get; set; }
    public decimal? AvgRate { get; set; }
    public string Unit { get; set; } = "";
}

public class StockAdjustmentLineDto
{
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public decimal BookQty { get; set; }
    public decimal ActualQty { get; set; }
    public decimal Difference { get; set; }
}

public class StockAdjustmentDto
{
    public int StockAdjustmentId { get; set; }
    public string? AdjustmentNo { get; set; }
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public DateTime AdjustmentDate { get; set; }
    public string Status { get; set; } = "Draft";
    public string? Reason { get; set; }
    public List<StockAdjustmentLineDto> Lines { get; set; } = new();
}

public class CreateStockAdjustmentLineRequest
{
    public int ProductId { get; set; }
    public decimal ActualQty { get; set; }
}

public class CreateStockAdjustmentRequest
{
    public int GodownId { get; set; }
    public string? Reason { get; set; }
    public List<CreateStockAdjustmentLineRequest> Lines { get; set; } = new();
}

public class StockTransferLineDto
{
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public decimal Qty { get; set; }
}

public class StockTransferDto
{
    public int StockTransferId { get; set; }
    public string? TransferNo { get; set; }
    public int FromGodownId { get; set; }
    public string? FromGodownName { get; set; }
    public int ToGodownId { get; set; }
    public string? ToGodownName { get; set; }
    public DateTime TransferDate { get; set; }
    public string Status { get; set; } = "Draft";
    public List<StockTransferLineDto> Lines { get; set; } = new();
}

public class CreateStockTransferRequest
{
    public int FromGodownId { get; set; }
    public int ToGodownId { get; set; }
    public List<StockTransferLineDto> Lines { get; set; } = new();
}

public class OffcutDto
{
    public int OffcutId { get; set; }
    public string? OffcutCode { get; set; }
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public decimal LengthMm { get; set; }
    public decimal WidthMm { get; set; }
    public decimal AreaSqft { get; set; }
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public string Status { get; set; } = "Available";
    public DateTime CreatedOn { get; set; }
}

public class CreateOffcutRequest
{
    public int ProductId { get; set; }
    public decimal LengthMm { get; set; }
    public decimal WidthMm { get; set; }
    public int GodownId { get; set; }
}

// ---------- Purchase ----------
public class SupplierDto
{
    public int SupplierId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Gstin { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? StateName { get; set; }
    public int CreditPeriodDays { get; set; }
    public bool IsActive { get; set; }
}

public class PurchaseOrderLineDto
{
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public decimal Qty { get; set; }
    public decimal Rate { get; set; }
    public decimal Value { get; set; }
}

/// <summary>A GRN raised against a purchase order — a PO can have more than one (partial
/// receipts), so this is a lightweight back-reference list, not a single link.</summary>
public class PoGrnRefDto
{
    public int GrnId { get; set; }
    public string? GrnNo { get; set; }
    public DateTime GrnDate { get; set; }
    public string Status { get; set; } = "Draft";
}

public class PurchaseOrderDto
{
    public int PurchaseOrderId { get; set; }
    public string? PoNo { get; set; }
    public int SupplierId { get; set; }
    public string? SupplierName { get; set; }
    public DateTime PoDate { get; set; }
    public string Status { get; set; } = "Draft";
    public decimal TotalValue { get; set; }
    /// <summary>Count of GRNs already posted against this order — the order has no edit screen
    /// to begin with, so this is purely informational (view/print only, same as a Sales Order).</summary>
    public int GrnCount { get; set; }
    /// <summary>True while no GRN has been posted against this order yet.</summary>
    public bool CanDelete { get; set; }
    /// <summary>Populated by GET /purchase-orders/{id} only; empty in the list.</summary>
    public List<PoGrnRefDto> Grns { get; set; } = new();
    public List<PurchaseOrderLineDto> Lines { get; set; } = new();
}

public class CreatePurchaseOrderRequest
{
    public int SupplierId { get; set; }
    public List<PurchaseOrderLineDto> Lines { get; set; } = new();
}

public class GrnLineDto
{
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public decimal ReceivedQty { get; set; }
    public decimal AcceptedQty { get; set; }
    public decimal RejectedQty { get; set; }
    public decimal BrokenQty { get; set; }
    public string? BatchNo { get; set; }
}

public class GrnDto
{
    public int GrnId { get; set; }
    public string? GrnNo { get; set; }
    public int PurchaseOrderId { get; set; }
    public string? PoNo { get; set; }
    public string? SupplierName { get; set; }
    public DateTime GrnDate { get; set; }
    public string Status { get; set; } = "Draft";
    /// <summary>Set once a purchase invoice has been booked against this GRN — the GRN is then
    /// locked from being invoiced again (there is no GRN edit screen to lock; this is the
    /// forward reference the view page shows).</summary>
    public int? PurchaseInvoiceId { get; set; }
    public string? PurchaseInvoiceNo { get; set; }
    /// <summary>True while no purchase invoice has been booked against this GRN yet.</summary>
    public bool CanDelete { get; set; }
    public List<GrnLineDto> Lines { get; set; } = new();
}

public class CreateGrnRequest
{
    public int PurchaseOrderId { get; set; }
    public string? GodownCode { get; set; }
    public List<GrnLineDto> Lines { get; set; } = new();
}

public class PurchaseInvoiceDto
{
    public int PurchaseInvoiceId { get; set; }
    public string? InvoiceNo { get; set; }
    public int GrnId { get; set; }
    public string? GrnNo { get; set; }
    public string? SupplierName { get; set; }
    public string? SupplierInvoiceNo { get; set; }
    public DateTime InvoiceDate { get; set; }
    public decimal TotalValue { get; set; }
    public string Status { get; set; } = "Booked";
    /// <summary>Nothing references a purchase invoice, so this is always true (no query needed) —
    /// same as VoucherDto.CanDelete.</summary>
    public bool CanDelete { get; set; } = true;
}

public class CreatePurchaseInvoiceRequest
{
    public int GrnId { get; set; }
    public string? SupplierInvoiceNo { get; set; }
    public decimal TotalValue { get; set; }
}

/// <summary>Corrects a wrong entry on an already-booked purchase invoice — unlike the GRN and
/// purchase order it derives from, this document can always be edited.</summary>
public class UpdatePurchaseInvoiceRequest
{
    public string? SupplierInvoiceNo { get; set; }
    public DateTime? InvoiceDate { get; set; }
    public decimal TotalValue { get; set; }
}

// ---------- Sales: Quotation / Sales Order ----------
/// <summary>
/// One quotation line. Fields above the divider are what the client sends; everything below is
/// produced by <see cref="RajendraGlass.Api.Data.QuotationCalculator"/> on the server and is
/// ignored on the way in — the server never trusts a client-supplied amount.
/// </summary>
public class QuotationLineDto
{
    /// <summary>Null for charge-only lines (van, cutter, previous dues).</summary>
    public int? ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductDescription { get; set; }
    /// <summary>Free text, used when there is no product or to override its wording.</summary>
    public string? Description { get; set; }

    // ----- entered by the operator -----
    public decimal Length { get; set; }
    public decimal Width { get; set; }
    /// <summary>MM | CM | INCH | FEET | METER.</summary>
    public string DimensionUnit { get; set; } = DimensionUnits.Meter;
    public decimal Qty { get; set; } = 1;
    public decimal Rate { get; set; }
    /// <summary>PER_SQFT | PER_SQM | PER_PIECE.</summary>
    public string RateUnit { get; set; } = RateUnits.PerSqm;
    /// <summary>Multiply the rate by thickness (Sheet3's metre convention).</summary>
    public bool ApplyThickness { get; set; } = true;
    /// <summary>Round each dimension up to the next multiple of this many inches; 0 = off.</summary>
    public decimal ChargeRoundingInch { get; set; }
    public decimal GstPct { get; set; } = QuotationCalculator.DefaultGstPct;
    public decimal DiscountPct { get; set; }
    /// <summary>
    /// Glass thickness in mm. Defaults from the product master when omitted, but is editable
    /// per line — Sheet3 types it per row and some lines carry none at all.
    /// </summary>
    public decimal? ThicknessMm { get; set; }
    /// <summary>Set to bill an area other than the computed one.</summary>
    public decimal? ManualArea { get; set; }
    /// <summary>Set to bill an amount other than the computed one; wins over everything else.</summary>
    public decimal? ManualBasicAmount { get; set; }

    // ----- server-calculated -----
    public decimal LengthInch { get; set; }
    public decimal WidthInch { get; set; }
    public decimal ChargeLengthInch { get; set; }
    public decimal ChargeWidthInch { get; set; }
    public decimal CalculatedArea { get; set; }
    public decimal Area { get; set; }
    public string AreaUnit { get; set; } = "";
    public decimal EffectiveRate { get; set; }
    public decimal CalculatedBasicAmount { get; set; }
    public decimal BasicAmount { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal GstAmount { get; set; }
    public decimal Amount { get; set; }
    public string CalculationMethod { get; set; } = "";
    public bool IsAreaManualOverride { get; set; }
    public bool IsAmountManualOverride { get; set; }
}

public class QuotationDto
{
    public int QuotationId { get; set; }
    public string? QuotationNo { get; set; }
    public int CustomerId { get; set; }
    public string? CustomerName { get; set; }
    // Populated only by Get(id) — the print/preview view needs them; the list doesn't.
    public string? CustomerType { get; set; }
    public string? CustomerAddress { get; set; }
    public string? CustomerGstin { get; set; }
    public string? CustomerMobile { get; set; }
    public string? CustomerStateName { get; set; }
    public DateTime QuotationDate { get; set; }
    public DateTime? ValidUntil { get; set; }
    public string Status { get; set; } = "Draft";
    public decimal TotalValue { get; set; }
    /// <summary>True while no sales order has been generated against this quotation — the same
    /// condition the server re-checks in DELETE (see QuotationsController.Delete).</summary>
    public bool CanDelete { get; set; }
    public List<QuotationLineDto> Lines { get; set; } = new();
}

public class CreateQuotationRequest
{
    /// <summary>Existing customer. Omit (or 0) and supply <see cref="NewCustomer"/> to create one inline.</summary>
    public int CustomerId { get; set; }
    /// <summary>Lets a quotation be raised for a walk-in customer without leaving the screen.</summary>
    public NewCustomerRequest? NewCustomer { get; set; }
    public DateTime? ValidUntil { get; set; }
    public List<QuotationLineDto> Lines { get; set; } = new();
}

/// <summary>
/// PUT /quotations/{id}. No inline new-customer creation here — an edit targets an existing
/// quotation, which by definition already has a real customer on it.
/// </summary>
public class UpdateQuotationRequest
{
    public int CustomerId { get; set; }
    public DateTime? ValidUntil { get; set; }
    public List<QuotationLineDto> Lines { get; set; } = new();
}

public class NewCustomerRequest
{
    public string? Code { get; set; }
    public string Name { get; set; } = "";
    public string CustomerType { get; set; } = "Retail";
    public string? Gstin { get; set; }
    public string? Mobile { get; set; }
    public string? Email { get; set; }
    public string? BillingAddress { get; set; }
    public string? StateCode { get; set; }
    public string? StateName { get; set; }
}

/// <summary>
/// One sales-order line. Same shape as <see cref="QuotationLineDto"/> and priced by the same
/// engine, so an order carries the glass sizing and GST rather than collapsing to qty x rate.
/// </summary>
public class SalesOrderLineDto
{
    public int? ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductDescription { get; set; }
    public string? Description { get; set; }

    // ----- entered -----
    public decimal Length { get; set; }
    public decimal Width { get; set; }
    public string DimensionUnit { get; set; } = DimensionUnits.Meter;
    public decimal Qty { get; set; } = 1;
    public decimal Rate { get; set; }
    public string RateUnit { get; set; } = RateUnits.PerSqm;
    public bool ApplyThickness { get; set; } = true;
    public decimal ChargeRoundingInch { get; set; }
    public decimal GstPct { get; set; } = QuotationCalculator.DefaultGstPct;
    public decimal DiscountPct { get; set; }
    public decimal? ThicknessMm { get; set; }
    public decimal? ManualArea { get; set; }
    public decimal? ManualBasicAmount { get; set; }

    // ----- server-calculated -----
    public decimal LengthInch { get; set; }
    public decimal WidthInch { get; set; }
    public decimal ChargeLengthInch { get; set; }
    public decimal ChargeWidthInch { get; set; }
    public decimal CalculatedArea { get; set; }
    public decimal Area { get; set; }
    public string AreaUnit { get; set; } = "";
    public decimal EffectiveRate { get; set; }
    public decimal CalculatedBasicAmount { get; set; }
    public decimal BasicAmount { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal GstAmount { get; set; }
    public decimal Amount { get; set; }
    /// <summary>Legacy column, kept equal to <see cref="BasicAmount"/> for older readers.</summary>
    public decimal Value { get; set; }
    public string CalculationMethod { get; set; } = "";
    public bool IsAreaManualOverride { get; set; }
    public bool IsAmountManualOverride { get; set; }
}

public class SalesOrderDto
{
    public int SalesOrderId { get; set; }
    public string? OrderNo { get; set; }
    public int CustomerId { get; set; }
    public string? CustomerName { get; set; }
    // Populated only by Get(id) — the print/preview view needs them; the list doesn't.
    public string? CustomerType { get; set; }
    public string? CustomerAddress { get; set; }
    public string? CustomerGstin { get; set; }
    public string? CustomerMobile { get; set; }
    public string? CustomerStateName { get; set; }
    public int? QuotationId { get; set; }
    public string? QuotationNo { get; set; }
    public DateTime OrderDate { get; set; }
    public decimal BasicValue { get; set; }
    public decimal GstValue { get; set; }
    public string Status { get; set; } = "Draft";
    public decimal TotalValue { get; set; }
    /// <summary>Set once a (non-cancelled) invoice has been generated against this order — the
    /// order is then locked from being invoiced again (mirrors QuotationId on the order itself).</summary>
    public int? InvoiceId { get; set; }
    public string? InvoiceNo { get; set; }
    /// <summary>True while no invoice (and no cutting plan / work order) has been raised against
    /// this order — the same condition the server re-checks in DELETE.</summary>
    public bool CanDelete { get; set; }
    public List<SalesOrderLineDto> Lines { get; set; } = new();
}

public class CreateSalesOrderRequest
{
    public int CustomerId { get; set; }
    public int? QuotationId { get; set; }
    public List<SalesOrderLineDto> Lines { get; set; } = new();
}

// ---------- Cutting ----------
public class CuttingPlanLineDto
{
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public decimal RequiredLengthMm { get; set; }
    public decimal RequiredWidthMm { get; set; }
    public int Qty { get; set; }
    public string Status { get; set; } = "Pending";
}

public class CuttingPlanDto
{
    public int CuttingPlanId { get; set; }
    public string? PlanNo { get; set; }
    public int? SalesOrderId { get; set; }
    public string? OrderNo { get; set; }
    public DateTime PlanDate { get; set; }
    public string Status { get; set; } = "Draft";
    public int TotalSheets { get; set; }
    public decimal? YieldPct { get; set; }
    public decimal? WasteAreaSqft { get; set; }
    public List<CuttingPlanLineDto> Lines { get; set; } = new();
    /// <summary>Nothing references a cutting plan and it never touches stock, so this is always
    /// true (no query needed) -- same as VoucherDto.CanDelete.</summary>
    public bool CanDelete { get; set; } = true;
}

public class CreateCuttingPlanRequest
{
    public int? SalesOrderId { get; set; }
    public List<CuttingPlanLineDto> Lines { get; set; } = new();
}

// ---------- Production ----------
public class WorkOrderDto
{
    public int WorkOrderId { get; set; }
    public string? WorkOrderNo { get; set; }
    public int? SalesOrderId { get; set; }
    public string? OrderNo { get; set; }
    public string Status { get; set; } = "Open";
    public DateTime CreatedOn { get; set; }
    public int JobCardCount { get; set; }
    /// <summary>True while no job card has been raised against this work order yet.</summary>
    public bool CanDelete { get; set; }
}

public class CreateWorkOrderRequest
{
    public int? SalesOrderId { get; set; }
}

public class JobCardDto
{
    public int JobCardId { get; set; }
    public string? JobCardNo { get; set; }
    public int WorkOrderId { get; set; }
    public string? WorkOrderNo { get; set; }
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public decimal QtyIn { get; set; }
    public decimal QtyPassed { get; set; }
    public decimal QtyBroken { get; set; }
    public decimal QtyRejected { get; set; }
    public string Status { get; set; } = "Pending";
    /// <summary>Nothing references a job card and finishing one never touches stock, so this is
    /// always true (no query needed) -- same as CuttingPlanDto.CanDelete.</summary>
    public bool CanDelete { get; set; } = true;
}

public class CreateJobCardRequest
{
    public int WorkOrderId { get; set; }
    public int ProductId { get; set; }
    public decimal QtyIn { get; set; }
}

public class FinishJobCardRequest
{
    public decimal QtyPassed { get; set; }
    public decimal QtyBroken { get; set; }
    public decimal QtyRejected { get; set; }
}

public class FurnaceBatchDto
{
    public int FurnaceBatchId { get; set; }
    public string? BatchNo { get; set; }
    public decimal ThicknessMm { get; set; }
    public DateTime BatchDate { get; set; }
    public decimal? UtilisationPct { get; set; }
    public decimal? EstElectricityCost { get; set; }
    public string Status { get; set; } = "Planned";
    /// <summary>Nothing references a furnace batch and it never touches stock, so this is always
    /// true (no query needed) -- same as CuttingPlanDto.CanDelete.</summary>
    public bool CanDelete { get; set; } = true;
}

public class CreateFurnaceBatchRequest
{
    public decimal ThicknessMm { get; set; }
    public decimal UtilisationPct { get; set; }
}

// ---------- Finance ----------
public class VoucherDto
{
    public int VoucherId { get; set; }
    public string? VoucherNo { get; set; }
    public string VoucherType { get; set; } = "Receipt";
    public DateTime VoucherDate { get; set; }
    public int? CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public int? SupplierId { get; set; }
    public string? SupplierName { get; set; }
    /// <summary>Set when this receipt settles a specific sales invoice — the "Payment Transaction"
    /// screen's invoice link (see VouchersController.Create/Update).</summary>
    public int? InvoiceId { get; set; }
    public string? InvoiceNo { get; set; }
    /// <summary>Advance or Full — informational only, not enforced against the invoice balance.</summary>
    public string? PaymentType { get; set; }
    /// <summary>Cheque no. / UPI transaction ref, as applicable to Mode.</summary>
    public string? ReferenceNo { get; set; }
    public decimal Amount { get; set; }
    public string Mode { get; set; } = "Cash";
    public string? Narration { get; set; }
    public DateTime? ModifiedOn { get; set; }
    /// <summary>Set when this voucher was created as one share of a split payment — every voucher
    /// carrying the same id was recorded together and adds up to one total (see VouchersController
    /// .CreateSplit). Null for an ordinary single-method voucher.</summary>
    public Guid? SplitGroupId { get; set; }
    /// <summary>Always true — nothing in the schema is ever generated from a voucher, so unlike
    /// Quotation/SalesOrder/Invoice there is no downstream document to check for.</summary>
    public bool CanDelete { get; set; } = true;
}

/// <summary>One method's share of a split payment — e.g. Cash 20 + UPI 50 + Cheque 30 for a ₹100
/// receipt. Every share in the group must add up to exactly the total the operator intended.</summary>
public class VoucherSplitLineRequest
{
    public string Mode { get; set; } = "Cash";
    public decimal Amount { get; set; }
    public string? ReferenceNo { get; set; }
}

public class CreateVoucherSplitRequest
{
    public string VoucherType { get; set; } = "Receipt";
    public int? CustomerId { get; set; }
    public int? SupplierId { get; set; }
    public int? InvoiceId { get; set; }
    public string? PaymentType { get; set; }
    public DateTime? VoucherDate { get; set; }
    public string? Narration { get; set; }
    public List<VoucherSplitLineRequest> Splits { get; set; } = new();
}

public class CreateVoucherRequest
{
    public string VoucherType { get; set; } = "Receipt";
    public int? CustomerId { get; set; }
    public int? SupplierId { get; set; }
    public int? InvoiceId { get; set; }
    public string? PaymentType { get; set; }
    public string? ReferenceNo { get; set; }
    public DateTime? VoucherDate { get; set; }
    public decimal Amount { get; set; }
    public string Mode { get; set; } = "Cash";
    public string? Narration { get; set; }
}

/// <summary>Corrects a wrong entry on an existing voucher — every field is re-suppliable, including
/// the party and invoice link, since "wrong entry" can mean any of them was mistyped.</summary>
public class UpdateVoucherRequest
{
    public int? CustomerId { get; set; }
    public int? SupplierId { get; set; }
    public int? InvoiceId { get; set; }
    public string? PaymentType { get; set; }
    public string? ReferenceNo { get; set; }
    public DateTime? VoucherDate { get; set; }
    public decimal Amount { get; set; }
    public string Mode { get; set; } = "Cash";
    public string? Narration { get; set; }
}

public class ExpenseDto
{
    public int ExpenseId { get; set; }
    public string? ExpenseNo { get; set; }
    public DateTime ExpenseDate { get; set; }
    public string Category { get; set; } = "";
    public decimal Amount { get; set; }
    public string? PaidTo { get; set; }
    public string? Narration { get; set; }
    public string Status { get; set; } = "Draft";
}

public class CreateExpenseRequest
{
    public string Category { get; set; } = "";
    public decimal Amount { get; set; }
    public string? PaidTo { get; set; }
    public string? Narration { get; set; }
}

public class CustomerOutstandingDto
{
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public decimal TotalInvoiced { get; set; }
    public decimal TotalReceived { get; set; }
    public decimal Outstanding { get; set; }
    public decimal CreditLimit { get; set; }
}

// ---------- CRM ----------
public class ComplaintDto
{
    public int ComplaintId { get; set; }
    public string? ComplaintNo { get; set; }
    public int CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public int? InvoiceId { get; set; }
    public string? InvoiceNo { get; set; }
    public string Subject { get; set; } = "";
    public string? Description { get; set; }
    public string Category { get; set; } = "Other";
    public string Status { get; set; } = "Open";
    public string? AssignedTo { get; set; }
    public DateTime? TargetDate { get; set; }
    public string? Resolution { get; set; }
    public DateTime CreatedOn { get; set; }
    /// <summary>Nothing references a complaint and it never touches stock, so this is always true
    /// (no query needed) -- same as CuttingPlanDto.CanDelete.</summary>
    public bool CanDelete { get; set; } = true;
}

public class CreateComplaintRequest
{
    public int CustomerId { get; set; }
    public int? InvoiceId { get; set; }
    public string Subject { get; set; } = "";
    public string? Description { get; set; }
    public string Category { get; set; } = "Other";
    public string? AssignedTo { get; set; }
    public DateTime? TargetDate { get; set; }
}

public class ResolveComplaintRequest
{
    public string Resolution { get; set; } = "";
}

// ---------- HR ----------
public class EmployeeDto
{
    public int EmployeeId { get; set; }
    public string Code { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? Designation { get; set; }
    public string? Department { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public DateTime? DateOfJoining { get; set; }
    public DateTime? DateOfLeaving { get; set; }
    public bool IsActive { get; set; }
}

public class CreateEmployeeRequest
{
    public string Code { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? Designation { get; set; }
    public string? Department { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public DateTime? DateOfJoining { get; set; }
}

public class AttendanceDto
{
    public int AttendanceId { get; set; }
    public int EmployeeId { get; set; }
    public string? EmployeeName { get; set; }
    public DateTime AttendanceDate { get; set; }
    public string Status { get; set; } = "Present";
    /// <summary>Nothing references an attendance record and marking one has no side effect on any
    /// other document, so this is always true (no query needed).</summary>
    public bool CanDelete { get; set; } = true;
}

public class MarkAttendanceRequest
{
    public int EmployeeId { get; set; }
    public DateTime AttendanceDate { get; set; }
    public string Status { get; set; } = "Present";
}

// ---------- Notifications (SignalR real-time push, SDD 10.1) ----------
public class NotificationDto
{
    public long NotificationId { get; set; }
    public string Type { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Message { get; set; }
    public string? Link { get; set; }
    public bool IsRead { get; set; }
    public DateTime CreatedOn { get; set; }
    /// <summary>Nothing references a notification, so this is always true (no query needed) --
    /// same as CuttingPlanDto.CanDelete.</summary>
    public bool CanDelete { get; set; } = true;
}

// ---------- Integration (e-Invoice / e-Way Bill gateway log) ----------
public class GatewayLogDto
{
    public long GatewayLogId { get; set; }
    public string GatewayType { get; set; } = "";
    public string Operation { get; set; } = "";
    public string Provider { get; set; } = "";
    public string DocType { get; set; } = "";
    public int DocId { get; set; }
    public string Status { get; set; } = "";
    public string? ErrorMessage { get; set; }
    public int DurationMs { get; set; }
    public DateTime CreatedOn { get; set; }
}

public class GatewayLogDetailDto : GatewayLogDto
{
    public string? RequestJson { get; set; }
    public string? ResponseJson { get; set; }
}

// ---------- Reports ----------
public class StockSummaryReportRow
{
    public int ProductId { get; set; }
    public string ProductCode { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal QtyOnHand { get; set; }
    public decimal QtyFree { get; set; }
    public decimal? AvgRate { get; set; }
    public decimal StockValue { get; set; }
}

public class SalesRegisterRow
{
    public string InvoiceNo { get; set; } = "";
    public DateTime InvoiceDate { get; set; }
    public string CustomerName { get; set; } = "";
    public decimal TaxableValue { get; set; }
    public decimal TaxValue { get; set; }
    public decimal TotalValue { get; set; }
}
