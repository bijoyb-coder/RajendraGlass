-- Purchase Invoice: unified line format (one column set for Local and Inter-State alike) plus a
-- flexible, ordered list of header-level charges (Admin/Installation/Freight/Insurance/Energy/...),
-- each entered as a % of the running total so far or a flat amount -- exactly how real supplier
-- invoices (Dhandhania Industries, Abhishek Glass Industries) actually lay theirs out. GST moves
-- from per-line to header-level (computed once on the final assessable value); the line table's
-- IGST/Charges columns become an informational proportional split that ties out exactly to the
-- header figures (see PurchaseController.ApplyChargesAndTax).
SET QUOTED_IDENTIFIER ON;
GO

-- InsuranceValue now means "sum of every header charge amount" -- Insurance is just one possible
-- named charge among many now, not a fixed column of its own.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'InsuranceValue')
    EXEC sp_rename 'Purchase.PurchaseInvoice.InsuranceValue', 'ChargesTotal', 'COLUMN';
GO

-- The single invoice-wide GST rate driving the header CGST+SGST/IGST split. Nullable so existing
-- rows (which never had one -- GST used to be computed per line) don't need a backfill.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'GstPct')
    ALTER TABLE Purchase.PurchaseInvoice ADD GstPct DECIMAL(5,2) NULL;
GO

IF OBJECT_ID('Purchase.PurchaseInvoiceCharge') IS NULL
CREATE TABLE Purchase.PurchaseInvoiceCharge (
    PurchaseInvoiceChargeId INT IDENTITY PRIMARY KEY,
    PurchaseInvoiceId INT NOT NULL FOREIGN KEY REFERENCES Purchase.PurchaseInvoice(PurchaseInvoiceId),
    SeqNo   INT NOT NULL,          -- entry order -- matters, since a % charge's base is the running
                                    -- total *at that point*, not the raw Basic Amount
    Label   NVARCHAR(50) NOT NULL,
    Basis   NVARCHAR(10) NOT NULL CHECK (Basis IN ('Percent', 'Flat')),
    Value   DECIMAL(14,4) NOT NULL, -- the entered % (Basis='Percent') or the entered flat amount
    Amount  DECIMAL(14,2) NOT NULL  -- the computed/stored rupee amount either way
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PurchaseInvoiceCharge_Invoice')
    CREATE INDEX IX_PurchaseInvoiceCharge_Invoice ON Purchase.PurchaseInvoiceCharge (PurchaseInvoiceId);
GO

-- Area was DECIMAL(14,3), but real supplier papers print it to 4 decimal places (e.g. Dhandhania's
-- "2.4154 SQM") -- truncating to 3dp before pricing (BasicValue = Area x Rate) silently drifted the
-- line's value off the paper by a few paise. Widened so the entered figure is preserved exactly.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoiceLine') AND name = 'Area' AND scale = 3)
    ALTER TABLE Purchase.PurchaseInvoiceLine ALTER COLUMN Area DECIMAL(14,4) NOT NULL;
GO

-- Per-line Holes and Cutout charges -- also qty x rate, input directly off the paper, added into
-- that line's own total (which then feeds the header Basic Amount via the existing TaxableValue
-- column, repurposed to mean "this line's contribution to Basic Amount").
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoiceLine') AND name = 'HolesQty')
    ALTER TABLE Purchase.PurchaseInvoiceLine ADD HolesQty DECIMAL(10,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoiceLine') AND name = 'HolesRate')
    ALTER TABLE Purchase.PurchaseInvoiceLine ADD HolesRate DECIMAL(14,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoiceLine') AND name = 'HolesAmount')
    ALTER TABLE Purchase.PurchaseInvoiceLine ADD HolesAmount DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoiceLine') AND name = 'CutoutQty')
    ALTER TABLE Purchase.PurchaseInvoiceLine ADD CutoutQty DECIMAL(10,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoiceLine') AND name = 'CutoutRate')
    ALTER TABLE Purchase.PurchaseInvoiceLine ADD CutoutRate DECIMAL(14,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoiceLine') AND name = 'CutoutAmount')
    ALTER TABLE Purchase.PurchaseInvoiceLine ADD CutoutAmount DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
