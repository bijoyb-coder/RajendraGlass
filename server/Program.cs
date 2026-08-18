using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using RajendraGlass.Api.Auth;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Integration;
using RajendraGlass.Api.Realtime;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers(options =>
{
    options.Filters.Add<MfaPendingGateFilter>();
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();
builder.Services.AddMemoryCache();

builder.Services.AddSingleton<IDbConnectionFactory, SqlConnectionFactory>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<PermissionService>();

// Master MFA/RBAC switches (SDD 8.1/8.2) — both off by default per current request; flip either
// back on in appsettings.json (Security:MfaEnforced / Security:RbacEnforced) whenever needed.
builder.Services.Configure<SecurityOptions>(builder.Configuration.GetSection("Security"));

// SignalR real-time push (SDD 10.1). Single node here, so no Redis backplane is configured —
// add .AddStackExchangeRedis(...) to AddSignalR() before scaling to more than one API instance.
builder.Services.AddSignalR();
builder.Services.AddSingleton<INotificationPublisher, NotificationPublisher>();

// e-Invoice / e-Way Bill gateways (SDD 10.2): defaults to Mock (no external calls) unless
// GstIntegration:Provider=Real and GSP credentials are configured in appsettings.
builder.Services.Configure<GstIntegrationOptions>(builder.Configuration.GetSection("GstIntegration"));
var gstProvider = builder.Configuration["GstIntegration:Provider"] ?? "Mock";
var gstTimeoutSeconds = builder.Configuration.GetValue<int?>("GstIntegration:TimeoutSeconds") ?? 30;
if (string.Equals(gstProvider, "Real", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddHttpClient<GstAuthTokenProvider>(c => c.Timeout = TimeSpan.FromSeconds(gstTimeoutSeconds));
    builder.Services.AddHttpClient<IEInvoiceGateway, RealEInvoiceGateway>(c => c.Timeout = TimeSpan.FromSeconds(gstTimeoutSeconds));
    builder.Services.AddHttpClient<IEwayBillGateway, RealEwayBillGateway>(c => c.Timeout = TimeSpan.FromSeconds(gstTimeoutSeconds));
}
else
{
    builder.Services.AddSingleton<IEInvoiceGateway, MockEInvoiceGateway>();
    builder.Services.AddSingleton<IEwayBillGateway, MockEwayBillGateway>();
}

var jwtSection = builder.Configuration.GetSection("Jwt");
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    // Without this, the handler silently remaps the "sub" claim to ClaimTypes.NameIdentifier,
    // which breaks every FindFirstValue(JwtRegisteredClaimNames.Sub) lookup in the controllers.
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSection["Issuer"],
        ValidAudience = jwtSection["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSection["Key"]!)),
        ClockSkew = TimeSpan.FromSeconds(30)
    };
    options.Events = new JwtBearerEvents
    {
        // Browsers can't attach an Authorization header to a WebSocket handshake, so the SignalR
        // client sends the token as a query-string parameter instead — accepted only on the hub
        // path, so REST calls still require a proper header.
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        },
    };
});
builder.Services.AddAuthorization();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Default", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

var app = builder.Build();

app.MapOpenApi();

app.UseCors("Default");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();
