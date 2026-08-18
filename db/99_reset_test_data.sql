USE RajendraGlassDb;
GO
SET QUOTED_IDENTIFIER ON;
GO
DELETE FROM Production.JobCard; DELETE FROM Production.WorkOrder;
DELETE FROM Cutting.CuttingPlanLine; DELETE FROM Cutting.CuttingPlan;
DELETE FROM Purchase.PurchaseInvoice; DELETE FROM Purchase.GrnLine; DELETE FROM Purchase.Grn; DELETE FROM Purchase.PurchaseOrderLine; DELETE FROM Purchase.PurchaseOrder;
DELETE FROM Sales.SalesOrderLine; DELETE FROM Sales.SalesOrder; DELETE FROM Sales.QuotationLine; DELETE FROM Sales.Quotation;
DELETE FROM Inventory.StockTransferLine; DELETE FROM Inventory.StockTransfer;
DELETE FROM Inventory.StockAdjustmentLine; DELETE FROM Inventory.StockAdjustment;
DELETE FROM Inventory.Offcut;
DELETE FROM Inventory.StockMovement WHERE MovementType <> 'OpeningBalance';
DELETE FROM Finance.Voucher; DELETE FROM Finance.Expense;
DELETE FROM CRM.Complaint;
DELETE FROM Production.FurnaceBatch;
GO
UPDATE sb SET sb.QtyOnHand = ob.Qty
FROM Inventory.StockBalance sb
JOIN (SELECT ProductId, GodownId, Qty FROM Inventory.StockMovement WHERE MovementType = 'OpeningBalance') ob
  ON ob.ProductId = sb.ProductId AND ob.GodownId = sb.GodownId;
GO
DELETE FROM Inventory.StockBalance WHERE GodownId <> (SELECT TOP 1 GodownId FROM Company.Godown WHERE Code = 'MAIN');
GO
UPDATE Company.DocSeries SET NextNumber = 1
WHERE DocType IN ('Quotation','SalesOrder','PurchaseOrder','Grn','PurchaseInvoice','StockAdjustment','StockTransfer','Offcut','CuttingPlan','WorkOrder','JobCard','FurnaceBatch','Voucher','Expense','Complaint');
GO
PRINT 'Test data reset.';
