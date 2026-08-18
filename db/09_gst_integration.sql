-- Rajendra Glass Centre - Inventory Management System
-- Phase 5: e-Invoice (IRP) and e-Way Bill government integration (SDD 10.2, API Spec Section 18)

USE RajendraGlassDb;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

IF SCHEMA_ID('Integration') IS NULL EXEC('CREATE SCHEMA Integration');
GO

-------------------------------------------------------------------
-- Sales.Invoice: e-Invoice (IRP) fields
-------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'IrnAckNo')
    ALTER TABLE Sales.Invoice ADD IrnAckNo NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'IrnAckDate')
    ALTER TABLE Sales.Invoice ADD IrnAckDate DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'IrnQrPayload')
    ALTER TABLE Sales.Invoice ADD IrnQrPayload NVARCHAR(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'EInvoiceStatus')
    ALTER TABLE Sales.Invoice ADD EInvoiceStatus NVARCHAR(20) NOT NULL DEFAULT 'NotGenerated';  -- NotGenerated, Generated, Cancelled, Failed
GO

-------------------------------------------------------------------
-- Dispatch.Waybill: e-Way Bill (government) fields — distinct from the
-- internal WaybillNo, which remains the company's own transport-doc series.
-------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Dispatch.Waybill') AND name = 'EwbNo')
    ALTER TABLE Dispatch.Waybill ADD EwbNo NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Dispatch.Waybill') AND name = 'EwbAckDate')
    ALTER TABLE Dispatch.Waybill ADD EwbAckDate DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Dispatch.Waybill') AND name = 'EwbValidUpto')
    ALTER TABLE Dispatch.Waybill ADD EwbValidUpto DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Dispatch.Waybill') AND name = 'EwbQrPayload')
    ALTER TABLE Dispatch.Waybill ADD EwbQrPayload NVARCHAR(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Dispatch.Waybill') AND name = 'EwayBillStatus')
    ALTER TABLE Dispatch.Waybill ADD EwayBillStatus NVARCHAR(20) NOT NULL DEFAULT 'NotGenerated';  -- NotGenerated, Generated, Cancelled, Failed
GO

-------------------------------------------------------------------
-- Integration.GatewayLog: every call to an external gateway (SDD 10.2) —
-- request/response captured for audit and troubleshooting, regardless of
-- whether the active provider is Mock or a real GSP/NIC endpoint.
-------------------------------------------------------------------
IF OBJECT_ID('Integration.GatewayLog') IS NULL
CREATE TABLE Integration.GatewayLog (
    GatewayLogId  BIGINT IDENTITY PRIMARY KEY,
    GatewayType   NVARCHAR(20) NOT NULL,     -- EInvoice, EwayBill
    Operation     NVARCHAR(20) NOT NULL,     -- Generate, Cancel
    Provider      NVARCHAR(20) NOT NULL,     -- Mock, Real
    DocType       NVARCHAR(20) NOT NULL,     -- Invoice, Waybill
    DocId         INT NOT NULL,
    RequestJson   NVARCHAR(MAX) NULL,
    ResponseJson  NVARCHAR(MAX) NULL,
    Status        NVARCHAR(20) NOT NULL,     -- Success, Failed
    ErrorMessage  NVARCHAR(500) NULL,
    DurationMs    INT NOT NULL DEFAULT 0,
    CreatedBy     INT NULL,
    CreatedOn     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GatewayLog_Doc')
CREATE INDEX IX_GatewayLog_Doc ON Integration.GatewayLog (DocType, DocId, CreatedOn DESC);
GO

PRINT 'e-Invoice/e-Way Bill integration schema created successfully.';
