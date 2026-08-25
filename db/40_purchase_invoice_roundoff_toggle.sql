-- Purchase Invoice always rounded its Total to the nearest whole rupee. Make that optional: a new
-- RoundOffEnabled flag, defaulting to the existing behaviour (true) so nothing changes for invoices
-- already booked or for anyone who doesn't touch the new checkbox.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'RoundOffEnabled')
    ALTER TABLE Purchase.PurchaseInvoice ADD RoundOffEnabled BIT NOT NULL DEFAULT 1;
GO
