using System.Net.Http.Headers;
using Microsoft.Extensions.Options;

namespace RajendraGlass.Api.Integration;

/// <summary>
/// OAuth2 client_credentials token cache shared by the Real e-Invoice and e-Way Bill gateways.
/// Most GSPs (Cygnet, ClearTax, Masters India, etc.) front the NIC APIs with a standard OAuth2
/// client_credentials grant: exchange ClientId/ClientSecret for a short-lived Bearer token, reuse
/// it until it's close to expiry, then refresh. This is written and ready to run the moment real
/// GSP credentials are supplied — nothing else in RealEInvoiceGateway/RealEwayBillGateway needs to
/// change.
/// </summary>
public class GstAuthTokenProvider(HttpClient http, IOptions<GstIntegrationOptions> options)
{
    private readonly SemaphoreSlim _lock = new(1, 1);
    private string? _cachedToken;
    private DateTimeOffset _expiresOn = DateTimeOffset.MinValue;

    /// <summary>Returns a valid Bearer token, fetching/refreshing it if the cached one is missing
    /// or within 60 seconds of expiry.</summary>
    public async Task<string?> GetAccessTokenAsync(CancellationToken ct = default)
    {
        var opts = options.Value;
        if (string.IsNullOrWhiteSpace(opts.TokenUrl))
        {
            // Some GSPs skip the token step and accept ClientSecret directly as the Bearer value —
            // fall back to that rather than failing, so a simpler GSP integration still works.
            return opts.ClientSecret;
        }

        if (_cachedToken is not null && DateTimeOffset.UtcNow < _expiresOn.AddSeconds(-60))
        {
            return _cachedToken;
        }

        await _lock.WaitAsync(ct);
        try
        {
            // Double-check after acquiring the lock — another caller may have just refreshed it.
            if (_cachedToken is not null && DateTimeOffset.UtcNow < _expiresOn.AddSeconds(-60))
            {
                return _cachedToken;
            }

            var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = opts.ClientId,
                ["client_secret"] = opts.ClientSecret,
                ["scope"] = string.IsNullOrWhiteSpace(opts.Scope) ? "einvoice ewaybill" : opts.Scope,
            });

            using var response = await GatewayRetry.SendAsync(() => http.PostAsync(opts.TokenUrl, form, ct), ct);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var payload = await response.Content.ReadFromJsonAsync<TokenResponse>(cancellationToken: ct);
            if (payload?.AccessToken is null) return null;

            _cachedToken = payload.AccessToken;
            _expiresOn = DateTimeOffset.UtcNow.AddSeconds(payload.ExpiresIn > 0 ? payload.ExpiresIn : 3600);
            return _cachedToken;
        }
        finally
        {
            _lock.Release();
        }
    }

    private class TokenResponse
    {
        public string? AccessToken { get; set; }
        public int ExpiresIn { get; set; }
    }
}

/// <summary>Small transient-failure retry helper — 3 attempts, exponential backoff. Stands in for
/// the "adapter calls run through Hangfire with retry/backoff" behaviour (SDD 10.2) at the
/// single-request scope these gateways operate in; a queued background retry is a further step up
/// once real traffic volume justifies it.</summary>
public static class GatewayRetry
{
    public static async Task<HttpResponseMessage> SendAsync(Func<Task<HttpResponseMessage>> send, CancellationToken ct = default)
    {
        Exception? lastError = null;
        for (int attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                var response = await send();
                if (response.IsSuccessStatusCode || (int)response.StatusCode < 500)
                {
                    return response; // success, or a client error that a retry won't fix
                }
                lastError = new HttpRequestException($"GSP returned {(int)response.StatusCode}");
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                lastError = ex;
            }

            if (attempt < 3)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(250 * Math.Pow(2, attempt - 1)), ct);
            }
        }
        throw lastError ?? new HttpRequestException("GSP call failed after retries.");
    }
}
