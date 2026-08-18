namespace RajendraGlass.Api.Integration;

/// <summary>Adapter to the government Invoice Registration Portal (IRP) for e-Invoicing,
/// reached in production via a GSP (GST Suvidha Provider). See SDD 10.2, API Spec Section 18.</summary>
public interface IEInvoiceGateway
{
    string ProviderName { get; }
    Task<EInvoiceResult> GenerateIrnAsync(EInvoiceRequest request, CancellationToken ct = default);
    Task<EInvoiceCancelResult> CancelIrnAsync(string irn, string reason, CancellationToken ct = default);
}

/// <summary>Adapter to the government e-Way Bill portal. See SDD 10.2, API Spec Section 18.</summary>
public interface IEwayBillGateway
{
    string ProviderName { get; }
    Task<EwayBillResult> GenerateEwbAsync(EwayBillRequest request, CancellationToken ct = default);
    Task<EwayBillCancelResult> CancelEwbAsync(string ewbNo, string reason, CancellationToken ct = default);
}
