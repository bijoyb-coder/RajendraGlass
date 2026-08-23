using Dapper;

namespace RajendraGlass.Api.Data;

/// <summary>
/// Shared stock-fulfilment logic for any document that needs to consume a specific cut piece
/// (as opposed to a plain quantity, see <see cref="StockUnitConversion"/>): first try to reuse an
/// existing leftover (<see cref="Inventory.Offcut"/>), and only fall back to cutting from full-sheet
/// stock when no offcut fits — logging the fresh leftover as a new offcut so it can be reused next
/// time. Currently wired into Counter Billing only, since that's the one sales flow that already
/// carries the piece's own Length/Width (a regular Sales Invoice line is a plain quantity, with no
/// geometry to compute a leftover shape from — see PurchaseController's Purchase Invoice for the
/// unrelated Purchase-side pattern this deliberately does not touch).
/// </summary>
public static class OffcutAllocation
{
    /// <summary>Best fit first (least wasted area), then oldest first — same query
    /// InventoryController.SearchOffcuts already exposes to the client, reused here so the two
    /// never drift apart. Marks the match Used and returns true if one was found and consumed.
    /// </summary>
    public static bool TryReuseOffcut(
        System.Data.IDbConnection conn, System.Data.IDbTransaction tx,
        int productId, int godownId, decimal requiredLengthMm, decimal requiredWidthMm, string docType, int docId)
    {
        var offcut = conn.QueryFirstOrDefault(
            @"SELECT TOP 1 OffcutId FROM Inventory.Offcut
              WHERE ProductId = @productId AND GodownId = @godownId AND Status = 'Available'
                AND LengthMm >= @requiredLengthMm AND WidthMm >= @requiredWidthMm
              ORDER BY (LengthMm * WidthMm - @requiredLengthMm * @requiredWidthMm) ASC, CreatedOn ASC",
            new { productId, godownId, requiredLengthMm, requiredWidthMm }, tx);
        if (offcut is null) return false;

        conn.Execute(
            "UPDATE Inventory.Offcut SET Status = 'Used', ConsumedByDocType = @docType, ConsumedByDocId = @docId WHERE OffcutId = @id",
            new { docType, docId, id = (int)offcut.OffcutId }, tx);
        return true;
    }

    /// <summary>No offcut fit — cut from full-sheet stock instead: the usual upsert-then-movement
    /// deduction (same pattern GrnController.Create/PurchaseController use for the reverse
    /// direction), then, only when the product has a standard sheet size configured and the piece's
    /// own dimensions are known, logs the leftover as a new offcut. The leftover shape is a single
    /// guillotine strip cut — leftover = the larger of SheetLength x (SheetWidth - PieceWidth) or
    /// (SheetLength - PieceLength) x SheetWidth — a deliberate simplification (no real 2D nesting
    /// solver), consistent with CuttingController's own admitted simplification.</summary>
    public static void DeductStockAndLogOffcut(
        System.Data.IDbConnection conn, System.Data.IDbTransaction tx,
        int productId, int godownId, decimal requiredStockQty, decimal? pieceLengthMm, decimal? pieceWidthMm, string docType, int docId)
    {
        var balance = conn.QueryFirstOrDefault(
            "SELECT StockBalanceId FROM Inventory.StockBalance WHERE ProductId = @productId AND GodownId = @godownId",
            new { productId, godownId }, tx);
        if (balance is null)
            conn.Execute("INSERT INTO Inventory.StockBalance (ProductId, GodownId, QtyOnHand) VALUES (@productId, @godownId, -@requiredStockQty)",
                new { productId, godownId, requiredStockQty }, tx);
        else
            conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @requiredStockQty WHERE StockBalanceId = @id",
                new { requiredStockQty, id = (int)balance.StockBalanceId }, tx);

        conn.Execute(
            "INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty) VALUES (@productId, @godownId, 'Sale', @docType, @docId, @negQty)",
            new { productId, godownId, docType, docId, negQty = -requiredStockQty }, tx);

        if (pieceLengthMm is null or <= 0 || pieceWidthMm is null or <= 0) return;

        var product = conn.QueryFirstOrDefault(
            "SELECT StandardSheetLengthMm, StandardSheetWidthMm, StockUnit FROM Master.Product WHERE ProductId = @productId",
            new { productId }, tx);
        decimal? sheetLength = product?.StandardSheetLengthMm;
        decimal? sheetWidth = product?.StandardSheetWidthMm;
        if (sheetLength is null or <= 0 || sheetWidth is null or <= 0) return;

        decimal byWidth = sheetLength.Value * (sheetWidth.Value - pieceWidthMm.Value);
        decimal byLength = (sheetLength.Value - pieceLengthMm.Value) * sheetWidth.Value;
        var (leftoverLength, leftoverWidth) = byWidth >= byLength
            ? (sheetLength.Value, sheetWidth.Value - pieceWidthMm.Value)
            : (sheetLength.Value - pieceLengthMm.Value, sheetWidth.Value);
        if (leftoverLength <= 0 || leftoverWidth <= 0) return; // the piece used the whole sheet — nothing left over

        int branchId = DocNumbering.DefaultBranchId(conn, tx);
        string offcutCode = DocNumbering.NextNumber(conn, tx, branchId, "Offcut");
        decimal areaSqft = Math.Round(leftoverLength * leftoverWidth / 92903.04m, 3);
        string? stockUnit = product?.StockUnit;
        decimal areaInStockUnit = StockUnitConversion.ToStockUnit(areaSqft, "SQFT", stockUnit);

        conn.Execute(
            @"INSERT INTO Inventory.Offcut (OffcutCode, ProductId, LengthMm, WidthMm, GodownId, Status, AreaInStockUnit, StockUnit, SourceDocType, SourceDocId)
              VALUES (@offcutCode, @productId, @leftoverLength, @leftoverWidth, @godownId, 'Available', @areaInStockUnit, @stockUnit, @docType, @docId)",
            new { offcutCode, productId, leftoverLength, leftoverWidth, godownId, areaInStockUnit, stockUnit, docType, docId }, tx);
    }
}
