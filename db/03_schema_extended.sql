-- Rajendra Glass Centre - Inventory Management System
-- Phase 2 schema: Inventory, Purchase, Sales (Quotation/Order), Cutting, Production, Finance, CRM, HR

USE RajendraGlassDb;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

IF SCHEMA_ID('Inventory')  IS NULL EXEC('CREATE SCHEMA Inventory');
IF SCHEMA_ID('Purchase')   IS NULL EXEC('CREATE SCHEMA Purchase');
IF SCHEMA_ID('Cutting')    IS NULL EXEC('CREATE SCHEMA Cutting');
IF SCHEMA_ID('Production') IS NULL EXEC('CREATE SCHEMA Production');
IF SCHEMA_ID('Finance')    IS NULL EXEC('CREATE SCHEMA Finance');
IF SCHEMA_ID('CRM')        IS NULL EXEC('CREATE SCHEMA CRM');
IF SCHEMA_ID('HR')         IS NULL EXEC('CREATE SCHEMA HR');
GO

-------------------------------------------------------------------
-- Company: Godown (needed by Inventory)
-------------------------------------------------------------------
IF OBJECT_ID('Company.Godown') IS NULL
CREATE TABLE Company.Godown (
    GodownId  INT IDENTITY PRIMARY KEY,
    BranchId  INT NOT NULL FOREIGN KEY REFERENCES Company.Branch(BranchId),
    Code      NVARCHAR(20) NOT NULL UNIQUE,
    Name      NVARCHAR(150) NOT NULL,
    IsActive  BIT NOT NULL DEFAULT 1
);
GO

-------------------------------------------------------------------
-- Master: Supplier
-------------------------------------------------------------------
IF OBJECT_ID('Master.Supplier') IS NULL
CREATE TABLE Master.Supplier (
    SupplierId       INT IDENTITY PRIMARY KEY,
    Code             NVARCHAR(40) NOT NULL UNIQUE,
    Name             NVARCHAR(200) NOT NULL,
    Gstin            CHAR(15) NULL,
    Pan              CHAR(10) NULL,
    Phone            NVARCHAR(20) NULL,
    Mobile           NVARCHAR(20) NULL,
    Email            NVARCHAR(150) NULL,
    Address          NVARCHAR(400) NULL,
    StateCode        NVARCHAR(5) NULL,
    StateName        NVARCHAR(60) NULL,
    CreditPeriodDays INT NOT NULL DEFAULT 0,
    IsActive         BIT NOT NULL DEFAULT 1,
    CreatedOn        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-------------------------------------------------------------------
-- Inventory schema
-------------------------------------------------------------------
IF OBJECT_ID('Inventory.StockBalance') IS NULL
CREATE TABLE Inventory.StockBalance (
    StockBalanceId INT IDENTITY PRIMARY KEY,
    ProductId  INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    GodownId   INT NOT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId),
    QtyOnHand  DECIMAL(14,3) NOT NULL DEFAULT 0,
    QtyReserved DECIMAL(14,3) NOT NULL DEFAULT 0,
    QtyBlocked DECIMAL(14,3) NOT NULL DEFAULT 0,
    QtyDamaged DECIMAL(14,3) NOT NULL DEFAULT 0,
    AvgRate    DECIMAL(14,2) NULL,
    CONSTRAINT UQ_StockBalance UNIQUE (ProductId, GodownId),
    CONSTRAINT CK_StockBalance_NonNegative CHECK (QtyOnHand >= 0)
);
GO

IF OBJECT_ID('Inventory.StockMovement') IS NULL
CREATE TABLE Inventory.StockMovement (
    StockMovementId INT IDENTITY PRIMARY KEY,
    ProductId    INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    GodownId     INT NOT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId),
    MovementDate DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    MovementType NVARCHAR(30) NOT NULL,     -- Purchase, Sale, Adjustment, TransferIn, TransferOut, Production, OpeningBalance
    DocType      NVARCHAR(30) NULL,
    DocId        INT NULL,
    Qty          DECIMAL(14,3) NOT NULL,    -- positive = in, negative = out
    Rate         DECIMAL(14,2) NULL,
    CreatedBy    INT NULL,
    CreatedOn    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockMovement_Product_Date')
CREATE INDEX IX_StockMovement_Product_Date ON Inventory.StockMovement (ProductId, MovementDate);
GO

IF OBJECT_ID('Inventory.StockAdjustment') IS NULL
CREATE TABLE Inventory.StockAdjustment (
    StockAdjustmentId INT IDENTITY PRIMARY KEY,
    AdjustmentNo  NVARCHAR(30) NOT NULL UNIQUE,
    GodownId      INT NOT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId),
    AdjustmentDate DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    Status        NVARCHAR(20) NOT NULL DEFAULT 'Draft',   -- Draft, Approved
    Reason        NVARCHAR(300) NULL,
    CreatedBy     INT NULL,
    CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Inventory.StockAdjustmentLine') IS NULL
CREATE TABLE Inventory.StockAdjustmentLine (
    StockAdjustmentLineId INT IDENTITY PRIMARY KEY,
    StockAdjustmentId INT NOT NULL FOREIGN KEY REFERENCES Inventory.StockAdjustment(StockAdjustmentId),
    ProductId    INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    BookQty      DECIMAL(14,3) NOT NULL,
    ActualQty    DECIMAL(14,3) NOT NULL,
    Difference   AS (ActualQty - BookQty) PERSISTED,
    ValueImpact  DECIMAL(14,2) NULL
);
GO

IF OBJECT_ID('Inventory.StockTransfer') IS NULL
CREATE TABLE Inventory.StockTransfer (
    StockTransferId INT IDENTITY PRIMARY KEY,
    TransferNo   NVARCHAR(30) NOT NULL UNIQUE,
    FromGodownId INT NOT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId),
    ToGodownId   INT NOT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId),
    TransferDate DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    Status       NVARCHAR(20) NOT NULL DEFAULT 'Draft',    -- Draft, Dispatched, Received
    CreatedBy    INT NULL,
    CreatedOn    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Inventory.StockTransferLine') IS NULL
CREATE TABLE Inventory.StockTransferLine (
    StockTransferLineId INT IDENTITY PRIMARY KEY,
    StockTransferId INT NOT NULL FOREIGN KEY REFERENCES Inventory.StockTransfer(StockTransferId),
    ProductId    INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    Qty          DECIMAL(14,3) NOT NULL
);
GO

IF OBJECT_ID('Inventory.Offcut') IS NULL
CREATE TABLE Inventory.Offcut (
    OffcutId    INT IDENTITY PRIMARY KEY,
    OffcutCode  NVARCHAR(40) NOT NULL UNIQUE,
    ProductId   INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    LengthMm    DECIMAL(10,2) NOT NULL,
    WidthMm     DECIMAL(10,2) NOT NULL,
    AreaSqft    AS (ROUND((LengthMm * WidthMm) / 92903.04, 3)) PERSISTED,
    GodownId    INT NOT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId),
    Status      NVARCHAR(20) NOT NULL DEFAULT 'Available',  -- Available, Reserved, Used, Scrapped
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Offcut_Search')
CREATE INDEX IX_Offcut_Search ON Inventory.Offcut (ProductId, LengthMm, WidthMm, Status);
GO

-------------------------------------------------------------------
-- Purchase schema
-------------------------------------------------------------------
IF OBJECT_ID('Purchase.PurchaseOrder') IS NULL
CREATE TABLE Purchase.PurchaseOrder (
    PurchaseOrderId INT IDENTITY PRIMARY KEY,
    PoNo        NVARCHAR(30) NOT NULL UNIQUE,
    SupplierId  INT NOT NULL FOREIGN KEY REFERENCES Master.Supplier(SupplierId),
    BranchId    INT NOT NULL FOREIGN KEY REFERENCES Company.Branch(BranchId),
    PoDate      DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    Status      NVARCHAR(20) NOT NULL DEFAULT 'Draft',   -- Draft, Approved, Sent, Closed, Cancelled
    TotalValue  DECIMAL(14,2) NOT NULL DEFAULT 0,
    CreatedBy   INT NULL,
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Purchase.PurchaseOrderLine') IS NULL
CREATE TABLE Purchase.PurchaseOrderLine (
    PurchaseOrderLineId INT IDENTITY PRIMARY KEY,
    PurchaseOrderId INT NOT NULL FOREIGN KEY REFERENCES Purchase.PurchaseOrder(PurchaseOrderId),
    ProductId   INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    Qty         DECIMAL(14,3) NOT NULL,
    Rate        DECIMAL(14,2) NOT NULL,
    Value       AS (Qty * Rate) PERSISTED
);
GO

IF OBJECT_ID('Purchase.Grn') IS NULL
CREATE TABLE Purchase.Grn (
    GrnId       INT IDENTITY PRIMARY KEY,
    GrnNo       NVARCHAR(30) NOT NULL UNIQUE,
    PurchaseOrderId INT NOT NULL FOREIGN KEY REFERENCES Purchase.PurchaseOrder(PurchaseOrderId),
    GrnDate     DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    Status      NVARCHAR(20) NOT NULL DEFAULT 'Draft',   -- Draft, Posted
    CreatedBy   INT NULL,
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Purchase.GrnLine') IS NULL
CREATE TABLE Purchase.GrnLine (
    GrnLineId   INT IDENTITY PRIMARY KEY,
    GrnId       INT NOT NULL FOREIGN KEY REFERENCES Purchase.Grn(GrnId),
    ProductId   INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    ReceivedQty DECIMAL(14,3) NOT NULL,
    AcceptedQty DECIMAL(14,3) NOT NULL DEFAULT 0,
    RejectedQty DECIMAL(14,3) NOT NULL DEFAULT 0,
    BrokenQty   DECIMAL(14,3) NOT NULL DEFAULT 0,
    BatchNo     NVARCHAR(40) NULL,
    CONSTRAINT CK_GrnLine_QtyBalance CHECK (AcceptedQty + RejectedQty + BrokenQty <= ReceivedQty)
);
GO

IF OBJECT_ID('Purchase.PurchaseInvoice') IS NULL
CREATE TABLE Purchase.PurchaseInvoice (
    PurchaseInvoiceId INT IDENTITY PRIMARY KEY,
    InvoiceNo         NVARCHAR(30) NOT NULL UNIQUE,
    GrnId             INT NOT NULL FOREIGN KEY REFERENCES Purchase.Grn(GrnId),
    SupplierInvoiceNo NVARCHAR(40) NULL,
    InvoiceDate       DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    TotalValue        DECIMAL(14,2) NOT NULL DEFAULT 0,
    Status            NVARCHAR(20) NOT NULL DEFAULT 'Booked',
    CreatedBy         INT NULL,
    CreatedOn         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-------------------------------------------------------------------
-- Sales: Quotation and Sales Order (extends existing Sales schema)
-------------------------------------------------------------------
IF OBJECT_ID('Sales.Quotation') IS NULL
CREATE TABLE Sales.Quotation (
    QuotationId INT IDENTITY PRIMARY KEY,
    QuotationNo NVARCHAR(30) NOT NULL UNIQUE,
    CustomerId  INT NOT NULL FOREIGN KEY REFERENCES Master.Customer(CustomerId),
    BranchId    INT NOT NULL FOREIGN KEY REFERENCES Company.Branch(BranchId),
    QuotationDate DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    ValidUntil  DATE NULL,
    Status      NVARCHAR(20) NOT NULL DEFAULT 'Draft',   -- Draft, Sent, Approved, Expired, Converted
    TotalValue  DECIMAL(14,2) NOT NULL DEFAULT 0,
    CreatedBy   INT NULL,
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Sales.QuotationLine') IS NULL
CREATE TABLE Sales.QuotationLine (
    QuotationLineId INT IDENTITY PRIMARY KEY,
    QuotationId INT NOT NULL FOREIGN KEY REFERENCES Sales.Quotation(QuotationId),
    ProductId   INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    Qty         DECIMAL(14,3) NOT NULL,
    Rate        DECIMAL(14,2) NOT NULL,
    Value       AS (Qty * Rate) PERSISTED
);
GO

IF OBJECT_ID('Sales.SalesOrder') IS NULL
CREATE TABLE Sales.SalesOrder (
    SalesOrderId INT IDENTITY PRIMARY KEY,
    OrderNo     NVARCHAR(30) NOT NULL UNIQUE,
    CustomerId  INT NOT NULL FOREIGN KEY REFERENCES Master.Customer(CustomerId),
    BranchId    INT NOT NULL FOREIGN KEY REFERENCES Company.Branch(BranchId),
    QuotationId INT NULL FOREIGN KEY REFERENCES Sales.Quotation(QuotationId),
    OrderDate   DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    Status      NVARCHAR(20) NOT NULL DEFAULT 'Draft',   -- Draft, Approved, InProduction, Completed, Cancelled
    TotalValue  DECIMAL(14,2) NOT NULL DEFAULT 0,
    CreatedBy   INT NULL,
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Sales.SalesOrderLine') IS NULL
CREATE TABLE Sales.SalesOrderLine (
    SalesOrderLineId INT IDENTITY PRIMARY KEY,
    SalesOrderId INT NOT NULL FOREIGN KEY REFERENCES Sales.SalesOrder(SalesOrderId),
    ProductId   INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    Qty         DECIMAL(14,3) NOT NULL,
    Rate        DECIMAL(14,2) NOT NULL,
    Value       AS (Qty * Rate) PERSISTED
);
GO

-------------------------------------------------------------------
-- Cutting schema
-------------------------------------------------------------------
IF OBJECT_ID('Cutting.CuttingPlan') IS NULL
CREATE TABLE Cutting.CuttingPlan (
    CuttingPlanId INT IDENTITY PRIMARY KEY,
    PlanNo        NVARCHAR(30) NOT NULL UNIQUE,
    SalesOrderId  INT NULL FOREIGN KEY REFERENCES Sales.SalesOrder(SalesOrderId),
    PlanDate      DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    Status        NVARCHAR(20) NOT NULL DEFAULT 'Draft',   -- Draft, Optimized, Completed
    TotalSheets   INT NOT NULL DEFAULT 0,
    YieldPct      DECIMAL(5,2) NULL,
    WasteAreaSqft DECIMAL(14,3) NULL,
    CreatedBy     INT NULL,
    CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Cutting.CuttingPlanLine') IS NULL
CREATE TABLE Cutting.CuttingPlanLine (
    CuttingPlanLineId INT IDENTITY PRIMARY KEY,
    CuttingPlanId INT NOT NULL FOREIGN KEY REFERENCES Cutting.CuttingPlan(CuttingPlanId),
    ProductId     INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    RequiredLengthMm DECIMAL(10,2) NOT NULL,
    RequiredWidthMm  DECIMAL(10,2) NOT NULL,
    Qty           INT NOT NULL,
    Status        NVARCHAR(20) NOT NULL DEFAULT 'Pending'   -- Pending, Cut
);
GO

-------------------------------------------------------------------
-- Production schema
-------------------------------------------------------------------
IF OBJECT_ID('Production.WorkOrder') IS NULL
CREATE TABLE Production.WorkOrder (
    WorkOrderId   INT IDENTITY PRIMARY KEY,
    WorkOrderNo   NVARCHAR(30) NOT NULL UNIQUE,
    SalesOrderId  INT NULL FOREIGN KEY REFERENCES Sales.SalesOrder(SalesOrderId),
    Status        NVARCHAR(20) NOT NULL DEFAULT 'Open',    -- Open, InProgress, Completed, Cancelled
    CreatedBy     INT NULL,
    CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Production.JobCard') IS NULL
CREATE TABLE Production.JobCard (
    JobCardId    INT IDENTITY PRIMARY KEY,
    JobCardNo    NVARCHAR(30) NOT NULL UNIQUE,
    WorkOrderId  INT NOT NULL FOREIGN KEY REFERENCES Production.WorkOrder(WorkOrderId),
    ProductId    INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    QtyIn        DECIMAL(14,3) NOT NULL,
    QtyPassed    DECIMAL(14,3) NOT NULL DEFAULT 0,
    QtyBroken    DECIMAL(14,3) NOT NULL DEFAULT 0,
    QtyRejected  DECIMAL(14,3) NOT NULL DEFAULT 0,
    Status       NVARCHAR(20) NOT NULL DEFAULT 'Pending',  -- Pending, Done
    CreatedOn    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_JobCard_QtyBalance CHECK (QtyPassed + QtyBroken + QtyRejected <= QtyIn)
);
GO

IF OBJECT_ID('Production.FurnaceBatch') IS NULL
CREATE TABLE Production.FurnaceBatch (
    FurnaceBatchId  INT IDENTITY PRIMARY KEY,
    BatchNo         NVARCHAR(30) NOT NULL UNIQUE,
    ThicknessMm     DECIMAL(6,2) NOT NULL,
    BatchDate       DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    UtilisationPct  DECIMAL(5,2) NULL,
    EstElectricityCost DECIMAL(14,2) NULL,
    Status          NVARCHAR(20) NOT NULL DEFAULT 'Planned',  -- Planned, Running, Completed
    CreatedOn       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-------------------------------------------------------------------
-- Finance schema
-------------------------------------------------------------------
IF OBJECT_ID('Finance.Voucher') IS NULL
CREATE TABLE Finance.Voucher (
    VoucherId   INT IDENTITY PRIMARY KEY,
    VoucherNo   NVARCHAR(30) NOT NULL UNIQUE,
    VoucherType NVARCHAR(20) NOT NULL,    -- Receipt, Payment
    VoucherDate DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    CustomerId  INT NULL FOREIGN KEY REFERENCES Master.Customer(CustomerId),
    SupplierId  INT NULL FOREIGN KEY REFERENCES Master.Supplier(SupplierId),
    Amount      DECIMAL(14,2) NOT NULL,
    Mode        NVARCHAR(20) NOT NULL DEFAULT 'Cash',   -- Cash, Bank, Cheque, UPI
    Narration   NVARCHAR(300) NULL,
    CreatedBy   INT NULL,
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Finance.Expense') IS NULL
CREATE TABLE Finance.Expense (
    ExpenseId   INT IDENTITY PRIMARY KEY,
    ExpenseNo   NVARCHAR(30) NOT NULL UNIQUE,
    ExpenseDate DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    Category    NVARCHAR(80) NOT NULL,
    Amount      DECIMAL(14,2) NOT NULL,
    PaidTo      NVARCHAR(150) NULL,
    Narration   NVARCHAR(300) NULL,
    Status      NVARCHAR(20) NOT NULL DEFAULT 'Draft',  -- Draft, Approved
    CreatedBy   INT NULL,
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-------------------------------------------------------------------
-- CRM schema
-------------------------------------------------------------------
IF OBJECT_ID('CRM.Complaint') IS NULL
CREATE TABLE CRM.Complaint (
    ComplaintId INT IDENTITY PRIMARY KEY,
    ComplaintNo NVARCHAR(30) NOT NULL UNIQUE,
    CustomerId  INT NOT NULL FOREIGN KEY REFERENCES Master.Customer(CustomerId),
    InvoiceId   INT NULL FOREIGN KEY REFERENCES Sales.Invoice(InvoiceId),
    Subject     NVARCHAR(200) NOT NULL,
    Description NVARCHAR(1000) NULL,
    Category    NVARCHAR(30) NOT NULL DEFAULT 'Other',  -- Breakage, Quality, Delay, Other
    Status      NVARCHAR(20) NOT NULL DEFAULT 'Open',   -- Open, InProgress, Resolved, Closed
    AssignedTo  NVARCHAR(120) NULL,
    TargetDate  DATE NULL,
    Resolution  NVARCHAR(1000) NULL,
    CreatedBy   INT NULL,
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-------------------------------------------------------------------
-- HR schema
-------------------------------------------------------------------
IF OBJECT_ID('HR.Employee') IS NULL
CREATE TABLE HR.Employee (
    EmployeeId    INT IDENTITY PRIMARY KEY,
    Code          NVARCHAR(30) NOT NULL UNIQUE,
    FullName      NVARCHAR(150) NOT NULL,
    Designation   NVARCHAR(100) NULL,
    Department    NVARCHAR(100) NULL,
    Phone         NVARCHAR(20) NULL,
    Email         NVARCHAR(150) NULL,
    DateOfJoining DATE NULL,
    DateOfLeaving DATE NULL,
    UserId        INT NULL FOREIGN KEY REFERENCES Security.[User](UserId),
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('HR.Attendance') IS NULL
CREATE TABLE HR.Attendance (
    AttendanceId  INT IDENTITY PRIMARY KEY,
    EmployeeId    INT NOT NULL FOREIGN KEY REFERENCES HR.Employee(EmployeeId),
    AttendanceDate DATE NOT NULL,
    Status        NVARCHAR(20) NOT NULL DEFAULT 'Present',  -- Present, Absent, HalfDay, Leave
    InTime        TIME NULL,
    OutTime       TIME NULL,
    CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Attendance UNIQUE (EmployeeId, AttendanceDate)
);
GO

PRINT 'Extended schema created successfully.';
