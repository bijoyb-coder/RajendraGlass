namespace RajendraGlass.Api.Auth;

/// <summary>
/// Master on/off switches for MFA and RBAC (SDD 8.1/8.2). Both default to disabled for now per
/// request — flip either back to true in appsettings.json (Security:MfaEnforced /
/// Security:RbacEnforced) whenever you're ready; no code changes needed, everything underneath
/// (TOTP enrollment, the permission catalogue, RequirePermission checks) is already built and
/// just goes dormant when its switch is off.
/// </summary>
public class SecurityOptions
{
    public bool MfaEnforced { get; set; } = false;
    public bool RbacEnforced { get; set; } = false;
}
