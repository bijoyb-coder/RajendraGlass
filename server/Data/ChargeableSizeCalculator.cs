namespace RajendraGlass.Api.Data;

/// <summary>
/// The seam for turning an actual cut size into a billed (chargeable) size. Today the business
/// rules for automatic chargeable-size rounding aren't defined yet, so this simply validates and
/// passes through whatever the operator typed -- but every call site goes through this one
/// function, so swapping in real rounding rules later (e.g. "round up to the nearest 3 inches",
/// minimum charge sizes, etc.) means changing this method's body only, not the controller, the
/// request model, or the database schema.
/// </summary>
public static class ChargeableSizeCalculator
{
    /// <summary>Returns a soft-validation problem string (never throws) if the chargeable size is
    /// smaller than the actual cut -- normally impossible (you can't charge for less glass than you
    /// cut), but deliberately a single, easily-relaxable check rather than a hard database
    /// constraint, since some future business exception might allow it.</summary>
    public static string? Validate(decimal actualHeight, decimal actualWidth, decimal chargeableHeight, decimal chargeableWidth)
    {
        if (chargeableHeight < actualHeight)
            return $"Chargeable height ({chargeableHeight}\") is less than the actual cut height ({actualHeight}\").";
        if (chargeableWidth < actualWidth)
            return $"Chargeable width ({chargeableWidth}\") is less than the actual cut width ({actualWidth}\").";
        return null;
    }

    /// <summary>Manual pass-through for now -- see the class-level remarks. Kept as a named call
    /// site so a future automatic implementation only has to change here.</summary>
    public static (decimal Height, decimal Width) Compute(decimal actualHeight, decimal actualWidth, decimal manualChargeableHeight, decimal manualChargeableWidth)
        => (manualChargeableHeight, manualChargeableWidth);
}
