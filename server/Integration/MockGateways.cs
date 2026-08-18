using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace RajendraGlass.Api.Integration;

/// <summary>
/// Stands in for the real NIC IRP when no GSP/production credentials are configured (the default
/// in this environment — see appsettings "GstIntegration:Provider"). It implements the same
/// contract as RealEInvoiceGateway and produces structurally realistic output (a genuine SHA-256
/// derived IRN, a QR payload shaped exactly like the government's), so the rest of the system —
/// controllers, storage, printing, the UI — is exercised exactly as it would be against the real
/// portal. It does not reach any external network.
/// </summary>
public class MockEInvoiceGateway : IEInvoiceGateway
{
    public string ProviderName => "Mock";

    public async Task<EInvoiceResult> GenerateIrnAsync(EInvoiceRequest request, CancellationToken ct = default)
    {
        await Task.Delay(Random.Shared.Next(250, 600), ct); // simulate GSP round-trip

        if (request.TotInvVal <= 0)
        {
            return new EInvoiceResult { Success = false, ErrorCode = "3038", ErrorMessage = "Total invoice value must be greater than zero." };
        }
        if (string.IsNullOrWhiteSpace(request.BuyerGstin))
        {
            return new EInvoiceResult { Success = false, ErrorCode = "3028", ErrorMessage = "Recipient GSTIN is mandatory for e-Invoice generation." };
        }

        // Real IRN = SHA-256(SellerGstin + DocNo + FY + DocType), hex, 64 chars — same algorithm NIC uses.
        var fy = request.DocDt.Month >= 4 ? request.DocDt.Year : request.DocDt.Year - 1;
        var seed = $"{request.SellerGstin}{request.DocNo}{fy}{request.DocTyp}{Guid.NewGuid():N}";
        var irn = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(seed))).ToLowerInvariant();
        var ackNo = (100000000000000L + Math.Abs(BitConverter.ToInt64(SHA256.HashData(Encoding.UTF8.GetBytes(irn)), 0)) % 900000000000000L).ToString();
        var ackDt = DateTime.UtcNow;

        // QR payload shape matches the government's SignedQrCode content once decoded.
        var qr = JsonSerializer.Serialize(new
        {
            SellerGstin = request.SellerGstin,
            BuyerGstin = request.BuyerGstin,
            DocNo = request.DocNo,
            DocTyp = request.DocTyp,
            DocDt = request.DocDt.ToString("dd/MM/yyyy"),
            TotInvVal = request.TotInvVal,
            ItemCnt = request.ItemList.Count,
            MainHsnCode = request.ItemList.FirstOrDefault()?.HsnCd,
            Irn = irn,
            IrnDt = ackDt.ToString("dd/MM/yyyy HH:mm:ss"),
        });

        return new EInvoiceResult
        {
            Success = true,
            Irn = irn,
            AckNo = ackNo,
            AckDt = ackDt,
            QrPayload = qr,
            SignedInvoice = $"mock.signed-invoice.{irn[..16]}",
            SignedQrCode = $"mock.signed-qr.{irn[..16]}",
        };
    }

    public async Task<EInvoiceCancelResult> CancelIrnAsync(string irn, string reason, CancellationToken ct = default)
    {
        await Task.Delay(Random.Shared.Next(150, 400), ct);
        if (string.IsNullOrWhiteSpace(reason))
            return new EInvoiceCancelResult { Success = false, ErrorCode = "3067", ErrorMessage = "Cancellation reason is mandatory." };
        return new EInvoiceCancelResult { Success = true };
    }
}

/// <summary>Stands in for the real e-Way Bill portal — see MockEInvoiceGateway for the rationale.</summary>
public class MockEwayBillGateway : IEwayBillGateway
{
    public string ProviderName => "Mock";

    public async Task<EwayBillResult> GenerateEwbAsync(EwayBillRequest request, CancellationToken ct = default)
    {
        await Task.Delay(Random.Shared.Next(250, 600), ct);

        if (request.TotalValue < 50000)
        {
            // Real rule: e-Way Bill is mandatory only above ₹50,000 consignment value (intra-state
            // thresholds vary by state; ₹50,000 is the pan-India default used here).
            return new EwayBillResult { Success = false, ErrorCode = "EWB001", ErrorMessage = "Consignment value is below the ₹50,000 e-Way Bill threshold." };
        }
        if (string.IsNullOrWhiteSpace(request.VehicleNo))
        {
            return new EwayBillResult { Success = false, ErrorCode = "EWB002", ErrorMessage = "Vehicle number is mandatory for road transport." };
        }

        // Real EWB numbers are 12 digits.
        var seed = $"{request.DocNo}{request.FromGstin}{Guid.NewGuid():N}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(seed));
        var ewbNo = (100000000000L + Math.Abs(BitConverter.ToInt64(hash, 0)) % 900000000000L).ToString();
        var ewbDate = DateTime.UtcNow;

        // Real validity rule: 1 day per 200 km (or part thereof) for normal cargo, minimum 1 day.
        var days = Math.Max(1, (int)Math.Ceiling(request.TransDistanceKm / 200m));
        var validUpto = ewbDate.Date.AddDays(days).AddHours(23).AddMinutes(59);

        var qr = JsonSerializer.Serialize(new
        {
            EwbNo = ewbNo,
            EwbDate = ewbDate.ToString("dd/MM/yyyy HH:mm:ss"),
            VehicleNo = request.VehicleNo,
            DocNo = request.DocNo,
            FromGstin = request.FromGstin,
            ToGstin = request.ToGstin,
            TotalValue = request.TotalValue,
            ValidUpto = validUpto.ToString("dd/MM/yyyy HH:mm:ss"),
        });

        return new EwayBillResult { Success = true, EwbNo = ewbNo, EwbDate = ewbDate, ValidUpto = validUpto, QrPayload = qr };
    }

    public async Task<EwayBillCancelResult> CancelEwbAsync(string ewbNo, string reason, CancellationToken ct = default)
    {
        await Task.Delay(Random.Shared.Next(150, 400), ct);
        if (string.IsNullOrWhiteSpace(reason))
            return new EwayBillCancelResult { Success = false, ErrorCode = "EWB010", ErrorMessage = "Cancellation reason is mandatory." };
        return new EwayBillCancelResult { Success = true };
    }
}
