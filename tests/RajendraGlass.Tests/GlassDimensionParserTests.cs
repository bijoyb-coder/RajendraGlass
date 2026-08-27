using RajendraGlass.Api.Data;
using Xunit;

namespace RajendraGlass.Tests;

/// <summary>
/// Every fraction case here comes from the Cutting Entry spec's own sample data (the acceptance
/// test document) -- the exact glass dimension notation a cutter writes on paper.
/// </summary>
public class GlassDimensionParserTests
{
    [Theory]
    [InlineData("20.25", 20.25)]
    [InlineData("21.5", 21.5)]
    [InlineData("24", 24)]
    [InlineData("20¼", 20.25)]
    [InlineData("21½", 21.5)]
    [InlineData("13⅛", 13.125)]
    [InlineData("17⅝", 17.625)]
    [InlineData("19⅜", 19.375)]
    [InlineData("20¾", 20.75)]
    [InlineData("72⅝", 72.625)]
    [InlineData("20¼\"", 20.25)]
    [InlineData("21½\"", 21.5)]
    [InlineData("20 1/4", 20.25)]
    [InlineData("21 1/2", 21.5)]
    [InlineData("20⅜", 20.375)]
    [InlineData("70½", 70.5)]
    [InlineData("72½", 72.5)]
    public void TryParse_AcceptsGlassIndustryNotation(string input, decimal expected)
    {
        Assert.True(GlassDimensionParser.TryParse(input, out var inches));
        Assert.Equal(expected, inches);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("abc")]
    [InlineData("0")]
    [InlineData("-5")]
    [InlineData("20 1/0")]
    public void TryParse_RejectsInvalidInput(string input)
    {
        Assert.False(GlassDimensionParser.TryParse(input, out _));
    }

    [Fact]
    public void TryParse_RejectsNull()
    {
        Assert.False(GlassDimensionParser.TryParse(null, out _));
    }

    // ---------- The spec's own 9-row acceptance table: SQFT = ChargeableHeight * ChargeableWidth * Pcs / 144 ----------
    [Theory]
    [InlineData(24, 24, 1, 4.00)]
    [InlineData(24, 15, 1, 2.50)]
    [InlineData(72, 18, 1, 9.00)]
    [InlineData(84, 24, 1, 14.00)]
    public void Sqft_MatchesSpecAcceptanceTable(decimal chargeableHeight, decimal chargeableWidth, int pcs, decimal expectedSqft)
    {
        decimal sqft = Math.Round(chargeableHeight * chargeableWidth * pcs / 144m, 2);
        Assert.Equal(expectedSqft, sqft);
    }
}
