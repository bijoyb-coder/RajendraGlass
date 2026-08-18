-- Delete for Job Cards. Nothing references a job card (confirmed via sys.foreign_keys) and
-- finishing one never touches stock -- like Cutting Plan, it's a pure production-tracking record,
-- so it is always deletable, subject to permission. Creating a job card flips its work order to
-- 'InProgress' as a side effect (only if the work order was 'Open'); deleting the last job card
-- against that work order reverses the flip back to 'Open', mirroring Work Order's own reversal
-- of its sales order's status.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'JobCard.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('JobCard.Delete', 'Production', 'Delete a job card, reverting its work order out of In Progress if it was the last one');
GO

-- Owner / Administrator: everything, including the new permission.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code = 'JobCard.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Production Supervisor already creates/finishes job cards; give it Delete too.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Production Supervisor'
  AND p.Code = 'JobCard.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
