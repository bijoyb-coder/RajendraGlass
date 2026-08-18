export interface CompanyDto {
  companyId: number
  legalName: string
  tradeName?: string | null
  registeredAddress?: string | null
  businessAddress?: string | null
  gstin?: string | null
  pan?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  website?: string | null
  bankName?: string | null
  accountNumber?: string | null
  ifsc?: string | null
  bankBranch?: string | null
  authSignatoryName?: string | null
  invoiceFooterNote?: string | null
}

export interface ProductDto {
  productId: number
  code: string
  description: string
  category?: string | null
  brand?: string | null
  thicknessMm?: number | null
  colour?: string | null
  hsnCode?: string | null
  gstRatePct: number
  stockUnit: string
  sellingUnit: string
  purchaseRate?: number | null
  sellingRate?: number | null
  minSellingPrice?: number | null
  isActive: boolean
}

export type CustomerType = 'Wholesale' | 'Retail'

export interface CustomerDto {
  customerId: number
  code: string
  name: string
  customerType: CustomerType
  gstin?: string | null
  pan?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  billingAddress?: string | null
  deliveryAddress?: string | null
  stateCode?: string | null
  stateName?: string | null
  creditLimit: number
  creditPeriodDays: number
  creditBlocked: boolean
  isActive: boolean
}

export interface TransporterDto {
  transporterId: number
  code: string
  name: string
  gstin?: string | null
  phone?: string | null
}

export interface VehicleDto {
  vehicleId: number
  transporterId?: number | null
  vehicleNo: string
  driverName?: string | null
  driverMobile?: string | null
}

export interface InvoiceLineDto {
  invoiceLineId: number
  lineNumber: number
  productId: number
  productCode?: string | null
  description?: string | null
  noOfSheets?: number | null
  quantity: number
  ratePerUnit: number
  basicValue: number
  discountValue: number
  netValue: number
  gstRatePct: number
}

export interface InvoiceDto {
  invoiceId: number
  invoiceNo?: string | null
  branchId: number
  customerId: number
  customerName?: string | null
  customerGstin?: string | null
  customerAddress?: string | null
  invoiceDate: string
  placeOfSupply?: string | null
  customerOrderRef?: string | null
  /** Set when this invoice was generated against a sales order (see CreateInvoiceRequest.salesOrderId). */
  salesOrderId?: number | null
  orderNo?: string | null
  transporterId?: number | null
  transporterName?: string | null
  vehicleNo?: string | null
  destination?: string | null
  basicValue: number
  discountValue: number
  taxableValue: number
  cgstValue: number
  sgstValue: number
  igstValue: number
  roundOff: number
  totalValue: number
  status: string
  ewayBillNo?: string | null
  remarks?: string | null
  irnNo?: string | null
  irnAckNo?: string | null
  irnAckDate?: string | null
  irnQrPayload?: string | null
  eInvoiceStatus: string
  /** True while no payment, waybill or complaint references this invoice yet. */
  canDelete: boolean
  lines: InvoiceLineDto[]
}

export interface CreateInvoiceLineRequest {
  productId: number
  noOfSheets?: number | null
  quantity: number
  ratePerUnit: number
  discountValue: number
}

export interface CreateInvoiceRequest {
  customerId: number
  /** Generates this invoice against a sales order — the order is then locked from being
   * invoiced again (see SalesOrderDto.invoiceId). */
  salesOrderId?: number
  invoiceDate?: string | null
  placeOfSupply?: string | null
  customerOrderRef?: string | null
  transporterId?: number | null
  vehicleNo?: string | null
  destination?: string | null
  remarks?: string | null
  lines: CreateInvoiceLineRequest[]
}

export interface WaybillDto {
  waybillId: number
  waybillNo?: string | null
  invoiceId: number
  invoiceNo?: string | null
  customerName?: string | null
  invoiceTotal?: number | null
  generatedDate: string
  validUntil?: string | null
  supplyType: string
  subType: string
  fromAddress?: string | null
  toAddress?: string | null
  transporterId?: number | null
  transporterName?: string | null
  vehicleNo?: string | null
  distanceKm?: number | null
  transportMode: string
  status: string
  ewbNo?: string | null
  ewbAckDate?: string | null
  ewbValidUpto?: string | null
  ewbQrPayload?: string | null
  ewayBillStatus: string
  /** True while no active e-Way Bill (ewayBillStatus 'Generated') is registered against this
   * waybill — cancel the e-Way Bill first if this is false. */
  canDelete: boolean
}

export interface CreateWaybillRequest {
  invoiceId: number
  toAddress?: string | null
  transporterId?: number | null
  vehicleNo?: string | null
  distanceKm?: number | null
  transportMode?: string
  subType?: string
}

export interface DashboardSummaryDto {
  todaySalesValue: number
  todayInvoiceCount: number
  monthSalesValue: number
  monthInvoiceCount: number
  activeCustomers: number
  activeProducts: number
  pendingWaybills: number
  recentInvoices: InvoiceDto[]
}

export interface ProblemResponse {
  title: string
  status: number
  errorCode: string
  detail: string
  errors?: Record<string, string[]>
}

// ---------- Inventory ----------
export interface GodownDto { godownId: number; branchId: number; code: string; name: string; location?: string | null; rackCount: number }
export interface CreateGodownRequest { code?: string; name: string; location?: string }
export interface UpdateGodownRequest { name: string; location?: string }

/** Godown master-detail: the godown plus its full rack list. Racks are entered/edited as
 * details of a godown on the same screen — there is no separate Rack master. */
export interface GodownDetailDto { godownId: number; code: string; name: string; location?: string | null; racks: RackDto[] }

/** A physical storage location inside a godown. Code is auto-derived server-side from the
 * godown's name and the short name the user types — never entered directly. */
export interface RackDto { rackId: number; godownId: number; godownName?: string | null; name: string; code: string; isActive: boolean }
export interface CreateRackRequest { godownId: number; name: string }
export interface UpdateRackRequest { name: string }

/** Current physical quantity of a product sitting in one rack. */
export interface RackStockDto {
  rackStockId: number; productId: number; productCode?: string | null; productDescription?: string | null
  rackId: number; rackCode?: string | null; godownId: number; godownName?: string | null
  qtyOnHand: number; unit?: string | null; modifiedOn: string
}
export interface AdjustRackStockRequest { rackId: number; productId: number; actualQty: number }
export interface TransferRackStockRequest { productId: number; fromRackId: number; toRackId: number; qty: number }

export interface StockBalanceDto {
  stockBalanceId: number
  productId: number
  productCode?: string | null
  productDescription?: string | null
  thicknessAndColour?: string | null
  godownId: number
  godownName?: string | null
  qtyOnHand: number
  qtyReserved: number
  qtyBlocked: number
  qtyDamaged: number
  qtyFree: number
  avgRate?: number | null
  unit: string
}

export interface StockAdjustmentLineDto { productId: number; productCode?: string | null; bookQty: number; actualQty: number; difference: number }
export interface StockAdjustmentDto {
  stockAdjustmentId: number; adjustmentNo?: string | null; godownId: number; godownName?: string | null
  adjustmentDate: string; status: string; reason?: string | null; lines: StockAdjustmentLineDto[]
}
export interface CreateStockAdjustmentRequest { godownId: number; reason?: string; lines: { productId: number; actualQty: number }[] }

export interface StockTransferLineDto { productId: number; productCode?: string | null; qty: number }
export interface StockTransferDto {
  stockTransferId: number; transferNo?: string | null; fromGodownId: number; fromGodownName?: string | null
  toGodownId: number; toGodownName?: string | null; transferDate: string; status: string; lines: StockTransferLineDto[]
}
export interface CreateStockTransferRequest { fromGodownId: number; toGodownId: number; lines: { productId: number; qty: number }[] }

export interface OffcutDto {
  offcutId: number; offcutCode?: string | null; productId: number; productCode?: string | null
  lengthMm: number; widthMm: number; areaSqft: number; godownId: number; godownName?: string | null; status: string; createdOn: string
}
export interface CreateOffcutRequest { productId: number; lengthMm: number; widthMm: number; godownId: number }

// ---------- Purchase ----------
export interface SupplierDto {
  supplierId: number; code: string; name: string; gstin?: string | null; phone?: string | null; mobile?: string | null
  email?: string | null; address?: string | null; stateName?: string | null; creditPeriodDays: number; isActive: boolean
}

export interface PurchaseOrderLineDto { productId: number; productCode?: string | null; qty: number; rate: number; value: number }
/** A GRN raised against this order — a PO can have more than one (partial receipts). */
export interface PoGrnRefDto { grnId: number; grnNo?: string | null; grnDate: string; status: string }
export interface PurchaseOrderDto {
  purchaseOrderId: number; poNo?: string | null; supplierId: number; supplierName?: string | null
  poDate: string; status: string; totalValue: number
  /** Count of GRNs already posted against this order — view/print only, no edit screen exists. */
  grnCount: number
  /** Populated by GET /purchase-orders/{id} only; empty in the list. */
  grns?: PoGrnRefDto[]
  lines: PurchaseOrderLineDto[]
  /** True while no GRN has been posted against this order yet. */
  canDelete: boolean
}
export interface CreatePurchaseOrderRequest { supplierId: number; lines: { productId: number; qty: number; rate: number }[] }

export interface GrnLineDto { productId: number; productCode?: string | null; receivedQty: number; acceptedQty: number; rejectedQty: number; brokenQty: number; batchNo?: string | null }
export interface GrnDto {
  grnId: number; grnNo?: string | null; purchaseOrderId: number; poNo?: string | null; supplierName?: string | null
  grnDate: string; status: string
  /** Set once a purchase invoice has been booked against this GRN — no GRN edit screen exists;
   * this is the forward reference the view page shows. */
  purchaseInvoiceId?: number | null; purchaseInvoiceNo?: string | null
  lines: GrnLineDto[]
  /** True while no purchase invoice has been booked against this GRN yet. */
  canDelete: boolean
}
export interface CreateGrnRequest { purchaseOrderId: number; lines: GrnLineDto[] }

export interface PurchaseInvoiceDto {
  purchaseInvoiceId: number; invoiceNo?: string | null; grnId: number; grnNo?: string | null; supplierName?: string | null
  supplierInvoiceNo?: string | null; invoiceDate: string; totalValue: number; status: string
  /** Nothing is ever generated against a purchase invoice, so this is always true. */
  canDelete: boolean
}
export interface CreatePurchaseInvoiceRequest { grnId: number; supplierInvoiceNo?: string; totalValue: number }
/** Fixes a wrong entry on an already-booked purchase invoice — unlike the GRN and purchase
 * order it derives from, this document can always be edited. */
export interface UpdatePurchaseInvoiceRequest { supplierInvoiceNo?: string; invoiceDate?: string; totalValue: number }

// ---------- Sales: Quotation / Order ----------
/** @deprecated Superseded by DimensionUnit; kept only for older stored rows. */
export type SizeUnit = 'MM' | 'Inch' | 'Meter'
// Imported (not just re-exported) so the names are usable in this file too.
import type { DimensionUnit, RateUnit, CalculationMethod } from './quotationCalc'
export type { DimensionUnit, RateUnit, CalculationMethod }
/** Rounding step, in inches, that a chargeable dimension is rounded up to. */
export type ChargeType = 3 | 6

export interface QuotationLineDto {
  /** Null for charge-only lines (van, cutter, previous dues). */
  productId?: number | null
  productCode?: string | null; productDescription?: string | null
  description?: string | null

  // Entered by the operator.
  length: number; width: number; dimensionUnit: DimensionUnit
  qty: number; rate: number; rateUnit: RateUnit
  applyThickness: boolean; chargeRoundingInch: number
  gstPct: number; discountPct: number
  manualArea?: number | null; manualBasicAmount?: number | null

  // Server-calculated (see server/Data/QuotationCalculator.cs) — never sent by the client.
  thicknessMm?: number | null
  lengthInch: number; widthInch: number
  chargeLengthInch: number; chargeWidthInch: number
  calculatedArea: number; area: number; areaUnit: string
  effectiveRate: number
  calculatedBasicAmount: number; basicAmount: number
  discountAmount: number; taxableAmount: number
  gstAmount: number; amount: number
  calculationMethod: CalculationMethod
  isAreaManualOverride: boolean; isAmountManualOverride: boolean
}
export interface QuotationDto {
  quotationId: number; quotationNo?: string | null; customerId: number; customerName?: string | null
  /** Returned by GET /quotations/{id} only (the print view needs them); absent in the list. */
  customerType?: CustomerType | null; customerAddress?: string | null; customerGstin?: string | null
  customerMobile?: string | null; customerStateName?: string | null
  quotationDate: string; validUntil?: string | null; status: string; totalValue: number
  /** True while no sales order has been generated against this quotation. */
  canDelete: boolean
  lines: QuotationLineDto[]
}
export interface NewCustomerRequest {
  code?: string; name: string; customerType: CustomerType
  gstin?: string; mobile?: string; email?: string; billingAddress?: string
  stateCode?: string; stateName?: string
}
/** What the client sends per line. Amounts are deliberately absent — the server prices it. */
export interface CreateQuotationLine {
  productId?: number | null
  description?: string | null
  length: number; width: number; dimensionUnit: DimensionUnit
  qty: number; rate: number; rateUnit: RateUnit
  applyThickness: boolean; chargeRoundingInch: number
  gstPct: number; discountPct: number
  /** Defaults from the product master when omitted; editable per line. */
  thicknessMm?: number | null
  manualArea?: number | null
  manualBasicAmount?: number | null
}
export interface CreateQuotationRequest {
  /** 0 when creating the customer inline via newCustomer. */
  customerId: number
  newCustomer?: NewCustomerRequest
  validUntil?: string
  lines: CreateQuotationLine[]
}
/** PUT /quotations/{id}. No inline new-customer here — an edit targets an existing quotation. */
export interface UpdateQuotationRequest {
  customerId: number
  validUntil?: string
  lines: CreateQuotationLine[]
}

/** Same shape as QuotationLineDto — an order carries the sizing and GST, not just qty x rate. */
export interface SalesOrderLineDto {
  productId?: number | null
  productCode?: string | null; productDescription?: string | null
  description?: string | null

  length: number; width: number; dimensionUnit: DimensionUnit
  qty: number; rate: number; rateUnit: RateUnit
  applyThickness: boolean; chargeRoundingInch: number
  gstPct: number; discountPct: number
  thicknessMm?: number | null
  manualArea?: number | null; manualBasicAmount?: number | null

  lengthInch: number; widthInch: number
  chargeLengthInch: number; chargeWidthInch: number
  calculatedArea: number; area: number; areaUnit: string
  effectiveRate: number
  calculatedBasicAmount: number; basicAmount: number
  discountAmount: number; taxableAmount: number
  gstAmount: number; amount: number
  /** Legacy column, equal to basicAmount. */
  value: number
  calculationMethod: CalculationMethod
  isAreaManualOverride: boolean; isAmountManualOverride: boolean
}
export interface SalesOrderDto {
  salesOrderId: number; orderNo?: string | null; customerId: number; customerName?: string | null
  quotationId?: number | null; quotationNo?: string | null
  basicValue: number; gstValue: number
  /** Set once a (non-cancelled) invoice has been generated against this order — the order is
   * then locked from being invoiced again, mirroring quotationId on the order itself. */
  invoiceId?: number | null; invoiceNo?: string | null
  /** Returned by GET /sales-orders/{id} only (the print view needs them); absent in the list. */
  customerType?: CustomerType | null; customerAddress?: string | null; customerGstin?: string | null
  customerMobile?: string | null; customerStateName?: string | null
  orderDate: string; status: string; totalValue: number
  /** True while no invoice (and no cutting plan / work order) has been raised against this order. */
  canDelete: boolean
  lines: SalesOrderLineDto[]
}
/** Identical to a quotation line — the server prices both with the same engine. */
export type CreateSalesOrderLine = CreateQuotationLine
export interface CreateSalesOrderRequest {
  customerId: number
  quotationId?: number
  lines: CreateSalesOrderLine[]
}

// ---------- Cutting ----------
export interface CuttingPlanLineDto { productId: number; productCode?: string | null; requiredLengthMm: number; requiredWidthMm: number; qty: number; status: string }
export interface CuttingPlanDto {
  cuttingPlanId: number; planNo?: string | null; salesOrderId?: number | null; orderNo?: string | null
  planDate: string; status: string; totalSheets: number; yieldPct?: number | null; wasteAreaSqft?: number | null; lines: CuttingPlanLineDto[]
  /** Nothing is ever generated against a cutting plan, so this is always true. */
  canDelete: boolean
}
export interface CreateCuttingPlanRequest { salesOrderId?: number; lines: { productId: number; requiredLengthMm: number; requiredWidthMm: number; qty: number }[] }

// ---------- Production ----------
export interface WorkOrderDto {
  workOrderId: number; workOrderNo?: string | null; salesOrderId?: number | null; orderNo?: string | null
  status: string; createdOn: string; jobCardCount: number
  /** True while no job card has been raised against this work order yet. */
  canDelete: boolean
}
export interface CreateWorkOrderRequest { salesOrderId?: number }

export interface JobCardDto {
  jobCardId: number; jobCardNo?: string | null; workOrderId: number; workOrderNo?: string | null
  productId: number; productCode?: string | null; qtyIn: number; qtyPassed: number; qtyBroken: number; qtyRejected: number; status: string
  /** Nothing is ever generated against a job card, so this is always true. */
  canDelete: boolean
}
export interface CreateJobCardRequest { workOrderId: number; productId: number; qtyIn: number }
export interface FinishJobCardRequest { qtyPassed: number; qtyBroken: number; qtyRejected: number }

export interface FurnaceBatchDto {
  furnaceBatchId: number; batchNo?: string | null; thicknessMm: number; batchDate: string
  utilisationPct?: number | null; estElectricityCost?: number | null; status: string
  /** Nothing is ever generated against a furnace batch, so this is always true. */
  canDelete: boolean
}
export interface CreateFurnaceBatchRequest { thicknessMm: number; utilisationPct: number }

// ---------- Finance ----------
export interface VoucherDto {
  voucherId: number; voucherNo?: string | null; voucherType: string; voucherDate: string
  customerId?: number | null; customerName?: string | null; supplierId?: number | null; supplierName?: string | null
  /** Set when this receipt settles a specific sales invoice — the "Payment Transaction" screen's invoice link. */
  invoiceId?: number | null; invoiceNo?: string | null
  /** Advance or Full — informational only, not enforced against the invoice balance. */
  paymentType?: string | null
  /** Cheque no. / UPI transaction ref, as applicable to mode. */
  referenceNo?: string | null
  amount: number; mode: string; narration?: string | null
  modifiedOn?: string | null
  /** Set when this voucher was recorded as one share of a split payment — every voucher sharing
   * this id was created together and adds up to one total. Null for an ordinary single voucher. */
  splitGroupId?: string | null
  /** Always true — nothing is ever generated from a voucher, so it's always deletable (subject
   * to permission), same as it's already editable for a wrong entry. */
  canDelete: boolean
}
export interface CreateVoucherRequest {
  voucherType: string; customerId?: number; supplierId?: number; invoiceId?: number
  paymentType?: string; referenceNo?: string; voucherDate?: string
  amount: number; mode: string; narration?: string
}
export interface UpdateVoucherRequest {
  customerId?: number; supplierId?: number; invoiceId?: number
  paymentType?: string; referenceNo?: string; voucherDate?: string
  amount: number; mode: string; narration?: string
}
/** One method's share of a split payment — the amounts across all splits must sum to the total
 * the operator intends to record. */
export interface VoucherSplitLineRequest { mode: string; amount: number; referenceNo?: string }
export interface CreateVoucherSplitRequest {
  voucherType: string; customerId?: number; supplierId?: number; invoiceId?: number
  paymentType?: string; voucherDate?: string; narration?: string
  splits: VoucherSplitLineRequest[]
}

export interface ExpenseDto {
  expenseId: number; expenseNo?: string | null; expenseDate: string; category: string; amount: number
  paidTo?: string | null; narration?: string | null; status: string
}
export interface CreateExpenseRequest { category: string; amount: number; paidTo?: string; narration?: string }

export interface CustomerOutstandingDto {
  customerId: number; customerName: string; totalInvoiced: number; totalReceived: number; outstanding: number; creditLimit: number
}

// ---------- CRM ----------
export interface ComplaintDto {
  complaintId: number; complaintNo?: string | null; customerId: number; customerName?: string | null
  invoiceId?: number | null; invoiceNo?: string | null; subject: string; description?: string | null
  category: string; status: string; assignedTo?: string | null; targetDate?: string | null; resolution?: string | null; createdOn: string
  /** Nothing is ever generated against a complaint, so this is always true. */
  canDelete: boolean
}
export interface CreateComplaintRequest { customerId: number; invoiceId?: number; subject: string; description?: string; category: string; assignedTo?: string; targetDate?: string }

// ---------- HR ----------
export interface EmployeeDto {
  employeeId: number; code: string; fullName: string; designation?: string | null; department?: string | null
  phone?: string | null; email?: string | null; dateOfJoining?: string | null; dateOfLeaving?: string | null; isActive: boolean
}
export interface CreateEmployeeRequest { code: string; fullName: string; designation?: string; department?: string; phone?: string; email?: string; dateOfJoining?: string }

export interface AttendanceDto { attendanceId: number; employeeId: number; employeeName?: string | null; attendanceDate: string; status: string; canDelete: boolean }
export interface MarkAttendanceRequest { employeeId: number; attendanceDate: string; status: string }

// ---------- Reports ----------
export interface StockSummaryReportRow { productId: number; productCode: string; description: string; qtyOnHand: number; qtyFree: number; avgRate?: number | null; stockValue: number }
export interface SalesRegisterRow { invoiceNo: string; invoiceDate: string; customerName: string; taxableValue: number; taxValue: number; totalValue: number }

export interface GodownStockSummaryRow {
  godownId: number; godownName?: string | null; productCode?: string | null; productDescription?: string | null
  qtyOnHand: number; qtyFree: number; unit?: string | null
}
/** Godown/Rack-wise detail — a rack's physical count set against that godown's own book quantity
 * for the same product, so a variance is visible directly. */
export interface RackStockDetailRow {
  godownId: number; godownName?: string | null; rackId: number; rackCode?: string | null
  productId: number; productCode?: string | null; productDescription?: string | null
  rackQty: number; godownBookQty: number; unit?: string | null
}

export interface CustomerTransactionRow {
  type: 'Sale' | 'Payment'; docNo?: string | null; docId: number; txnDate: string
  debit: number; credit: number; balance: number
}
export interface CustomerTransactionReport {
  customer: { customerId: number; name: string; mobile?: string | null; phone?: string | null }
  items: CustomerTransactionRow[]
  totalSales: number; totalPayments: number; balance: number
}
