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
    public bool CanDelete { get; set; } = true;
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
    public bool CanDelete { get; set; } = true;
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

public class StockOpeningLineDto
{
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public decimal Qty { get; set; }
}

/// <summary>An inbound-only entry recording the opening balance of a product at a godown -- e.g.
/// stock that already physically exists but predates the system. See CreateStockOpening for how
/// it differs from a Stock Adjustment.</summary>
public class StockOpeningDto
{
    public int StockOpeningId { get; set; }
    public string? OpeningNo { get; set; }
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public DateTime OpeningDate { get; set; }
    public string Status { get; set; } = "Posted";
    public string? Remarks { get; set; }
    public List<StockOpeningLineDto> Lines { get; set; } = new();
    public bool CanDelete { get; set; } = true;
}

public class CreateStockOpeningLineRequest
{
    public int ProductId { get; set; }
    public decimal Qty { get; set; }
}

public class CreateStockOpeningRequest
{
    public int GodownId { get; set; }
    public string? Remarks { get; set; }
    public List<CreateStockOpeningLineRequest> Lines { get; set; } = new();
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
    /// <summary>Same area as AreaSqft, converted into the product's own StockUnit — so full-sheet
    /// stock and offcut stock read in one consistent unit per product.</summary>
    public decimal? AreaInStockUnit { get; set; }
    public string? StockUnit { get; set; }
    /// <summary>Which sale produced this leftover, if it was auto-logged rather than manually
    /// entered (e.g. 'CounterInvoice').</summary>
    public string? SourceDocType { get; set; }
    public int? SourceDocId { get; set; }
    /// <summary>Which sale consumed this offcut, once used.</summary>
    public string? ConsumedByDocType { get; set; }
    public int? ConsumedByDocId { get; set; }
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public string Status { get; set; } = "Available";
    public DateTime CreatedOn { get; set; }
    public bool CanDelete { get; set; } = true;
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
    /// <summary>True while no Purchase Order, Purchase Invoice, Voucher (payment) or e-Way Bill
    /// entry references this supplier yet — a GRN is never independently checkable since every GRN
    /// traces back through its own Purchase Order, whose SupplierId is what this already covers.
    /// </summary>
    public bool CanDelete { get; set; } = true;
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

/// <summary>One line entered directly off the supplier's paper tax invoice. Local lines only ever
/// populate Qty/Rate; Inter-State lines also populate the physical breakdown, which is how Area
/// (and so BasicValue) gets derived — see PurchaseInvoiceLinePricing.</summary>
public class PurchaseInvoiceLineDto
{
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductDescription { get; set; }
    public string? Description { get; set; }
    // ----- legacy only (NULL for lines entered since the unified-column redesign; kept so older
    // invoices booked under the old Inter-State geometry entry still display their stored data) -----
    public decimal? ThicknessMm { get; set; }
    public decimal? WidthCm { get; set; }
    public decimal? LengthCm { get; set; }
    public int? NoOfCrates { get; set; }
    public int? SheetsPerCrate { get; set; }
    // ----- entered directly, same shape for every line regardless of Local/Inter-State -----
    /// <summary>Piece/case count off the paper — informational; Area (not Qty) is what drives
    /// BasicValue and stock.</summary>
    public decimal Qty { get; set; }
    public decimal Area { get; set; }
    public decimal Rate { get; set; }
    public decimal BasicValue { get; set; }
    /// <summary>Per-piece hole-drilling charge for this line: HolesQty x HolesRate.</summary>
    public decimal? HolesQty { get; set; }
    public decimal? HolesRate { get; set; }
    public decimal HolesAmount { get; set; }
    /// <summary>Per-piece cutout charge for this line: CutoutQty x CutoutRate.</summary>
    public decimal? CutoutQty { get; set; }
    public decimal? CutoutRate { get; set; }
    public decimal CutoutAmount { get; set; }
    /// <summary>This line's contribution to the invoice's Basic Amount: BasicValue + HolesAmount +
    /// CutoutAmount.</summary>
    public decimal TaxableValue { get; set; }
    /// <summary>Informational only — GST is computed once at header level (see
    /// PurchaseInvoiceDto.GstPct); these are this line's proportional share of the header
    /// CGST/SGST/IGST, server-computed so the column always sums exactly to the header figure.
    /// </summary>
    public decimal CgstAmount { get; set; }
    public decimal SgstAmount { get; set; }
    public decimal IgstAmount { get; set; }
    /// <summary>Informational line grand total: this line's share of Basic Amount + charges + tax.
    /// </summary>
    public decimal NetValue { get; set; }
}

/// <summary>One header-level charge (Admin Charge, Insurance, Freight, Energy, ...) — a free-form,
/// ordered list so the entry form matches whatever a given supplier's paper actually itemizes,
/// rather than a fixed set of named fields.</summary>
public class PurchaseInvoiceChargeDto
{
    public string Label { get; set; } = "";
    /// <summary>'Percent' or 'Flat'.</summary>
    public string Basis { get; set; } = "Flat";
    /// <summary>The entered % (Basis='Percent') or the entered flat amount (Basis='Flat').</summary>
    public decimal Value { get; set; }
    /// <summary>The computed rupee amount either way — for a % charge, that's Value% of the
    /// running subtotal (Basic Amount + every charge entered before this one), not the raw Basic
    /// Amount, matching how these charges cascade on the real paper invoices.</summary>
    public decimal Amount { get; set; }
}

public class PurchaseInvoiceDto
{
    public int PurchaseInvoiceId { get; set; }
    public string? InvoiceNo { get; set; }
    public int SupplierId { get; set; }
    public string? SupplierName { get; set; }
    /// <summary>Purely an optional cross-reference now — neither is required to book the invoice.</summary>
    public int? PurchaseOrderId { get; set; }
    public string? PoNo { get; set; }
    public int? GrnId { get; set; }
    public string? GrnNo { get; set; }
    public int? GodownId { get; set; }
    public string? GodownName { get; set; }
    public string? SupplierInvoiceNo { get; set; }
    public DateTime InvoiceDate { get; set; }
    /// <summary>The supplier's own e-Way Bill number for this shipment, selected from the
    /// Purchase &gt; E-way Bill Entry master (see <see cref="EwayBillDto"/>) rather than typed by
    /// hand — not generated via any gateway (unlike Dispatch.Waybill's outbound e-Way Bill, which
    /// this app does generate). This is a denormalized snapshot of the selected entry's number,
    /// kept for print/search without a join; <see cref="EwayBillId"/> is the actual link.</summary>
    public string? EwayBillNo { get; set; }
    public int? EwayBillId { get; set; }
    /// <summary>Drives only the header CGST+SGST-vs-IGST split now — no longer affects line entry,
    /// which is the same shape either way.</summary>
    public bool IsInterState { get; set; }
    public decimal BasicValue { get; set; }
    /// <summary>Sum of every Charges row's computed Amount.</summary>
    public decimal ChargesTotal { get; set; }
    public List<PurchaseInvoiceChargeDto> Charges { get; set; } = new();
    /// <summary>The single invoice-wide GST rate — computed once against the whole Assessable
    /// Value (TaxableValue = BasicValue + ChargesTotal), not per line. NULL on invoices booked
    /// before this became header-level.</summary>
    public decimal? GstPct { get; set; }
    public decimal TaxableValue { get; set; }
    public decimal CgstValue { get; set; }
    public decimal SgstValue { get; set; }
    public decimal IgstValue { get; set; }
    /// <summary>The operator always types the round-off figure (RoundOff). "Round On" adds it to
    /// the total; "Round Off" subtracts it.</summary>
    public bool RoundOffEnabled { get; set; }
    public decimal RoundOff { get; set; }
    public decimal TotalValue { get; set; }
    public string Status { get; set; } = "Booked";
    /// <summary>Nothing else references a purchase invoice, so this only ever reflects "no query
    /// needed" true — same as VoucherDto.CanDelete. The one real blocking condition (stock this
    /// invoice added has since moved on) can only be checked authoritatively at delete time, the
    /// same caveat GrnDto.CanDelete carries.</summary>
    public bool CanDelete { get; set; } = true;
    public List<PurchaseInvoiceLineDto> Lines { get; set; } = new();
}

public class CreatePurchaseInvoiceLineRequest
{
    public int ProductId { get; set; }
    public string? Description { get; set; }
    /// <summary>Piece/case count off the paper — informational only; Area drives BasicValue/stock.
    /// </summary>
    public decimal? Qty { get; set; }
    public decimal Area { get; set; }
    public decimal Rate { get; set; }
    public decimal? HolesQty { get; set; }
    public decimal? HolesRate { get; set; }
    public decimal? CutoutQty { get; set; }
    public decimal? CutoutRate { get; set; }
}

public class CreatePurchaseInvoiceChargeRequest
{
    public string Label { get; set; } = "";
    public string Basis { get; set; } = "Flat";
    public decimal Value { get; set; }
}

public class CreatePurchaseInvoiceRequest
{
    public int SupplierId { get; set; }
    /// <summary>Optional — defaults to the 'MAIN' godown (same fallback CreateGrnRequest.GodownCode
    /// already uses) when not supplied.</summary>
    public int? GodownId { get; set; }
    /// <summary>Drives only the header CGST+SGST-vs-IGST split.</summary>
    public bool IsInterState { get; set; }
    public int? PurchaseOrderId { get; set; }
    public int? GrnId { get; set; }
    public string? SupplierInvoiceNo { get; set; }
    public DateTime? InvoiceDate { get; set; }
    /// <summary>Selected from the Purchase &gt; E-way Bill Entry master. Optional — a Local invoice
    /// often has none. Must not already be linked to another purchase invoice.</summary>
    public int? EwayBillId { get; set; }
    /// <summary>The single rate applied once to the whole invoice's Assessable Value.</summary>
    public decimal GstPct { get; set; }
    /// <summary>Applied in this order — a 'Percent' charge's base is the running total at that
    /// point (Basic Amount + every charge before it), not the raw Basic Amount.</summary>
    public List<CreatePurchaseInvoiceChargeRequest> Charges { get; set; } = new();
    public List<CreatePurchaseInvoiceLineRequest> Lines { get; set; } = new();
    /// <summary>The operator always types the round-off figure (RoundOffValue). "Round On" adds it
    /// to the total; "Round Off" (the default) subtracts it.</summary>
    public bool RoundOffEnabled { get; set; }
    public decimal RoundOffValue { get; set; }
}

/// <summary>Fixes a wrong supplier reference number, e-Way Bill selection, date — and, unlike most
/// other documents in this app, the line items themselves.</summary>
public class UpdatePurchaseInvoiceRequest
{
    public string? SupplierInvoiceNo { get; set; }
    /// <summary>Pass to change the linked e-Way Bill, or explicitly send null to clear it — either
    /// way the old selection (if any) is freed back up for other invoices and the new one (if any)
    /// is marked used.</summary>
    public int? EwayBillId { get; set; }
    public bool ClearEwayBill { get; set; }
    public DateTime? InvoiceDate { get; set; }
    /// <summary>Pass to replace every line entirely (same shape as Create). The stock this invoice
    /// previously added is reversed first (refused with 409 if any of it has already moved on
    /// elsewhere) then the new lines' stock is applied, exactly as at Create time. Lines, Charges
    /// and GstPct travel together — sending Lines without the other two would leave the invoice's
    /// totals inconsistent, so all three are required together. Omit Lines entirely (leave null) to
    /// patch only the header fields above and leave lines/charges/tax untouched.</summary>
    public List<CreatePurchaseInvoiceLineRequest>? Lines { get; set; }
    public List<CreatePurchaseInvoiceChargeRequest>? Charges { get; set; }
    public decimal? GstPct { get; set; }
    /// <summary>Travel with Lines/Charges/GstPct — only take effect when those are sent too
    /// (there's no totals recompute otherwise, so nothing to apply them against).</summary>
    public bool RoundOffEnabled { get; set; }
    public decimal RoundOffValue { get; set; }
}

// ---------- Purchase: E-way Bill Entry (master, selected from a dropdown when booking a Purchase Invoice) ----------
public class EwayBillDto
{
    public int EwayBillId { get; set; }
    public string EwayBillNo { get; set; } = "";
    public int SupplierId { get; set; }
    public string? SupplierName { get; set; }
    public DateTime EwayBillDate { get; set; }
    public DateTime? ValidUpto { get; set; }
    public string? VehicleNo { get; set; }
    public string? DocumentNo { get; set; }
    public decimal? GoodsValue { get; set; }
    public bool IsUsed { get; set; }
    /// <summary>Which purchase invoice it's linked to, once used — for the list view.</summary>
    public int? PurchaseInvoiceId { get; set; }
    public string? PurchaseInvoiceNo { get; set; }
    public bool CanDelete { get; set; }
}

public class CreateEwayBillRequest
{
    public string EwayBillNo { get; set; } = "";
    public int SupplierId { get; set; }
    public DateTime EwayBillDate { get; set; }
    public DateTime? ValidUpto { get; set; }
    public string? VehicleNo { get; set; }
    public string? DocumentNo { get; set; }
    public decimal? GoodsValue { get; set; }
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
    /// <summary>Always rounded to the nearest whole rupee; the delta is <see cref="RoundOff"/>.</summary>
    public decimal TotalValue { get; set; }
    public decimal RoundOff { get; set; }
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
    /// <summary>Always rounded to the nearest whole rupee; the delta is <see cref="RoundOff"/>.</summary>
    public decimal TotalValue { get; set; }
    public decimal RoundOff { get; set; }
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

// ---------- Cutting Entry (Quotation -> Cutting) ----------

/// <summary>One line of a Quotation, as offered to the Cutting Entry product picker -- deliberately
/// its own DTO rather than reusing QuotationLineDto, since that one doesn't expose QuotationLineId
/// (nothing needed it until Cutting Entry, which must pin to the exact quoted line, not just the
/// product, per the multiple-lines-same-product case). Only area-rated lines are offered (PER_SQFT/
/// PER_SQM) -- a PER_PIECE line has no per-square-foot rate for Cutting's SQFT billing to use.</summary>
public class QuotationCuttingProductDto
{
    public int QuotationLineId { get; set; }
    public int ProductId { get; set; }
    public string ProductCode { get; set; } = "";
    public string ProductDescription { get; set; } = "";
    public decimal Rate { get; set; }
    public string RateUnit { get; set; } = "";
}

public class CuttingEntryLineDto
{
    public int CuttingEntryLineId { get; set; }
    public int SerialNo { get; set; }
    public int QuotationLineId { get; set; }
    public int ProductId { get; set; }
    public string ProductCode { get; set; } = "";
    public string ProductDescription { get; set; } = "";
    public decimal ActualHeight { get; set; }
    public decimal ActualWidth { get; set; }
    public string? ActualHeightText { get; set; }
    public string? ActualWidthText { get; set; }
    public int Pcs { get; set; }
    public decimal ChargeableHeight { get; set; }
    public decimal ChargeableWidth { get; set; }
    public decimal Sqft { get; set; }
    public decimal Rate { get; set; }
    public decimal Amount { get; set; }
    public int GodownId { get; set; }
    public string GodownName { get; set; } = "";
    public int? RackId { get; set; }
    public string? RackName { get; set; }
}

public class CuttingEntryDto
{
    public int CuttingEntryId { get; set; }
    public string CuttingNo { get; set; } = "";
    public DateTime CuttingDate { get; set; }
    public int QuotationId { get; set; }
    public string? QuotationNo { get; set; }
    public string? CustomerName { get; set; }
    public int TotalPcs { get; set; }
    public decimal TotalSqft { get; set; }
    public decimal TotalGlassValue { get; set; }
    public decimal VanFair { get; set; }
    public decimal TotalBillAmount { get; set; }
    public string Status { get; set; } = "Booked";
    public DateTime CreatedOn { get; set; }
    /// <summary>Cheap to include in the list view (no bytes moved) -- lets the list show a badge
    /// without loading the image itself.</summary>
    public bool HasDesign { get; set; }
    /// <summary>Populated only on Get(id), never List() -- a data: URL ("data:image/jpeg;base64,...")
    /// built server-side from DesignData, so the client can just drop it straight into an &lt;img&gt;
    /// src with no separate authenticated-download endpoint to build.</summary>
    public string? DesignDataUrl { get; set; }
    public string? DesignFileName { get; set; }
    public List<CuttingEntryLineDto> Lines { get; set; } = new();
}

public class CreateCuttingEntryLineRequest
{
    public int QuotationLineId { get; set; }
    /// <summary>Raw text as typed, e.g. "20¼", "20 1/4" or "20.25" -- parsed and validated
    /// server-side via GlassDimensionParser; the server never trusts a client-computed decimal.</summary>
    public string ActualHeightText { get; set; } = "";
    public string ActualWidthText { get; set; } = "";
    public int Pcs { get; set; }
    public decimal ChargeableHeight { get; set; }
    public decimal ChargeableWidth { get; set; }
    public int GodownId { get; set; }
    public int? RackId { get; set; }
}

public class CreateCuttingEntryRequest
{
    public int QuotationId { get; set; }
    public DateTime CuttingDate { get; set; }
    public decimal VanFair { get; set; }
    public List<CreateCuttingEntryLineRequest> Lines { get; set; } = new();
}
