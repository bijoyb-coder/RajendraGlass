-- VehicleNo NVARCHAR(20) (db/30) was too narrow: the "Vehicle/Trans Doc No & Dt" cell on a real
-- e-Way Bill slip often combines the vehicle number with a transporter document number and date
-- (e.g. "AP21TU0006 & 1185 & 14/08/2026"), which is what an operator naturally pastes in whole.
-- That overflow was hitting SQL Server's string-truncation error on INSERT, surfacing to the user
-- as an unhelpful generic "Could not save the e-Way Bill." Widened to comfortably fit the combined
-- text; EwayBillsController.Create now also validates lengths itself first so an overlong value
-- gets a clear 422 instead of ever reaching the DB.
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE Purchase.EwayBill ALTER COLUMN VehicleNo NVARCHAR(50) NULL;
GO
