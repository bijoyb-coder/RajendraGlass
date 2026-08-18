-- Rajendra Glass Centre - Inventory Management System
-- Phase 6: Notification inbox for SignalR real-time push (SDD 10.1, FRS 15)

USE RajendraGlassDb;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('Security.Notification') IS NULL
CREATE TABLE Security.Notification (
    NotificationId BIGINT IDENTITY PRIMARY KEY,
    -- Exactly one of UserId/Role identifies the audience; Role fans out to everyone holding it
    -- (used for broadcast-style events like "low stock" or "new complaint") while UserId targets
    -- one person (e.g. "your e-Invoice generation failed").
    UserId      INT NULL FOREIGN KEY REFERENCES Security.[User](UserId),
    Role        NVARCHAR(60) NULL,
    Type        NVARCHAR(40) NOT NULL,      -- InvoiceCreated, EInvoiceGenerated, EwayBillGenerated, StockLow, ComplaintCreated, OfflineSaleSynced, ...
    Title       NVARCHAR(150) NOT NULL,
    Message     NVARCHAR(400) NULL,
    Link        NVARCHAR(200) NULL,          -- client-side route to open on click, e.g. /sales/invoices/42
    IsRead      BIT NOT NULL DEFAULT 0,
    CreatedOn   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notification_User')
CREATE INDEX IX_Notification_User ON Security.Notification (UserId, IsRead, CreatedOn DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notification_Role')
CREATE INDEX IX_Notification_Role ON Security.Notification (Role, CreatedOn DESC);
GO

PRINT 'Notification schema created successfully.';
