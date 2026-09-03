-- Supports the redesigned Quotation Entry screen (two-stage item-entry-form + added-items list,
-- per the user-supplied mockup) without touching any existing calculation rule -- every new
-- column here is a genuinely new, additive charge/field the mockup introduces that had no prior
-- equivalent anywhere in the schema (confirmed by inspection before adding these: neither
-- "Hardware" nor "Transport" existed as a pricing concept, and Quotations deliberately carried no
-- tax at all -- see db/45_quotation_no_gst_roundoff_toggle.sql and
-- QuotationsController.Create's own comment "Quotations don't carry GST... enforced here, not
-- just hidden client-side"). Sales Order is untouched -- it keeps its existing SalesLineGrid UI
-- and none of these new columns.
--
-- Per-item (Sales.QuotationLine): Hardware/Transport/Other Charges are flat amounts added into
-- that line's own Basic/Final Amount (QuotationCalculator.Calculate now sums them in), mirroring
-- the mockup's per-item "Other Charges (Rs.)" panel. Selection is a free-text field on the Cutting
-- tab with no defined calculation role -- carried through as-is, purely descriptive.
--
-- Document-level (Sales.Quotation): TermsConditions/Notes are free text. OtherChargesAmount is a
-- flat document-level charge (the mockup's own "Other Charges (+)" in the Charges & Discount
-- panel, distinct from the per-item Hardware/Transport/Other Charges above). TaxPct/TaxAmount add
-- a genuinely new, Quotation-specific document-level tax, computed the same way document-level
-- Discount already is (see db/49_quotation_header_discount.sql) -- against the subtotal after
-- discount, before Round Off -- deliberately NOT the per-line GstPct/GstAmount columns, which stay
-- forced to zero for every Quotation line exactly as before.
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('Sales.QuotationLine', 'HardwareAmount') IS NULL
    ALTER TABLE Sales.QuotationLine ADD HardwareAmount DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'TransportAmount') IS NULL
    ALTER TABLE Sales.QuotationLine ADD TransportAmount DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'OtherChargesAmount') IS NULL
    ALTER TABLE Sales.QuotationLine ADD OtherChargesAmount DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'Selection') IS NULL
    ALTER TABLE Sales.QuotationLine ADD Selection NVARCHAR(200) NULL;
GO

IF COL_LENGTH('Sales.Quotation', 'TermsConditions') IS NULL
    ALTER TABLE Sales.Quotation ADD TermsConditions NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('Sales.Quotation', 'Notes') IS NULL
    ALTER TABLE Sales.Quotation ADD Notes NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('Sales.Quotation', 'OtherChargesAmount') IS NULL
    ALTER TABLE Sales.Quotation ADD OtherChargesAmount DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('Sales.Quotation', 'TaxPct') IS NULL
    ALTER TABLE Sales.Quotation ADD TaxPct DECIMAL(5,2) NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('Sales.Quotation', 'TaxAmount') IS NULL
    ALTER TABLE Sales.Quotation ADD TaxAmount DECIMAL(14,2) NOT NULL DEFAULT 0;
GO

PRINT 'Quotation Entry redesign columns added.';
GO
