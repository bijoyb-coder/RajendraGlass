-- "Payment Transaction" feature (Sales & Dispatch): customer receipts, editable for wrong entries,
-- optionally linked to the sales invoice they're settling. Reuses Finance.Voucher rather than a
-- parallel ledger table — Receivables already sums Finance.Voucher receipts, and a second
-- customer-payment table would silently desync that figure from what this screen shows.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Finance.Voucher') AND name = 'InvoiceId')
    ALTER TABLE Finance.Voucher ADD InvoiceId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Voucher_Invoice')
    ALTER TABLE Finance.Voucher ADD CONSTRAINT FK_Voucher_Invoice FOREIGN KEY (InvoiceId) REFERENCES Sales.Invoice(InvoiceId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Finance.Voucher') AND name = 'PaymentType')
    ALTER TABLE Finance.Voucher ADD PaymentType NVARCHAR(20) NULL;   -- Advance, Full (Receipt only)
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Finance.Voucher') AND name = 'ReferenceNo')
    ALTER TABLE Finance.Voucher ADD ReferenceNo NVARCHAR(60) NULL;   -- Cheque no. / UPI transaction ref
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Finance.Voucher') AND name = 'ModifiedBy')
    ALTER TABLE Finance.Voucher ADD ModifiedBy INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Finance.Voucher') AND name = 'ModifiedOn')
    ALTER TABLE Finance.Voucher ADD ModifiedOn DATETIME2 NULL;
GO

-------------------------------------------------------------------
-- Permission: editing a voucher (Create/View already exist)
-------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Voucher.Edit')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Voucher.Edit', 'Finance', 'Edit a receipt/payment voucher to fix a wrong entry');
GO

-- Owner / Administrator: everything, including the new permission (idempotent re-run of the
-- same "grant all" rule 07_rbac_seed.sql already applies for them).
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Accountant already has Voucher.View/Create; give it Edit too.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Accountant' AND p.Code = 'Voucher.Edit'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Sales Manager: "Payment Transaction" lives under Sales & Dispatch, so sales-side staff need
-- the same View/Create/Edit access the Accountant already has for vouchers.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Sales Manager' AND p.Code IN ('Voucher.View', 'Voucher.Create', 'Voucher.Edit')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
