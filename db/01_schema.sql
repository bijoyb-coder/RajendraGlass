-- Rajendra Glass Centre - Inventory Management System
-- Phase 1 schema: Security, Company, Master Data, Sales, Dispatch
-- Per SDD Section 7 (Database Design)

IF DB_ID('RajendraGlassDb') IS NULL
BEGIN
    CREATE DATABASE RajendraGlassDb;
END
GO

USE RajendraGlassDb;
GO

IF SCHEMA_ID('Security') IS NULL EXEC('CREATE SCHEMA Security');
IF SCHEMA_ID('Company')  IS NULL EXEC('CREATE SCHEMA Company');
IF SCHEMA_ID('Master')   IS NULL EXEC('CREATE SCHEMA Master');
IF SCHEMA_ID('Sales')    IS NULL EXEC('CREATE SCHEMA Sales');
IF SCHEMA_ID('Dispatch') IS NULL EXEC('CREATE SCHEMA Dispatch');
GO

-------------------------------------------------------------------
-- Security schema
-------------------------------------------------------------------
IF OBJECT_ID('Security.Role') IS NULL
CREATE TABLE Security.Role (
    RoleId      INT IDENTITY PRIMARY KEY,
    Name        NVARCHAR(60) NOT NULL UNIQUE,
    Description NVARCHAR(200) NULL,
    IsActive    BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('Security.[User]') IS NULL
CREATE TABLE Security.[User] (
    UserId          INT IDENTITY PRIMARY KEY,
    Username        NVARCHAR(60) NOT NULL UNIQUE,
    FullName        NVARCHAR(120) NOT NULL,
    Email           NVARCHAR(150) NULL,
    Mobile          NVARCHAR(20) NULL,
    PasswordHash    NVARCHAR(200) NOT NULL,
    IsActive        BIT NOT NULL DEFAULT 1,
    FailedAttempts  INT NOT NULL DEFAULT 0,
    LockedUntil     DATETIME2 NULL,
    LastLoginOn     DATETIME2 NULL,
    CreatedBy       INT NULL,
    CreatedOn       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ModifiedBy      INT NULL,
    ModifiedOn      DATETIME2 NULL,
    RowVersion      ROWVERSION
);
GO

IF OBJECT_ID('Security.UserRole') IS NULL
CREATE TABLE Security.UserRole (
    UserId INT NOT NULL FOREIGN KEY REFERENCES Security.[User](UserId),
    RoleId INT NOT NULL FOREIGN KEY REFERENCES Security.Role(RoleId),
    PRIMARY KEY (UserId, RoleId)
);
GO

IF OBJECT_ID('Security.RefreshToken') IS NULL
CREATE TABLE Security.RefreshToken (
    TokenId    INT IDENTITY PRIMARY KEY,
    UserId     INT NOT NULL FOREIGN KEY REFERENCES Security.[User](UserId),
    TokenHash  NVARCHAR(200) NOT NULL,
    ExpiresOn  DATETIME2 NOT NULL,
    RevokedOn  DATETIME2 NULL,
    CreatedOn  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('Security.AuditLog') IS NULL
CREATE TABLE Security.AuditLog (
    AuditId     BIGINT IDENTITY PRIMARY KEY,
    UserId      INT NULL,
    Action      NVARCHAR(100) NOT NULL,
    Entity      NVARCHAR(100) NOT NULL,
    EntityId    NVARCHAR(50) NULL,
    BeforeJson  NVARCHAR(MAX) NULL,
    AfterJson   NVARCHAR(MAX) NULL,
    IpAddress   NVARCHAR(50) NULL,
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-------------------------------------------------------------------
-- Company schema
-------------------------------------------------------------------
IF OBJECT_ID('Company.Company') IS NULL
CREATE TABLE Company.Company (
    CompanyId        INT IDENTITY PRIMARY KEY,
    LegalName         NVARCHAR(200) NOT NULL,
    TradeName         NVARCHAR(200) NULL,
    RegisteredAddress NVARCHAR(400) NULL,
    BusinessAddress   NVARCHAR(400) NULL,
    Gstin             CHAR(15) NULL,
    Pan               CHAR(10) NULL,
    Cin               NVARCHAR(30) NULL,
    Phone             NVARCHAR(20) NULL,
    Mobile            NVARCHAR(20) NULL,
    Email             NVARCHAR(150) NULL,
    Website           NVARCHAR(150) NULL,
    LogoUrl           NVARCHAR(300) NULL,
    BankName          NVARCHAR(150) NULL,
    AccountNumber     NVARCHAR(40) NULL,
    Ifsc              NVARCHAR(15) NULL,
    BankBranch        NVARCHAR(150) NULL,
    AuthSignatoryName NVARCHAR(150) NULL,
    TermsAndConditions NVARCHAR(MAX) NULL,
    InvoiceFooterNote NVARCHAR(500) NULL,
    RowVersion        ROWVERSION
);
GO

IF OBJECT_ID('Company.Branch') IS NULL
CREATE TABLE Company.Branch (
    BranchId   INT IDENTITY PRIMARY KEY,
    CompanyId  INT NOT NULL FOREIGN KEY REFERENCES Company.Company(CompanyId),
    Code       NVARCHAR(20) NOT NULL UNIQUE,
    Name       NVARCHAR(150) NOT NULL,
    Gstin      CHAR(15) NULL,
    Address    NVARCHAR(400) NULL,
    StateCode  NVARCHAR(5) NULL,
    IsActive   BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('Company.DocSeries') IS NULL
CREATE TABLE Company.DocSeries (
    DocSeriesId INT IDENTITY PRIMARY KEY,
    BranchId    INT NOT NULL FOREIGN KEY REFERENCES Company.Branch(BranchId),
    DocType     NVARCHAR(30) NOT NULL,      -- Invoice, Waybill, ...
    FinancialYear NVARCHAR(9) NOT NULL,     -- e.g. 2026-2027
    Prefix      NVARCHAR(20) NOT NULL,
    NextNumber  INT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_DocSeries UNIQUE (BranchId, DocType, FinancialYear)
);
GO

-------------------------------------------------------------------
-- Master data schema
-------------------------------------------------------------------
IF OBJECT_ID('Master.Product') IS NULL
CREATE TABLE Master.Product (
    ProductId       INT IDENTITY PRIMARY KEY,
    Code            NVARCHAR(40) NOT NULL UNIQUE,
    Description     NVARCHAR(300) NOT NULL,
    Category        NVARCHAR(100) NULL,
    Brand           NVARCHAR(100) NULL,
    ThicknessMm     DECIMAL(6,2) NULL,
    Colour          NVARCHAR(60) NULL,
    HsnCode         NVARCHAR(10) NULL,
    GstRatePct      DECIMAL(5,2) NOT NULL DEFAULT 18,
    StockUnit       NVARCHAR(20) NOT NULL DEFAULT 'Sqm',
    SellingUnit     NVARCHAR(20) NOT NULL DEFAULT 'Sqm',
    PurchaseRate    DECIMAL(14,2) NULL,
    SellingRate     DECIMAL(14,2) NULL,
    MinSellingPrice DECIMAL(14,2) NULL,
    MinStock        DECIMAL(14,3) NULL,
    MaxStock        DECIMAL(14,3) NULL,
    ReorderLevel    DECIMAL(14,3) NULL,
    IsActive        BIT NOT NULL DEFAULT 1,
    CreatedOn       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    RowVersion      ROWVERSION
);
GO

IF OBJECT_ID('Master.Customer') IS NULL
CREATE TABLE Master.Customer (
    CustomerId      INT IDENTITY PRIMARY KEY,
    Code            NVARCHAR(40) NOT NULL UNIQUE,
    Name            NVARCHAR(200) NOT NULL,
    Gstin           CHAR(15) NULL,
    Pan             CHAR(10) NULL,
    Phone           NVARCHAR(20) NULL,
    Mobile          NVARCHAR(20) NULL,
    Email           NVARCHAR(150) NULL,
    BillingAddress  NVARCHAR(400) NULL,
    DeliveryAddress NVARCHAR(400) NULL,
    StateCode       NVARCHAR(5) NULL,
    StateName       NVARCHAR(60) NULL,
    CreditLimit     DECIMAL(14,2) NOT NULL DEFAULT 0,
    CreditPeriodDays INT NOT NULL DEFAULT 0,
    CreditBlocked   BIT NOT NULL DEFAULT 0,
    IsActive        BIT NOT NULL DEFAULT 1,
    CreatedOn       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    RowVersion      ROWVERSION
);
GO

IF OBJECT_ID('Master.Transporter') IS NULL
CREATE TABLE Master.Transporter (
    TransporterId   INT IDENTITY PRIMARY KEY,
    Code            NVARCHAR(40) NOT NULL UNIQUE,
    Name            NVARCHAR(200) NOT NULL,
    Gstin           CHAR(15) NULL,
    Phone           NVARCHAR(20) NULL,
    IsActive        BIT NOT NULL DEFAULT 1
);
GO

IF OBJECT_ID('Master.Vehicle') IS NULL
CREATE TABLE Master.Vehicle (
    VehicleId       INT IDENTITY PRIMARY KEY,
    TransporterId   INT NULL FOREIGN KEY REFERENCES Master.Transporter(TransporterId),
    VehicleNo       NVARCHAR(20) NOT NULL,
    DriverName      NVARCHAR(120) NULL,
    DriverMobile    NVARCHAR(20) NULL,
    CapacityKg      DECIMAL(12,2) NULL,
    IsActive        BIT NOT NULL DEFAULT 1
);
GO

-------------------------------------------------------------------
-- Sales schema
-------------------------------------------------------------------
IF OBJECT_ID('Sales.Invoice') IS NULL
CREATE TABLE Sales.Invoice (
    InvoiceId        INT IDENTITY PRIMARY KEY,
    InvoiceNo         NVARCHAR(30) NOT NULL UNIQUE,
    BranchId          INT NOT NULL FOREIGN KEY REFERENCES Company.Branch(BranchId),
    CustomerId        INT NOT NULL FOREIGN KEY REFERENCES Master.Customer(CustomerId),
    InvoiceDate       DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
    PlaceOfSupply     NVARCHAR(60) NULL,
    CustomerOrderRef  NVARCHAR(60) NULL,
    TransporterId     INT NULL FOREIGN KEY REFERENCES Master.Transporter(TransporterId),
    VehicleNo         NVARCHAR(20) NULL,
    Destination       NVARCHAR(150) NULL,
    BasicValue        DECIMAL(14,2) NOT NULL DEFAULT 0,
    DiscountValue     DECIMAL(14,2) NOT NULL DEFAULT 0,
    TaxableValue      DECIMAL(14,2) NOT NULL DEFAULT 0,
    CgstValue         DECIMAL(14,2) NOT NULL DEFAULT 0,
    SgstValue         DECIMAL(14,2) NOT NULL DEFAULT 0,
    IgstValue         DECIMAL(14,2) NOT NULL DEFAULT 0,
    RoundOff          DECIMAL(6,2) NOT NULL DEFAULT 0,
    TotalValue        DECIMAL(14,2) NOT NULL DEFAULT 0,
    Status            NVARCHAR(20) NOT NULL DEFAULT 'Draft',   -- Draft, PendingApproval, Approved, Cancelled
    IrnNo             NVARCHAR(80) NULL,
    EwayBillNo        NVARCHAR(30) NULL,
    Remarks           NVARCHAR(400) NULL,
    CreatedBy         INT NULL,
    CreatedOn         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ModifiedBy        INT NULL,
    ModifiedOn        DATETIME2 NULL,
    RowVersion        ROWVERSION
);
GO

IF OBJECT_ID('Sales.InvoiceLine') IS NULL
CREATE TABLE Sales.InvoiceLine (
    InvoiceLineId  INT IDENTITY PRIMARY KEY,
    InvoiceId      INT NOT NULL FOREIGN KEY REFERENCES Sales.Invoice(InvoiceId),
    LineNumber     INT NOT NULL,
    ProductId      INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    Description    NVARCHAR(300) NULL,
    NoOfSheets     DECIMAL(10,2) NULL,
    Quantity       DECIMAL(14,3) NOT NULL,       -- sqm/sqft
    RatePerUnit    DECIMAL(14,2) NOT NULL,
    BasicValue     DECIMAL(14,2) NOT NULL,
    DiscountValue  DECIMAL(14,2) NOT NULL DEFAULT 0,
    NetValue       DECIMAL(14,2) NOT NULL,
    GstRatePct     DECIMAL(5,2) NOT NULL DEFAULT 18
);
GO

-------------------------------------------------------------------
-- Dispatch schema (Waybill / e-Way Bill)
-------------------------------------------------------------------
IF OBJECT_ID('Dispatch.Waybill') IS NULL
CREATE TABLE Dispatch.Waybill (
    WaybillId        INT IDENTITY PRIMARY KEY,
    WaybillNo         NVARCHAR(30) NOT NULL UNIQUE,     -- e-Way Bill No
    InvoiceId         INT NOT NULL FOREIGN KEY REFERENCES Sales.Invoice(InvoiceId),
    GeneratedDate     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ValidUntil        DATETIME2 NULL,
    SupplyType        NVARCHAR(20) NOT NULL DEFAULT 'Outward',
    SubType           NVARCHAR(30) NOT NULL DEFAULT 'Supply',
    FromAddress       NVARCHAR(300) NULL,
    ToAddress         NVARCHAR(300) NULL,
    TransporterId     INT NULL FOREIGN KEY REFERENCES Master.Transporter(TransporterId),
    VehicleNo         NVARCHAR(20) NULL,
    DistanceKm        DECIMAL(10,2) NULL,
    ApproxDistanceKm  DECIMAL(10,2) NULL,
    TransportMode     NVARCHAR(20) NOT NULL DEFAULT 'Road',
    Status            NVARCHAR(20) NOT NULL DEFAULT 'Generated',  -- Generated, InTransit, Delivered, Cancelled
    CreatedBy         INT NULL,
    CreatedOn         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    RowVersion        ROWVERSION
);
GO

PRINT 'Schema created successfully.';
