-- Split payments: a single sale/receipt may be settled across several payment methods at once
-- (e.g. Cash 20 + UPI 50 + Cheque 30 = 100). Applies to both Counter Billing (Sales.Invoice) and
-- Payment Transactions (Finance.Voucher).
SET QUOTED_IDENTIFIER ON;
GO

-- ---------- Counter Billing ----------
-- Allow 'Split' as a summary PaymentType on the invoice header when it was settled by more than
-- one method; the true breakdown lives in Sales.InvoicePayment below.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Invoice_PaymentType')
    ALTER TABLE Sales.Invoice DROP CONSTRAINT CK_Invoice_PaymentType;
GO
ALTER TABLE Sales.Invoice ADD CONSTRAINT CK_Invoice_PaymentType CHECK (PaymentType IN ('Cash','Cheque','UPI','Split'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InvoicePayment' AND schema_id = SCHEMA_ID('Sales'))
BEGIN
    CREATE TABLE Sales.InvoicePayment (
        InvoicePaymentId INT IDENTITY(1,1) PRIMARY KEY,
        InvoiceId INT NOT NULL REFERENCES Sales.Invoice(InvoiceId),
        PaymentType NVARCHAR(20) NOT NULL CHECK (PaymentType IN ('Cash','Cheque','UPI')),
        Amount DECIMAL(18,2) NOT NULL CHECK (Amount > 0),
        ReferenceNo NVARCHAR(50) NULL,
        CreatedOn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_InvoicePayment_InvoiceId ON Sales.InvoicePayment(InvoiceId);
END
GO

-- ---------- Payment Transactions (Finance.Voucher) ----------
-- Ties together the N rows a single split payment produces, so the list can show them as one
-- transaction. NULL for an ordinary single-method voucher — nothing about existing rows changes.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Finance.Voucher') AND name = 'SplitGroupId')
    ALTER TABLE Finance.Voucher ADD SplitGroupId UNIQUEIDENTIFIER NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Voucher_SplitGroupId')
    CREATE INDEX IX_Voucher_SplitGroupId ON Finance.Voucher(SplitGroupId) WHERE SplitGroupId IS NOT NULL;
GO
