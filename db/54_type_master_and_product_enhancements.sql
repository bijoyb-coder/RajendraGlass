-- Type Master (new standalone reference-data master) + Product Master enhancements: Category,
-- Sub-Category, Type and Opening Balance.
--
-- Type Master follows the same shape as every other standalone master in this codebase (see
-- db/51_category_subcategory_master.sql), except it has NO separate Code column -- the task spec
-- for this master is explicit that Type has exactly two fields, TypeID and TypeName, unlike
-- Category/SubCategory which both have Code+Name. Audit trail goes through the existing
-- Security.AuditLog mechanism, not CreatedBy/ModifiedBy columns, matching every other master here.
--
-- Product.CategoryId and Product.SubCategoryId already exist (db/52_product_category_link.sql,
-- db/53_category_subcategory_direction_swap.sql) -- this migration only adds TypeId and
-- OpeningBalance.
--
-- OpeningBalance is a master-reference figure only (matching, per line, what was actually posted
-- through Inventory.StockOpening -- see InventoryController.CreateStockOpening, the existing
-- opening-stock document feature). Product.OpeningBalance is never itself summed into
-- Inventory.StockBalance a second time: the real stock effect happens exactly once, through a
-- StockOpening document, exactly like every other opening-stock entry in this app. Current stock is
-- read from Inventory.StockBalance, not from this column -- see ProductsController.
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('Master.Type') IS NULL
CREATE TABLE Master.Type (
    TypeId    INT IDENTITY PRIMARY KEY,
    Name      NVARCHAR(200) NOT NULL UNIQUE,
    IsActive  BIT NOT NULL DEFAULT 1,
    CreatedOn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF COL_LENGTH('Master.Product', 'TypeId') IS NULL
    ALTER TABLE Master.Product ADD TypeId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Product_Type')
    ALTER TABLE Master.Product ADD CONSTRAINT FK_Product_Type FOREIGN KEY (TypeId) REFERENCES Master.Type(TypeId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Product_TypeId')
    CREATE INDEX IX_Product_TypeId ON Master.Product(TypeId);
GO

-- Opening Balance -- the quantity a product started with, in the product's own StockUnit, matching
-- the Inventory.StockOpeningLine.Qty precision (DECIMAL(14,3), not an integer -- glass stock is
-- routinely fractional, e.g. sqm/sqft). NULL means "no opening balance recorded" (most existing
-- products), distinct from 0.
IF COL_LENGTH('Master.Product', 'OpeningBalance') IS NULL
    ALTER TABLE Master.Product ADD OpeningBalance DECIMAL(14,3) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Type.View')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Type.View', 'Masters', 'View types');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Type.Create')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Type.Create', 'Masters', 'Create/edit types');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Type.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Type.Delete', 'Masters', 'Delete a type');
GO

-- Owner / Administrator only, matching every other standalone-master addition in this codebase.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('Type.View', 'Type.Create', 'Type.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

PRINT 'Type Master and Product enhancements complete.';
GO
