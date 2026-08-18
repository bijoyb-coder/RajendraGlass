USE RajendraGlassDb;
GO

-- Roles
IF NOT EXISTS (SELECT 1 FROM Security.Role WHERE Name = 'Owner')
    INSERT INTO Security.Role (Name, Description) VALUES ('Owner', 'Full access');
IF NOT EXISTS (SELECT 1 FROM Security.Role WHERE Name = 'Administrator')
    INSERT INTO Security.Role (Name, Description) VALUES ('Administrator', 'System administration');
IF NOT EXISTS (SELECT 1 FROM Security.Role WHERE Name = 'Sales Executive')
    INSERT INTO Security.Role (Name, Description) VALUES ('Sales Executive', 'Sales and dispatch');
GO

-- Admin user: username=admin, password=Admin@123 (bcrypt hash)
IF NOT EXISTS (SELECT 1 FROM Security.[User] WHERE Username = 'admin')
BEGIN
    INSERT INTO Security.[User] (Username, FullName, Email, PasswordHash, IsActive)
    VALUES ('admin', 'Administrator', 'admin@rajendraglass.local', '$2b$10$O/DGg352KEtIX50Cna51heDwUlgJ/mEIdJ5d6.i4tLvfc/BlNnZNG', 1);

    INSERT INTO Security.UserRole (UserId, RoleId)
    SELECT u.UserId, r.RoleId FROM Security.[User] u, Security.Role r
    WHERE u.Username = 'admin' AND r.Name = 'Owner';
END
GO

-- Demo sales user: username=sales, password=Admin@123
IF NOT EXISTS (SELECT 1 FROM Security.[User] WHERE Username = 'sales')
BEGIN
    INSERT INTO Security.[User] (Username, FullName, Email, PasswordHash, IsActive)
    VALUES ('sales', 'Sales Executive', 'sales@rajendraglass.local', '$2b$10$O/DGg352KEtIX50Cna51heDwUlgJ/mEIdJ5d6.i4tLvfc/BlNnZNG', 1);

    INSERT INTO Security.UserRole (UserId, RoleId)
    SELECT u.UserId, r.RoleId FROM Security.[User] u, Security.Role r
    WHERE u.Username = 'sales' AND r.Name = 'Sales Executive';
END
GO

-- Company profile
IF NOT EXISTS (SELECT 1 FROM Company.Company)
    INSERT INTO Company.Company
        (LegalName, TradeName, RegisteredAddress, BusinessAddress, Gstin, Pan, Phone, Mobile, Email, Website,
         BankName, AccountNumber, Ifsc, BankBranch, AuthSignatoryName, InvoiceFooterNote)
    VALUES
        ('Rajendra Glass Centre', 'Rajendra Glass Centre', '123 Feeder Road, Kolkata, West Bengal 700056',
         '123 Feeder Road, Kolkata, West Bengal 700056', '19AAFFR9619B1Z2', 'AAFFR9619B', '033-25647161',
         '9230537752', 'accounts@rajendraglass.in', 'www.rajendraglass.in',
         'HDFC Bank', '50100123456789', 'HDFC0000123', 'Kolkata Park Street', 'Rajendra Kumar',
         'Goods once sold will not be taken back. Subject to Kolkata jurisdiction.');
GO

IF NOT EXISTS (SELECT 1 FROM Company.Branch)
    INSERT INTO Company.Branch (CompanyId, Code, Name, Gstin, Address, StateCode)
    SELECT CompanyId, 'HO', 'Head Office - Kolkata', Gstin, BusinessAddress, '19'
    FROM Company.Company;
GO

-- Doc series for current FY
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'Invoice')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'Invoice', '2026-2027', 'RGC/INV/26-27/', 1 FROM Company.Branch;
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'Waybill')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'Waybill', '2026-2027', 'RGC/EWB/26-27/', 1 FROM Company.Branch;
GO

-- Sample products (glass, per FRS/sample bills)
IF NOT EXISTS (SELECT 1 FROM Master.Product)
BEGIN
    INSERT INTO Master.Product (Code, Description, Category, Brand, ThicknessMm, Colour, HsnCode, GstRatePct, StockUnit, SellingUnit, PurchaseRate, SellingRate, MinSellingPrice, MinStock, MaxStock, ReorderLevel)
    VALUES
    ('BLKD-3.5-CLR', 'BLK DIAMOND 3.50MM Clear Float Glass', 'Float Glass', 'Saint-Gobain', 3.5, 'Clear', '70051010', 18, 'Sqm', 'Sqm', 950.00, 1150.00, 1000.00, 100, 5000, 300),
    ('BLKD-5-CLR', 'BLK DIAMOND 5MM Clear Float Glass', 'Float Glass', 'Saint-Gobain', 5.0, 'Clear', '70051010', 18, 'Sqm', 'Sqm', 1150.00, 1380.00, 1200.00, 100, 5000, 300),
    ('BLKD-8-CLR', 'BLK DIAMOND 8MM Clear Float Glass', 'Float Glass', 'Saint-Gobain', 8.0, 'Clear', '70051010', 18, 'Sqm', 'Sqm', 1650.00, 1980.00, 1700.00, 50, 3000, 150),
    ('TOUGH-10-CLR', 'Toughened Clear Glass 10MM', 'Toughened Glass', 'Rajendra Glass', 10.0, 'Clear', '70071900', 18, 'Sqft', 'Sqft', 210.00, 265.00, 220.00, 50, 2000, 150),
    ('LAM-6-BZ', 'Laminated Bronze Glass 6MM', 'Laminated Glass', 'Rajendra Glass', 6.0, 'Bronze', '70071900', 18, 'Sqft', 'Sqft', 175.00, 220.00, 185.00, 50, 1500, 100);
END
GO

-- Sample customers
IF NOT EXISTS (SELECT 1 FROM Master.Customer)
BEGIN
    INSERT INTO Master.Customer (Code, Name, Gstin, Pan, Phone, Mobile, Email, BillingAddress, DeliveryAddress, StateCode, StateName, CreditLimit, CreditPeriodDays)
    VALUES
    ('CUST-501226', 'Rajendra Glass Centre - Retail', '19AAFFR9619B1Z2', 'AAFFR9619B', '033-25647161', '9230537752', 'orders@rajendraglass.in', 'Feeder Road, Kolkata 700056', 'Feeder Road, Kolkata 700056', '19', 'West Bengal', 2500000.00, 45),
    ('CUST-100234', 'Metro Interiors Pvt Ltd', '19AABCM1234C1Z5', 'AABCM1234C', '033-40012233', '9830011223', 'accounts@metrointeriors.in', '12 Park Street, Kolkata 700016', '12 Park Street, Kolkata 700016', '19', 'West Bengal', 1000000.00, 30),
    ('CUST-100587', 'Sunrise Constructions', '19AACCS5678D1Z1', 'AACCS5678D', '033-24001199', '9831122334', 'purchase@sunriseconst.in', 'Salt Lake Sector V, Kolkata 700091', 'Salt Lake Sector V, Kolkata 700091', '19', 'West Bengal', 750000.00, 30);
END
GO

-- Sample transporter/vehicle (from waybill sample)
IF NOT EXISTS (SELECT 1 FROM Master.Transporter)
BEGIN
    INSERT INTO Master.Transporter (Code, Name, Gstin, Phone) VALUES ('TRN-001', 'CJ DARCL LOGISTICS LTD', '33AAACD2086J2ZS', '9876543210');
    INSERT INTO Master.Vehicle (TransporterId, VehicleNo, DriverName, DriverMobile, CapacityKg)
    SELECT TransporterId, 'WB23L1936', 'Vikash Kumar Yadav', '6354723013', 12000
    FROM Master.Transporter WHERE Code = 'TRN-001';
END
GO

PRINT 'Seed data inserted successfully.';
