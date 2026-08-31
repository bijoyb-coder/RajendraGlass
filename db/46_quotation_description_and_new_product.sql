-- Quotation Entry: the free-text Description moves from item-wise (Sales.QuotationLine.Description,
-- one per line) to a single document-level field for the whole quotation -- entered once in a
-- 3-line textarea. The per-line column is left in place (still written by Sales Orders, and kept
-- as historical record on any Quotation saved before this change); new Quotation saves just leave
-- it null going forward (enforced server-side, see QuotationsController.Create/Update).
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('Sales.Quotation', 'Description') IS NULL
    ALTER TABLE Sales.Quotation ADD Description NVARCHAR(1000) NULL;
GO
