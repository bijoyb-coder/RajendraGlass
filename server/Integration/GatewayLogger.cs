using System.Data;
using System.Text.Json;
using Dapper;

namespace RajendraGlass.Api.Integration;

/// <summary>Shared writer for Integration.GatewayLog — every e-Invoice/e-Way Bill gateway call,
/// regardless of caller, lands one row here (SDD 10.2).</summary>
public static class GatewayLogger
{
    public static void Log(IDbConnection conn, string gatewayType, string operation, string provider, string docType, int docId, object request, object response, bool success, string? error, int durationMs)
    {
        conn.Execute(
            @"INSERT INTO Integration.GatewayLog (GatewayType, Operation, Provider, DocType, DocId, RequestJson, ResponseJson, Status, ErrorMessage, DurationMs)
              VALUES (@gatewayType, @operation, @provider, @docType, @docId, @requestJson, @responseJson, @status, @error, @durationMs)",
            new
            {
                gatewayType,
                operation,
                provider,
                docType,
                docId,
                requestJson = JsonSerializer.Serialize(request),
                responseJson = JsonSerializer.Serialize(response),
                status = success ? "Success" : "Failed",
                error,
                durationMs,
            });
    }
}
