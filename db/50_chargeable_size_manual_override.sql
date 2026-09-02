-- Chargeable Height/Width become independently editable, per line, on Quotation, Sales Order and
-- Counter Billing (all three price through the shared QuotationCalculator/SalesLinePricing) --
-- overriding the auto-rounded figure for that one dimension outright, the same "wins over the
-- computed value" precedence ManualArea already has. Sales.InvoiceLine (Counter Billing's target
-- table) didn't previously even store the chargeable size at all, so ChargeLengthInch/
-- ChargeWidthInch are added there too, nullable to match its existing counter-billing-only columns.
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('Sales.QuotationLine', 'ManualChargeHeightInch') IS NULL
    ALTER TABLE Sales.QuotationLine ADD ManualChargeHeightInch DECIMAL(18,4) NULL;
GO
IF COL_LENGTH('Sales.QuotationLine', 'ManualChargeWidthInch') IS NULL
    ALTER TABLE Sales.QuotationLine ADD ManualChargeWidthInch DECIMAL(18,4) NULL;
GO
IF COL_LENGTH('Sales.QuotationLine', 'IsChargeSizeManualOverride') IS NULL
    ALTER TABLE Sales.QuotationLine ADD IsChargeSizeManualOverride BIT NOT NULL CONSTRAINT DF_QuotationLine_ChargeSizeOvr DEFAULT 0;
GO

IF COL_LENGTH('Sales.SalesOrderLine', 'ManualChargeHeightInch') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD ManualChargeHeightInch DECIMAL(18,4) NULL;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'ManualChargeWidthInch') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD ManualChargeWidthInch DECIMAL(18,4) NULL;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'IsChargeSizeManualOverride') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD IsChargeSizeManualOverride BIT NOT NULL CONSTRAINT DF_SalesOrderLine_ChargeSizeOvr DEFAULT 0;
GO

IF COL_LENGTH('Sales.InvoiceLine', 'ChargeLengthInch') IS NULL
    ALTER TABLE Sales.InvoiceLine ADD
        ChargeLengthInch DECIMAL(18,4) NULL,
        ChargeWidthInch DECIMAL(18,4) NULL,
        ManualChargeHeightInch DECIMAL(18,4) NULL,
        ManualChargeWidthInch DECIMAL(18,4) NULL,
        IsChargeSizeManualOverride BIT NOT NULL CONSTRAINT DF_InvoiceLine_ChargeSizeOvr DEFAULT 0;
GO
