namespace RajendraGlass.Api.Data;

/// <summary>Everything one Purchase Invoice line resolves to, regardless of which mode priced it.</summary>
public class PurchaseInvoiceLineCalcResult
{
    /// <summary>Sheet/piece count (Inter-State) or the entered sq.m quantity itself (Local).</summary>
    public decimal Qty { get; set; }
    /// <summary>Total sq.m this line represents — what stock actually moves by, either way.</summary>
    public decimal Area { get; set; }
    public decimal BasicValue { get; set; }
}

/// <summary>
/// Prices one Purchase Invoice line for either entry mode (SDD: direct-entry purchase invoice,
/// same two paper formats a supplier actually issues).
///
///   Local:       the supplier's invoice states the sq.m quantity directly — Qty is that figure,
///                Rate is per sq.m, BasicValue = Qty x Rate. No thickness factor.
///
///   Inter-State: the supplier's invoice breaks a line into Thickness/Width/Length/Crates/Sheets
///                and quotes a rate "per mm" (per sq.m per mm of thickness) -- exactly Sheet3's
///                metre convention already built for Sales (QuotationCalculator, ApplyThickness
///                folds thickness into the rate). Reused here rather than re-derived: one sheet's
///                area comes from QuotationCalculator.Calculate with RateUnit=PER_SQM,
///                DimensionUnit=CM, ApplyThickness=true, Qty=NoOfCrates*SheetsPerCrate.
/// </summary>
public static class PurchaseInvoiceLinePricing
{
    public static PurchaseInvoiceLineCalcResult PriceLocalLine(decimal qty, decimal rate)
    {
        return new PurchaseInvoiceLineCalcResult
        {
            Qty = qty,
            Area = Math.Round(qty, 3),
            BasicValue = Math.Round(qty * rate, 2),
        };
    }

    public static PurchaseInvoiceLineCalcResult PriceInterStateLine(
        decimal thicknessMm, decimal widthCm, decimal lengthCm, int noOfCrates, int sheetsPerCrate, decimal rate)
    {
        decimal qty = noOfCrates * sheetsPerCrate;
        var calc = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = lengthCm,
            Width = widthCm,
            DimensionUnit = DimensionUnits.Cm,
            Qty = qty,
            Rate = rate,
            RateUnit = RateUnits.PerSqm,
            ApplyThickness = true,
            ThicknessMm = thicknessMm,
            ChargeRoundingInch = 0,
            GstPct = 0, // this helper only needs Area/BasicValue; GST is applied by the caller
        });

        return new PurchaseInvoiceLineCalcResult
        {
            Qty = qty,
            Area = Math.Round(calc.Area * qty, 3),
            BasicValue = calc.BasicAmount,
        };
    }
}
