-- Purchase E-way Bill Entry: a small master of e-Way Bill numbers received from suppliers,
-- entered once from the government e-Way Bill slip / QR printout, then picked from a dropdown
-- when booking the matching Purchase Invoice (rather than re-typing the number by hand).
-- Purchase.PurchaseInvoice.EwayBillNo (added in db/29) is kept as a denormalized snapshot of
-- whichever e-Way Bill was selected -- still useful for print/search without a join -- while the
-- new EwayBillId column is the actual link and is what enforces "one e-Way Bill, one invoice".
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID('Purchase') AND name = 'EwayBill')
BEGIN
    CREATE TABLE Purchase.EwayBill (
        EwayBillId    INT IDENTITY PRIMARY KEY,
        EwayBillNo    NVARCHAR(30) NOT NULL,
        SupplierId    INT NOT NULL FOREIGN KEY REFERENCES Master.Supplier(SupplierId),
        EwayBillDate  DATE NOT NULL,
        ValidUpto     DATE NULL,
        VehicleNo     NVARCHAR(20) NULL,
        DocumentNo    NVARCHAR(50) NULL,      -- supplier's own invoice/document no. printed on the e-Way Bill, for cross-check
        GoodsValue    DECIMAL(14,2) NULL,     -- value of goods declared on the e-Way Bill, for cross-check
        IsUsed        BIT NOT NULL DEFAULT 0, -- set once linked to a Purchase Invoice; frees up again if that invoice is deleted
        CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE UNIQUE INDEX UX_EwayBill_No ON Purchase.EwayBill(EwayBillNo);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'EwayBillId')
    ALTER TABLE Purchase.PurchaseInvoice ADD EwayBillId INT NULL FOREIGN KEY REFERENCES Purchase.EwayBill(EwayBillId);
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'EwayBill.View')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('EwayBill.View', 'Purchase', 'View purchase e-Way Bill entries');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'EwayBill.Create')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('EwayBill.Create', 'Purchase', 'Enter a supplier''s e-Way Bill');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'EwayBill.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('EwayBill.Delete', 'Purchase', 'Delete an unused e-Way Bill entry');
GO

-- Owner / Administrator: everything.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('EwayBill.View', 'EwayBill.Create', 'EwayBill.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Accountant already books/deletes Purchase Invoices -- give it the same over e-Way Bills.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Accountant' AND p.Code IN ('EwayBill.View', 'EwayBill.Create', 'EwayBill.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Auditor holds every '%.View' permission (see 26_auditor_rack_view.sql) -- the original one-time
-- seed rule doesn't retroactively pick up permissions added by later migrations, so grant explicitly.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Auditor' AND p.Code = 'EwayBill.View'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
