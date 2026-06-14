using FreeQueue.Api.Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Hubs;

public class QueueHub(AppDbContext db) : Hub
{
    public async Task JoinBranch(string branchId)
    {
        if (!await db.Branches.AnyAsync(b => b.Id == branchId))
            throw new HubException("Branch not found.");
        await Groups.AddToGroupAsync(Context.ConnectionId, BranchGroup(branchId));
    }

    public async Task LeaveBranch(string branchId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, BranchGroup(branchId));
    }

    public static string BranchGroup(string branchId) => $"branch:{branchId}";

    public async Task JoinTicket(int ticketId, string? vt = null)
    {
        var ticket = await db.QueueTickets.FindAsync(ticketId);
        if (ticket == null) throw new HubException("Ticket not found.");
        if (ticket.ViewToken != null && ticket.ViewToken != vt)
            throw new HubException("Unauthorized.");
        await Groups.AddToGroupAsync(Context.ConnectionId, TicketGroup(ticketId));
    }

    public static string TicketGroup(int ticketId) => $"ticket:{ticketId}";
}

// Events pushed to clients:
//
// "QueueAdvanced"    { currentTicketNumber, nextTicketNumber, activeCount, servedToday }
// "TicketUpdated"    { ticketId, status, peopleAhead }
// "WaitTimeUpdated"  { branchId, estimatedMinutes, confidence }
// "Broadcast"        { branchId, message }
