-- Both sample supplier tax invoices carry an e-Way Bill number for the incoming shipment; capture
-- it as a plain reference field on Purchase Invoice (not generated via any gateway -- it's the
-- supplier's own e-Way Bill, entered from their paper invoice).
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'EwayBillNo')
    ALTER TABLE Purchase.PurchaseInvoice ADD EwayBillNo NVARCHAR(30) NULL;
GO
