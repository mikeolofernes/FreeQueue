namespace FreeQueue.Api.Models;

public class StaffAccount
{
    public int Id { get; set; }
    public string BranchId { get; set; } = default!;
    public string Username { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;
    public string Role { get; set; } = "staff";
    public string? DefaultKioskPin { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Branch Branch { get; set; } = default!;
}
