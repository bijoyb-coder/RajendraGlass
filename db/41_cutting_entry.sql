-- Cutting Entry: records glass pieces actually cut/sold against a saved Quotation, with a real,
-- auditable effect on inventory (Inventory.StockBalance / Inventory.StockMovement) -- unlike the
-- existing Cutting.CuttingPlan/CuttingPlanLine tables (server/Controllers/CuttingController.cs),
-- which are a pure nesting/waste-estimate tool that never touches stock. Deliberately separate
-- tables/permission prefix so this doesn't collide with that existing feature.
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('Cutting.CuttingEntry') IS NULL
CREATE TABLE Cutting.CuttingEntry (
    CuttingEntryId   INT IDENTITY PRIMARY KEY,
    CuttingNo        NVARCHAR(30) NOT NULL UNIQUE,
    CuttingDate      DATE NOT NULL,
    QuotationId      INT NOT NULL FOREIGN KEY REFERENCES Sales.Quotation(QuotationId),
    TotalPcs         INT NOT NULL DEFAULT 0,
    TotalSqft        DECIMAL(14,3) NOT NULL DEFAULT 0,
    TotalGlassValue  DECIMAL(14,2) NOT NULL DEFAULT 0,
    VanFair          DECIMAL(14,2) NOT NULL DEFAULT 0,
    TotalBillAmount  DECIMAL(14,2) NOT NULL DEFAULT 0,
    Status           NVARCHAR(20) NOT NULL DEFAULT 'Booked',  -- Booked, Cancelled
    CreatedBy        INT NULL,
    CreatedOn        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ModifiedBy       INT NULL,
    ModifiedOn       DATETIME2 NULL
);
GO

-- DECIMAL(10,3), not the (10,2) mm convention used elsewhere -- these are inches, and an eighth
-- (0.125") needs three decimal places to round-trip exactly.
IF OBJECT_ID('Cutting.CuttingEntryLine') IS NULL
CREATE TABLE Cutting.CuttingEntryLine (
    CuttingEntryLineId INT IDENTITY PRIMARY KEY,
    CuttingEntryId     INT NOT NULL FOREIGN KEY REFERENCES Cutting.CuttingEntry(CuttingEntryId),
    SerialNo           INT NOT NULL,                 -- display order only, not a stable key
    QuotationLineId    INT NOT NULL FOREIGN KEY REFERENCES Sales.QuotationLine(QuotationLineId),
    ProductId          INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    ActualHeight       DECIMAL(10,3) NOT NULL,        -- inches, normalized (e.g. 20.25)
    ActualWidth        DECIMAL(10,3) NOT NULL,
    ActualHeightText   NVARCHAR(20) NULL,             -- original user text, e.g. "20¼" -- display only
    ActualWidthText    NVARCHAR(20) NULL,
    Pcs                INT NOT NULL,
    ChargeableHeight   DECIMAL(10,3) NOT NULL,        -- manual for now -- see ChargeableSizeCalculator.cs
    ChargeableWidth    DECIMAL(10,3) NOT NULL,
    Sqft               DECIMAL(14,3) NOT NULL,        -- ChargeableHeight * ChargeableWidth * Pcs / 144
    Rate               DECIMAL(14,2) NOT NULL,        -- copied from QuotationLine.Rate at save time
    Amount             DECIMAL(14,2) NOT NULL,        -- Sqft * Rate
    GodownId           INT NOT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId),
    RackId             INT NULL FOREIGN KEY REFERENCES Company.Rack(RackId),
    CONSTRAINT CK_CuttingEntryLine_Positive CHECK (
        ActualHeight > 0 AND ActualWidth > 0 AND Pcs > 0 AND
        ChargeableHeight > 0 AND ChargeableWidth > 0
    )
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CuttingEntryLine_CuttingEntry')
    CREATE INDEX IX_CuttingEntryLine_CuttingEntry ON Cutting.CuttingEntryLine(CuttingEntryId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CuttingEntryLine_QuotationLine')
    CREATE INDEX IX_CuttingEntryLine_QuotationLine ON Cutting.CuttingEntryLine(QuotationLineId);
GO

-- Doc series for the new document type (current FY), same pattern as db/04_seed_extended.sql.
-- Prefix distinct from CuttingPlan's RGC/CUT/26-27/.
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'CuttingEntry')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'CuttingEntry', '2026-2027', 'RGC/CUTE/26-27/', 1 FROM Company.Branch;
GO

-- Permissions, same pattern as db/21_production_delete.sql.
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'CuttingEntry.View')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('CuttingEntry.View', 'Sales', 'View cutting entries');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'CuttingEntry.Create')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('CuttingEntry.Create', 'Sales', 'Create a cutting entry against a quotation, deducting stock');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'CuttingEntry.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('CuttingEntry.Delete', 'Sales', 'Cancel a cutting entry, reversing its stock deduction');
GO

-- Owner / Administrator: everything, including the new permissions.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('CuttingEntry.View', 'CuttingEntry.Create', 'CuttingEntry.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Sales Executive: same scope as Quotation.Create -- can enter cutting but not cancel one.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Sales Executive'
  AND p.Code IN ('CuttingEntry.View', 'CuttingEntry.Create')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Sales Manager: Sales Executive scope + cancel, same pattern as Invoice.Cancel/Waybill.Cancel.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Sales Manager'
  AND p.Code IN ('CuttingEntry.View', 'CuttingEntry.Create', 'CuttingEntry.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
