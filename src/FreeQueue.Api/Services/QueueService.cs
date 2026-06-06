using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Hubs;
using FreeQueue.Api.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using System.Text.Json;

namespace FreeQueue.Api.Services;

public class QueueService(
    AppDbContext db,
    WaitTimeEstimator estimator,
    IHubContext<QueueHub> hub,
    IConnectionMultiplexer redis)
{
    private const int MaxSkipsBeforeRemoval = 2;
    private const int MaxUndoLevels = 5;

    // ── Join ──────────────────────────────────────────────────────────────────

    public async Task<TicketResponse> JoinQueueAsync(JoinQueueRequest req)
    {
        var branch = await db.Branches.FindAsync(req.BranchId)
            ?? throw new KeyNotFoundException($"Branch '{req.BranchId}' not found.");

        var activeCount = await ActiveCountAsync(req.BranchId);
        if (activeCount >= branch.MaxCapacity)
            throw new InvalidOperationException("Queue is full.");

        var closesAt = branch.ClosesAt;
        if (closesAt.HasValue)
        {
            var now = TimeOnly.FromDateTime(DateTime.UtcNow);
            if (now >= closesAt.Value.AddMinutes(-30))
                throw new InvalidOperationException("Queue is closed for new entries.");
        }

        var nextNumber = await NextTicketNumberAsync(req.BranchId);

        var ticket = new QueueTicket
        {
            BranchId = req.BranchId,
            TicketNumber = nextNumber,
            ServiceType = req.ServiceType,
            CustomerName = req.CustomerName,
            Phone = req.Phone,
            Status = TicketStatus.Waiting,
        };

        db.QueueTickets.Add(ticket);
        await db.SaveChangesAsync();

        var peopleAhead = await PeopleAheadAsync(req.BranchId, ticket.TicketNumber);
        var estimate = await estimator.EstimateAsync(req.BranchId, req.ServiceType, peopleAhead);

        await BroadcastQueueStateAsync(req.BranchId);

        return MapTicket(ticket, peopleAhead, estimate);
    }

    // ── Advance (Staff Tap) ───────────────────────────────────────────────────

    public async Task<QueueStatusResponse> AdvanceQueueAsync(AdvanceQueueRequest req)
    {
        var now = DateTime.UtcNow;

        // Log the completed transaction for wait-time estimation
        if (req.DurationSecs > 0)
        {
            db.QueueTransactions.Add(new QueueTransaction
            {
                BranchId = req.BranchId,
                ServiceType = req.ServiceType,
                TicketNumber = req.TicketNumber,
                CalledAt = now.AddSeconds(-req.DurationSecs),
                ServedAt = now,
                DurationSecs = req.DurationSecs,
                DayOfWeek = (short)now.DayOfWeek,
                HourOfDay = (short)now.Hour,
            });
        }

        // Mark current ticket as served
        var current = await db.QueueTickets
            .Where(t => t.BranchId == req.BranchId && t.TicketNumber == req.TicketNumber)
            .FirstOrDefaultAsync();

        if (current != null)
        {
            current.Status = TicketStatus.Served;
            current.ServedAt = now;
        }

        await db.SaveChangesAsync();

        // Save to undo stack in Redis
        await PushUndoAsync(req.BranchId, req.TicketNumber);

        // Call the next ticket
        var next = await NextActiveTicketAsync(req.BranchId);
        if (next != null)
        {
            next.Status = TicketStatus.Near;
            next.CalledAt = now;
            await db.SaveChangesAsync();

            await hub.Clients.Group(QueueHub.BranchGroup(req.BranchId))
                .SendAsync("TicketUpdated", new { ticketId = next.Id, status = next.Status, peopleAhead = 0 });
        }

        await BroadcastQueueStateAsync(req.BranchId);

        return await GetQueueStatusAsync(req.BranchId);
    }

    // ── Walk-in ───────────────────────────────────────────────────────────────

    public async Task<TicketResponse> AddWalkInAsync(AddWalkInRequest req)
    {
        return await JoinQueueAsync(new JoinQueueRequest(
            req.BranchId, req.ServiceType, req.CustomerName ?? "Walk-in", req.Phone));
    }

    // ── Ticket actions ────────────────────────────────────────────────────────

    public async Task StepAwayAsync(int ticketId)
    {
        var ticket = await GetActiveTicketAsync(ticketId);
        ticket.Status = TicketStatus.Away;
        await db.SaveChangesAsync();
        await BroadcastTicketUpdate(ticket);
    }

    public async Task CheckInAsync(int ticketId)
    {
        var ticket = await GetActiveTicketAsync(ticketId);
        ticket.Status = TicketStatus.Arrived;
        await db.SaveChangesAsync();
        await BroadcastTicketUpdate(ticket);
    }

    public async Task SkipAsync(int ticketId)
    {
        var ticket = await GetActiveTicketAsync(ticketId);
        ticket.SkipCount++;

        if (ticket.SkipCount >= MaxSkipsBeforeRemoval)
        {
            ticket.Status = TicketStatus.Cancelled;
        }
        else
        {
            ticket.Status = TicketStatus.Skipped;
            // Re-insert at end by bumping ticket number past current max
            var maxNumber = await db.QueueTickets
                .Where(t => t.BranchId == ticket.BranchId)
                .MaxAsync(t => (int?)t.TicketNumber) ?? 0;
            ticket.TicketNumber = maxNumber + 1;
            ticket.Status = TicketStatus.Waiting;
        }

        await db.SaveChangesAsync();
        await BroadcastQueueStateAsync(ticket.BranchId);
    }

    public async Task LeaveQueueAsync(int ticketId)
    {
        var ticket = await GetActiveTicketAsync(ticketId);
        ticket.Status = TicketStatus.Cancelled;
        await db.SaveChangesAsync();
        await BroadcastQueueStateAsync(ticket.BranchId);
    }

    // ── Undo ──────────────────────────────────────────────────────────────────

    public async Task<UndoResponse> UndoAsync(string branchId)
    {
        var cache = redis.GetDatabase();
        var key = UndoKey(branchId);
        var val = await cache.ListRightPopAsync(key);

        if (val.IsNullOrEmpty)
            return new UndoResponse(false, "Nothing to undo.");

        var lastTicketNumber = (int)val;
        var now = DateTime.UtcNow;

        // Restore the served ticket back to waiting
        var ticket = await db.QueueTickets
            .Where(t => t.BranchId == branchId && t.TicketNumber == lastTicketNumber && t.Status == TicketStatus.Served)
            .FirstOrDefaultAsync();

        if (ticket == null)
            return new UndoResponse(false, "Cannot restore — ticket no longer undoable.");

        ticket.Status = TicketStatus.Waiting;
        ticket.ServedAt = null;

        // Also delete the transaction log entry
        var txn = await db.QueueTransactions
            .Where(t => t.BranchId == branchId && t.TicketNumber == lastTicketNumber)
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefaultAsync();

        if (txn != null)
            db.QueueTransactions.Remove(txn);

        // Move any "Near" ticket back to Waiting
        var calledNext = await db.QueueTickets
            .Where(t => t.BranchId == branchId && t.Status == TicketStatus.Near)
            .FirstOrDefaultAsync();

        if (calledNext != null)
        {
            calledNext.Status = TicketStatus.Waiting;
            calledNext.CalledAt = null;
        }

        await db.SaveChangesAsync();
        await BroadcastQueueStateAsync(branchId);

        return new UndoResponse(true, $"Restored ticket #{lastTicketNumber}.");
    }

    // ── Status & estimates ────────────────────────────────────────────────────

    public async Task<QueueStatusResponse> GetQueueStatusAsync(string branchId)
    {
        var activeTickets = await db.QueueTickets
            .Where(t => t.BranchId == branchId && TicketStatus.Active.Contains(t.Status))
            .OrderBy(t => t.TicketNumber)
            .ToListAsync();

        var servedToday = await db.QueueTickets
            .CountAsync(t => t.BranchId == branchId
                          && t.Status == TicketStatus.Served
                          && t.ServedAt >= DateTime.UtcNow.Date);

        var current = activeTickets.FirstOrDefault(t => t.Status == TicketStatus.Near || t.Status == TicketStatus.Arrived);
        var waiting = activeTickets.Count(t => t.Status == TicketStatus.Waiting || t.Status == TicketStatus.Away);

        WaitEstimateDto? estimate = null;
        if (current != null)
            estimate = await estimator.EstimateAsync(branchId, current.ServiceType, waiting);

        return new QueueStatusResponse(
            branchId,
            current?.TicketNumber,
            current?.ServiceType,
            activeTickets.Count,
            servedToday,
            waiting,
            estimate
        );
    }

    public async Task<TicketResponse> GetTicketAsync(int ticketId)
    {
        var ticket = await db.QueueTickets.FindAsync(ticketId)
            ?? throw new KeyNotFoundException($"Ticket {ticketId} not found.");

        var peopleAhead = TicketStatus.Active.Contains(ticket.Status)
            ? await PeopleAheadAsync(ticket.BranchId, ticket.TicketNumber)
            : 0;

        var estimate = await estimator.EstimateAsync(ticket.BranchId, ticket.ServiceType, peopleAhead);
        return MapTicket(ticket, peopleAhead, estimate);
    }

    // ── Broadcast ─────────────────────────────────────────────────────────────

    public async Task BroadcastMessageAsync(string branchId, string message)
    {
        await hub.Clients.Group(QueueHub.BranchGroup(branchId))
            .SendAsync("Broadcast", new { branchId, message });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<QueueTicket> GetActiveTicketAsync(int ticketId)
    {
        var ticket = await db.QueueTickets.FindAsync(ticketId)
            ?? throw new KeyNotFoundException($"Ticket {ticketId} not found.");

        if (!TicketStatus.Active.Contains(ticket.Status))
            throw new InvalidOperationException($"Ticket is {ticket.Status} and cannot be modified.");

        return ticket;
    }

    private async Task<int> NextTicketNumberAsync(string branchId)
    {
        var max = await db.QueueTickets
            .Where(t => t.BranchId == branchId && t.JoinedAt >= DateTime.UtcNow.Date)
            .MaxAsync(t => (int?)t.TicketNumber) ?? 0;
        return max + 1;
    }

    private async Task<int> ActiveCountAsync(string branchId) =>
        await db.QueueTickets.CountAsync(t => t.BranchId == branchId && TicketStatus.Active.Contains(t.Status));

    private async Task<int> PeopleAheadAsync(string branchId, int ticketNumber) =>
        await db.QueueTickets.CountAsync(t =>
            t.BranchId == branchId &&
            t.TicketNumber < ticketNumber &&
            TicketStatus.Active.Contains(t.Status));

    private async Task<QueueTicket?> NextActiveTicketAsync(string branchId) =>
        await db.QueueTickets
            .Where(t => t.BranchId == branchId && t.Status == TicketStatus.Waiting)
            .OrderBy(t => t.TicketNumber)
            .FirstOrDefaultAsync();

    private static TicketResponse MapTicket(QueueTicket t, int peopleAhead, WaitEstimateDto? estimate) =>
        new(t.Id, t.BranchId, t.TicketNumber, t.ServiceType, t.CustomerName, t.Status, peopleAhead, t.JoinedAt, estimate);

    private async Task BroadcastQueueStateAsync(string branchId)
    {
        var status = await GetQueueStatusAsync(branchId);
        await hub.Clients.Group(QueueHub.BranchGroup(branchId))
            .SendAsync("QueueAdvanced", status);

        if (status.WaitEstimate != null)
        {
            await hub.Clients.Group(QueueHub.BranchGroup(branchId))
                .SendAsync("WaitTimeUpdated", new
                {
                    branchId,
                    status.WaitEstimate.EstimatedMinutes,
                    status.WaitEstimate.Confidence
                });
        }
    }

    private async Task BroadcastTicketUpdate(QueueTicket ticket)
    {
        var peopleAhead = await PeopleAheadAsync(ticket.BranchId, ticket.TicketNumber);
        await hub.Clients.Group(QueueHub.BranchGroup(ticket.BranchId))
            .SendAsync("TicketUpdated", new { ticketId = ticket.Id, ticket.Status, peopleAhead });
    }

    private async Task PushUndoAsync(string branchId, int ticketNumber)
    {
        var cache = redis.GetDatabase();
        var key = UndoKey(branchId);
        await cache.ListLeftPushAsync(key, ticketNumber);
        await cache.ListTrimAsync(key, 0, MaxUndoLevels - 1);
        await cache.KeyExpireAsync(key, TimeSpan.FromHours(8));
    }

    private static string UndoKey(string branchId) => $"undo:{branchId}";
}
