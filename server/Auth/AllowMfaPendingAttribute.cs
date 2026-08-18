namespace RajendraGlass.Api.Auth;

/// <summary>
/// Marks an action as reachable with an MFA-pending token (issued after a correct password but
/// before MFA is satisfied). Every other endpoint rejects such tokens — see MfaPendingGateFilter.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public class AllowMfaPendingAttribute : Attribute
{
}
