using RajendraGlass.Api.Data;

namespace RajendraGlass.Api.Models;

/// <summary>
/// Same entered-by-operator shape as <see cref="QuotationLineDto"/> — Counter Billing prices its
/// lines through the identical <see cref="QuotationCalculator"/> engine (via SalesLinePricing) so
/// a walk-in sale never computes a different amount than the Quotation screen would for the same
/// size/rate/thickness. Amounts are deliberately absent — the server prices it, same as a quotation.
/// </summary>
public class CreateCounterInvoiceLineRequest
{
    public int ProductId { get; set; }
    public string? Description { get; set; }
    public decimal Length { get; set; }
    public decimal Width { get; set; }
    /// <summary>MM | CM | INCH | FEET | METER.</summary>
    public string DimensionUnit { get; set; } = DimensionUnits.Meter;
    public decimal Qty { get; set; } = 1;
    public decimal Rate { get; set; }
    /// <summary>PER_SQFT | PER_SQM | PER_PIECE.</summary>
    public string RateUnit { get; set; } = RateUnits.PerSqm;
    public bool ApplyThickness { get; set; } = true;
    public decimal ChargeRoundingInch { get; set; }
    /// <summary>Set to bill this dimension at a height/width other than the auto-rounded one --
    /// see QuotationLineDto.ManualChargeHeightInch/ManualChargeWidthInch.</summary>
    public decimal? ManualChargeHeightInch { get; set; }
    public decimal? ManualChargeWidthInch { get; set; }
    public decimal GstPct { get; set; } = QuotationCalculator.DefaultGstPct;
    public decimal DiscountPct { get; set; }
    /// <summary>Defaults from the product master when omitted; editable per line.</summary>
    public decimal? ThicknessMm { get; set; }
    public decimal? ManualArea { get; set; }
    public decimal? ManualBasicAmount { get; set; }
}

/// <summary>One method's share of the bill — the customer may pay part in Cash, part by Cheque,
/// part by UPI, in any combination, as long as every share together adds up to the total.</summary>
public class CounterInvoicePaymentRequest
{
    /// <summary>Cash | Cheque | UPI.</summary>
    public string PaymentType { get; set; } = "Cash";
    public decimal Amount { get; set; }
    /// <summary>Cheque number or UPI transaction reference. Required for Cheque/UPI, unused for Cash.</summary>
    public string? ReferenceNo { get; set; }
}

public class CreateCounterInvoiceRequest
{
    public int? CustomerId { get; set; }
    public string? WalkInCustomerName { get; set; }
    public List<CreateCounterInvoiceLineRequest> Lines { get; set; } = new();
    /// <summary>How the bill was settled — one or more methods; their amounts must sum to the
    /// invoice total exactly (see CounterInvoicesController.Create).</summary>
    public List<CounterInvoicePaymentRequest> Payments { get; set; } = new();

    /// <summary>
    /// Set true when this request is being replayed from the offline sync queue
    /// (client-side timestamp preserved for audit even though the server number is assigned now).
    /// </summary>
    public DateTime? OriginalCapturedOn { get; set; }
}

public class CounterInvoicePaymentDto
{
    public string PaymentType { get; set; } = "Cash";
    public decimal Amount { get; set; }
    public string? ReferenceNo { get; set; }
}

public class CounterInvoiceDto
{
    public int InvoiceId { get; set; }
    public string? InvoiceNo { get; set; }
    public int? CustomerId { get; set; }
    public string? CustomerName { get; set; }
    public DateTime InvoiceDate { get; set; }
    public decimal TaxableValue { get; set; }
    public decimal TaxValue { get; set; }
    public decimal TotalValue { get; set; }
    /// <summary>Cash | Cheque | UPI | Split — Split when more than one payment method was used;
    /// see <see cref="Payments"/> for the actual breakdown.</summary>
    public string PaymentType { get; set; } = "Cash";
    public string? ReferenceNo { get; set; }
    public List<CounterInvoicePaymentDto> Payments { get; set; } = new();
    public string Status { get; set; } = "Approved";
    public bool SyncedFromOffline { get; set; }
}

public static class PaymentTypes
{
    public const string Cash = "Cash";
    public const string Cheque = "Cheque";
    public const string Upi = "UPI";
    public const string Split = "Split";

    public static readonly string[] All = [Cash, Cheque, Upi];

    public static bool IsValid(string? type) => type is not null && All.Contains(type, StringComparer.OrdinalIgnoreCase);
}
