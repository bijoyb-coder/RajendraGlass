namespace RajendraGlass.Api.Models;

/// <summary>Type Master. Deliberately only TypeId + TypeName -- no separate Code column, unlike
/// Category/SubCategory (see server/Controllers/TypeController.cs).</summary>
public class TypeDto
{
    public int TypeId { get; set; }
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    /// <summary>True while no Product currently references this Type.</summary>
    public bool CanDelete { get; set; } = true;
}
