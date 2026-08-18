namespace RajendraGlass.Api.Data;

/// <summary>
/// Converts a computed line area into a product's own stock unit (Sqm ⇄ Sqft) so a
/// required-quantity figure is comparable to what Inventory.StockBalance holds — the same
/// conversion the frontend's live shortage badge uses (client/src/features/sales/SalesLineGrid.tsx
/// getLineStockShortage/toStockUnit). Shared by every document that checks stock against a
/// computed area (Counter Billing, Quotations, ...) so the rule can't drift between them.
/// </summary>
public static class StockUnitConversion
{
    private const decimal SqmPerSqft = 1m / 10.7639m;

    public static decimal ToStockUnit(decimal value, string fromAreaUnit, string? stockUnit)
    {
        var from = (fromAreaUnit ?? "").ToUpperInvariant();
        var to = (stockUnit ?? "").ToUpperInvariant();
        if (string.IsNullOrEmpty(to) || from == to) return value;
        if (from == "SQM" && to.StartsWith("SQFT")) return value / SqmPerSqft;
        if (from == "SQFT" && to.StartsWith("SQM")) return value * SqmPerSqft;
        return value;
    }

    /// <summary>The physical quantity, in the product's stock unit, that a priced line implies —
    /// area x qty for area-rated lines, the raw qty for PER_PIECE lines.</summary>
    public static decimal RequiredQty(LineCalcResult calc, string? stockUnit)
        => string.Equals(calc.RateUnit, RateUnits.PerPiece, StringComparison.OrdinalIgnoreCase)
            ? calc.Qty
            : ToStockUnit(calc.Area, calc.AreaUnit, stockUnit) * calc.Qty;
}
