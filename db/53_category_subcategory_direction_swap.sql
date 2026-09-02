-- Inverts the Category/SubCategory parent-child direction, per explicit user decision.
--
-- db/51_category_subcategory_master.sql built SubCategory as the PARENT (one SubCategory, e.g.
-- "GLS - Glass", maps to many Categories, e.g. "GLS001 - Clear Glass"). A later task specified the
-- opposite -- Category as the PARENT, SubCategory as the CHILD, with Product's Category/Sub-
-- Category picker cascading Category -> SubCategory. Asked directly, the user confirmed: invert
-- the schema to match the new direction, not the other way round.
--
-- This is a genuine data migration, not just a DDL change -- Category and SubCategory swap roles,
-- so their rows swap tables too:
--   old Master.SubCategory row (GLS/MIR/ACC/HWD) -> new Master.Category row (same Code/Name/IsActive)
--   old Master.Category row (GLS001/GLS002/... )  -> new Master.SubCategory row, CategoryId pointing
--                                                    at its old parent's new Category row
-- Master.Product.CategoryId (added in db/52_product_category_link.sql) pointed at the OLD Category
-- table (the child side, e.g. GLS001); after the swap that product must point at the NEW
-- SubCategory row for GLS001 (via the new SubCategoryId column added here) and the NEW Category
-- row for its parent (GLS/Glass).
--
-- Exact live data at the time this migration was written (captured immediately before writing it,
-- so the explicit re-seed below reproduces it precisely -- see the SELECTs this comment block
-- summarises):
--   old SubCategory: 1=GLS/Glass, 2=MIR/Mirror, 3=ACC/Accessories, 4=HWD/Hardware
--   old Category: 2=GLS001/Clear Glass(->old SC 1), 3=GLS002/Tinted Glass(->1), 4=GLS003/Toughened Glass(->1),
--                 5=MIR001/Plain Mirror(->2), 6=ACC001/Glass Accessories(->3)
--   old Product.CategoryId: ProductId 47 (PROD/FROSTED/3.2) -> old CategoryId 2 (GLS001)
SET QUOTED_IDENTIFIER ON;
GO

BEGIN TRANSACTION;

-- ---------- 1. Drop the FKs that point at the tables being restructured ----------
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Category__SubCat__7093AB15')
    ALTER TABLE Master.Category DROP CONSTRAINT FK__Category__SubCat__7093AB15;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK__Product__Categor__7C055DC1')
    ALTER TABLE Master.Product DROP CONSTRAINT FK__Product__Categor__7C055DC1;
GO

-- ---------- 2. Rename the old tables out of the way ----------
EXEC sp_rename 'Master.Category', 'Category_Old';
EXEC sp_rename 'Master.SubCategory', 'SubCategory_Old';
GO

-- ---------- 3. Create the new-shape tables: Category is now the parent ----------
CREATE TABLE Master.Category (
    CategoryId INT IDENTITY PRIMARY KEY,
    Code       NVARCHAR(40) NOT NULL UNIQUE,
    Name       NVARCHAR(200) NOT NULL,
    IsActive   BIT NOT NULL DEFAULT 1,
    CreatedOn  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE Master.SubCategory (
    SubCategoryId INT IDENTITY PRIMARY KEY,
    Code          NVARCHAR(40) NOT NULL UNIQUE,
    Name          NVARCHAR(200) NOT NULL,
    CategoryId    INT NOT NULL FOREIGN KEY REFERENCES Master.Category(CategoryId),
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX IX_SubCategory_CategoryId ON Master.SubCategory(CategoryId);
GO

-- ---------- 4. Migrate the data: old SubCategory rows -> new Category rows, preserving Id ----------
SET IDENTITY_INSERT Master.Category ON;
INSERT INTO Master.Category (CategoryId, Code, Name, IsActive, CreatedOn)
    SELECT SubCategoryId, Code, Name, IsActive, CreatedOn FROM Master.SubCategory_Old;
SET IDENTITY_INSERT Master.Category OFF;
GO

-- old Category rows -> new SubCategory rows (fresh Ids; CategoryId = the old row's SubCategoryId,
-- which is now a valid Master.Category.CategoryId thanks to the identity-preserving insert above)
INSERT INTO Master.SubCategory (Code, Name, CategoryId, IsActive, CreatedOn)
    SELECT Code, Name, SubCategoryId, IsActive, CreatedOn FROM Master.Category_Old ORDER BY CategoryId;
GO

-- ---------- 5. Re-point Master.Product at the new tables ----------
IF COL_LENGTH('Master.Product', 'SubCategoryId') IS NULL
    ALTER TABLE Master.Product ADD SubCategoryId INT NULL;
GO

-- Every product's old CategoryId pointed at an old Category row (now a SubCategory row with the
-- same Code) -- resolve by Code, not by Id, since SubCategory got fresh Ids in step 4.
UPDATE p
    SET p.SubCategoryId = newsc.SubCategoryId,
        p.CategoryId = newsc.CategoryId
FROM Master.Product p
JOIN Master.Category_Old oldc ON oldc.CategoryId = p.CategoryId
JOIN Master.SubCategory newsc ON newsc.Code = oldc.Code;
GO

ALTER TABLE Master.Product ADD CONSTRAINT FK_Product_Category FOREIGN KEY (CategoryId) REFERENCES Master.Category(CategoryId);
ALTER TABLE Master.Product ADD CONSTRAINT FK_Product_SubCategory FOREIGN KEY (SubCategoryId) REFERENCES Master.SubCategory(SubCategoryId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Product_SubCategoryId')
    CREATE INDEX IX_Product_SubCategoryId ON Master.Product(SubCategoryId);
GO

-- ---------- 6. Drop the old tables now that everything has been migrated ----------
DROP TABLE Master.Category_Old;
DROP TABLE Master.SubCategory_Old;
GO

COMMIT TRANSACTION;
GO

PRINT 'Category/SubCategory direction swap complete.';
GO
