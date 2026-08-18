-- Delete for Waybills. Nothing references a waybill via FK (confirmed via sys.foreign_keys) --
-- Invoice's own delete rule already blocks on "any waybill exists", regardless of status, so that
-- side is unaffected. The real risk here is unique to Waybill: once EwayBillStatus = 'Generated'
-- it means a real e-Way Bill is registered with the government (GST e-Way Bill system) -- deleting
-- the local record at that point would orphan a live government-side document our system would no
-- longer know about. So, unlike every other doc in this delete-feature series (which only ever
-- checks other rows in our own DB), Waybill is blocked from deletion while it has an *active* EWB;
-- the existing "Cancel e-Way Bill" action must be used first, then the waybill becomes deletable.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Waybill.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Waybill.Delete', 'Dispatch', 'Delete a waybill that has no active e-Way Bill registered against it');
GO

-- Owner / Administrator: everything, including the new permission.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code = 'Waybill.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Sales Manager already cancels waybills; give it Delete too.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Sales Manager' AND p.Code = 'Waybill.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
