-- Stock Opening: a new inventory document type for entering the opening balance of a product at
-- a godown -- e.g. when onboarding stock that already physically exists but was never recorded
-- through a Purchase/GRN. Unlike Stock Adjustment (which corrects book qty to a counted actual,
-- and can move the balance up or down), Stock Opening only ever adds -- it's an inbound-only entry,
-- mirroring how a Purchase/GRN increases Inventory.StockBalance and logs Inventory.StockMovement.
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('Inventory.StockOpening') IS NULL
CREATE TABLE Inventory.StockOpening (
    StockOpeningId INT IDENTITY PRIMARY KEY,
    OpeningNo    NVARCHAR(30) NOT NULL UNIQUE,
    GodownId     INT NOT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId),
    OpeningDate  DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    Status       NVARCHAR(20) NOT NULL DEFAULT 'Posted',
    Remarks      NVARCHAR(300) NULL,
    CreatedBy    INT NULL,
    CreatedOn    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Inventory.StockOpeningLine') IS NULL
CREATE TABLE Inventory.StockOpeningLine (
    StockOpeningLineId INT IDENTITY PRIMARY KEY,
    StockOpeningId INT NOT NULL FOREIGN KEY REFERENCES Inventory.StockOpening(StockOpeningId),
    ProductId    INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    Qty          DECIMAL(14,3) NOT NULL,
    CONSTRAINT CK_StockOpeningLine_QtyPositive CHECK (Qty > 0)
);
GO

CREATE INDEX IX_StockOpeningLine_StockOpening ON Inventory.StockOpeningLine(StockOpeningId);
GO

IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'StockOpening')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'StockOpening', '2026-2027', 'RGC/OPEN/26-27/', 1 FROM Company.Branch;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'StockOpening.Create')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('StockOpening.Create', 'Inventory', 'Post a stock opening balance');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'StockOpening.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('StockOpening.Delete', 'Inventory', 'Delete a stock opening entry');
GO

-- Owner / Administrator only, matching StockAdjustment.Create / StockTransfer.Create -- no other
-- seeded role currently holds those either.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('StockOpening.Create', 'StockOpening.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
