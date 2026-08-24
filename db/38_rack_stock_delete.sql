-- Delete for Rack Stock entries. Inventory.RackStock is a second, independent ledger from the
-- godown-level Inventory.StockBalance (reconciled by comparison, not by a shared row -- see
-- 13_rack_master_and_stock.sql) and nothing downstream ever references a RackStockId, so removing
-- a row is always allowed and never touches StockBalance/StockMovement: it simply means this rack
-- no longer carries a tracked quantity for that product (rack decommissioned, count corrected to
-- zero and cleared, etc).
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'RackStock.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('RackStock.Delete', 'Inventory', 'Delete a rack stock entry');
GO

-- Owner / Administrator: everything (existing catch-all rule already covers new permissions,
-- but insert explicitly too in case that rule has not been re-run since).
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code = 'RackStock.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
