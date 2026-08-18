-- Rack master under Godown, and a rack-level stock ledger for physical location tracking.
--
-- Design: Inventory.StockBalance (godown-level) stays exactly as-is and remains the source of
-- truth everywhere it's already used (free-stock checks, GRN, transfers, adjustments) — nothing
-- that already works is touched. Inventory.RackStock is a second, independent ledger recording
-- how a godown's quantity is physically distributed across its racks. The two are reconciled by
-- comparison (see /reports/stock-rack-detail), not by a shared row, exactly as asked: "maintain
-- stock physically each rack... and compare digitally" — the whole point is the two can and do
-- drift until someone counts and adjusts the rack ledger to match.

IF OBJECT_ID('Company.Rack') IS NULL
CREATE TABLE Company.Rack (
    RackId    INT IDENTITY PRIMARY KEY,
    GodownId  INT NOT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId),
    Name      NVARCHAR(50) NOT NULL,          -- short name the user types, e.g. "Rack1"
    Code      NVARCHAR(120) NOT NULL UNIQUE,  -- auto-combined "<GodownName>_<Name>", e.g. "Godown1_Rack1"
    IsActive  BIT NOT NULL DEFAULT 1,
    CreatedOn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Rack_Godown_Name UNIQUE (GodownId, Name)
);
GO

IF OBJECT_ID('Inventory.RackStock') IS NULL
CREATE TABLE Inventory.RackStock (
    RackStockId INT IDENTITY PRIMARY KEY,
    ProductId   INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    RackId      INT NOT NULL FOREIGN KEY REFERENCES Company.Rack(RackId),
    QtyOnHand   DECIMAL(14,3) NOT NULL DEFAULT 0,
    ModifiedOn  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_RackStock UNIQUE (ProductId, RackId),
    CONSTRAINT CK_RackStock_NonNegative CHECK (QtyOnHand >= 0)
);
GO

-------------------------------------------------------------------
-- Permissions
-------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Godown.Create')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Godown.Create', 'Inventory', 'Create godowns');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Rack.View')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Rack.View', 'Inventory', 'View racks');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Rack.Create')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Rack.Create', 'Inventory', 'Create racks under a godown');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'RackStock.View')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('RackStock.View', 'Inventory', 'View rack-level stock');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'RackStock.Adjust')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('RackStock.Adjust', 'Inventory', 'Record a physical count against a rack');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'RackStock.Transfer')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('RackStock.Transfer', 'Inventory', 'Shift stock from one rack to another');
GO

-- Owner / Administrator: everything, including the new permissions.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
