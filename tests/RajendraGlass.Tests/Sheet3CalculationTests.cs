using RajendraGlass.Api.Data;
using Xunit;

namespace RajendraGlass.Tests;

/// <summary>
/// Every expected value here comes from the business workbook (test.xlsx, Sheet3) — the cached
/// results of its own formulas, including the hidden H/I/J columns. These tests are the contract:
/// the engine must reproduce the workbook, intermediate values included, not just final totals.
/// </summary>
public class Sheet3CalculationTests
{
    // ---------- Rule A: metre rows (Sheet3's own formula) ----------
    // H = Rate x Thick ; I = L x W x Qty x H ; J = I x 18% ; K = I + J
    public static IEnumerable<object[]> MetreRows()
    {
        yield return new object[] { 6, 3m, 1.08m, 1.83m, 12m, 109m, 327m, 7755.39m, 1395.97m, 9151.36m };
        yield return new object[] { 7, 3m, 1.14m, 1.83m, 12m, 109m, 327m, 8186.25m, 1473.52m, 9659.77m };
        yield return new object[] { 9, 3.5m, 1.22m, 1.83m, 18m, 116m, 406m, 16315.84m, 2936.85m, 19252.69m };
        yield return new object[] { 35, 8m, 1.22m, 1.83m, 4m, 94m, 752m, 6715.66m, 1208.82m, 7924.48m };
        yield return new object[] { 36, 3.5m, 1.22m, 1.83m, 6m, 194m, 679m, 9095.61m, 1637.21m, 10732.82m };
        yield return new object[] { 47, 3m, 1.22m, 1.83m, 10m, 105m, 315m, 7032.69m, 1265.88m, 8298.57m };
        yield return new object[] { 48, 3m, 1.22m, 1.83m, 10m, 95m, 285m, 6362.91m, 1145.32m, 7508.23m };
        yield return new object[] { 58, 3.5m, 2.44m, 1.83m, 10m, 126m, 441m, 19691.53m, 3544.48m, 23236.01m };
        yield return new object[] { 69, 12m, 2.14m, 0.76m, 5m, 96m, 1152m, 9368.06m, 1686.25m, 11054.32m };
        yield return new object[] { 81, 3.5m, 1.22m, 1.83m, 10m, 126m, 441m, 9845.77m, 1772.24m, 11618m };
        yield return new object[] { 82, 3.5m, 1.14m, 1.83m, 8m, 126m, 441m, 7360.11m, 1324.82m, 8684.93m };
        yield return new object[] { 92, 3m, 1.22m, 1.83m, 20m, 96m, 288m, 12859.78m, 2314.76m, 15174.54m };
        yield return new object[] { 103, 3.5m, 1.22m, 1.83m, 5m, 126m, 441m, 4922.88m, 886.12m, 5809m };
        yield return new object[] { 104, 3.5m, 1.08m, 1.83m, 5m, 126m, 441m, 4357.96m, 784.43m, 5142.4m };
        yield return new object[] { 105, 5m, 1.22m, 1.83m, 4m, 190m, 950m, 8483.88m, 1527.1m, 10010.98m };
        yield return new object[] { 106, 4m, 1.22m, 1.83m, 1m, 190m, 760m, 1696.78m, 305.42m, 2002.2m };
        yield return new object[] { 116, 3.2m, 1.22m, 1.83m, 7m, 96m, 307.2m, 4800.98m, 864.18m, 5665.16m };
        yield return new object[] { 128, 4m, 1.83m, 1.22m, 8m, 116m, 464m, 8287.41m, 1491.73m, 9779.15m };
        yield return new object[] { 129, 3m, 1.83m, 1.22m, 10m, 95m, 285m, 6362.91m, 1145.32m, 7508.23m };
        yield return new object[] { 145, 4m, 1.22m, 1.83m, 15m, 92m, 368m, 12323.95m, 2218.31m, 14542.26m };
        yield return new object[] { 156, 3m, 1.22m, 1.83m, 40m, 96m, 288m, 25719.55m, 4629.52m, 30349.07m };
    }

    [Theory]
    [MemberData(nameof(MetreRows))]
    public void MetreRow_MatchesWorkbook(int row, decimal thick, decimal l, decimal w, decimal qty,
        decimal rate, decimal expectedEffRate, decimal expectedBasic, decimal expectedGst, decimal expectedTotal)
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = l,
            Width = w,
            DimensionUnit = DimensionUnits.Meter,
            Qty = qty,
            Rate = rate,
            RateUnit = RateUnits.PerSqm,
            ThicknessMm = thick,
            ApplyThickness = true,
            ChargeRoundingInch = 0,
            GstPct = 18m,
        });

        // Intermediate values, not just the final amount.
        Assert.Equal(expectedEffRate, r.EffectiveRate);
        Assert.Equal(Math.Round(l * w, 6), r.Area);          // raw m2, no size rounding
        Assert.Equal("SQM", r.AreaUnit);
        Assert.Equal(CalculationMethods.AutoAreaSqm, r.CalculationMethod);
        Assert.Equal(expectedBasic, r.BasicAmount);
        Assert.Equal(expectedGst, r.GstAmount);
        Assert.Equal(expectedTotal, r.FinalAmount);
        Assert.False(r.IsAmountManualOverride);
    }

    // ---------- Rule B: inch rows (held on Sheet3 as manual amounts) ----------
    // Each dimension rounded UP to the next multiple of 6"; area = L" x W" / 144;
    // amount = area x Qty x Rate. Thickness is NOT a factor here.
    [Theory]
    [InlineData(19, 60, 36, 3, 160, 60, 36, 15.00, 7200)]
    [InlineData(20, 18, 48.5, 1, 135, 18, 54, 6.75, 911)]
    [InlineData(21, 18, 45.375, 1, 135, 18, 48, 6.00, 810)]
    [InlineData(22, 18, 79.625, 1, 135, 18, 84, 10.50, 1418)]
    [InlineData(23, 6, 79.625, 1, 135, 6, 84, 3.50, 473)]
    [InlineData(24, 6, 48.25, 1, 135, 6, 54, 2.25, 304)]
    [InlineData(25, 6, 27.75, 1, 135, 6, 30, 1.25, 169)]
    [InlineData(37, 60, 36, 1, 135, 60, 36, 15.00, 2025)]
    [InlineData(70, 72, 36, 1, 155, 72, 36, 18.00, 2790)]
    [InlineData(117, 60, 36, 1, 170, 60, 36, 15.00, 2550)]
    [InlineData(131, 96, 30, 1, 80, 96, 30, 20.00, 1600)]
    public void InchRow_MatchesWorkbook(int row, double l, double w, double qty, double rate,
        double expChargeL, double expChargeW, double expSqft, double expAmountRounded)
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = (decimal)l,
            Width = (decimal)w,
            DimensionUnit = DimensionUnits.Inch,
            Qty = (decimal)qty,
            Rate = (decimal)rate,
            RateUnit = RateUnits.PerSqft,
            ApplyThickness = false,
            ChargeRoundingInch = 6m,
            GstPct = 0m,
        });

        Assert.Equal((decimal)expChargeL, r.ChargeLengthInch);
        Assert.Equal((decimal)expChargeW, r.ChargeWidthInch);
        Assert.Equal((decimal)expSqft, r.Area);
        Assert.Equal("SQFT", r.AreaUnit);
        Assert.Equal((decimal)rate, r.EffectiveRate);        // thickness not folded in
        Assert.Equal(CalculationMethods.AutoAreaSqft, r.CalculationMethod);
        // The workbook holds these to the rupee; the engine keeps the exact figure.
        Assert.Equal((decimal)expAmountRounded, Math.Round(r.BasicAmount, 0, MidpointRounding.AwayFromZero));
    }

    /// <summary>
    /// Sheet3 row 130 (40 x 64 @ 20 = 356) is the one inch row that does NOT round up — an
    /// old-glass refitting charge billed on the measured size. It is reproduced by switching
    /// charge rounding off, which is precisely why that is a per-line setting and not a constant.
    /// </summary>
    [Fact]
    public void Row130_RawInchesWithoutRounding()
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = 40m,
            Width = 64m,
            DimensionUnit = DimensionUnits.Inch,
            Qty = 1m,
            Rate = 20m,
            RateUnit = RateUnits.PerSqft,
            ApplyThickness = false,
            ChargeRoundingInch = 0m,
            GstPct = 0m,
        });
        Assert.Equal(40m, r.ChargeLengthInch);
        Assert.Equal(356m, Math.Round(r.BasicAmount, 0, MidpointRounding.AwayFromZero));
    }

    // ---------- Rule C: flat charge lines (VAN 140, CUTTER 140, previous dues) ----------
    [Theory]
    [InlineData(93, 140)]
    [InlineData(118, 140)]
    [InlineData(146, 3905)]
    [InlineData(59, 290287)]
    public void FlatChargeRow_UsesPerPiece(int row, double amount)
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Qty = 1m,
            Rate = (decimal)amount,
            RateUnit = RateUnits.PerPiece,
            GstPct = 0m,
        });
        Assert.Equal((decimal)amount, r.BasicAmount);
        Assert.Equal(CalculationMethods.AutoPiece, r.CalculationMethod);
        Assert.Equal((decimal)amount, r.FinalAmount);
    }

    // ---------- Unit conversion ----------
    // The same physical pane expressed five ways must give one area.
    [Theory]
    [InlineData(DimensionUnits.Meter, 1.22, 1.83)]
    [InlineData(DimensionUnits.Mm, 1220, 1830)]
    [InlineData(DimensionUnits.Cm, 122, 183)]
    [InlineData(DimensionUnits.Inch, 48.031496063, 72.047244094)]
    [InlineData(DimensionUnits.Feet, 4.002624672, 6.003937008)]
    public void AllUnitsNormaliseToSameArea(string unit, double l, double w)
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = (decimal)l,
            Width = (decimal)w,
            DimensionUnit = unit,
            Qty = 1m,
            Rate = 1m,
            RateUnit = RateUnits.PerSqm,
            ChargeRoundingInch = 0m,
        });
        Assert.Equal(2.2326m, Math.Round(r.Area, 4));
    }

    [Fact]
    public void InchAndFeetAgreeOnSqft()
    {
        var byInch = QuotationCalculator.Calculate(new LineCalcInput
        { Length = 60m, Width = 36m, DimensionUnit = DimensionUnits.Inch, Qty = 1m, Rate = 10m, RateUnit = RateUnits.PerSqft });
        var byFeet = QuotationCalculator.Calculate(new LineCalcInput
        { Length = 5m, Width = 3m, DimensionUnit = DimensionUnits.Feet, Qty = 1m, Rate = 10m, RateUnit = RateUnits.PerSqft });
        Assert.Equal(15m, byInch.Area);
        Assert.Equal(15m, byFeet.Area);
        Assert.Equal(byInch.BasicAmount, byFeet.BasicAmount);
    }

    // ---------- Rounding rule ----------
    [Theory]
    [InlineData(6, 6, 6)]          // already a multiple: stays put — no minimum-size rule in the workbook
    [InlineData(48.5, 6, 54)]
    [InlineData(17.6054, 6, 18)]
    [InlineData(17.6054, 3, 18)]
    [InlineData(8, 3, 9)]
    [InlineData(12, 3, 12)]
    [InlineData(30, 0, 30)]        // rounding disabled
    public void RoundUpToStep_Works(double value, double step, double expected)
        => Assert.Equal((decimal)expected, QuotationCalculator.RoundUpToStep((decimal)value, (decimal)step));

    // ---------- Manual overrides ----------
    [Fact]
    public void ManualArea_ReplacesComputedAreaAndFlagsLine()
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = 60m,
            Width = 36m,
            DimensionUnit = DimensionUnits.Inch,
            Qty = 1m,
            Rate = 100m,
            RateUnit = RateUnits.PerSqft,
            GstPct = 0m,
            ManualArea = 14.5m,
        });
        Assert.Equal(15m, r.CalculatedArea);    // what the system worked out, kept for audit
        Assert.Equal(14.5m, r.Area);            // what is actually billed
        Assert.Equal(1450m, r.BasicAmount);
        Assert.True(r.IsAreaManualOverride);
        Assert.Equal(CalculationMethods.ManualArea, r.CalculationMethod);
    }

    [Fact]
    public void ManualBasicAmount_WinsOverEverythingButIsStillTaxed()
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = 60m,
            Width = 36m,
            DimensionUnit = DimensionUnits.Inch,
            Qty = 3m,
            Rate = 160m,
            RateUnit = RateUnits.PerSqft,
            GstPct = 18m,
            ManualBasicAmount = 911m,
        });
        Assert.Equal(7200m, r.CalculatedBasicAmount);   // preserved for audit
        Assert.Equal(911m, r.BasicAmount);
        Assert.Equal(163.98m, r.GstAmount);
        Assert.Equal(1074.98m, r.FinalAmount);
        Assert.True(r.IsAmountManualOverride);
        Assert.Equal(CalculationMethods.ManualOverride, r.CalculationMethod);
    }

    // ---------- GST / discount ----------
    [Fact]
    public void GstIsConfigurablePerLine()
    {
        var input = new LineCalcInput
        { Length = 1m, Width = 1m, DimensionUnit = DimensionUnits.Meter, Qty = 1m, Rate = 100m, RateUnit = RateUnits.PerSqm };
        Assert.Equal(18m, QuotationCalculator.Calculate(input).GstAmount);
        input.GstPct = 12m;
        Assert.Equal(12m, QuotationCalculator.Calculate(input).GstAmount);
        input.GstPct = 0m;
        Assert.Equal(0m, QuotationCalculator.Calculate(input).GstAmount);
    }

    [Fact]
    public void DiscountAppliesBeforeGst()
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = 1m,
            Width = 1m,
            DimensionUnit = DimensionUnits.Meter,
            Qty = 1m,
            Rate = 1000m,
            RateUnit = RateUnits.PerSqm,
            GstPct = 18m,
            DiscountPct = 10m,
        });
        Assert.Equal(1000m, r.BasicAmount);
        Assert.Equal(100m, r.DiscountAmount);
        Assert.Equal(900m, r.TaxableAmount);
        Assert.Equal(162m, r.GstAmount);
        Assert.Equal(1062m, r.FinalAmount);
    }

    [Fact]
    public void DiscountCannotPushLineNegative()
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        { Qty = 1m, Rate = 100m, RateUnit = RateUnits.PerPiece, GstPct = 0m, DiscountAmount = 500m });
        Assert.Equal(100m, r.DiscountAmount);
        Assert.Equal(0m, r.TaxableAmount);
        Assert.Equal(0m, r.FinalAmount);
    }

    // ---------- Edge cases ----------
    [Fact]
    public void ZeroAndBlankValuesGiveZeroNotAnError()
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        { Length = 0m, Width = 0m, DimensionUnit = DimensionUnits.Meter, Qty = 0m, Rate = 0m, RateUnit = RateUnits.PerSqm });
        Assert.Equal(0m, r.Area);
        Assert.Equal(0m, r.BasicAmount);
        Assert.Equal(0m, r.FinalAmount);
    }

    [Fact]
    public void DecimalQuantityIsSupported()
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = 1m,
            Width = 1m,
            DimensionUnit = DimensionUnits.Meter,
            Qty = 2.5m,
            Rate = 100m,
            RateUnit = RateUnits.PerSqm,
            GstPct = 0m,
        });
        Assert.Equal(250m, r.BasicAmount);
    }

    /// <summary>Precision is held to the end — quantity must not be applied to a rounded area.</summary>
    [Fact]
    public void PrecisionIsNotLostBeforeQuantityIsApplied()
    {
        var r = QuotationCalculator.Calculate(new LineCalcInput
        {
            Length = 1.08m,
            Width = 1.83m,
            DimensionUnit = DimensionUnits.Meter,
            Qty = 12m,
            Rate = 109m,
            RateUnit = RateUnits.PerSqm,
            ThicknessMm = 3m,
            ApplyThickness = true,
            GstPct = 18m,
        });
        Assert.Equal(7755.39m, r.BasicAmount);   // workbook: 7755.3936
        Assert.Equal(1395.97m, r.GstAmount);     // workbook: 1395.970848
    }
}
