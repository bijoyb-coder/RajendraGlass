USE RajendraGlassDb;
GO

-------------------------------------------------------------------
-- Additional roles
-------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM Security.Role WHERE Name = 'Sales Manager')
    INSERT INTO Security.Role (Name, Description) VALUES ('Sales Manager', 'Approves discounts, credit release, sees cost/margin');
IF NOT EXISTS (SELECT 1 FROM Security.Role WHERE Name = 'Accountant')
    INSERT INTO Security.Role (Name, Description) VALUES ('Accountant', 'Finance, vouchers, GST, receivables');
IF NOT EXISTS (SELECT 1 FROM Security.Role WHERE Name = 'Production Supervisor')
    INSERT INTO Security.Role (Name, Description) VALUES ('Production Supervisor', 'Cutting, production, furnace batches');
IF NOT EXISTS (SELECT 1 FROM Security.Role WHERE Name = 'Auditor')
    INSERT INTO Security.Role (Name, Description) VALUES ('Auditor', 'Read-only access to everything, including audit log');
GO

-- MFA compulsory per FRS 12.2: Owner, Administrator, Accountant (Super Admin role not modelled separately here)
UPDATE Security.Role SET IsMfaRequired = 1 WHERE Name IN ('Owner', 'Administrator', 'Accountant');
GO

-------------------------------------------------------------------
-- Permission catalogue
-------------------------------------------------------------------
IF OBJECT_ID('tempdb..#Perms') IS NOT NULL DROP TABLE #Perms;
CREATE TABLE #Perms (Code NVARCHAR(60), Module NVARCHAR(40), Description NVARCHAR(200));

INSERT INTO #Perms (Code, Module, Description) VALUES
-- Sales
('Invoice.View','Sales','View sales invoices'),
('Invoice.Create','Sales','Create sales invoices'),
('Invoice.Cancel','Sales','Cancel sales invoices'),
('Invoice.Print','Sales','Print sales invoices'),
('Invoice.Export','Sales','Export invoice data'),
('View.Cost','Sales','See purchase rate / cost / margin figures'),
('Quotation.View','Sales','View quotations'),
('Quotation.Create','Sales','Create quotations'),
('SalesOrder.View','Sales','View sales orders'),
('SalesOrder.Create','Sales','Create sales orders'),
('CounterInvoice.View','Sales','View counter-billing invoices'),
('CounterInvoice.Create','Sales','Bill at the counter, incl. offline'),
-- Dispatch
('Waybill.View','Dispatch','View waybills / e-way bills'),
('Waybill.Create','Dispatch','Generate waybills'),
('Waybill.Cancel','Dispatch','Cancel waybills'),
-- Master data
('Company.View','Masters','View company profile'),
('Company.Edit','Masters','Edit company profile'),
('Product.View','Masters','View products'),
('Product.Create','Masters','Create/edit products'),
('Customer.View','Masters','View customers'),
('Customer.Create','Masters','Create/edit customers'),
('Customer.CreditBlock','Masters','Block/release customer credit'),
('Supplier.View','Masters','View suppliers'),
('Supplier.Create','Masters','Create suppliers'),
-- Inventory
('Stock.View','Inventory','View stock position'),
('StockAdjustment.Create','Inventory','Post stock adjustments'),
('StockTransfer.Create','Inventory','Post stock transfers'),
('Offcut.View','Inventory','View offcuts'),
('Offcut.Create','Inventory','Log offcuts'),
-- Purchase
('PurchaseOrder.View','Purchase','View purchase orders'),
('PurchaseOrder.Create','Purchase','Create purchase orders'),
('Grn.View','Purchase','View goods receipts'),
('Grn.Create','Purchase','Post goods receipts'),
('PurchaseInvoice.View','Purchase','View purchase invoices'),
('PurchaseInvoice.Create','Purchase','Book purchase invoices'),
-- Cutting & Production
('CuttingPlan.View','Production','View cutting plans'),
('CuttingPlan.Create','Production','Create cutting plans'),
('WorkOrder.View','Production','View work orders'),
('WorkOrder.Create','Production','Create work orders'),
('JobCard.View','Production','View job cards'),
('JobCard.Create','Production','Create job cards'),
('JobCard.Finish','Production','Record job card completion'),
('FurnaceBatch.View','Production','View furnace batches'),
('FurnaceBatch.Create','Production','Create furnace batches'),
-- Finance
('Voucher.View','Finance','View receipt/payment vouchers'),
('Voucher.Create','Finance','Create vouchers'),
('Expense.View','Finance','View expenses'),
('Expense.Create','Finance','Log expenses'),
('Expense.Approve','Finance','Approve expenses above threshold'),
('Ledger.View','Finance','View receivables/ledgers'),
-- CRM
('Complaint.View','CRM','View complaints'),
('Complaint.Create','CRM','Log complaints'),
('Complaint.Resolve','CRM','Resolve complaints'),
-- HR & Admin
('Employee.View','HR','View employees'),
('Employee.Create','HR','Create employees'),
('Employee.Deactivate','HR','Deactivate employees'),
('Attendance.View','HR','View attendance'),
('Attendance.Mark','HR','Mark attendance'),
('Role.View','Admin','View roles and permissions'),
('Role.Edit','Admin','Edit role permission grid'),
('User.View','Admin','View users'),
('User.Create','Admin','Create users'),
('User.Unlock','Admin','Unlock a locked-out account'),
('User.Deactivate','Admin','Deactivate a user'),
-- Reports & Audit
('Report.View','Reports','View reports'),
('Report.Export','Reports','Export report data'),
('Audit.View','Admin','View the audit trail');

INSERT INTO Security.Permission (Code, Module, Description)
SELECT p.Code, p.Module, p.Description
FROM #Perms p
WHERE NOT EXISTS (SELECT 1 FROM Security.Permission x WHERE x.Code = p.Code);
GO

-------------------------------------------------------------------
-- Role grants
-------------------------------------------------------------------

-- Owner: everything
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Owner'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Administrator: everything except Role.Edit is still allowed (admin manages roles) — same as Owner minus nothing for this app's scope
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Administrator'
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Sales Executive: sales & dispatch operational, no cost visibility, no admin/finance/HR
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Sales Executive'
  AND p.Code IN (
    'Invoice.View','Invoice.Create','Invoice.Print',
    'Quotation.View','Quotation.Create','SalesOrder.View','SalesOrder.Create',
    'CounterInvoice.View','CounterInvoice.Create',
    'Waybill.View','Waybill.Create',
    'Product.View','Customer.View','Customer.Create',
    'Stock.View','Offcut.View',
    'Complaint.View','Complaint.Create',
    'Report.View'
  )
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Sales Manager: Sales Executive scope + approvals + cost visibility + credit block
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Sales Manager'
  AND p.Code IN (
    'Invoice.View','Invoice.Create','Invoice.Cancel','Invoice.Print','Invoice.Export','View.Cost',
    'Quotation.View','Quotation.Create','SalesOrder.View','SalesOrder.Create',
    'CounterInvoice.View','CounterInvoice.Create',
    'Waybill.View','Waybill.Create','Waybill.Cancel',
    'Product.View','Customer.View','Customer.Create','Customer.CreditBlock',
    'Stock.View','Offcut.View','Offcut.Create',
    'Complaint.View','Complaint.Create','Complaint.Resolve',
    'Report.View','Report.Export'
  )
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Accountant: finance-focused + cost visibility + read sales/purchase
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Accountant'
  AND p.Code IN (
    'Invoice.View','Invoice.Print','Invoice.Export','View.Cost',
    'Waybill.View',
    'PurchaseOrder.View','Grn.View','PurchaseInvoice.View','PurchaseInvoice.Create',
    'Voucher.View','Voucher.Create','Expense.View','Expense.Create','Expense.Approve','Ledger.View',
    'Customer.View','Supplier.View',
    'Report.View','Report.Export'
  )
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Production Supervisor: cutting/production + read stock, no finance/sales
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Production Supervisor'
  AND p.Code IN (
    'CuttingPlan.View','CuttingPlan.Create',
    'WorkOrder.View','WorkOrder.Create','JobCard.View','JobCard.Create','JobCard.Finish',
    'FurnaceBatch.View','FurnaceBatch.Create',
    'Stock.View','Offcut.View','Offcut.Create','Product.View',
    'Report.View'
  )
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-- Auditor: read-only across the board, including the audit trail
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name = 'Auditor'
  AND (p.Code LIKE '%.View' OR p.Code = 'View.Cost')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO

-------------------------------------------------------------------
-- Role limits (FRS 7.7) — illustrative defaults
-------------------------------------------------------------------
INSERT INTO Security.RoleLimit (RoleId, LimitType, MaxValue)
SELECT r.RoleId, v.LimitType, v.MaxValue
FROM Security.Role r
CROSS APPLY (VALUES
    ('Discount', CASE r.Name WHEN 'Sales Executive' THEN 5 WHEN 'Sales Manager' THEN 15 ELSE 100 END),
    ('CreditLimit', CASE r.Name WHEN 'Sales Executive' THEN 0 WHEN 'Sales Manager' THEN 500000 ELSE 99999999 END),
    ('PoValue', CASE r.Name WHEN 'Production Supervisor' THEN 0 WHEN 'Accountant' THEN 200000 ELSE 99999999 END),
    ('AdjustmentValue', CASE r.Name WHEN 'Production Supervisor' THEN 25000 ELSE 99999999 END)
) v(LimitType, MaxValue)
WHERE r.Name IN ('Sales Executive','Sales Manager','Accountant','Production Supervisor','Owner','Administrator')
  AND NOT EXISTS (SELECT 1 FROM Security.RoleLimit x WHERE x.RoleId = r.RoleId AND x.LimitType = v.LimitType);
GO

PRINT 'RBAC seed data inserted successfully.';
