-- Quotation and Sales Order totals were stored as the raw (unrounded) sum of line amounts,
-- unlike Sales.Invoice which already rounds its TotalValue to the nearest whole rupee and tracks
-- the delta in a RoundOff column. Bringing Quotation/SalesOrder in line: add the same RoundOff
-- column to both tables so their TotalValue is always a rounded figure too, printable/auditable
-- the same way an invoice's round-off already is.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.Quotation') AND name = 'RoundOff')
    ALTER TABLE Sales.Quotation ADD RoundOff DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Sales.SalesOrder') AND name = 'RoundOff')
    ALTER TABLE Sales.SalesOrder ADD RoundOff DECIMAL(14,2) NOT NULL DEFAULT 0;
GO

-- Backfill existing rows: round TotalValue to the nearest whole rupee and record the delta,
-- same convention Invoice uses (rounded = ROUND(total, 0), roundOff = rounded - total).
UPDATE Sales.Quotation
SET RoundOff = ROUND(TotalValue, 0) - TotalValue,
    TotalValue = ROUND(TotalValue, 0)
WHERE RoundOff = 0 AND TotalValue <> ROUND(TotalValue, 0);
GO
UPDATE Sales.SalesOrder
SET RoundOff = ROUND(TotalValue, 0) - TotalValue,
    TotalValue = ROUND(TotalValue, 0)
WHERE RoundOff = 0 AND TotalValue <> ROUND(TotalValue, 0);
GO
