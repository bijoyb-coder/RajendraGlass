-- The client-side code standardised the metric unit's wire value on "METER" (not "METRE").
-- Brings the server and any already-saved lines in line with it, so an existing metre-priced
-- quotation/order doesn't silently mis-price when re-opened (the unit would go unrecognised
-- and fall through to "already in inches" — see DimensionUnits.InchesPer's default branch).
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

USE RajendraGlassDb;
GO

UPDATE Sales.QuotationLine SET DimensionUnit = 'METER' WHERE DimensionUnit = 'METRE';
GO
UPDATE Sales.SalesOrderLine SET DimensionUnit = 'METER' WHERE DimensionUnit = 'METRE';
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_QuotationLine_DimUnit')
    ALTER TABLE Sales.QuotationLine DROP CONSTRAINT DF_QuotationLine_DimUnit;
GO
ALTER TABLE Sales.QuotationLine ADD CONSTRAINT DF_QuotationLine_DimUnit DEFAULT 'METER' FOR DimensionUnit;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_SalesOrderLine_DimUnit')
    ALTER TABLE Sales.SalesOrderLine DROP CONSTRAINT DF_SalesOrderLine_DimUnit;
GO
ALTER TABLE Sales.SalesOrderLine ADD CONSTRAINT DF_SalesOrderLine_DimUnit DEFAULT 'METER' FOR DimensionUnit;
GO
