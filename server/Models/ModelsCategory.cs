namespace RajendraGlass.Api.Models;

/// <summary>Category Master -- the parent side of Category -> SubCategory (see
/// db/53_category_subcategory_direction_swap.sql for why this is the parent). Mandatory Code +
/// Name, unique Code -- same shape as Master.Supplier/Master.Customer
/// (see server/Controllers/CategoryController.cs).</summary>
public class CategoryDto
{
    public int CategoryId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    /// <summary>True while no Sub-Category and no Product currently references this Category.</summary>
    public bool CanDelete { get; set; } = true;
}

/// <summary>Sub-Category Master -- the child side of Category -> SubCategory. CategoryId is the
/// real foreign key; CategoryCode/CategoryName are joined in for display only -- never sent back to
/// the server as the source of truth, never stored a second time on this row.</summary>
public class SubCategoryDto
{
    public int SubCategoryId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public int CategoryId { get; set; }
    /// <summary>Read-only, joined from Master.Category -- never trusted from the client.</summary>
    public string? CategoryCode { get; set; }
    public string? CategoryName { get; set; }
    public bool IsActive { get; set; } = true;
    /// <summary>True while no Product currently references this Sub-Category.</summary>
    public bool CanDelete { get; set; } = true;
}
