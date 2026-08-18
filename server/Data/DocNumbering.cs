using System.Data;
using Dapper;

namespace RajendraGlass.Api.Data;

/// <summary>
/// Unbroken document numbering per branch per financial year (SDD 5.8 / 7.3).
/// Caller must invoke inside an active transaction with the row already locked via UPDLOCK, HOLDLOCK.
/// </summary>
public static class DocNumbering
{
    public static string NextNumber(IDbConnection conn, IDbTransaction tx, int branchId, string docType, string? padded = "D5")
    {
        var fy = FinancialYearFor(DateTime.Today);
        var series = conn.QueryFirstOrDefault(
            @"SELECT DocSeriesId, Prefix, NextNumber FROM Company.DocSeries WITH (UPDLOCK, HOLDLOCK)
              WHERE BranchId = @branchId AND DocType = @docType AND FinancialYear = @fy",
            new { branchId, docType, fy }, transaction: tx);

        if (series is null)
        {
            throw new InvalidOperationException($"No numbering series configured for {docType} in FY {fy}.");
        }

        int next = series.NextNumber;
        conn.Execute("UPDATE Company.DocSeries SET NextNumber = NextNumber + 1 WHERE DocSeriesId = @id",
            new { id = (int)series.DocSeriesId }, tx);

        string number = padded switch
        {
            "D6" => next.ToString("D6"),
            _ => next.ToString("D5"),
        };
        return $"{series.Prefix}{number}";
    }

    public static string FinancialYearFor(DateTime date)
    {
        int startYear = date.Month >= 4 ? date.Year : date.Year - 1;
        return $"{startYear}-{startYear + 1}";
    }

    public static int DefaultBranchId(IDbConnection conn, IDbTransaction? tx = null)
    {
        return conn.QueryFirstOrDefault<int?>("SELECT TOP 1 BranchId FROM Company.Branch WHERE IsActive = 1", transaction: tx) ?? 1;
    }
}
