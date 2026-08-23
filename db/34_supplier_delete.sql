-- Delete for Suppliers. Blocked while any Purchase Order or Purchase Invoice has been booked
-- against the supplier (a GRN is never independently checkable -- every GRN traces back through
-- its own PurchaseOrder, whose SupplierId is NOT NULL, so the PurchaseOrder check already covers
-- it), and also blocked by any Voucher (supplier payment) or e-Way Bill entry -- both are real
-- foreign keys into Master.Supplier that would otherwise fail the DELETE with a raw constraint
-- error instead of a clear message.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Supplier.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Supplier.Delete', 'Masters', 'Delete a supplier');
GO

-- Owner / Administrator: everything (existing catch-all rule already covers new permissions,
-- but insert explicitly too in case that rule has not been re-run since).
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code = 'Supplier.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
