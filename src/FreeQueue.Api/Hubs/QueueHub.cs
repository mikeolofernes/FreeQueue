using Microsoft.AspNetCore.SignalR;

namespace FreeQueue.Api.Hubs;

public class QueueHub : Hub
{
    // Clients call this to subscribe to a branch's live updates.
    public async Task JoinBranch(string branchId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, BranchGroup(branchId));
    }

    public async Task LeaveBranch(string branchId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, BranchGroup(branchId));
    }

    public static string BranchGroup(string branchId) => $"branch:{branchId}";

    public async Task JoinTicket(int ticketId)
        => await Groups.AddToGroupAsync(Context.ConnectionId, TicketGroup(ticketId));

    public static string TicketGroup(int ticketId) => $"ticket:{ticketId}";
}

// Events pushed to clients:
//
// "QueueAdvanced"    { currentTicketNumber, nextTicketNumber, activeCount, servedToday }
// "TicketUpdated"    { ticketId, status, peopleAhead }
// "WaitTimeUpdated"  { branchId, estimatedMinutes, confidence }
// "Broadcast"        { branchId, message }
