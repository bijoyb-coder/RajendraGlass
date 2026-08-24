-- Widen Purchase Invoice Line precision: Area to 9 decimal places (18 total digits), Rate to 5
-- decimal places (18 total digits) -- both well beyond the old DECIMAL(14,3)/DECIMAL(14,2), so no
-- existing value can be truncated by this change. Holes/Cutout Qty/Rate already carry 2 decimal
-- places (DECIMAL(10,2)/DECIMAL(14,2)) and are left as-is; only their entry-form inputs needed
-- fixing (see the frontend change in the same PR) since they were wrongly restricted to whole
-- numbers despite the database already supporting 2 decimals.
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE Purchase.PurchaseInvoiceLine ALTER COLUMN Area DECIMAL(18,9) NOT NULL;
GO
ALTER TABLE Purchase.PurchaseInvoiceLine ALTER COLUMN Rate DECIMAL(18,5) NOT NULL;
GO
