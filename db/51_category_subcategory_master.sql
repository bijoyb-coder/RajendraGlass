-- Category Master and Sub-Category Master -- new standalone reference-data masters, following the
-- exact shape of the closest existing master (Master.Supplier: Code/Name/IsActive, no separate
-- Created/ModifiedBy columns -- audit trail goes through the existing Security.AuditLog mechanism
-- instead, same as Supplier/Customer/Godown).
--
-- The Category -> SubCategory relationship uses a surrogate SubCategoryId FK (matching every other
-- relationship in this schema, e.g. Sales.Quotation.CustomerId, Cutting.CuttingEntry.QuotationId --
-- nothing in this codebase uses a natural business code as an FK target). This is deliberate: it
-- means renaming a SubCategory's Code later can never orphan a Category (the link survives by Id,
-- not by the string), and every place Category is displayed re-joins to SubCategory for the current
-- Code/Name -- there is exactly one authoritative place a Sub-Category's name lives.
--
-- Master.Product.Category (a free-text NVARCHAR(100) column, see db/01_schema.sql) is a separate,
-- pre-existing, unrelated free-text field -- it is left untouched here; wiring Product to this new
-- normalized Category master is a larger follow-up, not part of this change.
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('Master.SubCategory') IS NULL
CREATE TABLE Master.SubCategory (
    SubCategoryId INT IDENTITY PRIMARY KEY,
    Code          NVARCHAR(40) NOT NULL UNIQUE,
    Name          NVARCHAR(200) NOT NULL,
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Master.Category') IS NULL
CREATE TABLE Master.Category (
    CategoryId    INT IDENTITY PRIMARY KEY,
    Code          NVARCHAR(40) NOT NULL UNIQUE,
    Name          NVARCHAR(200) NOT NULL,
    SubCategoryId INT NOT NULL FOREIGN KEY REFERENCES Master.SubCategory(SubCategoryId),
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Category_SubCategoryId')
    CREATE INDEX IX_Category_SubCategoryId ON Master.Category(SubCategoryId);
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'SubCategory.View')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('SubCategory.View', 'Masters', 'View sub-categories');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'SubCategory.Create')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('SubCategory.Create', 'Masters', 'Create/edit sub-categories');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'SubCategory.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('SubCategory.Delete', 'Masters', 'Delete a sub-category');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Category.View')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Category.View', 'Masters', 'View categories');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Category.Create')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Category.Create', 'Masters', 'Create/edit categories');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Category.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Category.Delete', 'Masters', 'Delete a category');
GO

-- Owner / Administrator only, matching every other standalone-master addition in this codebase
-- (StockOpening.Create, StockAdjustment.Create, ...) -- no other seeded role holds those either.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('SubCategory.View', 'SubCategory.Create', 'SubCategory.Delete', 'Category.View', 'Category.Create', 'Category.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
