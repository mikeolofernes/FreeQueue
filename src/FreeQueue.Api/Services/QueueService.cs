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
    IConnectionMultiplexer redis,
    ISmsService sms)
{
    private const int MaxSkipsBeforeRemoval = 2;
    private const int MaxUndoLevels = 5;

    // ── Join ──────────────────────────────────────────────────────────────────

    public async Task<TicketResponse> JoinQueueAsync(JoinQueueRequest req)
    {
        var branch = await db.Branches.FindAsync(req.BranchId)
            ?? throw new KeyNotFoundException($"Branch '{req.BranchId}' not found.");

        if (!branch.IsOpen)
            throw new InvalidOperationException("Queue is currently closed.");

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

        var (groupId, prefix) = await ResolveGroupAsync(req.BranchId, req.ServiceType);
        var nextNumber = await NextTicketNumberAsync(req.BranchId, groupId);
        var displayNumber = prefix != null ? $"{prefix}-{nextNumber}" : nextNumber.ToString();

        var ticket = new QueueTicket
        {
            BranchId = req.BranchId,
            TicketNumber = nextNumber,
            DisplayNumber = displayNumber,
            ServiceGroupId = groupId,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            ServiceType = req.ServiceType,
            CustomerName = req.CustomerName,
            Phone = req.Phone,
            Priority = req.Priority,
            Status = TicketStatus.Waiting,
            ViewToken = Guid.NewGuid().ToString("N"),
        };

        db.QueueTickets.Add(ticket);
        await db.SaveChangesAsync();

        var peopleAhead = await PeopleAheadAsync(req.BranchId, ticket.TicketNumber, ticket.Priority);
        var estimate = await estimator.EstimateAsync(req.BranchId, req.ServiceType, peopleAhead);

        await BroadcastQueueStateAsync(req.BranchId);

        return MapTicket(ticket, peopleAhead, estimate);
    }

    // ── Advance (Staff Tap) ───────────────────────────────────────────────────

    public async Task<QueueStatusResponse> AdvanceQueueAsync(AdvanceQueueRequest req)
    {
        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(now);

        // Find the currently-serving ticket by status rather than by number to avoid
        // ambiguity when multiple groups share the same ticket number on the same day.
        var current = await db.QueueTickets
            .Where(t => t.BranchId == req.BranchId
                     && (t.Status == TicketStatus.Near || t.Status == TicketStatus.Arrived)
                     && t.QueueDate == today)
            .FirstOrDefaultAsync();

        if (req.DurationSecs > 0)
        {
            db.QueueTransactions.Add(new QueueTransaction
            {
                BranchId = req.BranchId,
                ServiceType = current?.ServiceType ?? req.ServiceType,
                TicketNumber = current?.TicketNumber ?? req.TicketNumber,
                CalledAt = now.AddSeconds(-req.DurationSecs),
                ServedAt = now,
                DurationSecs = req.DurationSecs,
                DayOfWeek = (short)now.DayOfWeek,
                HourOfDay = (short)now.Hour,
            });
        }

        if (current != null)
        {
            current.Status = TicketStatus.Served;
            current.ServedAt = now;
            if (req.CounterId != null) current.CounterId = req.CounterId;
        }

        await db.SaveChangesAsync();
        await PushUndoAsync(req.BranchId, current?.TicketNumber ?? req.TicketNumber);

        var next = await NextActiveTicketAsync(req.BranchId);
        if (next != null)
        {
            next.Status = TicketStatus.Near;
            next.CalledAt = now;
            if (req.CounterId != null) next.CounterId = req.CounterId;
            await db.SaveChangesAsync();

            await hub.Clients.Group(QueueHub.BranchGroup(req.BranchId))
                .SendAsync("TicketUpdated", new { ticketId = next.Id, status = next.Status, peopleAhead = 0 });

            // "Your turn soon" — notify 2nd in queue
            await NotifyYourTurnSoonAsync(req.BranchId, next.TicketNumber);
        }

        return await BroadcastQueueStateAsync(req.BranchId);
    }

    // ── Call Next ─────────────────────────────────────────────────────────────

    public async Task<QueueStatusResponse> CallNextAsync(string branchId, string? counterId = null)
    {
        var next = await NextActiveTicketAsync(branchId);
        if (next != null)
        {
            next.Status = TicketStatus.Near;
            next.CalledAt = DateTime.UtcNow;
            if (counterId != null) next.CounterId = counterId;
            await db.SaveChangesAsync();

            await NotifyYourTurnSoonAsync(branchId, next.TicketNumber);
        }
        return await BroadcastQueueStateAsync(branchId);
    }

    // ── Walk-in ───────────────────────────────────────────────────────────────

    public async Task<TicketResponse> AddWalkInAsync(AddWalkInRequest req)
    {
        return await JoinQueueAsync(new JoinQueueRequest(
            req.BranchId, req.ServiceType, req.CustomerName ?? "Walk-in", req.Phone, req.Priority));
    }

    // ── No-show ───────────────────────────────────────────────────────────────

    public async Task NoShowAsync(int ticketId, string? counterId = null)
    {
        var ticket = await db.QueueTickets.FindAsync(ticketId)
            ?? throw new KeyNotFoundException($"Ticket {ticketId} not found.");

        ticket.Status = TicketStatus.NoShow;
        ticket.AbandonedAt = DateTime.UtcNow;
        if (counterId != null) ticket.CounterId = counterId;
        await db.SaveChangesAsync();

        // Call the next ticket automatically after a no-show
        var next = await NextActiveTicketAsync(ticket.BranchId);
        if (next != null)
        {
            next.Status = TicketStatus.Near;
            next.CalledAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await NotifyYourTurnSoonAsync(ticket.BranchId, next.TicketNumber);
        }

        await BroadcastQueueStateAsync(ticket.BranchId);
    }

    // ── Transfer ──────────────────────────────────────────────────────────────

    public async Task<TicketResponse> TransferAsync(int ticketId, string newServiceType)
    {
        var ticket = await GetActiveTicketAsync(ticketId);
        var (groupId, prefix) = await ResolveGroupAsync(ticket.BranchId, newServiceType);
        ticket.ServiceType = newServiceType;
        ticket.ServiceGroupId = groupId;
        // Move to end of queue so fair ordering is maintained
        ticket.TicketNumber = await NextTicketNumberAsync(ticket.BranchId, groupId);
        ticket.DisplayNumber = prefix != null ? $"{prefix}-{ticket.TicketNumber}" : ticket.TicketNumber.ToString();
        ticket.QueueDate = DateOnly.FromDateTime(DateTime.UtcNow);
        ticket.Status = TicketStatus.Waiting;
        await db.SaveChangesAsync();

        await BroadcastQueueStateAsync(ticket.BranchId);

        var peopleAhead = await PeopleAheadAsync(ticket.BranchId, ticket.TicketNumber, ticket.Priority);
        var estimate = await estimator.EstimateAsync(ticket.BranchId, ticket.ServiceType, peopleAhead);
        return MapTicket(ticket, peopleAhead, estimate);
    }

    // ── Queue open/close toggle ───────────────────────────────────────────────

    public async Task<bool> ToggleOpenAsync(string branchId)
    {
        var branch = await db.Branches.FindAsync(branchId)
            ?? throw new KeyNotFoundException($"Branch '{branchId}' not found.");
        branch.IsOpen = !branch.IsOpen;
        await db.SaveChangesAsync();

        await hub.Clients.Group(QueueHub.BranchGroup(branchId))
            .SendAsync("BranchStatusChanged", new { branchId, isOpen = branch.IsOpen });

        return branch.IsOpen;
    }

    // ── Ticket actions ────────────────────────────────────────────────────────

    public async Task SkipAsync(int ticketId)
    {
        var ticket = await GetActiveTicketAsync(ticketId);
        ticket.SkipCount++;

        if (ticket.SkipCount >= MaxSkipsBeforeRemoval)
        {
            ticket.Status = TicketStatus.Cancelled;
            ticket.AbandonedAt = DateTime.UtcNow;
        }
        else
        {
            ticket.TicketNumber = await NextTicketNumberAsync(ticket.BranchId, ticket.ServiceGroupId);
            ticket.DisplayNumber = ticket.ServiceGroupId.HasValue
                ? await FormatDisplayNumberAsync(ticket.BranchId, ticket.ServiceGroupId.Value, ticket.TicketNumber)
                : ticket.TicketNumber.ToString();
            ticket.QueueDate = DateOnly.FromDateTime(DateTime.UtcNow);
            ticket.Status = TicketStatus.Waiting;
        }

        await db.SaveChangesAsync();
        await BroadcastQueueStateAsync(ticket.BranchId);
    }

    public async Task LeaveQueueAsync(int ticketId, string? viewToken = null)
    {
        var ticket = await GetActiveTicketAsync(ticketId);
        if (ticket.ViewToken != null && ticket.ViewToken != viewToken)
            throw new UnauthorizedAccessException("Invalid view token.");

        // Track abandonment position
        ticket.AbandonPosition = await PeopleAheadAsync(ticket.BranchId, ticket.TicketNumber, ticket.Priority);
        ticket.AbandonedAt = DateTime.UtcNow;
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

        var ticket = await db.QueueTickets
            .Where(t => t.BranchId == branchId && t.TicketNumber == lastTicketNumber && t.Status == TicketStatus.Served)
            .FirstOrDefaultAsync();

        if (ticket == null)
            return new UndoResponse(false, "Cannot restore — ticket no longer undoable.");

        ticket.Status = TicketStatus.Waiting;
        ticket.ServedAt = null;

        var txn = await db.QueueTransactions
            .Where(t => t.BranchId == branchId && t.TicketNumber == lastTicketNumber)
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefaultAsync();

        if (txn != null)
            db.QueueTransactions.Remove(txn);

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
        var branch = await db.Branches.FindAsync(branchId);

        var activeTickets = await db.QueueTickets
            .Where(t => t.BranchId == branchId && TicketStatus.Active.Contains(t.Status))
            .OrderByDescending(t => t.Priority)
            .ThenBy(t => t.TicketNumber)
            .ToListAsync();

        var servedToday = await db.QueueTickets
            .CountAsync(t => t.BranchId == branchId
                          && t.Status == TicketStatus.Served
                          && t.ServedAt >= DateTime.UtcNow.Date);

        var current = activeTickets.FirstOrDefault(t => t.Status == TicketStatus.Near || t.Status == TicketStatus.Arrived);
        var waiting = activeTickets.Count(t => t.Status == TicketStatus.Waiting);

        WaitEstimateDto? estimate = null;
        if (current != null)
            estimate = await estimator.EstimateAsync(branchId, current.ServiceType, waiting);

        // Next 3 in waiting (for display board)
        var nextWaiting = activeTickets
            .Where(t => t.Status == TicketStatus.Waiting)
            .Take(3)
            .ToList();

        var nextTickets = nextWaiting.Select(t => t.TicketNumber).ToList();
        var nextDisplayNumbers = nextWaiting
            .Select(t => t.DisplayNumber ?? t.TicketNumber.ToString())
            .ToList();

        return new QueueStatusResponse(
            branchId,
            current?.TicketNumber,
            current?.ServiceType,
            activeTickets.Count,
            servedToday,
            waiting,
            estimate,
            IsOpen: branch?.IsOpen ?? true,
            NextTicketNumbers: nextTickets,
            CounterId: current?.CounterId,
            CurrentTicketId: current?.Id,
            CurrentDisplayNumber: current?.DisplayNumber ?? current?.TicketNumber.ToString(),
            NextDisplayNumbers: nextDisplayNumbers
        );
    }

    public async Task<TicketResponse> GetTicketAsync(int ticketId)
    {
        var ticket = await db.QueueTickets.FindAsync(ticketId)
            ?? throw new KeyNotFoundException($"Ticket {ticketId} not found.");

        var peopleAhead = TicketStatus.Active.Contains(ticket.Status)
            ? await PeopleAheadAsync(ticket.BranchId, ticket.TicketNumber, ticket.Priority)
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

    public async Task RateTicketAsync(int ticketId, int rating)
    {
        var ticket = await db.QueueTickets.FindAsync(ticketId);
        if (ticket == null) return;
        ticket.Rating = Math.Clamp(rating, 1, 3);
        await db.SaveChangesAsync();
    }

    public async Task<string?> LookupCustomerNameAsync(string phone)
    {
        return await db.QueueTickets
            .Where(t => t.Phone == phone)
            .OrderByDescending(t => t.JoinedAt)
            .Select(t => t.CustomerName)
            .FirstOrDefaultAsync();
    }

    public async Task NotifyTicketViewedAsync(int ticketId, string? viewToken = null)
    {
        var ticket = await db.QueueTickets.FindAsync(ticketId);
        if (ticket?.ViewToken != null && ticket.ViewToken != viewToken) return;

        var cache = redis.GetDatabase();
        var key = $"ticket_viewed:{ticketId}";
        if (!await cache.StringSetAsync(key, 1, TimeSpan.FromSeconds(10), when: When.NotExists))
            return;
        await hub.Clients.Group(QueueHub.TicketGroup(ticketId))
            .SendAsync("TicketScanned", ticketId);
    }

    // ── "Your turn soon" SMS helper ───────────────────────────────────────────

    private async Task NotifyYourTurnSoonAsync(string branchId, int currentTicketNumber)
    {
        // Find the 2nd person in the queue
        var second = await db.QueueTickets
            .Where(t => t.BranchId == branchId && t.Status == TicketStatus.Waiting)
            .OrderByDescending(t => t.Priority)
            .ThenBy(t => t.TicketNumber)
            .Skip(1)
            .FirstOrDefaultAsync();

        if (second?.Phone == null) return;

        // Deduplicate SMS via Redis
        var cache = redis.GetDatabase();
        var key = $"sms_soon:{second.Id}";
        if (!await cache.StringSetAsync(key, 1, TimeSpan.FromMinutes(10), when: When.NotExists))
            return;

        var msg = $"QueueFree: You're next! Ticket #{second.TicketNumber} ({second.ServiceType}). Please be ready.";
        await sms.SendAsync(second.Phone, msg);
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

    private async Task<int> NextTicketNumberAsync(string branchId, int? serviceGroupId)
    {
        var cache = redis.GetDatabase();
        var date = DateTime.UtcNow.ToString("yyyyMMdd");
        var key = serviceGroupId.HasValue
            ? $"ticket_seq:{branchId}:g{serviceGroupId.Value}:{date}"
            : $"ticket_seq:{branchId}:{date}";

        if (!await cache.KeyExistsAsync(key))
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            int todayMax;
            if (serviceGroupId.HasValue)
            {
                todayMax = await db.QueueTickets
                    .Where(t => t.BranchId == branchId && t.ServiceGroupId == serviceGroupId && t.QueueDate == today)
                    .MaxAsync(t => (int?)t.TicketNumber) ?? 0;
            }
            else
            {
                todayMax = await db.QueueTickets
                    .Where(t => t.BranchId == branchId && t.ServiceGroupId == null && t.QueueDate == today)
                    .MaxAsync(t => (int?)t.TicketNumber) ?? 0;
            }
            await cache.StringSetAsync(key, todayMax, when: When.NotExists);
            await cache.KeyExpireAsync(key, TimeSpan.FromDays(2));
        }

        return (int)await cache.StringIncrementAsync(key);
    }

    private async Task<(int? groupId, string? prefix)> ResolveGroupAsync(string branchId, string serviceType)
    {
        var svc = await db.BranchServices
            .Include(s => s.ServiceGroup)
            .FirstOrDefaultAsync(s => s.BranchId == branchId && s.Name == serviceType);
        return (svc?.ServiceGroupId, svc?.ServiceGroup?.Prefix);
    }

    private async Task<string> FormatDisplayNumberAsync(string branchId, int groupId, int ticketNumber)
    {
        var group = await db.ServiceGroups.FindAsync(groupId);
        return group?.Prefix != null ? $"{group.Prefix}-{ticketNumber}" : ticketNumber.ToString();
    }

    private async Task<int> ActiveCountAsync(string branchId) =>
        await db.QueueTickets.CountAsync(t => t.BranchId == branchId && TicketStatus.Active.Contains(t.Status));

    private async Task<int> PeopleAheadAsync(string branchId, int ticketNumber, bool isPriority)
    {
        if (isPriority)
        {
            // Priority tickets only have other priority tickets ahead
            return await db.QueueTickets.CountAsync(t =>
                t.BranchId == branchId &&
                t.Priority &&
                t.TicketNumber < ticketNumber &&
                TicketStatus.Active.Contains(t.Status));
        }
        // Regular tickets: all priority tickets + regular tickets with lower number
        var priorityCount = await db.QueueTickets.CountAsync(t =>
            t.BranchId == branchId && t.Priority && TicketStatus.Active.Contains(t.Status));
        var regularAhead = await db.QueueTickets.CountAsync(t =>
            t.BranchId == branchId &&
            !t.Priority &&
            t.TicketNumber < ticketNumber &&
            TicketStatus.Active.Contains(t.Status));
        return priorityCount + regularAhead;
    }

    private async Task<QueueTicket?> NextActiveTicketAsync(string branchId) =>
        await db.QueueTickets
            .Where(t => t.BranchId == branchId && t.Status == TicketStatus.Waiting)
            .OrderByDescending(t => t.Priority)
            .ThenBy(t => t.TicketNumber)
            .FirstOrDefaultAsync();

    private static TicketResponse MapTicket(QueueTicket t, int peopleAhead, WaitEstimateDto? estimate) =>
        new(t.Id, t.BranchId, t.TicketNumber, t.DisplayNumber ?? t.TicketNumber.ToString(), t.ServiceType, t.CustomerName, t.Status, peopleAhead, t.JoinedAt, estimate, t.ViewToken, t.Priority, t.CounterId);

    private async Task<QueueStatusResponse> BroadcastQueueStateAsync(string branchId)
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

        return status;
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
