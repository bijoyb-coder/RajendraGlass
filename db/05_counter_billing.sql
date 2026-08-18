-- Rajendra Glass Centre - Inventory Management System
-- Phase 3: Counter Billing / offline mode (SDD 4.7, FRS 9.3, API 2.7 & 9.3)

USE RajendraGlassDb;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

-------------------------------------------------------------------
-- Idempotency (API 2.7): a create request replayed with the same
-- Idempotency-Key returns the original result instead of duplicating.
-- Keys are retained 24 hours.
-------------------------------------------------------------------
IF OBJECT_ID('Security.IdempotencyKey') IS NULL
CREATE TABLE Security.IdempotencyKey (
    IdempotencyKeyId INT IDENTITY PRIMARY KEY,
    IdempotencyKey   NVARCHAR(80) NOT NULL UNIQUE,
    Endpoint         NVARCHAR(100) NOT NULL,
    StatusCode       INT NOT NULL,
    ResponseJson     NVARCHAR(MAX) NOT NULL,
    CreatedOn        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ExpiresOn        DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 24, SYSUTCDATETIME())
);
GO

-------------------------------------------------------------------
-- Sales.Invoice: counter-billing fields
-------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'Channel')
    ALTER TABLE Sales.Invoice ADD Channel NVARCHAR(20) NOT NULL DEFAULT 'Normal';   -- Normal, Counter
GO
-- Counter sales may be walk-in customers with no CustomerId on file.
ALTER TABLE Sales.Invoice ALTER COLUMN CustomerId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'TenderedCash')
    ALTER TABLE Sales.Invoice ADD TenderedCash DECIMAL(14,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'ChangeDue')
    ALTER TABLE Sales.Invoice ADD ChangeDue DECIMAL(14,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'SyncedFromOffline')
    ALTER TABLE Sales.Invoice ADD SyncedFromOffline BIT NOT NULL DEFAULT 0;
GO

-------------------------------------------------------------------
-- Doc series for counter invoices (separate unbroken series per branch/FY)
-------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM Company.DocSeries WHERE DocType = 'CounterInvoice')
    INSERT INTO Company.DocSeries (BranchId, DocType, FinancialYear, Prefix, NextNumber)
    SELECT BranchId, 'CounterInvoice', '2026-2027', 'RGC/CB/26-27/', 1 FROM Company.Branch;
GO

PRINT 'Counter billing schema created successfully.';
