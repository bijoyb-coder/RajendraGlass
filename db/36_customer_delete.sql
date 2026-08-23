-- Delete for Customers. Blocked while the customer has ever been referenced by a Quotation, Sales
-- Order, Sales Invoice (incl. Counter Billing, which posts into the same Sales.Invoice table), a
-- payment Voucher, or a CRM Complaint -- all real foreign keys into Master.Customer that would
-- otherwise fail the DELETE with a raw constraint error instead of a clear message. Editing a
-- customer remains unrestricted (Customer.Create is reused for Update, same as every other master
-- this session); only hard delete is gated.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Customer.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Customer.Delete', 'Masters', 'Delete a customer');
GO

-- Owner / Administrator: everything (existing catch-all rule already covers new permissions,
-- but insert explicitly too in case that rule has not been re-run since).
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code = 'Customer.Delete'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
