-- The business no longer wants a sale blocked for lack of stock (see the STOCK_INSUFFICIENT
-- removals in InvoicesController/CounterInvoicesController/CuttingEntryController/
-- QuotationsController) -- a sale made without a prior Purchase/Stock Opening/Adjustment must be
-- able to actually take Inventory.StockBalance negative, not just skip an application-level check
-- that the database then silently re-blocks. Same for Inventory.RackStock, which
-- CuttingStockConsumption.Deduct already decrements best-effort past zero.
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_StockBalance_NonNegative')
    ALTER TABLE Inventory.StockBalance DROP CONSTRAINT CK_StockBalance_NonNegative;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_RackStock_NonNegative')
    ALTER TABLE Inventory.RackStock DROP CONSTRAINT CK_RackStock_NonNegative;
GO
