-- Wires Master.Product to the new Category Master (see db/51_category_subcategory_master.sql).
-- Master.Product.Category (a free-text NVARCHAR(100) column, db/01_schema.sql) predates the new
-- master and is NOT touched or migrated here -- no automatic text-to-Category matching is
-- attempted (existing values like "TOUGHENED"/"CORE"/"MIRROR GLASS" don't reliably map onto the
-- new normalized Category codes, and a wrong guess would be worse than no guess). The legacy
-- column stays exactly as it is, still returned by the API, and the UI falls back to showing it
-- for any product that hasn't been assigned a real Category yet -- nothing existing is destroyed
-- or hidden. Going forward, the product form uses the new CategoryId (database-driven dropdown)
-- instead of free text.
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('Master.Product', 'CategoryId') IS NULL
    ALTER TABLE Master.Product ADD CategoryId INT NULL FOREIGN KEY REFERENCES Master.Category(CategoryId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Product_CategoryId')
    CREATE INDEX IX_Product_CategoryId ON Master.Product(CategoryId);
GO
