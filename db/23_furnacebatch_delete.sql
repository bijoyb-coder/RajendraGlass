-- Delete for Furnace Batches. Nothing references a furnace batch (confirmed via sys.foreign_keys)
-- and it never touches stock -- it's a planning/estimation record (utilisation % and estimated
-- electricity cost only), same as Cutting Plan and Job Card, so it is always deletable, subject
-- to permission. Unlike Work Order/Job Card, creating a furnace batch has no side effect on any
-- other document's status, so there is nothing to reverse on delete.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'FurnaceBatch.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('FurnaceBatch.Delete', 'Production', 'Delete a furnace batch');
GO

-- Owner / Administrator: everything, including the new permission.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code = 'FurnaceBatch.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Production Supervisor already creates furnace batches; give it Delete too.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Production Supervisor'
  AND p.Code = 'FurnaceBatch.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
