-- Stock Opening: capture the physical Area (SQM) of each line as a user-entered figure, alongside
-- the existing Qty. Unlike a computed conversion, this is entered directly by the person recording
-- the opening balance (e.g. from a physical measurement or paper record), so it is stored as its
-- own column rather than derived from Qty/StockUnit at read time.
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('Inventory.StockOpeningLine', 'AreaSqm') IS NULL
    ALTER TABLE Inventory.StockOpeningLine ADD AreaSqm DECIMAL(14,3) NOT NULL CONSTRAINT DF_StockOpeningLine_AreaSqm DEFAULT (0);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_StockOpeningLine_AreaSqmPositive')
    ALTER TABLE Inventory.StockOpeningLine ADD CONSTRAINT CK_StockOpeningLine_AreaSqmPositive CHECK (AreaSqm >= 0);
GO
