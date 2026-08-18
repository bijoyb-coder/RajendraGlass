using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace RajendraGlass.Api.Integration;

public class GstIntegrationOptions
{
    /// <summary>"Mock" (default, no external calls) or "Real".</summary>
    public string Provider { get; set; } = "Mock";

    /// <summary>
    /// Base URL of your GSP's (GST Suvidha Provider — e.g. Cygnet, ClearTax, Masters India) REST API.
    /// Direct integration against the NIC IRP itself additionally requires an RSA/AES session-key
    /// handshake (auth → Sek exchange → AES-encrypt every payload) that is specific to the NIC
    /// crypto protocol; going through a GSP is the standard path for a business this size and is
    /// what this client is written against. Point it at your GSP's documented base URL.
    /// </summary>
    public string BaseUrl { get; set; } = "";

    /// <summary>
    /// OAuth2 client_credentials token endpoint, e.g. "https://gsp.example.com/oauth/token". Leave
    /// blank if your GSP accepts ClientSecret directly as the Bearer token (some do) — see
    /// GstAuthTokenProvider.
    /// </summary>
    public string TokenUrl { get; set; } = "";
    public string Scope { get; set; } = "";

    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string Gstin { get; set; } = "";

    public int TimeoutSeconds { get; set; } = 30;
}

/// <summary>
/// Real e-Invoice (IRP) client, written against a typical GSP's REST wrapper around the NIC schema.
/// Inactive unless GstIntegration:Provider=Real and the options above are filled in — see
/// Program.cs for the registration switch. Field/endpoint names follow the NIC e-Invoice API
/// (Generate IRN / Cancel IRN); confirm exact paths against your GSP's own API reference, since
/// each GSP wraps the NIC contract slightly differently (auth scheme, base path).
/// </summary>
public class RealEInvoiceGateway(HttpClient http, GstAuthTokenProvider tokenProvider, IOptions<GstIntegrationOptions> options) : IEInvoiceGateway
{
    public string ProviderName => "Real";

    public async Task<EInvoiceResult> GenerateIrnAsync(EInvoiceRequest request, CancellationToken ct = default)
    {
        var opts = options.Value;
        if (string.IsNullOrWhiteSpace(opts.BaseUrl) || string.IsNullOrWhiteSpace(opts.ClientId))
        {
            return new EInvoiceResult { Success = false, ErrorCode = "CONFIG", ErrorMessage = "GstIntegration is not configured for a Real provider (BaseUrl/ClientId missing). Set GstIntegration:Provider back to Mock, or complete GSP onboarding first." };
        }

        var token = await tokenProvider.GetAccessTokenAsync(ct);
        if (token is null)
        {
            return new EInvoiceResult { Success = false, ErrorCode = "AUTH", ErrorMessage = "Could not obtain an access token from the GSP (check ClientId/ClientSecret/TokenUrl)." };
        }

        try
        {
            var res = await GatewayRetry.SendAsync(() =>
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{opts.BaseUrl.TrimEnd('/')}/eicore/v1.03/Invoice")
                {
                    Content = JsonContent.Create(request),
                };
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                req.Headers.Add("client_id", opts.ClientId);
                req.Headers.Add("Gstin", opts.Gstin);
                return http.SendAsync(req, ct);
            }, ct);

            if (!res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(ct);
                return new EInvoiceResult { Success = false, ErrorCode = res.StatusCode.ToString(), ErrorMessage = $"GSP returned {(int)res.StatusCode}: {body}" };
            }
            var result = await res.Content.ReadFromJsonAsync<EInvoiceResult>(cancellationToken: ct);
            return result ?? new EInvoiceResult { Success = false, ErrorCode = "EMPTY", ErrorMessage = "Empty response from GSP." };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new EInvoiceResult { Success = false, ErrorCode = "NETWORK", ErrorMessage = $"Could not reach the GSP after retries: {ex.Message}" };
        }
    }

    public async Task<EInvoiceCancelResult> CancelIrnAsync(string irn, string reason, CancellationToken ct = default)
    {
        var opts = options.Value;
        if (string.IsNullOrWhiteSpace(opts.BaseUrl))
            return new EInvoiceCancelResult { Success = false, ErrorCode = "CONFIG", ErrorMessage = "GstIntegration is not configured for a Real provider." };

        var token = await tokenProvider.GetAccessTokenAsync(ct);
        if (token is null)
            return new EInvoiceCancelResult { Success = false, ErrorCode = "AUTH", ErrorMessage = "Could not obtain an access token from the GSP." };

        try
        {
            var res = await GatewayRetry.SendAsync(() =>
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{opts.BaseUrl.TrimEnd('/')}/eicore/v1.03/Invoice/Cancel")
                {
                    Content = JsonContent.Create(new { Irn = irn, CnlRsn = "1", CnlRem = reason }),
                };
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                req.Headers.Add("client_id", opts.ClientId);
                return http.SendAsync(req, ct);
            }, ct);

            return new EInvoiceCancelResult { Success = res.IsSuccessStatusCode, ErrorMessage = res.IsSuccessStatusCode ? null : await res.Content.ReadAsStringAsync(ct) };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new EInvoiceCancelResult { Success = false, ErrorCode = "NETWORK", ErrorMessage = ex.Message };
        }
    }
}

/// <summary>Real e-Way Bill client — same GSP-wrapper approach as RealEInvoiceGateway.</summary>
public class RealEwayBillGateway(HttpClient http, GstAuthTokenProvider tokenProvider, IOptions<GstIntegrationOptions> options) : IEwayBillGateway
{
    public string ProviderName => "Real";

    public async Task<EwayBillResult> GenerateEwbAsync(EwayBillRequest request, CancellationToken ct = default)
    {
        var opts = options.Value;
        if (string.IsNullOrWhiteSpace(opts.BaseUrl) || string.IsNullOrWhiteSpace(opts.ClientId))
        {
            return new EwayBillResult { Success = false, ErrorCode = "CONFIG", ErrorMessage = "GstIntegration is not configured for a Real provider (BaseUrl/ClientId missing)." };
        }

        var token = await tokenProvider.GetAccessTokenAsync(ct);
        if (token is null)
            return new EwayBillResult { Success = false, ErrorCode = "AUTH", ErrorMessage = "Could not obtain an access token from the GSP (check ClientId/ClientSecret/TokenUrl)." };

        try
        {
            var res = await GatewayRetry.SendAsync(() =>
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{opts.BaseUrl.TrimEnd('/')}/ewb/v1.03/GenEwayBill")
                {
                    Content = JsonContent.Create(request),
                };
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                req.Headers.Add("client_id", opts.ClientId);
                req.Headers.Add("Gstin", opts.Gstin);
                return http.SendAsync(req, ct);
            }, ct);

            if (!res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(ct);
                return new EwayBillResult { Success = false, ErrorCode = res.StatusCode.ToString(), ErrorMessage = $"GSP returned {(int)res.StatusCode}: {body}" };
            }
            var result = await res.Content.ReadFromJsonAsync<EwayBillResult>(cancellationToken: ct);
            return result ?? new EwayBillResult { Success = false, ErrorCode = "EMPTY", ErrorMessage = "Empty response from GSP." };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new EwayBillResult { Success = false, ErrorCode = "NETWORK", ErrorMessage = $"Could not reach the GSP after retries: {ex.Message}" };
        }
    }

    public async Task<EwayBillCancelResult> CancelEwbAsync(string ewbNo, string reason, CancellationToken ct = default)
    {
        var opts = options.Value;
        if (string.IsNullOrWhiteSpace(opts.BaseUrl))
            return new EwayBillCancelResult { Success = false, ErrorCode = "CONFIG", ErrorMessage = "GstIntegration is not configured for a Real provider." };

        var token = await tokenProvider.GetAccessTokenAsync(ct);
        if (token is null)
            return new EwayBillCancelResult { Success = false, ErrorCode = "AUTH", ErrorMessage = "Could not obtain an access token from the GSP." };

        try
        {
            var res = await GatewayRetry.SendAsync(() =>
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{opts.BaseUrl.TrimEnd('/')}/ewb/v1.03/CancelEwayBill")
                {
                    Content = JsonContent.Create(new { EwbNo = ewbNo, CancelRsnCode = "3", CancelRmrk = reason }),
                };
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                req.Headers.Add("client_id", opts.ClientId);
                return http.SendAsync(req, ct);
            }, ct);

            return new EwayBillCancelResult { Success = res.IsSuccessStatusCode, ErrorMessage = res.IsSuccessStatusCode ? null : await res.Content.ReadAsStringAsync(ct) };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new EwayBillCancelResult { Success = false, ErrorCode = "NETWORK", ErrorMessage = ex.Message };
        }
    }
}
