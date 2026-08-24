-- Delete for Stock Adjustments and Offcuts.
--
-- Stock Adjustment: nothing downstream ever references an adjustment, so the list always offers
-- Delete; the guard lives in the Delete endpoint itself, which reverses exactly the stock this
-- adjustment moved (read back from its own Inventory.StockMovement rows) and refuses if any of it
-- has since moved on elsewhere -- the same "stock already moved on" rule GrnController.Delete
-- already enforces for the same reason.
--
-- Offcut: deletable only while still 'Available' -- a 'Used' offcut is tied to the real sale that
-- consumed it (ConsumedByDocType/ConsumedByDocId) and that history shouldn't be silently erased.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'StockAdjustment.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('StockAdjustment.Delete', 'Inventory', 'Delete a stock adjustment');
IF NOT EXISTS (SELECT 1 FROM Security.Permission WHERE Code = 'Offcut.Delete')
    INSERT INTO Security.Permission (Code, Module, Description) VALUES ('Offcut.Delete', 'Inventory', 'Delete an offcut');
GO

-- Owner / Administrator: everything (existing catch-all rule already covers new permissions,
-- but insert explicitly too in case that rule has not been re-run since).
INSERT INTO Security.RolePermission (RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId
FROM Security.Role r CROSS JOIN Security.Permission p
WHERE r.Name IN ('Owner', 'Administrator')
  AND p.Code IN ('StockAdjustment.Delete', 'Offcut.Delete')
  AND NOT EXISTS (SELECT 1 FROM Security.RolePermission x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
GO
