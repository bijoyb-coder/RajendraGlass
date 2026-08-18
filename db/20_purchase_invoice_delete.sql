-- Delete for Purchase Invoices. Unlike Purchase Order (-> Grn) and Grn (-> PurchaseInvoice), no
-- table anywhere references Purchase.PurchaseInvoice (confirmed via sys.foreign_keys) -- supplier
-- payments are recorded as a generic Finance.Voucher tied only to SupplierId, not to a specific
-- invoice. So, exactly like Voucher.Delete, this is always deletable (subject to permission);
-- there is nothing that can be "generated against" a purchase invoice to block on.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'PurchaseInvoice.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('PurchaseInvoice.Delete', 'Purchase', 'Delete a booked purchase invoice');
GO

-- Owner / Administrator: everything (existing catch-all rule already covers new permissions,
-- but insert explicitly too in case that rule has not been re-run since).
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code = 'PurchaseInvoice.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Accountant already has PurchaseInvoice.Create/Edit; give it Delete too, same as Invoice.Delete.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Accountant' AND p.Code = 'PurchaseInvoice.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
