namespace FreeQueue.Api.Models;

public static class TicketStatus
{
    public const string Waiting = "waiting";
    public const string Away = "away";
    public const string Near = "near";
    public const string Arrived = "arrived";
    public const string Served = "served";
    public const string Skipped = "skipped";
    public const string Cancelled = "cancelled";

    public static readonly string[] Active = [Waiting, Away, Near, Arrived];
}
