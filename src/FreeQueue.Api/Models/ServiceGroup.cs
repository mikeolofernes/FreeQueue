namespace FreeQueue.Api.Models;

public class ServiceGroup
{
    public int Id { get; set; }
    public string BranchId { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string? Prefix { get; set; }
    public int SortOrder { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Branch Branch { get; set; } = default!;
    public ICollection<BranchService> Services { get; set; } = new List<BranchService>();
}
