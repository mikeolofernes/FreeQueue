using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/analytics")]
[Authorize]
public class AnalyticsController(AppDbContext db) : ControllerBase
{
    [HttpGet("{branchId}")]
    public async Task<ActionResult<AnalyticsResponse>> GetAnalytics(string branchId, [FromQuery] int days = 7)
    {
        var tokenBranch = User.FindFirst("branch_id")?.Value;
        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
        if (role != "admin" && tokenBranch != branchId) return Forbid();

        var since = DateTime.UtcNow.Date.AddDays(-days + 1);

        var transactions = await db.QueueTransactions
            .Where(t => t.BranchId == branchId && t.ServedAt >= since)
            .ToListAsync();

        var todayStart = DateTime.UtcNow.Date;
        var todayTickets = await db.QueueTickets
            .Where(t => t.BranchId == branchId && t.JoinedAt >= todayStart)
            .ToListAsync();

        var waiting = todayTickets.Count(t => t.Status == "waiting" || t.Status == "near" || t.Status == "arrived");
        var servedToday = todayTickets.Count(t => t.Status == "served");

        var avgWait = transactions.Any()
            ? transactions.Average(t => t.DurationSecs) / 60.0
            : 0;

        var hourly = transactions
            .GroupBy(t => t.HourOfDay)
            .OrderBy(g => g.Key)
            .Select(g => new HourlyStats(g.Key, g.Count(), g.Average(t => t.DurationSecs)))
            .ToList();

        var services = transactions
            .GroupBy(t => t.ServiceType)
            .Select(g => new ServiceStats(g.Key, g.Count(), g.Average(t => t.DurationSecs)))
            .OrderByDescending(s => s.Count)
            .ToList();

        // CSAT: average rating from tickets that have a rating
        var ratedTickets = await db.QueueTickets
            .Where(t => t.BranchId == branchId && t.Rating != null && t.JoinedAt >= since)
            .Select(t => (double)t.Rating!)
            .ToListAsync();

        var csat = ratedTickets.Any() ? ratedTickets.Average() : 0;

        return Ok(new AnalyticsResponse(branchId, servedToday, waiting, avgWait, hourly, services, csat));
    }
}
