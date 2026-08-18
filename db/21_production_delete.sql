-- Delete for the two "production docs" that block Sales Order deletion (ORDER_HAS_PRODUCTION_DOCS):
--   Cutting Plan: a pure planning/estimation document -- nothing references it (confirmed via
--                 sys.foreign_keys: only its own CuttingPlanLine rows point at it), and it never
--                 touches stock, so it is always deletable, subject to permission.
--   Work Order:   deletable while no Job Card has been raised against it. Creating a Work Order
--                 flips its Sales Order to 'InProduction' as a side effect; deleting the last
--                 Work Order against that Sales Order reverses that flip back to 'Approved' so the
--                 order doesn't show as "in production" with nothing actually in production.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'CuttingPlan.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('CuttingPlan.Delete', 'Production', 'Delete a cutting plan');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'WorkOrder.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('WorkOrder.Delete', 'Production', 'Delete a work order that has no job cards raised against it, reverting its sales order out of In Production');
GO

-- Owner / Administrator: everything, including the new permissions.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('CuttingPlan.Delete', 'WorkOrder.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Production Supervisor already creates these docs; give it Delete too, same as Accountant got
-- PurchaseInvoice.Delete/Invoice.Delete for docs it creates.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Production Supervisor'
  AND p.Code IN ('CuttingPlan.Delete', 'WorkOrder.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
