-- Aligns Sales.QuotationLine with the calculation engine reverse-engineered from the business
-- workbook (test.xlsx, Sheet3). See server/Data/QuotationCalculator.cs for the rules.
--
-- Additive only: existing columns are kept and back-filled, so saved quotations survive.
--   HeightMm/WidthMm/HeightMeter/WidthMeter  -> Length/Width + DimensionUnit
--   ChargeType                               -> ChargeRoundingInch
--   ChargeableAmount                         -> stays, and now means the basic (pre-GST) amount
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

USE RajendraGlassDb;
GO

-- ---------- Size as entered, in one place ----------
IF COL_LENGTH('Sales.QuotationLine', 'Length') IS NULL
    ALTER TABLE Sales.QuotationLine ADD Length DECIMAL(18, 4) NOT NULL CONSTRAINT DF_QuotationLine_Length DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'Width') IS NULL
    ALTER TABLE Sales.QuotationLine ADD Width DECIMAL(18, 4) NOT NULL CONSTRAINT DF_QuotationLine_Width DEFAULT 0;
GO
-- MM | CM | INCH | FEET | METRE
IF COL_LENGTH('Sales.QuotationLine', 'DimensionUnit') IS NULL
    ALTER TABLE Sales.QuotationLine ADD DimensionUnit NVARCHAR(10) NOT NULL CONSTRAINT DF_QuotationLine_DimUnit DEFAULT 'METRE';
GO

-- ---------- Pricing basis ----------
-- PER_SQFT | PER_SQM | PER_PIECE
IF COL_LENGTH('Sales.QuotationLine', 'RateUnit') IS NULL
    ALTER TABLE Sales.QuotationLine ADD RateUnit NVARCHAR(20) NOT NULL CONSTRAINT DF_QuotationLine_RateUnit DEFAULT 'PER_SQM';
GO
-- Sheet3's metre convention folds thickness into the rate (hidden column H = Rate x Thick);
-- its sqft rows do not. Hence a per-line switch rather than a hard-coded rule.
IF COL_LENGTH('Sales.QuotationLine', 'ApplyThickness') IS NULL
    ALTER TABLE Sales.QuotationLine ADD ApplyThickness BIT NOT NULL CONSTRAINT DF_QuotationLine_ApplyThick DEFAULT 1;
GO
-- Round each dimension up to the next multiple of this many inches; 0 = bill the measured size.
IF COL_LENGTH('Sales.QuotationLine', 'ChargeRoundingInch') IS NULL
    ALTER TABLE Sales.QuotationLine ADD ChargeRoundingInch DECIMAL(9, 4) NOT NULL CONSTRAINT DF_QuotationLine_ChargeRound DEFAULT 0;
GO

-- ---------- Area ----------
-- NB: DF_QuotationLine_Area is already taken by the older AreaSqft column, hence the suffix.
IF COL_LENGTH('Sales.QuotationLine', 'Area') IS NULL
    ALTER TABLE Sales.QuotationLine ADD Area DECIMAL(18, 6) NOT NULL CONSTRAINT DF_QuotationLine_AreaValue DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'AreaUnit') IS NULL
    ALTER TABLE Sales.QuotationLine ADD AreaUnit NVARCHAR(10) NOT NULL CONSTRAINT DF_QuotationLine_AreaUnit DEFAULT 'SQM';
GO
IF COL_LENGTH('Sales.QuotationLine', 'CalculatedArea') IS NULL
    ALTER TABLE Sales.QuotationLine ADD CalculatedArea DECIMAL(18, 6) NOT NULL CONSTRAINT DF_QuotationLine_CalcArea DEFAULT 0;
GO

-- ---------- Money ----------
IF COL_LENGTH('Sales.QuotationLine', 'EffectiveRate') IS NULL
    ALTER TABLE Sales.QuotationLine ADD EffectiveRate DECIMAL(18, 6) NOT NULL CONSTRAINT DF_QuotationLine_EffRate DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'CalculatedBasicAmount') IS NULL
    ALTER TABLE Sales.QuotationLine ADD CalculatedBasicAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_QuotationLine_CalcBasic DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'DiscountPct') IS NULL
    ALTER TABLE Sales.QuotationLine ADD DiscountPct DECIMAL(9, 4) NOT NULL CONSTRAINT DF_QuotationLine_DiscPct DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'DiscountAmount') IS NULL
    ALTER TABLE Sales.QuotationLine ADD DiscountAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_QuotationLine_DiscAmt DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'TaxableAmount') IS NULL
    ALTER TABLE Sales.QuotationLine ADD TaxableAmount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_QuotationLine_Taxable DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'GstPct') IS NULL
    ALTER TABLE Sales.QuotationLine ADD GstPct DECIMAL(9, 4) NOT NULL CONSTRAINT DF_QuotationLine_GstPct DEFAULT 18;
GO

-- ---------- Manual overrides + audit ----------
IF COL_LENGTH('Sales.QuotationLine', 'ManualArea') IS NULL
    ALTER TABLE Sales.QuotationLine ADD ManualArea DECIMAL(18, 6) NULL;
GO
IF COL_LENGTH('Sales.QuotationLine', 'ManualBasicAmount') IS NULL
    ALTER TABLE Sales.QuotationLine ADD ManualBasicAmount DECIMAL(18, 2) NULL;
GO
IF COL_LENGTH('Sales.QuotationLine', 'IsAreaManualOverride') IS NULL
    ALTER TABLE Sales.QuotationLine ADD IsAreaManualOverride BIT NOT NULL CONSTRAINT DF_QuotationLine_AreaOvr DEFAULT 0;
GO
IF COL_LENGTH('Sales.QuotationLine', 'IsAmountManualOverride') IS NULL
    ALTER TABLE Sales.QuotationLine ADD IsAmountManualOverride BIT NOT NULL CONSTRAINT DF_QuotationLine_AmtOvr DEFAULT 0;
GO
-- AUTO_AREA_SQFT | AUTO_AREA_SQM | AUTO_PIECE | MANUAL_AREA | MANUAL_OVERRIDE
IF COL_LENGTH('Sales.QuotationLine', 'CalculationMethod') IS NULL
    ALTER TABLE Sales.QuotationLine ADD CalculationMethod NVARCHAR(30) NOT NULL CONSTRAINT DF_QuotationLine_CalcMethod DEFAULT 'AUTO_AREA_SQM';
GO
-- Free-form JSON: the exact inputs the amount was derived from, for later audit.
IF COL_LENGTH('Sales.QuotationLine', 'CalculationMetadata') IS NULL
    ALTER TABLE Sales.QuotationLine ADD CalculationMetadata NVARCHAR(MAX) NULL;
GO
-- Line description, so charge lines (VAN, CUTTER, dues) can be quoted without a product.
IF COL_LENGTH('Sales.QuotationLine', 'Description') IS NULL
    ALTER TABLE Sales.QuotationLine ADD Description NVARCHAR(200) NULL;
GO
-- Charge lines have no product, so the FK must tolerate NULL.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.QuotationLine')
           AND name = 'ProductId' AND is_nullable = 0)
    ALTER TABLE Sales.QuotationLine ALTER COLUMN ProductId INT NULL;
GO

-- ---------- Back-fill existing rows ----------
-- Bring the old three-pairs-of-columns layout onto Length/Width/DimensionUnit.
UPDATE Sales.QuotationLine
SET Length = CASE UPPER(UnitOfMeasure)
                  WHEN 'MM' THEN ISNULL(HeightMm, 0)
                  WHEN 'METER' THEN ISNULL(HeightMeter, 0)
                  ELSE HeightInch END,
    Width = CASE UPPER(UnitOfMeasure)
                  WHEN 'MM' THEN ISNULL(WidthMm, 0)
                  WHEN 'METER' THEN ISNULL(WidthMeter, 0)
                  ELSE WidthInch END,
    DimensionUnit = CASE UPPER(UnitOfMeasure)
                  WHEN 'MM' THEN 'MM'
                  WHEN 'METER' THEN 'METRE'
                  ELSE 'INCH' END,
    -- Old rows priced off chargeable square feet with thickness folded in.
    RateUnit = 'PER_SQFT',
    ApplyThickness = 1,
    ChargeRoundingInch = ISNULL(ChargeType, 0),
    Area = ISNULL(AreaSqft, 0),
    CalculatedArea = ISNULL(AreaSqft, 0),
    AreaUnit = 'SQFT',
    EffectiveRate = ISNULL(ThicknessMm, 0) * Rate,
    CalculatedBasicAmount = ISNULL(ChargeableAmount, 0),
    TaxableAmount = ISNULL(ChargeableAmount, 0),
    GstPct = 18,
    CalculationMethod = 'AUTO_AREA_SQFT'
WHERE Length = 0 AND Width = 0;
GO
