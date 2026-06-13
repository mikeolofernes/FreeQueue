namespace FreeQueue.Api.Models;

public class BranchService
{
    public int Id { get; set; }
    public string BranchId { get; set; } = default!;
    public string Name { get; set; } = default!;
    public int SortOrder { get; set; }

    public Branch Branch { get; set; } = default!;
}
