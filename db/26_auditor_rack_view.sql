-- Auditor is meant to hold every '%.View' permission (see 07_rbac_seed.sql's original grant rule:
-- "p.Code LIKE '%.View' OR p.Code = 'View.Cost'"), but Rack.View and RackStock.View were added in
-- a later migration (13_rack_master_and_stock.sql) after that one-time seed ran, so Auditor never
-- picked them up. Backfilling them here closes that gap.
SET QUOTED_IDENTIFIER ON;
GO

INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Auditor'
  AND p.Code IN ('Rack.View', 'RackStock.View')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
