-- Links a Sales Invoice back to the Sales Order it was generated from (mirrors Sales.SalesOrder's
-- own QuotationId link). Once an order has a non-cancelled invoice against it, the order is
-- locked from being invoiced again — same "convert once, then read-only" pattern as
-- Quotation -> Sales Order.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('Sales.Invoice') AND name = 'SalesOrderId'
)
ALTER TABLE Sales.Invoice ADD SalesOrderId INT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Invoice_SalesOrder'
)
ALTER TABLE Sales.Invoice ADD CONSTRAINT FK_Invoice_SalesOrder
    FOREIGN KEY (SalesOrderId) REFERENCES Sales.SalesOrder(SalesOrderId);
GO
