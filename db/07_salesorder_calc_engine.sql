-- Brings Sales.SalesOrderLine up to the same shape as Sales.QuotationLine so an order carries
-- the glass sizing and GST rather than collapsing to qty x rate. Both are priced by the one
-- engine (server/Data/QuotationCalculator.cs).
--
-- Additive only; the existing Qty/Rate/Value columns stay and are back-filled.
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

USE RajendraGlassDb;
GO

-- Charge-only lines (van, cutter, dues) carry no product.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.SalesOrderLine')
           AND name = 'ProductId' AND is_nullable = 0)
    ALTER TABLE Sales.SalesOrderLine ALTER COLUMN ProductId INT NULL;
GO

IF COL_LENGTH('Sales.SalesOrderLine', 'Description') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD Description NVARCHAR(200) NULL;
GO

-- ---------- Size as entered ----------
IF COL_LENGTH('Sales.SalesOrderLine', 'Length') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD Length DECIMAL(18, 4) NOT NULL CONSTRAINT DF_SalesOrderLine_Length DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'Width') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD Width DECIMAL(18, 4) NOT NULL CONSTRAINT DF_SalesOrderLine_Width DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'DimensionUnit') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD DimensionUnit NVARCHAR(10) NOT NULL CONSTRAINT DF_SalesOrderLine_DimUnit DEFAULT 'METRE';
GO

-- ---------- Pricing basis ----------
IF COL_LENGTH('Sales.SalesOrderLine', 'RateUnit') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD RateUnit NVARCHAR(20) NOT NULL CONSTRAINT DF_SalesOrderLine_RateUnit DEFAULT 'PER_SQM';
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'ApplyThickness') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD ApplyThickness BIT NOT NULL CONSTRAINT DF_SalesOrderLine_ApplyThick DEFAULT 1;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'ChargeRoundingInch') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD ChargeRoundingInch DECIMAL(9, 4) NOT NULL CONSTRAINT DF_SalesOrderLine_ChargeRound DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'ThicknessMm') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD ThicknessMm DECIMAL(18, 4) NULL;
GO

-- ---------- Converted / derived sizes ----------
IF COL_LENGTH('Sales.SalesOrderLine', 'LengthInch') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD LengthInch DECIMAL(18, 4) NOT NULL CONSTRAINT DF_SalesOrderLine_LenIn DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'WidthInch') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD WidthInch DECIMAL(18, 4) NOT NULL CONSTRAINT DF_SalesOrderLine_WidIn DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'ChargeLengthInch') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD ChargeLengthInch DECIMAL(18, 4) NOT NULL CONSTRAINT DF_SalesOrderLine_ChgLen DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'ChargeWidthInch') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD ChargeWidthInch DECIMAL(18, 4) NOT NULL CONSTRAINT DF_SalesOrderLine_ChgWid DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'CalculatedArea') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD CalculatedArea DECIMAL(18, 6) NOT NULL CONSTRAINT DF_SalesOrderLine_CalcArea DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'Area') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD Area DECIMAL(18, 6) NOT NULL CONSTRAINT DF_SalesOrderLine_AreaValue DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'AreaUnit') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD AreaUnit NVARCHAR(10) NOT NULL CONSTRAINT DF_SalesOrderLine_AreaUnit DEFAULT 'SQM';
GO

-- ---------- Money ----------
IF COL_LENGTH('Sales.SalesOrderLine', 'EffectiveRate') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD EffectiveRate DECIMAL(18, 6) NOT NULL CONSTRAINT DF_SalesOrderLine_EffRate DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'CalculatedBasicAmount') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD CalculatedBasicAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_SalesOrderLine_CalcBasic DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'BasicAmount') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD BasicAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_SalesOrderLine_Basic DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'DiscountPct') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD DiscountPct DECIMAL(9, 4) NOT NULL CONSTRAINT DF_SalesOrderLine_DiscPct DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'DiscountAmount') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD DiscountAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_SalesOrderLine_DiscAmt DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'TaxableAmount') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD TaxableAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_SalesOrderLine_Taxable DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'GstPct') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD GstPct DECIMAL(9, 4) NOT NULL CONSTRAINT DF_SalesOrderLine_GstPct DEFAULT 18;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'GstAmount') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD GstAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_SalesOrderLine_GstAmt DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'Amount') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD Amount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_SalesOrderLine_Amount DEFAULT 0;
GO

-- ---------- Manual overrides + audit ----------
IF COL_LENGTH('Sales.SalesOrderLine', 'ManualArea') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD ManualArea DECIMAL(18, 6) NULL;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'ManualBasicAmount') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD ManualBasicAmount DECIMAL(18, 2) NULL;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'IsAreaManualOverride') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD IsAreaManualOverride BIT NOT NULL CONSTRAINT DF_SalesOrderLine_AreaOvr DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'IsAmountManualOverride') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD IsAmountManualOverride BIT NOT NULL CONSTRAINT DF_SalesOrderLine_AmtOvr DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'CalculationMethod') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD CalculationMethod NVARCHAR(30) NOT NULL CONSTRAINT DF_SalesOrderLine_CalcMethod DEFAULT 'AUTO_AREA_SQM';
GO
IF COL_LENGTH('Sales.SalesOrderLine', 'CalculationMetadata') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD CalculationMetadata NVARCHAR(MAX) NULL;
GO

-- Order header: GST is now tracked separately from the taxable value.
IF COL_LENGTH('Sales.SalesOrder', 'BasicValue') IS NULL
    ALTER TABLE Sales.SalesOrder ADD BasicValue DECIMAL(18, 2) NOT NULL CONSTRAINT DF_SalesOrder_BasicValue DEFAULT 0;
GO
IF COL_LENGTH('Sales.SalesOrder', 'GstValue') IS NULL
    ALTER TABLE Sales.SalesOrder ADD GstValue DECIMAL(18, 2) NOT NULL CONSTRAINT DF_SalesOrder_GstValue DEFAULT 0;
GO

-- ---------- Back-fill existing rows ----------
-- Older orders were priced as qty x rate with no size and no GST; keep those figures.
UPDATE Sales.SalesOrderLine
SET BasicAmount = ISNULL(Value, Qty * Rate),
    CalculatedBasicAmount = ISNULL(Value, Qty * Rate),
    TaxableAmount = ISNULL(Value, Qty * Rate),
    Amount = ISNULL(Value, Qty * Rate),
    EffectiveRate = Rate,
    RateUnit = 'PER_PIECE',
    AreaUnit = 'PIECE',
    ApplyThickness = 0,
    GstPct = 0,
    CalculationMethod = 'AUTO_PIECE'
WHERE BasicAmount = 0 AND Amount = 0;
GO

UPDATE o
SET BasicValue = x.Basic, GstValue = x.Gst
FROM Sales.SalesOrder o
JOIN (SELECT SalesOrderId, SUM(BasicAmount) AS Basic, SUM(GstAmount) AS Gst
      FROM Sales.SalesOrderLine GROUP BY SalesOrderId) x ON x.SalesOrderId = o.SalesOrderId
WHERE o.BasicValue = 0;
GO
