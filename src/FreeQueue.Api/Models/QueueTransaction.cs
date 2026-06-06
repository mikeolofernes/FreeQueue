namespace FreeQueue.Api.Models;

public class QueueTransaction
{
    public int Id { get; set; }
    public string BranchId { get; set; } = default!;
    public string ServiceType { get; set; } = default!;
    public int? TicketNumber { get; set; }
    public DateTime? CalledAt { get; set; }
    public DateTime? ServedAt { get; set; }
    public int DurationSecs { get; set; }
    public short DayOfWeek { get; set; }
    public short HourOfDay { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Branch Branch { get; set; } = default!;
}
