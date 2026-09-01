-- One-time operational script (not a schema migration, not auto-applied): wipes every
-- transactional record so the business can start fresh, while keeping Product, Customer,
-- Supplier and all other master/user/setup data untouched.
--
-- Cleared: Purchase Orders, GRNs, Purchase Invoices (+ lines/charges/e-way bills), all Stock
-- records (StockBalance, StockMovement, StockAdjustment, StockTransfer, StockOpening, Offcut,
-- RackStock), Quotations, Sales Orders, Sales Invoices incl. Counter Billing (+ lines/split
-- payments), Waybills, Cutting Entries, Vouchers, plus the disposable e-invoice/e-way-bill
-- gateway log and idempotency-key cache (both reference doc IDs that no longer exist).
--
-- Kept: Master.Product, Master.Customer, Master.Supplier, Master.Transporter, Master.Vehicle,
-- Company.*, Security.*, and every other module not listed above (Production, CRM.Complaint,
-- Finance.Expense, Cutting.CuttingPlan) -- none of those were in scope for this reset.
--
-- Run manually: sqlcmd -S <server> -d RajendraGlassDb -U sa -P <password> -I -i reset_to_fresh_start.sql
USE RajendraGlassDb;
GO
SET QUOTED_IDENTIFIER ON;
GO

BEGIN TRANSACTION;

-- Cutting Entry (references Quotation/QuotationLine)
DELETE FROM Cutting.CuttingEntryLine;
DELETE FROM Cutting.CuttingEntry;

-- Purchase: PurchaseInvoice -> Grn -> PurchaseOrder, plus EwayBill (nulled out of PurchaseInvoice
-- before either side is deleted) and the invoice-level charge lines.
UPDATE Purchase.PurchaseInvoice SET EwayBillId = NULL;
DELETE FROM Purchase.PurchaseInvoiceCharge;
DELETE FROM Purchase.PurchaseInvoiceLine;
DELETE FROM Purchase.PurchaseInvoice;
DELETE FROM Purchase.EwayBill;
DELETE FROM Purchase.GrnLine;
DELETE FROM Purchase.Grn;
DELETE FROM Purchase.PurchaseOrderLine;
DELETE FROM Purchase.PurchaseOrder;

-- Sales: Voucher/Waybill/InvoicePayment/InvoiceLine -> Invoice -> SalesOrder -> Quotation
DELETE FROM Finance.Voucher;
DELETE FROM Dispatch.Waybill;
DELETE FROM Sales.InvoicePayment;
DELETE FROM Sales.InvoiceLine;
DELETE FROM Sales.Invoice;
DELETE FROM Sales.SalesOrderLine;
DELETE FROM Sales.SalesOrder;
DELETE FROM Sales.QuotationLine;
DELETE FROM Sales.Quotation;

-- Stock: every stock-affecting record, back to a clean slate (StockBalance rows removed
-- entirely, not reset to an opening figure -- there is no opening balance left to reset to).
DELETE FROM Inventory.StockOpeningLine;
DELETE FROM Inventory.StockOpening;
DELETE FROM Inventory.StockAdjustmentLine;
DELETE FROM Inventory.StockAdjustment;
DELETE FROM Inventory.StockTransferLine;
DELETE FROM Inventory.StockTransfer;
DELETE FROM Inventory.Offcut;
DELETE FROM Inventory.StockMovement;
DELETE FROM Inventory.StockBalance;
DELETE FROM Inventory.RackStock;

-- Disposable caches/logs tied to doc IDs that no longer exist.
DELETE FROM Integration.GatewayLog;
DELETE FROM Security.IdempotencyKey;

-- Every doc-numbering series touched above starts again from 1.
UPDATE Company.DocSeries SET NextNumber = 1
WHERE DocType IN (
    'PurchaseOrder', 'Grn', 'PurchaseInvoice',
    'Quotation', 'SalesOrder', 'Invoice', 'CounterInvoice', 'Waybill',
    'CuttingEntry', 'StockAdjustment', 'StockTransfer', 'StockOpening', 'Offcut', 'Voucher'
);

COMMIT TRANSACTION;
GO

PRINT 'Reset complete -- Product, Customer, and Supplier master data kept; all transactional data cleared.';
GO
