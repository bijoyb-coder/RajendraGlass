-- Godown/Rack master-detail: add Location to Godown, allow editing both Godown and Rack.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Company.Godown') AND name = 'Location')
BEGIN
    ALTER TABLE Company.Godown ADD Location NVARCHAR(200) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Godown.Edit')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Godown.Edit', 'Inventory', 'Edit godown master details');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Rack.Edit')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Rack.Edit', 'Inventory', 'Edit rack master details');
GO

-- Grant to Owner/Administrator (idempotent cross-join re-run pattern)
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r
CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('Godown.Edit', 'Rack.Edit')
  AND NOT EXISTS (
      SELECT 1 FROM Security.RolePermission rp
      WHERE rp.RoleId = r.RoleId AND rp.PermissionId = p.PermissionId
  );
GO
