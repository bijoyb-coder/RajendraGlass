SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-------------------------------------------------------------------
-- Quotation sizing / chargeable-size feature
--   * Customer.CustomerType  : Wholesale | Retail (also captured on the
--     quotation screen when a brand-new customer is entered inline)
--   * Sales.QuotationLine    : entered size (MM or Inch), the converted
--     inch size, the chargeable size after rounding up to the charge
--     type (3" or 6"), and the resulting sqft / GST / amount split.
-- Sizes are stored per piece; Qty multiplies them into the totals.
-------------------------------------------------------------------

IF COL_LENGTH('Master.Customer', 'CustomerType') IS NULL
    ALTER TABLE Master.Customer ADD CustomerType NVARCHAR(20) NOT NULL
        CONSTRAINT DF_Customer_CustomerType DEFAULT 'Retail';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Customer_CustomerType')
    ALTER TABLE Master.Customer ADD CONSTRAINT CK_Customer_CustomerType
        CHECK (CustomerType IN ('Wholesale', 'Retail'));
GO

-- The original line table only carried Qty/Rate with a computed Value.
-- Sizing turns Value into something the API computes, so the persisted
-- computed column is replaced by plain stored columns.
IF EXISTS (SELECT 1 FROM sys.computed_columns
           WHERE object_id = OBJECT_ID('Sales.QuotationLine') AND name = 'Value')
    ALTER TABLE Sales.QuotationLine DROP COLUMN Value;
GO

IF COL_LENGTH('Sales.QuotationLine', 'UnitOfMeasure') IS NULL
    ALTER TABLE Sales.QuotationLine ADD
        -- What the customer actually quoted the size in.
        UnitOfMeasure   NVARCHAR(10)   NOT NULL CONSTRAINT DF_QuotationLine_Uom DEFAULT 'Inch',
        ChargeType      DECIMAL(5,2)   NOT NULL CONSTRAINT DF_QuotationLine_ChargeType DEFAULT 3,
        -- As entered (only populated when UnitOfMeasure = 'MM').
        HeightMm        DECIMAL(12,3)  NULL,
        WidthMm         DECIMAL(12,3)  NULL,
        -- Converted / entered inches, before rounding.
        HeightInch      DECIMAL(12,4)  NOT NULL CONSTRAINT DF_QuotationLine_HeightInch DEFAULT 0,
        WidthInch       DECIMAL(12,4)  NOT NULL CONSTRAINT DF_QuotationLine_WidthInch DEFAULT 0,
        -- Rounded up to the next multiple of ChargeType — what we bill on.
        ChargeHeightInch DECIMAL(12,2) NOT NULL CONSTRAINT DF_QuotationLine_ChgH DEFAULT 0,
        ChargeWidthInch  DECIMAL(12,2) NOT NULL CONSTRAINT DF_QuotationLine_ChgW DEFAULT 0,
        -- Chargeable size expressed in feet (inch / 12) — the "Size (Sqft.)" columns.
        HeightFt        DECIMAL(12,4)  NOT NULL CONSTRAINT DF_QuotationLine_HFt DEFAULT 0,
        WidthFt         DECIMAL(12,4)  NOT NULL CONSTRAINT DF_QuotationLine_WFt DEFAULT 0,
        AreaSqft        DECIMAL(14,4)  NOT NULL CONSTRAINT DF_QuotationLine_Area DEFAULT 0,
        ThicknessMm     DECIMAL(6,2)   NULL,
        ChargeableAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_QuotationLine_ChgAmt DEFAULT 0,
        GstAmount       DECIMAL(18,2)  NOT NULL CONSTRAINT DF_QuotationLine_Gst DEFAULT 0,
        Amount          DECIMAL(18,2)  NOT NULL CONSTRAINT DF_QuotationLine_Amount DEFAULT 0;
GO
