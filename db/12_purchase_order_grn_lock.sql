-- Purchase Order / GRN / Purchase Invoice document-lock chain, mirroring the Quotation -> Sales
-- Order -> Sales Invoice pattern already in place: a Purchase Order has no edit screen (view/print
-- only), a GRN raised against it likewise has no edit screen, but a Purchase Invoice booked
-- against a GRN can always be corrected for a wrong entry — hence the one new permission below.
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'PurchaseInvoice.Edit')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('PurchaseInvoice.Edit', 'Purchase', 'Edit a booked purchase invoice to fix a wrong entry');
GO

-- Owner / Administrator: everything, including the new permission.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Accountant already has PurchaseInvoice.View/Create; give it Edit too.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Accountant' AND p.Code = 'PurchaseInvoice.Edit'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
