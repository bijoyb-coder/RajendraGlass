-- Conditional delete for the Quotation → Sales Order → Sales Invoice chain.
-- A document can be deleted only while nothing has been generated against it yet:
--   Quotation:     deletable while no Sales Order has been raised from it.
--   Sales Order:   deletable while no Sales Invoice has been raised from it.
--   Sales Invoice: deletable while no payment (Voucher/InvoicePayment) has been recorded against it.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Quotation.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Quotation.Delete', 'Sales', 'Delete a quotation that has not been converted to a sales order');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'SalesOrder.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('SalesOrder.Delete', 'Sales', 'Delete a sales order that has not been invoiced');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Invoice.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Invoice.Delete', 'Sales', 'Delete a sales invoice that has no payment recorded against it');
GO

-- Owner/Administrator get every new permission (idempotent re-run pattern used throughout).
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r
CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('Quotation.Delete', 'SalesOrder.Delete', 'Invoice.Delete')
  AND NOT EXISTS (
      SELECT 1 FROM Security.RolePermission rp
      WHERE rp.RoleId = r.RoleId AND rp.PermissionId = p.PermissionId
  );
GO

-- Sales Manager can clean up its own quotations/orders; invoice deletion (a financial document)
-- stays with Owner/Administrator/Accountant only.
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r
CROSS JOIN Security.Permission p
WHERE r.Name = 'Sales Manager'
  AND p.Code IN ('Quotation.Delete', 'SalesOrder.Delete')
  AND NOT EXISTS (
      SELECT 1 FROM Security.RolePermission rp
      WHERE rp.RoleId = r.RoleId AND rp.PermissionId = p.PermissionId
  );
GO

INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r
CROSS JOIN Security.Permission p
WHERE r.Name = 'Accountant'
  AND p.Code = 'Invoice.Delete'
  AND NOT EXISTS (
      SELECT 1 FROM Security.RolePermission rp
      WHERE rp.RoleId = r.RoleId AND rp.PermissionId = p.PermissionId
  );
GO
