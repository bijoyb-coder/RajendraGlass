-- Quotation Entry: item-wise, optional Hole/B-Hole/Cutout/B-Cutout quantities per line, priced at
-- one rate per type entered once for the whole document (not per line) -- Amount = (sum of that
-- type's qty across every line) x its rate, added into the quotation's basic amount before the
-- existing round-to-nearest-rupee step. See server/Controllers/QuotationsController.cs.
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('Sales.QuotationLine', 'HoleQty') IS NULL
    ALTER TABLE Sales.QuotationLine ADD HoleQty DECIMAL(14,3) NOT NULL CONSTRAINT DF_QuotationLine_HoleQty DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'BHoleQty') IS NULL
    ALTER TABLE Sales.QuotationLine ADD BHoleQty DECIMAL(14,3) NOT NULL CONSTRAINT DF_QuotationLine_BHoleQty DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'CutoutQty') IS NULL
    ALTER TABLE Sales.QuotationLine ADD CutoutQty DECIMAL(14,3) NOT NULL CONSTRAINT DF_QuotationLine_CutoutQty DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'BCutoutQty') IS NULL
    ALTER TABLE Sales.QuotationLine ADD BCutoutQty DECIMAL(14,3) NOT NULL CONSTRAINT DF_QuotationLine_BCutoutQty DEFAULT 0;
GO
IF OBJECT_ID('CK_QuotationLine_HolesCutoutQtyNonNegative', 'C') IS NULL
    ALTER TABLE Sales.QuotationLine ADD CONSTRAINT CK_QuotationLine_HolesCutoutQtyNonNegative
        CHECK (HoleQty >= 0 AND BHoleQty >= 0 AND CutoutQty >= 0 AND BCutoutQty >= 0);
GO

IF COL_LENGTH('Sales.Quotation', 'HoleRate') IS NULL
    ALTER TABLE Sales.Quotation ADD HoleRate DECIMAL(14,2) NOT NULL CONSTRAINT DF_Quotation_HoleRate DEFAULT 0;
GO
IF COL_LENGTH('Sales.Quotation', 'BHoleRate') IS NULL
    ALTER TABLE Sales.Quotation ADD BHoleRate DECIMAL(14,2) NOT NULL CONSTRAINT DF_Quotation_BHoleRate DEFAULT 0;
GO
IF COL_LENGTH('Sales.Quotation', 'CutoutRate') IS NULL
    ALTER TABLE Sales.Quotation ADD CutoutRate DECIMAL(14,2) NOT NULL CONSTRAINT DF_Quotation_CutoutRate DEFAULT 0;
GO
IF COL_LENGTH('Sales.Quotation', 'BCutoutRate') IS NULL
    ALTER TABLE Sales.Quotation ADD BCutoutRate DECIMAL(14,2) NOT NULL CONSTRAINT DF_Quotation_BCutoutRate DEFAULT 0;
GO
IF OBJECT_ID('CK_Quotation_HolesCutoutRateNonNegative', 'C') IS NULL
    ALTER TABLE Sales.Quotation ADD CONSTRAINT CK_Quotation_HolesCutoutRateNonNegative
        CHECK (HoleRate >= 0 AND BHoleRate >= 0 AND CutoutRate >= 0 AND BCutoutRate >= 0);
GO
