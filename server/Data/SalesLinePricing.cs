using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Data;

/// <summary>
/// Shared line handling for quotations and sales orders. Both documents carry the same size,
/// rate-basis and GST fields and must price identically, so the validation rules and the call
/// into <see cref="QuotationCalculator"/> live here rather than being written twice.
/// </summary>
public static class SalesLinePricing
{
    /// <summary>Returns null when the line is acceptable, otherwise the reason it is not.</summary>
    public static string? Validate(
        decimal length, decimal width, string dimensionUnit, decimal qty, decimal rate,
        string rateUnit, decimal gstPct, decimal discountPct, decimal chargeRoundingInch,
        decimal? thicknessMm, decimal? manualArea, decimal? manualBasicAmount,
        decimal? manualChargeHeightInch = null, decimal? manualChargeWidthInch = null)
    {
        if (!DimensionUnits.IsValid(dimensionUnit))
            return $"Dimension unit must be one of {string.Join(", ", DimensionUnits.All)}.";
        if (!RateUnits.IsValid(rateUnit))
            return $"Rate unit must be one of {string.Join(", ", RateUnits.All)}.";
        if (qty <= 0) return "Quantity must be greater than zero.";
        if (rate < 0) return "Rate cannot be negative.";
        if (gstPct < 0 || gstPct > 100) return "GST % must be between 0 and 100.";
        if (discountPct < 0 || discountPct > 100) return "Discount % must be between 0 and 100.";
        if (chargeRoundingInch < 0) return "Charge rounding cannot be negative.";
        if (thicknessMm is < 0) return "Thickness cannot be negative.";
        if (manualArea is < 0) return "Area cannot be negative.";
        if (manualBasicAmount is < 0) return "Amount cannot be negative.";
        if (manualChargeHeightInch is < 0) return "Chargeable height cannot be negative.";
        if (manualChargeWidthInch is < 0) return "Chargeable width cannot be negative.";

        // Area-priced lines need a real size unless a figure was supplied outright -- either an
        // area/amount override, or both chargeable dimensions pinned directly (which makes the
        // measured Length/Width moot). Pinning only one still leaves the other coming from
        // rounding the real dimension, so that alone doesn't excuse Length/Width being empty.
        bool needsSize = !string.Equals(rateUnit, RateUnits.PerPiece, StringComparison.OrdinalIgnoreCase)
                         && !manualArea.HasValue && !manualBasicAmount.HasValue
                         && !(manualChargeHeightInch.HasValue && manualChargeWidthInch.HasValue);
        if (needsSize && (length <= 0 || width <= 0))
            return "Length and width must be greater than zero, or supply an area/amount/chargeable size directly.";

        return null;
    }

    /// <summary>
    /// Prices one line. <paramref name="thicknessFromProduct"/> is the master value, used only
    /// when the line does not carry its own thickness.
    /// </summary>
    public static LineCalcResult Price(
        decimal length, decimal width, string dimensionUnit, decimal qty, decimal rate,
        string rateUnit, bool applyThickness, decimal chargeRoundingInch, decimal gstPct,
        decimal discountPct, decimal? thicknessMm, decimal thicknessFromProduct,
        decimal? manualArea, decimal? manualBasicAmount,
        decimal? manualChargeHeightInch = null, decimal? manualChargeWidthInch = null)
        => QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = length,
            Width = width,
            DimensionUnit = dimensionUnit,
            Qty = qty,
            Rate = rate,
            RateUnit = rateUnit,
            ThicknessMm = thicknessMm ?? thicknessFromProduct,
            ApplyThickness = applyThickness,
            ChargeRoundingInch = chargeRoundingInch,
            ManualChargeHeightInch = manualChargeHeightInch,
            ManualChargeWidthInch = manualChargeWidthInch,
            GstPct = gstPct,
            DiscountPct = discountPct,
            ManualArea = manualArea,
            ManualBasicAmount = manualBasicAmount,
        });

    /// <summary>Audit trail of what the amount was derived from, stored as JSON on the line.</summary>
    public static string Metadata(LineCalcResult calc, decimal thicknessUsed,
        decimal? manualArea, decimal? manualBasicAmount, decimal discountPct,
        decimal? manualChargeHeightInch = null, decimal? manualChargeWidthInch = null)
        => System.Text.Json.JsonSerializer.Serialize(new
        {
            entered = new { calc.Length, calc.Width, unit = calc.DimensionUnit, calc.Qty, calc.Rate, rateUnit = calc.RateUnit },
            rules = new { thicknessMm = thicknessUsed, calc.GstPct, discountPct },
            overrides = new { manualArea, manualBasicAmount, manualChargeHeightInch, manualChargeWidthInch },
            computed = new { calc.CalculatedArea, calc.CalculatedBasicAmount, calc.EffectiveRate },
            calc.CalculationMethod,
        });
}
