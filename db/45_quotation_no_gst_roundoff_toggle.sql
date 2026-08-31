-- Quotation Entry: GST removed (every line is now saved/priced with GstPct = 0, enforced
-- server-side regardless of what a client sends -- see QuotationsController.Create/Update), and
-- the previously-automatic "round to nearest rupee" becomes a visible, optional document-level
-- checkbox instead of always-on behaviour.
SET QUOTED_IDENTIFIER ON;
GO

-- NOT NULL DEFAULT 1 backfills every existing row to "was always rounded", matching the behaviour
-- this replaces.
IF COL_LENGTH('Sales.Quotation', 'RoundOffEnabled') IS NULL
    ALTER TABLE Sales.Quotation ADD RoundOffEnabled BIT NOT NULL CONSTRAINT DF_Quotation_RoundOffEnabled DEFAULT 1;
GO

-- Existing lines' GstPct/GstAmount are left as historical record (what was actually quoted at the
-- time) -- only new saves are forced to 0 going forward.
