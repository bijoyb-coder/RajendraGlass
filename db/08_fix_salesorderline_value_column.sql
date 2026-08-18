-- Sales.SalesOrderLine.Value has been a PERSISTED COMPUTED column (Qty * Rate) since the very
-- first schema (03_schema_extended.sql). Migration 07 started treating it as an ordinary,
-- writable mirror of BasicAmount (see QuotationLineDto.Value / SalesOrdersController), which
-- SQL Server rejects for a computed column — every sales-order Create/Get fails with
-- "column 'Value' cannot be modified because it is ... the result of ... a computed column."
--
-- Fix: make Value a real column. Qty*Rate only equals BasicAmount for simple PER_PIECE lines;
-- for area-priced lines it doesn't, so the computed formula was already wrong for anything
-- this migration was built to support.
SET QUOTED_IDENTIFIER ON;
GO
SET ANSI_NULLS ON;
GO

USE RajendraGlassDb;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('Sales.SalesOrderLine') AND name = 'Value' AND is_computed = 1)
    ALTER TABLE Sales.SalesOrderLine DROP COLUMN Value;
GO

IF COL_LENGTH('Sales.SalesOrderLine', 'Value') IS NULL
    ALTER TABLE Sales.SalesOrderLine ADD Value DECIMAL(18, 2) NOT NULL CONSTRAINT DF_SalesOrderLine_Value DEFAULT 0;
GO

-- Back-fill any rows that already exist from the BasicAmount this migration introduced.
UPDATE Sales.SalesOrderLine SET Value = BasicAmount WHERE Value = 0 AND BasicAmount <> 0;
GO
