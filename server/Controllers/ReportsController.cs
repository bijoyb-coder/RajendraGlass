using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Controllers;

[ApiController]
[Route("api/v1/reports")]
[Authorize]
public class ReportsController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet("stock-summary")]
    public IActionResult StockSummary()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<StockSummaryReportRow>(
            @"SELECT p.ProductId, p.Code AS ProductCode, p.Description, SUM(sb.QtyOnHand) AS QtyOnHand,
                     SUM(sb.QtyOnHand - sb.QtyReserved - sb.QtyBlocked - sb.QtyDamaged) AS QtyFree,
                     AVG(sb.AvgRate) AS AvgRate,
                     SUM(sb.QtyOnHand * ISNULL(sb.AvgRate, p.PurchaseRate)) AS StockValue
              FROM Inventory.StockBalance sb JOIN Master.Product p ON p.ProductId = sb.ProductId
              GROUP BY p.ProductId, p.Code, p.Description ORDER BY p.Description");
        return Ok(new { items = rows, generatedOn = DateTime.UtcNow });
    }

    /// <summary>Item totals broken out per godown — "Godown Wise" summary.</summary>
    [HttpGet("stock-godown-summary")]
    public IActionResult StockGodownSummary()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<GodownStockSummaryRow>(
            @"SELECT sb.GodownId, g.Name AS GodownName, p.Code AS ProductCode, p.Description AS ProductDescription,
                     sb.QtyOnHand, (sb.QtyOnHand - sb.QtyReserved - sb.QtyBlocked - sb.QtyDamaged) AS QtyFree, p.StockUnit AS Unit
              FROM Inventory.StockBalance sb
              JOIN Master.Product p ON p.ProductId = sb.ProductId
              JOIN Company.Godown g ON g.GodownId = sb.GodownId
              WHERE sb.QtyOnHand <> 0
              ORDER BY g.Name, p.Description");
        return Ok(new { items = rows });
    }

    /// <summary>Godown/Rack-wise detail — every rack's physical count for a product, alongside
    /// that godown's own book quantity for the same product so a variance is visible directly.</summary>
    [HttpGet("stock-rack-detail")]
    public IActionResult StockRackDetail()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<RackStockDetailRow>(
            @"SELECT r.GodownId, g.Name AS GodownName, rs.RackId, r.Code AS RackCode,
                     rs.ProductId, p.Code AS ProductCode, p.Description AS ProductDescription,
                     rs.QtyOnHand AS RackQty, ISNULL(sb.QtyOnHand, 0) AS GodownBookQty, p.StockUnit AS Unit
              FROM Inventory.RackStock rs
              JOIN Company.Rack r ON r.RackId = rs.RackId
              JOIN Company.Godown g ON g.GodownId = r.GodownId
              JOIN Master.Product p ON p.ProductId = rs.ProductId
              LEFT JOIN Inventory.StockBalance sb ON sb.ProductId = rs.ProductId AND sb.GodownId = r.GodownId
              ORDER BY g.Name, r.Code, p.Description");
        return Ok(new { items = rows });
    }

    /// <summary>Full-sheet stock and leftover offcut stock, side by side, per product/godown — the
    /// single combined view for "how much of this glass do we actually have left, and in what
    /// shape". QtyOnHand/QtyFree/OffcutAreaInStockUnit are already in the product's own StockUnit;
    /// SheetEquivalent (QtyFree divided by one standard sheet's area) is only populated for
    /// products that have a standard sheet size configured (Master.Product.StandardSheetLengthMm/
    /// WidthMm) — otherwise it's just the plain area figure, same as today.</summary>
    [HttpGet("inventory-status")]
    public IActionResult InventoryStatus()
    {
        using var conn = db.CreateConnection();
        var stockRows = conn.Query(
            @"SELECT p.ProductId, p.Code AS ProductCode, p.Description AS ProductDescription, p.StockUnit,
                     p.StandardSheetLengthMm, p.StandardSheetWidthMm,
                     sb.GodownId, g.Name AS GodownName, sb.QtyOnHand,
                     (sb.QtyOnHand - sb.QtyReserved - sb.QtyBlocked - sb.QtyDamaged) AS QtyFree
              FROM Inventory.StockBalance sb
              JOIN Master.Product p ON p.ProductId = sb.ProductId
              JOIN Company.Godown g ON g.GodownId = sb.GodownId
              WHERE sb.QtyOnHand <> 0
              ORDER BY p.Description, g.Name").ToList();

        var offcutTotals = conn.Query(
            @"SELECT o.ProductId, o.GodownId, COUNT(*) AS OffcutCount, SUM(ISNULL(o.AreaInStockUnit, 0)) AS OffcutArea
              FROM Inventory.Offcut o WHERE o.Status = 'Available'
              GROUP BY o.ProductId, o.GodownId")
            .ToDictionary(r => ((int)r.ProductId, (int)r.GodownId), r => ((int)r.OffcutCount, (decimal)r.OffcutArea));

        var rows = stockRows.Select(r =>
        {
            decimal? sheetLength = r.StandardSheetLengthMm;
            decimal? sheetWidth = r.StandardSheetWidthMm;
            decimal? sheetAreaInStockUnit = null;
            decimal? sheetEquivalent = null;
            if (sheetLength is > 0 && sheetWidth is > 0)
            {
                decimal sheetAreaSqft = Math.Round(sheetLength.Value * sheetWidth.Value / 92903.04m, 3);
                sheetAreaInStockUnit = StockUnitConversion.ToStockUnit(sheetAreaSqft, "SQFT", (string)r.StockUnit);
                if (sheetAreaInStockUnit is > 0) sheetEquivalent = Math.Round((decimal)r.QtyFree / sheetAreaInStockUnit.Value, 2);
            }
            offcutTotals.TryGetValue(((int)r.ProductId, (int)r.GodownId), out var offcut);

            return new InventoryStatusRow
            {
                ProductId = r.ProductId,
                ProductCode = r.ProductCode,
                ProductDescription = r.ProductDescription,
                GodownId = r.GodownId,
                GodownName = r.GodownName,
                StockUnit = r.StockUnit,
                QtyOnHand = r.QtyOnHand,
                QtyFree = r.QtyFree,
                SheetEquivalent = sheetEquivalent,
                OffcutCount = offcut.Item1,
                OffcutAreaInStockUnit = offcut.Item2,
            };
        }).ToList();

        return Ok(new { items = rows });
    }

    [HttpGet("sales-register")]
    public IActionResult SalesRegister([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int? customerId)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<SalesRegisterRow>(
            @"SELECT i.InvoiceNo, i.InvoiceDate, c.Name AS CustomerName, i.TaxableValue,
                     (i.CgstValue + i.SgstValue + i.IgstValue) AS TaxValue, i.TotalValue
              FROM Sales.Invoice i JOIN Master.Customer c ON c.CustomerId = i.CustomerId
              WHERE i.Status <> 'Cancelled'
                AND (@from IS NULL OR i.InvoiceDate >= @from) AND (@to IS NULL OR i.InvoiceDate <= @to)
                AND (@customerId IS NULL OR i.CustomerId = @customerId)
              ORDER BY i.InvoiceDate DESC", new { from, to, customerId });
        return Ok(new { items = rows, total = rows.Sum(r => r.TotalValue) });
    }

    /// <summary>Every Receipt voucher -- money actually collected from a customer, in Cash, Bank,
    /// Cheque or UPI -- across the whole business, not scoped to one customer the way Customer
    /// Transactions is. Mode left unfiltered (the default) never hides a collection, even one made
    /// in a mode outside the three named on the filter (e.g. UPI).</summary>
    [HttpGet("collection-register")]
    public IActionResult CollectionRegister([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? mode, [FromQuery] int? customerId)
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query<CollectionRegisterRow>(
            @"SELECT v.VoucherId, v.VoucherNo, v.VoucherDate, v.CustomerId, c.Name AS CustomerName,
                     i.InvoiceNo, v.Mode, v.ReferenceNo, v.Amount, v.Narration
              FROM Finance.Voucher v
              LEFT JOIN Master.Customer c ON c.CustomerId = v.CustomerId
              LEFT JOIN Sales.Invoice i ON i.InvoiceId = v.InvoiceId
              WHERE v.VoucherType = 'Receipt'
                AND (@from IS NULL OR v.VoucherDate >= @from) AND (@to IS NULL OR v.VoucherDate <= @to)
                AND (@mode IS NULL OR v.Mode = @mode)
                AND (@customerId IS NULL OR v.CustomerId = @customerId)
              ORDER BY v.VoucherDate DESC, v.VoucherId DESC", new { from, to, mode, customerId });
        return Ok(new { items = rows, total = rows.Sum(r => r.Amount) });
    }

    [HttpGet("receivables-ageing")]
    public IActionResult ReceivablesAgeing()
    {
        using var conn = db.CreateConnection();
        var rows = conn.Query(
            @"SELECT c.Name AS CustomerName, i.InvoiceNo, i.InvoiceDate, i.TotalValue,
                     DATEDIFF(DAY, i.InvoiceDate, SYSUTCDATETIME()) AS AgeDays
              FROM Sales.Invoice i JOIN Master.Customer c ON c.CustomerId = i.CustomerId
              WHERE i.Status = 'Approved'
              ORDER BY AgeDays DESC");
        return Ok(new { items = rows });
    }

    /// <summary>Every sale (invoice) and payment (receipt) for one customer, on a single timeline
    /// with a running balance — "how much do they owe, and how did we get there".</summary>
    [HttpGet("customer-transactions")]
    public IActionResult CustomerTransactions([FromQuery] int customerId)
    {
        using var conn = db.CreateConnection();
        var customer = conn.QueryFirstOrDefault(
            "SELECT CustomerId, Name, Mobile, Phone FROM Master.Customer WHERE CustomerId = @customerId", new { customerId });
        if (customer is null) return NotFound();

        // Debit = a sale increases what the customer owes; Credit = a payment reduces it.
        // Cancelled invoices and reversed vouchers never carry a value in this app already, so no
        // extra status filter is needed here beyond excluding cancelled invoices explicitly.
        var rows = conn.Query<CustomerTransactionRow>(
            @"SELECT 'Sale' AS Type, i.InvoiceNo AS DocNo, i.InvoiceId AS DocId, i.InvoiceDate AS TxnDate,
                     i.TotalValue AS Debit, 0 AS Credit
              FROM Sales.Invoice i
              WHERE i.CustomerId = @customerId AND i.Status <> 'Cancelled'
              UNION ALL
              SELECT 'Payment' AS Type, v.VoucherNo AS DocNo, v.VoucherId AS DocId, v.VoucherDate AS TxnDate,
                     0 AS Debit, v.Amount AS Credit
              FROM Finance.Voucher v
              WHERE v.CustomerId = @customerId AND v.VoucherType = 'Receipt'
              ORDER BY TxnDate, DocId", new { customerId }).ToList();

        decimal running = 0;
        foreach (var r in rows)
        {
            running += r.Debit - r.Credit;
            r.Balance = running;
        }

        return Ok(new
        {
            customer,
            items = rows,
            totalSales = rows.Sum(r => r.Debit),
            totalPayments = rows.Sum(r => r.Credit),
            balance = running,
        });
    }
}

public class InventoryStatusRow
{
    public int ProductId { get; set; }
    public string? ProductCode { get; set; }
    public string? ProductDescription { get; set; }
    public int GodownId { get; set; }
    public string? GodownName { get; set; }
    public string StockUnit { get; set; } = "";
    public decimal QtyOnHand { get; set; }
    public decimal QtyFree { get; set; }
    /// <summary>QtyFree ÷ one standard sheet's area — only set when the product has a standard
    /// sheet size configured.</summary>
    public decimal? SheetEquivalent { get; set; }
    public int OffcutCount { get; set; }
    public decimal OffcutAreaInStockUnit { get; set; }
}

public class CustomerTransactionRow
{
    public string Type { get; set; } = "";
    public string? DocNo { get; set; }
    public int DocId { get; set; }
    public DateTime TxnDate { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
    public decimal Balance { get; set; }
}
