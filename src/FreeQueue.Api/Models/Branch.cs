namespace FreeQueue.Api.Models;

public class Branch
{
    public string Id { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string? Category { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public int MaxCapacity { get; set; } = 50;
    public int GraceMinutes { get; set; } = 15;
    public TimeOnly? OpensAt { get; set; }
    public TimeOnly? ClosesAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<QueueTicket> Tickets { get; set; } = [];
    public ICollection<QueueTransaction> Transactions { get; set; } = [];
}
