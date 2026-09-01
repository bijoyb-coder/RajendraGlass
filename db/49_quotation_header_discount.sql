-- Quotation Entry: Discount moves from item-wise (Sales.QuotationLine.DiscountPct/DiscountAmount,
-- still present but forced to 0 for every quotation line going forward -- see
-- QuotationsController.Create/Update, the same pattern already used for GstPct) to one
-- document-level figure applied to the whole quotation's basic amount, right before Round Off /
-- Total. DiscountType picks whether DiscountValue is read as a percentage or a flat rupee amount;
-- DiscountAmount is the resolved rupee figure, stored so the list/print views don't need to
-- recompute it.
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('Sales.Quotation', 'DiscountType') IS NULL
    ALTER TABLE Sales.Quotation ADD DiscountType NVARCHAR(10) NOT NULL CONSTRAINT DF_Quotation_DiscountType DEFAULT 'Percent';
GO

IF COL_LENGTH('Sales.Quotation', 'DiscountValue') IS NULL
    ALTER TABLE Sales.Quotation ADD DiscountValue DECIMAL(14,2) NOT NULL CONSTRAINT DF_Quotation_DiscountValue DEFAULT 0;
GO

IF COL_LENGTH('Sales.Quotation', 'DiscountAmount') IS NULL
    ALTER TABLE Sales.Quotation ADD DiscountAmount DECIMAL(14,2) NOT NULL CONSTRAINT DF_Quotation_DiscountAmount DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Quotation_DiscountType')
    ALTER TABLE Sales.Quotation ADD CONSTRAINT CK_Quotation_DiscountType CHECK (DiscountType IN ('Percent', 'Amount'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Quotation_DiscountValueNonNegative')
    ALTER TABLE Sales.Quotation ADD CONSTRAINT CK_Quotation_DiscountValueNonNegative CHECK (DiscountValue >= 0);
GO
