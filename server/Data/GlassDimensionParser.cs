using System.Globalization;
using System.Text.RegularExpressions;

namespace RajendraGlass.Api.Data;

/// <summary>
/// Parses the glass-industry dimension formats a cutter actually writes on paper -- plain decimal
/// inches, a whole number glued to a unicode fraction glyph (optionally with a trailing "), or a
/// whole number and an ASCII a/b fraction separated by a space -- into a normalized decimal number
/// of inches. This is a different concern from <c>DimensionUnits.InchesPer</c>
/// (server/Data/QuotationCalculator.cs), which converts between measurement *units* (mm/cm/inch/
/// feet/metre); this parser only ever produces inches, from *fraction notation* within inches.
/// Authoritative on the server -- client/src/lib/glassDimension.ts mirrors the same rules purely
/// for live UI feedback, but every save re-parses the raw text server-side rather than trusting
/// whatever number the client already computed.
/// </summary>
public static class GlassDimensionParser
{
    private static readonly Dictionary<char, decimal> UnicodeFractions = new()
    {
        ['⅛'] = 0.125m,
        ['¼'] = 0.25m,
        ['⅜'] = 0.375m,
        ['½'] = 0.5m,
        ['⅝'] = 0.625m,
        ['¾'] = 0.75m,
        ['⅞'] = 0.875m,
    };

    // "20 1/4" -- a whole number, whitespace, then an ASCII a/b fraction.
    private static readonly Regex AsciiFractionPattern = new(@"^(\d+)\s+(\d+)\s*/\s*(\d+)$", RegexOptions.Compiled);

    // "20¼" or "20¼\"" -- a whole number glued directly to one unicode fraction glyph, optional
    // trailing inch mark and/or whitespace.
    private static readonly Regex UnicodeFractionPattern = new(@"^(\d+)\s*([⅛¼⅜½⅝¾⅞])\s*""?$", RegexOptions.Compiled);

    /// <summary>Returns false (never throws) for anything unparseable -- bad user input is a
    /// validation error the caller reports, not a server exception.</summary>
    public static bool TryParse(string? input, out decimal inches)
    {
        inches = 0;
        if (string.IsNullOrWhiteSpace(input)) return false;
        var text = input.Trim().TrimEnd('"', '”', '″');

        // Plain decimal: "20.25", "21.5", or just a whole number "24".
        if (decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var plain))
        {
            inches = plain;
            return inches > 0;
        }

        var unicodeMatch = UnicodeFractionPattern.Match(text);
        if (unicodeMatch.Success)
        {
            int whole = int.Parse(unicodeMatch.Groups[1].Value, CultureInfo.InvariantCulture);
            decimal fraction = UnicodeFractions[unicodeMatch.Groups[2].Value[0]];
            inches = whole + fraction;
            return inches > 0;
        }

        var asciiMatch = AsciiFractionPattern.Match(text);
        if (asciiMatch.Success)
        {
            int whole = int.Parse(asciiMatch.Groups[1].Value, CultureInfo.InvariantCulture);
            int numerator = int.Parse(asciiMatch.Groups[2].Value, CultureInfo.InvariantCulture);
            int denominator = int.Parse(asciiMatch.Groups[3].Value, CultureInfo.InvariantCulture);
            if (denominator == 0) return false;
            inches = whole + (decimal)numerator / denominator;
            return inches > 0;
        }

        return false;
    }
}
