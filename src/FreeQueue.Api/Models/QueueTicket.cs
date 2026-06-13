namespace FreeQueue.Api.Models;

public class QueueTicket
{
    public int Id { get; set; }
    public string BranchId { get; set; } = default!;
    public int TicketNumber { get; set; }
    public string ServiceType { get; set; } = default!;
    public string? CustomerName { get; set; }
    public string? Phone { get; set; }
    public string Status { get; set; } = TicketStatus.Waiting;
    public bool Priority { get; set; } = false;
    public int SkipCount { get; set; } = 0;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CalledAt { get; set; }
    public DateTime? ServedAt { get; set; }
    public DateTime? AbandonedAt { get; set; }
    public int? AbandonPosition { get; set; }
    public string? CounterId { get; set; }
    public int? Rating { get; set; }
    public string? ViewToken { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Branch Branch { get; set; } = default!;
}
