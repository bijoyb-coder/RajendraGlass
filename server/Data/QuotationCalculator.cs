namespace RajendraGlass.Api.Data;

/// <summary>How a dimension was entered. Stored per line so the original figure is never lost.</summary>
public static class DimensionUnits
{
    public const string Mm = "MM";
    public const string Cm = "CM";
    public const string Inch = "INCH";
    public const string Feet = "FEET";
    public const string Meter = "METER";

    public static readonly string[] All = [Mm, Cm, Inch, Feet, Meter];

    /// <summary>Inches per one unit. Everything normalises through inches.</summary>
    public static decimal InchesPer(string unit) => (unit ?? "").ToUpperInvariant() switch
    {
        Mm => 1m / 25.4m,
        Cm => 10m / 25.4m,
        Inch => 1m,
        Feet => 12m,
        Meter => 1000m / 25.4m,
        _ => 1m,
    };

    public static bool IsValid(string? unit) => unit is not null && All.Contains(unit.ToUpperInvariant());
}

/// <summary>What the rate is quoted against.</summary>
public static class RateUnits
{
    /// <summary>Rate per square foot — the inch/feet convention on Sheet3.</summary>
    public const string PerSqft = "PER_SQFT";
    /// <summary>Rate per square metre — the metre convention on Sheet3.</summary>
    public const string PerSqm = "PER_SQM";
    /// <summary>Rate per piece; area is not a factor (van charges, cutter charges, dues).</summary>
    public const string PerPiece = "PER_PIECE";

    public static readonly string[] All = [PerSqft, PerSqm, PerPiece];

    public static bool IsValid(string? unit) => unit is not null && All.Contains(unit.ToUpperInvariant());
}

/// <summary>Records how a line's amount was arrived at, for audit and debugging.</summary>
public static class CalculationMethods
{
    public const string AutoAreaSqft = "AUTO_AREA_SQFT";
    public const string AutoAreaSqm = "AUTO_AREA_SQM";
    public const string AutoPiece = "AUTO_PIECE";
    /// <summary>Auto, but the operator replaced the computed area.</summary>
    public const string ManualArea = "MANUAL_AREA";
    /// <summary>The operator replaced the basic amount outright.</summary>
    public const string ManualOverride = "MANUAL_OVERRIDE";
}

/// <summary>Everything the engine needs for one quotation line.</summary>
public class LineCalcInput
{
    public decimal Length { get; set; }
    public decimal Width { get; set; }
    public string DimensionUnit { get; set; } = DimensionUnits.Meter;
    public decimal Qty { get; set; } = 1;
    public decimal Rate { get; set; }
    public string RateUnit { get; set; } = RateUnits.PerSqm;

    /// <summary>Product thickness in mm. Only a price factor when <see cref="ApplyThickness"/> is set.</summary>
    public decimal ThicknessMm { get; set; }

    /// <summary>
    /// Sheet3's metre convention multiplies the rate by thickness (H = Rate x Thick), so the
    /// rate is "per m2 per mm". The sqft convention does not. Hence a per-line flag rather
    /// than a hard-coded rule.
    /// </summary>
    public bool ApplyThickness { get; set; }

    /// <summary>
    /// Round each dimension UP to the next whole multiple of this many inches before computing
    /// area (Sheet3's inch rows use 6"). 0 or null disables rounding, which is what the metre
    /// rows do.
    /// </summary>
    public decimal ChargeRoundingInch { get; set; }

    /// <summary>Operator-supplied chargeable height/width, replacing the auto-rounded figure for
    /// that dimension outright -- the other dimension (if not also overridden) still comes from
    /// rounding as usual. Either or both may be set.</summary>
    public decimal? ManualChargeHeightInch { get; set; }
    public decimal? ManualChargeWidthInch { get; set; }

    public decimal GstPct { get; set; } = 18m;
    public decimal DiscountPct { get; set; }
    public decimal DiscountAmount { get; set; }

    /// <summary>Operator-supplied area, replacing the computed one.</summary>
    public decimal? ManualArea { get; set; }
    /// <summary>Operator-supplied basic amount, replacing everything above it.</summary>
    public decimal? ManualBasicAmount { get; set; }

    /// <summary>Flat per-item charges from the Quotation Entry redesign's "Other Charges" panel --
    /// added straight into this line's own basic amount, on top of whatever the glass itself
    /// costs (area x rate). Always 0 for every other document (Sales Order, ...), which never
    /// populates these. See db/55_quotation_entry_redesign.sql for why these exist.</summary>
    public decimal HardwareAmount { get; set; }
    public decimal TransportAmount { get; set; }
    public decimal OtherChargesAmount { get; set; }
}

/// <summary>Full breakdown — every intermediate value is returned so a mismatch can be traced.</summary>
public class LineCalcResult
{
    public decimal Length { get; set; }
    public decimal Width { get; set; }
    public string DimensionUnit { get; set; } = "";
    public decimal LengthInch { get; set; }
    public decimal WidthInch { get; set; }
    public decimal ChargeLengthInch { get; set; }
    public decimal ChargeWidthInch { get; set; }
    public decimal CalculatedArea { get; set; }
    public decimal Area { get; set; }
    public string AreaUnit { get; set; } = "";
    public decimal Qty { get; set; }
    public decimal ThicknessMm { get; set; }
    public decimal Rate { get; set; }
    public string RateUnit { get; set; } = "";
    public decimal EffectiveRate { get; set; }
    public decimal CalculatedBasicAmount { get; set; }
    public decimal GlassAmount { get; set; }
    public decimal HardwareAmount { get; set; }
    public decimal TransportAmount { get; set; }
    public decimal OtherChargesAmount { get; set; }
    public decimal BasicAmount { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal GstPct { get; set; }
    public decimal GstAmount { get; set; }
    public decimal FinalAmount { get; set; }
    public string CalculationMethod { get; set; } = "";
    public bool IsAreaManualOverride { get; set; }
    public bool IsAmountManualOverride { get; set; }
    /// <summary>True when either ChargeLengthInch or ChargeWidthInch came from
    /// ManualChargeHeightInch/ManualChargeWidthInch rather than rounding.</summary>
    public bool IsChargeSizeManualOverride { get; set; }
}

/// <summary>
/// The single authoritative quotation-line calculator. Reverse-engineered from the business
/// workbook (test.xlsx, Sheet3), which uses two distinct conventions:
///
///   Rule A — metre rows (the sheet's built-in formula, hidden columns H/I/J):
///       H = Rate x Thickness            (effective rate, per m2 per mm)
///       I = L(m) x W(m) x Qty x H       (basic)
///       J = I x 18%                     (GST)
///       K = I + J                       (total)
///     No size rounding, no unit conversion — the rate is quoted per square metre.
///     Reproduced here as: RateUnit=PER_SQM, ApplyThickness=true, ChargeRoundingInch=0.
///
///   Rule B — inch rows (entered on the sheet as manual amounts because its formula
///     cannot express them):
///       each dimension rounded UP to the next multiple of 6 inches
///       area = L" x W" / 144
///       amount = area x Qty x Rate      (thickness is NOT a factor here)
///     Reproduced here as: RateUnit=PER_SQFT, ApplyThickness=false, ChargeRoundingInch=6.
///
///   Rule C — flat charges (VAN, CUTTER, previous dues): a bare amount.
///     Reproduced as RateUnit=PER_PIECE, or a manual basic amount.
///
/// Everything (API, UI preview, print) goes through this one place — see
/// client/src/lib/quotationCalc.ts for the display-only mirror.
/// </summary>
public static class QuotationCalculator
{
    public const decimal SqInchesPerSqFoot = 144m;
    public const decimal DefaultGstPct = 18m;

    /// <summary>Rounds a dimension up to the next whole multiple of <paramref name="stepInch"/>.</summary>
    public static decimal RoundUpToStep(decimal inches, decimal stepInch)
    {
        if (stepInch <= 0) return inches;
        // Guard against binary/decimal noise making an exact multiple round to the next step up.
        var steps = Math.Ceiling(Math.Round(inches / stepInch, 9, MidpointRounding.AwayFromZero));
        return steps * stepInch;
    }

    public static LineCalcResult Calculate(LineCalcInput input)
    {
        var unit = (input.DimensionUnit ?? DimensionUnits.Meter).ToUpperInvariant();
        var rateUnit = (input.RateUnit ?? RateUnits.PerSqm).ToUpperInvariant();

        var perInch = DimensionUnits.InchesPer(unit);
        decimal lengthInch = input.Length * perInch;
        decimal widthInch = input.Width * perInch;

        // Chargeable size: round up to the next multiple of the charge step (Sheet3 inch rows
        // use 6"). Zero leaves the measured size untouched, which is what the metre rows do.
        // Either dimension may instead be pinned directly by the operator (ManualChargeHeightInch/
        // ManualChargeWidthInch), overriding the rounded figure for that dimension outright.
        bool chargeHeightOverridden = input.ManualChargeHeightInch.HasValue;
        bool chargeWidthOverridden = input.ManualChargeWidthInch.HasValue;
        decimal chargeLengthInch = chargeHeightOverridden ? input.ManualChargeHeightInch!.Value : RoundUpToStep(lengthInch, input.ChargeRoundingInch);
        decimal chargeWidthInch = chargeWidthOverridden ? input.ManualChargeWidthInch!.Value : RoundUpToStep(widthInch, input.ChargeRoundingInch);

        // Area is computed in whatever unit the rate is quoted against, at full precision —
        // nothing is rounded until the very end.
        decimal calculatedArea;
        string areaUnit;
        switch (rateUnit)
        {
            case RateUnits.PerSqft:
                calculatedArea = chargeLengthInch * chargeWidthInch / SqInchesPerSqFoot;
                areaUnit = "SQFT";
                break;
            case RateUnits.PerPiece:
                calculatedArea = 0m; // area plays no part; the rate is per piece
                areaUnit = "PIECE";
                break;
            default: // PER_SQM
                decimal lm = chargeLengthInch * 25.4m / 1000m;
                decimal wm = chargeWidthInch * 25.4m / 1000m;
                calculatedArea = lm * wm;
                areaUnit = "SQM";
                break;
        }

        bool areaOverridden = input.ManualArea.HasValue && rateUnit != RateUnits.PerPiece;
        decimal area = areaOverridden ? input.ManualArea!.Value : calculatedArea;

        // Sheet3's metre convention folds thickness into the rate (its hidden H column).
        decimal effectiveRate = input.ApplyThickness ? input.Rate * input.ThicknessMm : input.Rate;

        decimal glassAmount = rateUnit == RateUnits.PerPiece
            ? input.Qty * effectiveRate
            : area * input.Qty * effectiveRate;
        // Hardware/Transport/Other Charges (Quotation Entry redesign) are flat, additive, and
        // never affected by a manual area override -- only ManualBasicAmount (which "replaces
        // everything above it", per its own doc comment) supersedes them too.
        decimal flatCharges = input.HardwareAmount + input.TransportAmount + input.OtherChargesAmount;
        decimal calculatedBasic = glassAmount + flatCharges;

        bool amountOverridden = input.ManualBasicAmount.HasValue;
        decimal basic = amountOverridden ? input.ManualBasicAmount!.Value : calculatedBasic;

        // Discount: percentage first, then any flat amount, then clamp so a line can't go negative.
        decimal discount = basic * input.DiscountPct / 100m + input.DiscountAmount;
        if (discount < 0) discount = 0;
        if (discount > basic) discount = basic;

        decimal taxable = basic - discount;
        decimal gstPct = input.GstPct;
        decimal gst = taxable * gstPct / 100m;
        decimal final = taxable + gst;

        string method = amountOverridden ? CalculationMethods.ManualOverride
            : areaOverridden ? CalculationMethods.ManualArea
            : rateUnit switch
            {
                RateUnits.PerSqft => CalculationMethods.AutoAreaSqft,
                RateUnits.PerPiece => CalculationMethods.AutoPiece,
                _ => CalculationMethods.AutoAreaSqm,
            };

        return new LineCalcResult
        {
            Length = input.Length,
            Width = input.Width,
            DimensionUnit = unit,
            LengthInch = Math.Round(lengthInch, 4),
            WidthInch = Math.Round(widthInch, 4),
            ChargeLengthInch = Math.Round(chargeLengthInch, 4),
            ChargeWidthInch = Math.Round(chargeWidthInch, 4),
            CalculatedArea = Math.Round(calculatedArea, 6),
            Area = Math.Round(area, 6),
            AreaUnit = areaUnit,
            Qty = input.Qty,
            ThicknessMm = input.ThicknessMm,
            Rate = input.Rate,
            RateUnit = rateUnit,
            EffectiveRate = Math.Round(effectiveRate, 6),
            CalculatedBasicAmount = Math.Round(calculatedBasic, 2),
            GlassAmount = Math.Round(glassAmount, 2),
            HardwareAmount = Math.Round(input.HardwareAmount, 2),
            TransportAmount = Math.Round(input.TransportAmount, 2),
            OtherChargesAmount = Math.Round(input.OtherChargesAmount, 2),
            BasicAmount = Math.Round(basic, 2),
            DiscountAmount = Math.Round(discount, 2),
            TaxableAmount = Math.Round(taxable, 2),
            GstPct = gstPct,
            GstAmount = Math.Round(gst, 2),
            FinalAmount = Math.Round(final, 2),
            CalculationMethod = method,
            IsAreaManualOverride = areaOverridden,
            IsAmountManualOverride = amountOverridden,
            IsChargeSizeManualOverride = chargeHeightOverridden || chargeWidthOverridden,
        };
    }
}
