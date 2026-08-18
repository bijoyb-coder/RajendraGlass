-- Delete for Purchase Orders and GRN, same "nothing generated against it yet" pattern:
--   Purchase Order: deletable while no GRN has been posted against it.
--   GRN:            deletable while no Purchase Invoice has been booked against it, AND the
--                    stock it added is still fully on hand (reversed on delete; blocked if any
--                    of it has already moved on).
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'PurchaseOrder.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('PurchaseOrder.Delete', 'Purchase', 'Delete a purchase order that has not been received against');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Grn.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Grn.Delete', 'Purchase', 'Delete a GRN that has not been invoiced, reversing the stock it added');
GO

INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r
CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('PurchaseOrder.Delete', 'Grn.Delete')
  AND NOT EXISTS (
      SELECT 1 FROM Security.RolePermission rp
      WHERE rp.RoleId = r.RoleId AND rp.PermissionId = p.PermissionId
  );
GO
