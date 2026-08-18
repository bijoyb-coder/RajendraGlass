USE RajendraGlassDb;
GO

-- Godowns
IF NOT EXISTS (SELECT 1 FROM Company.Godown)
    INSERT INTO Company.Godown (BranchId, Code, Name)
    SELECT BranchId, 'MAIN', 'Main Godown' FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.Godown WHERE Code = 'CUT')
    INSERT INTO Company.Godown (BranchId, Code, Name)
    SELECT BranchId, 'CUT', 'Cutting Section Store' FROM Company.Branch;
GO

-- Opening stock for existing products at Main godown
IF NOT EXISTS (SELECT 1 FROM Inventory.StockBalance)
BEGIN
    INSERT INTO Inventory.StockBalance (ProductId, GodownId, QtyOnHand, AvgRate)
    SELECT p.ProductId, g.GodownId,
           CASE p.Code WHEN 'BLKD-3.5-CLR' THEN 1200 WHEN 'BLKD-5-CLR' THEN 950 WHEN 'BLKD-8-CLR' THEN 480
                       WHEN 'TOUGH-10-CLR' THEN 600 WHEN 'LAM-6-BZ' THEN 340 ELSE 100 END,
           p.PurchaseRate
    FROM Master.Product p CROSS JOIN (SELECT TOP 1 GodownId FROM Company.Godown WHERE Code = 'MAIN') g;

    INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, Qty, Rate)
    SELECT ProductId, GodownId, 'OpeningBalance', 'Opening', QtyOnHand, AvgRate FROM Inventory.StockBalance;
END
GO

-- Suppliers
IF NOT EXISTS (SELECT 1 FROM Master.Supplier)
BEGIN
    INSERT INTO Master.Supplier (Code, Name, Gstin, Pan, Phone, Mobile, Email, Address, StateCode, StateName, CreditPeriodDays)
    VALUES
    ('SUP-001', 'Saint-Gobain India Pvt Ltd (Glass Business)', '33AABCS4338M1Z8', 'AABCS4338M', '044-27152300', '9840012345', 'sales@saint-gobain.in', 'SIPCOT Industrial Park, Sriperumbudur, Kanchipuram 602106', '33', 'Tamil Nadu', 45),
    ('SUP-002', 'Gujarat Guardian Ltd', '24AAACG1234B1Z9', 'AAACG1234B', '02642-661000', '9825098250', 'sales@guardianglass.in', 'Jhagadia, Bharuch, Gujarat 393110', '24', 'Gujarat', 30),
    ('SUP-003', 'Local Edge Works', '19AABFL5678C1Z2', 'AABFL5678C', '033-22345678', '9433012345', 'contact@localedge.in', 'Howrah Industrial Area, West Bengal 711101', '19', 'West Bengal', 15);
END
GO

-- Doc series for new document types (current FY)
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'Quotation')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'Quotation', '2026-2027', 'RGC/QTN/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'SalesOrder')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'SalesOrder', '2026-2027', 'RGC/SO/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'PurchaseOrder')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'PurchaseOrder', '2026-2027', 'RGC/PO/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'Grn')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'Grn', '2026-2027', 'RGC/GRN/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'PurchaseInvoice')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'PurchaseInvoice', '2026-2027', 'RGC/PINV/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'StockAdjustment')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'StockAdjustment', '2026-2027', 'RGC/ADJ/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'StockTransfer')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'StockTransfer', '2026-2027', 'RGC/TRF/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'Offcut')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'Offcut', '2026-2027', 'OFC-', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'CuttingPlan')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'CuttingPlan', '2026-2027', 'RGC/CUT/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'WorkOrder')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'WorkOrder', '2026-2027', 'RGC/WO/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'JobCard')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'JobCard', '2026-2027', 'RGC/JC/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'FurnaceBatch')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'FurnaceBatch', '2026-2027', 'RGC/FB/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'Voucher')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'Voucher', '2026-2027', 'RGC/VCH/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'Expense')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'Expense', '2026-2027', 'RGC/EXP/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'Complaint')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'Complaint', '2026-2027', 'RGC/CMP/26-27/', 1 FROM Company.Branch;
GO

-- Employees (link admin/sales users)
IF NOT EXISTS (SELECT 1 FROM HR.Employee)
BEGIN
    INSERT INTO HR.Employee (Code, FullName, Designation, Department, Phone, Email, DateOfJoining, UserId)
    SELECT 'EMP-001', 'Administrator', 'Owner', 'Management', '9000000001', 'admin@rajendraglass.local', '2020-01-01', UserId FROM Security.[User] WHERE Username = 'admin';
    INSERT INTO HR.Employee (Code, FullName, Designation, Department, Phone, Email, DateOfJoining, UserId)
    SELECT 'EMP-002', 'Sales Executive', 'Sales Executive', 'Sales', '9000000002', 'sales@rajendraglass.local', '2022-06-01', UserId FROM Security.[User] WHERE Username = 'sales';
    INSERT INTO HR.Employee (Code, FullName, Designation, Department, Phone, Email, DateOfJoining)
    VALUES ('EMP-003', 'Ramesh Toughening Operator', 'Furnace Operator', 'Production', '9000000003', NULL, '2021-03-15'),
           ('EMP-004', 'Suresh Cutting Supervisor', 'Cutting Supervisor', 'Cutting', '9000000004', NULL, '2021-07-01');
END
GO

PRINT 'Extended seed data inserted successfully.';
