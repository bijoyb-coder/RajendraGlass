-- Purchase Invoice becomes a direct-entry document, matching a supplier's paper tax invoice --
-- Local (CGST+SGST) or Inter-State (IGST) -- instead of a flat total booked against a mandatory
-- GRN. It now carries its own line items and adds stock itself on save (GRN and Purchase Order
-- become optional references only).
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('Purchase.PurchaseInvoiceLine') IS NULL
CREATE TABLE Purchase.PurchaseInvoiceLine (
    PurchaseInvoiceLineId INT IDENTITY PRIMARY KEY,
    PurchaseInvoiceId INT NOT NULL FOREIGN KEY REFERENCES Purchase.PurchaseInvoice(PurchaseInvoiceId),
    ProductId    INT NOT NULL FOREIGN KEY REFERENCES Master.Product(ProductId),
    Description  NVARCHAR(200) NULL,
    -- Inter-State-only physical breakdown (NULL for Local lines, which enter Qty in sq.m directly)
    ThicknessMm    DECIMAL(6,2) NULL,
    WidthCm        DECIMAL(10,2) NULL,
    LengthCm       DECIMAL(10,2) NULL,
    NoOfCrates     INT NULL,
    SheetsPerCrate INT NULL,
    -- Common to both modes
    Qty          DECIMAL(14,3) NOT NULL,          -- sheet/piece count (Inter-State) or entered sq.m qty (Local)
    Area         DECIMAL(14,3) NOT NULL,          -- resulting sq.m quantity either way -- this is what stock moves by
    Rate         DECIMAL(14,2) NOT NULL,          -- per sq.m (Local) or per mm-sq.m (Inter-State)
    BasicValue   DECIMAL(14,2) NOT NULL,
    GstPct       DECIMAL(5,2) NOT NULL DEFAULT 18,
    TaxableValue DECIMAL(14,2) NOT NULL,
    CgstAmount   DECIMAL(14,2) NOT NULL DEFAULT 0,
    SgstAmount   DECIMAL(14,2) NOT NULL DEFAULT 0,
    IgstAmount   DECIMAL(14,2) NOT NULL DEFAULT 0,
    NetValue     DECIMAL(14,2) NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PurchaseInvoiceLine_Invoice')
    CREATE INDEX IX_PurchaseInvoiceLine_Invoice ON Purchase.PurchaseInvoiceLine (PurchaseInvoiceId);
GO

-- GrnId was mandatory; the invoice no longer needs a GRN to exist.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'GrnId' AND is_nullable = 0)
    ALTER TABLE Purchase.PurchaseInvoice ALTER COLUMN GrnId INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'SupplierId')
    ALTER TABLE Purchase.PurchaseInvoice ADD SupplierId INT NULL FOREIGN KEY REFERENCES Master.Supplier(SupplierId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'PurchaseOrderId')
    ALTER TABLE Purchase.PurchaseInvoice ADD PurchaseOrderId INT NULL FOREIGN KEY REFERENCES Purchase.PurchaseOrder(PurchaseOrderId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'GodownId')
    ALTER TABLE Purchase.PurchaseInvoice ADD GodownId INT NULL FOREIGN KEY REFERENCES Company.Godown(GodownId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'IsInterState')
    ALTER TABLE Purchase.PurchaseInvoice ADD IsInterState BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'BasicValue')
    ALTER TABLE Purchase.PurchaseInvoice ADD BasicValue DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'InsuranceValue')
    ALTER TABLE Purchase.PurchaseInvoice ADD InsuranceValue DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'TaxableValue')
    ALTER TABLE Purchase.PurchaseInvoice ADD TaxableValue DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'CgstValue')
    ALTER TABLE Purchase.PurchaseInvoice ADD CgstValue DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'SgstValue')
    ALTER TABLE Purchase.PurchaseInvoice ADD SgstValue DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'IgstValue')
    ALTER TABLE Purchase.PurchaseInvoice ADD IgstValue DECIMAL(14,2) NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Purchase.PurchaseInvoice') AND name = 'RoundOff')
    ALTER TABLE Purchase.PurchaseInvoice ADD RoundOff DECIMAL(14,2) NOT NULL DEFAULT 0;
GO

-- Backfill existing rows (booked the old way, against a GRN) with Supplier/PurchaseOrder reached
-- through the Grn -> PurchaseOrder chain, so they still show a supplier. They never carried GST
-- or moved stock through the invoice itself (the GRN already did that), so the new tax/stock
-- fields stay at their zero defaults -- there is nothing to retroactively invent.
UPDATE pi
SET pi.SupplierId = po.SupplierId,
    pi.PurchaseOrderId = po.PurchaseOrderId
FROM Purchase.PurchaseInvoice pi
JOIN Purchase.Grn g ON g.GrnId = pi.GrnId
JOIN Purchase.PurchaseOrder po ON po.PurchaseOrderId = g.PurchaseOrderId
WHERE pi.SupplierId IS NULL;
GO
