-- Delete for Products. Blocked while the product has ever been referenced by any purchase, sale,
-- quotation, cutting, production, or inventory-movement document -- deleting a product with real
-- transaction history behind it would either fail on a raw FK constraint or silently orphan that
-- history. Editing a product remains unrestricted (Product.Create is reused for Update, same as
-- every other master this session); only hard delete is gated.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Product.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Product.Delete', 'Masters', 'Delete a product');
GO

-- Owner / Administrator: everything (existing catch-all rule already covers new permissions,
-- but insert explicitly too in case that rule has not been re-run since).
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code = 'Product.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
