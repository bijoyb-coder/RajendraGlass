namespace RajendraGlass.Api.Models;

/// <summary>Sub-Category Master. Mandatory Code + Name, unique Code -- same shape as
/// Master.Supplier/Master.Customer (see server/Controllers/CategoryController.cs).</summary>
public class SubCategoryDto
{
    public int SubCategoryId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    /// <summary>True while no Category currently references this Sub-Category.</summary>
    public bool CanDelete { get; set; } = true;
}

/// <summary>Category Master. SubCategoryId is the real foreign key (see the migration's own doc
/// comment for why); SubCategoryCode/SubCategoryName are joined in for display only -- never sent
/// back to the server as the source of truth, never stored a second time on this row.</summary>
public class CategoryDto
{
    public int CategoryId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public int SubCategoryId { get; set; }
    /// <summary>Read-only, joined from Master.SubCategory -- never trusted from the client.</summary>
    public string? SubCategoryCode { get; set; }
    public string? SubCategoryName { get; set; }
    public bool IsActive { get; set; } = true;
    public bool CanDelete { get; set; } = true;
}
