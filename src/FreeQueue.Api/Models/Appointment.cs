namespace FreeQueue.Api.Models;

public class Appointment
{
    public int Id { get; set; }
    public string BranchId { get; set; } = default!;
    public string ServiceType { get; set; } = default!;
    public string CustomerName { get; set; } = default!;
    public string? Phone { get; set; }
    public DateTime ScheduledAt { get; set; }
    public string Status { get; set; } = "pending"; // pending, confirmed, cancelled, converted
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Branch Branch { get; set; } = default!;
}
