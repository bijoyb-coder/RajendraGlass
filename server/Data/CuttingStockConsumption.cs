using Dapper;

namespace RajendraGlass.Api.Data;

/// <summary>
/// Stock deduction for Cutting Entry, mirroring the deduct-and-log half of
/// <see cref="OffcutAllocation.DeductStockAndLogOffcut"/> (Inventory.StockBalance decrement +
/// Inventory.StockMovement insert, inside the caller's own transaction). Godown-level
/// Inventory.StockBalance is the one authoritative check/deduction everywhere else in this app
/// (Purchase, Sales, Counter Billing); Inventory.RackStock is a separate, non-reconciled physical
/// location ledger that nothing downstream treats as load-bearing (see its own migration,
/// db/13_rack_master_and_stock.sql). So Rack here is informational only: if a RackId is supplied,
/// RackStock is decremented best-effort and never blocks the transaction, even if that specific
/// rack's own count would go negative -- the real availability check already happened against
/// StockBalance before this runs.
/// </summary>
public static class CuttingStockConsumption
{
    /// <summary>Free stock at the Godown level -- QtyOnHand minus every reservation, exactly the
    /// same figure every other module's shortage check uses.</summary>
    public static decimal FreeStock(System.Data.IDbConnection conn, System.Data.IDbTransaction tx, int productId, int godownId)
    {
        var balance = conn.QueryFirstOrDefault(
            "SELECT (QtyOnHand - QtyReserved - QtyBlocked - QtyDamaged) AS QtyFree FROM Inventory.StockBalance WHERE ProductId = @productId AND GodownId = @godownId",
            new { productId, godownId }, tx);
        return balance?.QtyFree ?? 0m;
    }

    public static void Deduct(
        System.Data.IDbConnection conn, System.Data.IDbTransaction tx,
        int productId, int godownId, int? rackId, decimal requiredStockQty, string docType, int docId)
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
            "INSERT INTO Inventory.StockMovement (ProductId, GodownId, MovementType, DocType, DocId, Qty) VALUES (@productId, @godownId, 'Cutting', @docType, @docId, @negQty)",
            new { productId, godownId, docType, docId, negQty = -requiredStockQty }, tx);

        if (rackId is null) return;
        var rackStock = conn.QueryFirstOrDefault(
            "SELECT RackStockId FROM Inventory.RackStock WHERE ProductId = @productId AND RackId = @rackId",
            new { productId, rackId }, tx);
        if (rackStock is null)
            conn.Execute("INSERT INTO Inventory.RackStock (ProductId, RackId, QtyOnHand) VALUES (@productId, @rackId, -@requiredStockQty)",
                new { productId, rackId, requiredStockQty }, tx);
        else
            conn.Execute("UPDATE Inventory.RackStock SET QtyOnHand = QtyOnHand - @requiredStockQty, ModifiedOn = SYSUTCDATETIME() WHERE RackStockId = @id",
                new { requiredStockQty, id = (int)rackStock.RackStockId }, tx);
    }

    /// <summary>Reverses everything <see cref="Deduct"/> posted for one Cutting Entry -- reads back
    /// this document's own StockMovement rows (authoritative, never recomputed from the cutting
    /// lines) rather than trusting the caller, same pattern as
    /// PurchaseController.ReverseStockMovements -- but note the direction is opposite: a Purchase
    /// movement is a positive addition, so *reversing* it subtracts, and needs enough currently on
    /// hand to remove (that check is a real constraint there). A Cutting movement is already
    /// negative (Deduct subtracts), so reversing it *adds back* -- which can never be numerically
    /// insufficient, no matter how negative the balance has gone (Deduct itself never blocks on
    /// stock sufficiency; see its own doc comment). There is deliberately no "cannot reverse" check
    /// here -- always returns null.</summary>
    public static string? Reverse(System.Data.IDbConnection conn, System.Data.IDbTransaction tx, string docType, int docId)
    {
        var movements = conn.Query<(int ProductId, int GodownId, decimal Qty)>(
            "SELECT ProductId, GodownId, Qty FROM Inventory.StockMovement WHERE DocType = @docType AND DocId = @docId AND MovementType = 'Cutting'",
            new { docType, docId }, tx).ToList();

        foreach (var m in movements)
            conn.Execute("UPDATE Inventory.StockBalance SET QtyOnHand = QtyOnHand - @Qty WHERE ProductId = @ProductId AND GodownId = @GodownId",
                new { m.Qty, m.ProductId, m.GodownId }, tx);
        conn.Execute("DELETE FROM Inventory.StockMovement WHERE DocType = @docType AND DocId = @docId AND MovementType = 'Cutting'", new { docType, docId }, tx);
        return null;
    }
}
