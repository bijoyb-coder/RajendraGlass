-- Adds Meter as a third size-entry unit on quotation lines (alongside MM and Inch).
-- The entered value is kept in the column matching UnitOfMeasure, exactly as MM already
-- works; everything downstream (chargeable inches, sqft, amounts) is derived from inches.
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

USE RajendraGlassDb;
GO

IF COL_LENGTH('Sales.QuotationLine', 'HeightMeter') IS NULL
    ALTER TABLE Sales.QuotationLine ADD HeightMeter DECIMAL(18, 4) NULL;
GO

IF COL_LENGTH('Sales.QuotationLine', 'WidthMeter') IS NULL
    ALTER TABLE Sales.QuotationLine ADD WidthMeter DECIMAL(18, 4) NULL;
GO
