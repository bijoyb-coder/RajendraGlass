-- Inventory unit tracking: Sales Invoice now deducts stock (previously only Counter Billing did),
-- offcut reuse/leftover-logging is automated for Counter Billing (which already carries piece
-- geometry), and offcut area reports in the product's own StockUnit instead of hardcoded sqft.
-- See server/Data/OffcutAllocation.cs for the logic this schema supports.
SET QUOTED_IDENTIFIER ON;
GO

-- Optional standard sheet size a product is normally stocked in. When set, drives both the
-- "≈ N sheets" report readout and the guillotine-leftover computation after cutting a fresh sheet.
-- Left NULL for products where a "standard sheet" doesn't apply -- those simply keep today's plain
-- area figure, with no offcut auto-logging.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Master.Product') AND name = 'StandardSheetLengthMm')
    ALTER TABLE Master.Product ADD StandardSheetLengthMm DECIMAL(10,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Master.Product') AND name = 'StandardSheetWidthMm')
    ALTER TABLE Master.Product ADD StandardSheetWidthMm DECIMAL(10,2) NULL;
GO

-- AreaSqft stays as-is (still useful as a common sortable/searchable figure for the best-fit
-- /offcuts/search query). AreaInStockUnit/StockUnit are computed in application code at write time
-- (a persisted computed column can't join Master.Product for the unit), so full-sheet stock and
-- offcut stock can be read side by side in one unit per product.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Inventory.Offcut') AND name = 'AreaInStockUnit')
    ALTER TABLE Inventory.Offcut ADD AreaInStockUnit DECIMAL(14,3) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Inventory.Offcut') AND name = 'StockUnit')
    ALTER TABLE Inventory.Offcut ADD StockUnit NVARCHAR(20) NULL;
GO

-- Traceability: which document produced this leftover, and which document later consumed it.
-- Both nullable -- most historical/manually-logged offcuts have neither. No recursive splitting in
-- this pass: once an offcut is matched to a sale, it's consumed in full (matches the existing
-- UseOffcut endpoint's own simple Available -> Used semantics).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Inventory.Offcut') AND name = 'SourceDocType')
    ALTER TABLE Inventory.Offcut ADD SourceDocType NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Inventory.Offcut') AND name = 'SourceDocId')
    ALTER TABLE Inventory.Offcut ADD SourceDocId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Inventory.Offcut') AND name = 'ConsumedByDocType')
    ALTER TABLE Inventory.Offcut ADD ConsumedByDocType NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Inventory.Offcut') AND name = 'ConsumedByDocId')
    ALTER TABLE Inventory.Offcut ADD ConsumedByDocId INT NULL;
GO
