-- Delete for Payment Transactions (Finance.Voucher). Nothing in the schema is ever generated
-- from a voucher (no foreign keys reference it), so unlike Quotation/SalesOrder/Invoice there is
-- no downstream document to check for — a voucher is deletable whenever the operator has
-- permission, same as it's already editable for a wrong entry.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Voucher.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Voucher.Delete', 'Finance', 'Delete a payment voucher entered in error');
GO

INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r
CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code = 'Voucher.Delete'
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
  AND p.Code = 'Voucher.Delete'
  AND NOT EXISTS (
      SELECT 1 FROM Security.RolePermission rp
      WHERE rp.RoleId = r.RoleId AND rp.PermissionId = p.PermissionId
  );
GO
