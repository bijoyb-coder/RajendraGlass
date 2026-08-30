-- Cutting Entry Design upload: a reference image (JPEG/PNG/GIF) attached to a cutting entry --
-- e.g. a photo of the customer's design/drawing -- stored in the database like every other piece
-- of this app's data (no filesystem/blob-storage dependency), served back to the client as a
-- data: URL inside the existing authenticated GET /cutting-entries/{id} response rather than a
-- separate unauthenticated static file, so it never needs its own auth plumbing.
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('Cutting.CuttingEntry', 'DesignFileName') IS NULL
    ALTER TABLE Cutting.CuttingEntry ADD DesignFileName NVARCHAR(255) NULL;
GO
IF COL_LENGTH('Cutting.CuttingEntry', 'DesignContentType') IS NULL
    ALTER TABLE Cutting.CuttingEntry ADD DesignContentType NVARCHAR(100) NULL;
GO
IF COL_LENGTH('Cutting.CuttingEntry', 'DesignData') IS NULL
    ALTER TABLE Cutting.CuttingEntry ADD DesignData VARBINARY(MAX) NULL;
GO
