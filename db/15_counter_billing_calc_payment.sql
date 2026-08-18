-- Counter Billing: Payment Type (Cash/Cheque/UPI) + line pricing detail identical to the
-- Quotation calculation engine (Sheet3 rules — see server/Data/QuotationCalculator.cs).

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'PaymentType')
    ALTER TABLE Sales.Invoice ADD PaymentType NVARCHAR(20) NOT NULL CONSTRAINT DF_Invoice_PaymentType DEFAULT 'Cash';
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'ReferenceNo')
    ALTER TABLE Sales.Invoice ADD ReferenceNo NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Invoice_PaymentType')
    ALTER TABLE Sales.Invoice ADD CONSTRAINT CK_Invoice_PaymentType CHECK (PaymentType IN ('Cash','Cheque','UPI'));
GO

-- Nullable — only Counter Billing populates these. Regular invoices (generated from a Sales
-- Order, which already carries this same detail on Sales.SalesOrderLine) keep working with
-- these columns NULL, exactly as before this migration.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.InvoiceLine') AND name = 'Length')
BEGIN
    ALTER TABLE Sales.InvoiceLine ADD
        Length DECIMAL(18,4) NULL,
        Width DECIMAL(18,4) NULL,
        DimensionUnit NVARCHAR(10) NULL,
        RateUnit NVARCHAR(20) NULL,
        ApplyThickness BIT NULL,
        ChargeRoundingInch DECIMAL(18,4) NULL,
        ThicknessMm DECIMAL(18,4) NULL,
        DiscountPct DECIMAL(9,4) NULL,
        ManualArea DECIMAL(18,4) NULL,
        ManualBasicAmount DECIMAL(18,4) NULL,
        CalculatedArea DECIMAL(18,4) NULL,
        Area DECIMAL(18,4) NULL,
        AreaUnit NVARCHAR(10) NULL,
        EffectiveRate DECIMAL(18,4) NULL,
        CalculationMethod NVARCHAR(30) NULL,
        CalculationMetadata NVARCHAR(MAX) NULL;
END
GO
