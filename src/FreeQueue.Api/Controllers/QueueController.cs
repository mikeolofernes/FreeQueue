using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/queue")]
public class QueueController(QueueService queue, AppDbContext db) : ControllerBase
{
    // ── Customer endpoints (public) ───────────────────────────────────────────

    [EnableRateLimiting("kiosk")]
    [HttpPost("{branchId}/kiosk-join")]
    public async Task<ActionResult<TicketResponse>> KioskJoin(string branchId, [FromBody] KioskJoinRequest req)
    {
        var branch = await db.Branches.FindAsync(branchId);
        if (branch == null) return NotFound("Branch not found.");
        if (!branch.IsOpen) return BadRequest("Queue is currently closed.");
        if (branch.KioskPin != null && branch.KioskPin != req.KioskPin?.Trim())
            return Unauthorized("Invalid kiosk PIN.");

        try
        {
            return Ok(await queue.JoinQueueAsync(
                new JoinQueueRequest(branchId, req.ServiceType, req.CustomerName, req.Phone)));
        }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [HttpGet("ticket/{ticketId:int}")]
    public async Task<ActionResult<TicketResponse>> GetTicket(int ticketId)
    {
        try { return Ok(await queue.GetTicketAsync(ticketId)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }

    [HttpPost("ticket/{ticketId:int}/rate")]
    public async Task<IActionResult> RateTicket(int ticketId, [FromBody] RateTicketRequest req)
    {
        await queue.RateTicketAsync(ticketId, req.Rating);
        return Ok();
    }

    [HttpGet("customer/lookup")]
    public async Task<ActionResult<object>> LookupCustomer([FromQuery] string phone)
    {
        var name = await queue.LookupCustomerNameAsync(phone);
        return Ok(new { name });
    }

    [HttpPost("ticket/{ticketId:int}/viewed")]
    public async Task<IActionResult> TicketViewed(int ticketId, [FromQuery] string? vt)
    {
        await queue.NotifyTicketViewedAsync(ticketId, vt);
        return Ok();
    }

    [HttpPost("ticket/{ticketId:int}/leave")]
    public async Task<IActionResult> Leave(int ticketId, [FromQuery] string? vt)
    {
        try { await queue.LeaveQueueAsync(ticketId, vt); return Ok(); }
        catch (UnauthorizedAccessException ex) { return Unauthorized(ex.Message); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [HttpPost("ticket/{ticketId:int}/skip")]
    public async Task<IActionResult> Skip(int ticketId)
    {
        try { await queue.SkipAsync(ticketId); return Ok(); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [HttpGet("{branchId}/status")]
    public async Task<ActionResult<QueueStatusResponse>> GetStatus(string branchId)
    {
        try { return Ok(await queue.GetQueueStatusAsync(branchId)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }

    // ── Staff endpoints (JWT required) ────────────────────────────────────────

    [Authorize]
    [HttpPost("{branchId}/callnext")]
    public async Task<ActionResult<QueueStatusResponse>> CallNext(string branchId, [FromQuery] string? counterId = null)
    {
        if (CheckBranch(branchId) is { } denied) return denied;
        try { return Ok(await queue.CallNextAsync(branchId, counterId)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }

    [Authorize]
    [HttpPost("advance")]
    public async Task<ActionResult<QueueStatusResponse>> Advance(AdvanceQueueRequest req)
    {
        if (CheckBranch(req.BranchId) is { } denied) return denied;
        try { return Ok(await queue.AdvanceQueueAsync(req)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [Authorize]
    [HttpPost("walkin")]
    public async Task<ActionResult<TicketResponse>> AddWalkIn(AddWalkInRequest req)
    {
        if (CheckBranch(req.BranchId) is { } denied) return denied;
        try { return Ok(await queue.AddWalkInAsync(req)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [Authorize]
    [HttpPost("{branchId}/undo")]
    public async Task<ActionResult<UndoResponse>> Undo(string branchId)
    {
        if (CheckBranch(branchId) is { } denied) return denied;
        return Ok(await queue.UndoAsync(branchId));
    }

    [Authorize]
    [HttpPost("{branchId}/broadcast")]
    public async Task<IActionResult> Broadcast(string branchId, [FromBody] BroadcastRequest req)
    {
        if (CheckBranch(branchId) is { } denied) return denied;
        await queue.BroadcastMessageAsync(branchId, req.Message);
        return Ok();
    }

    [Authorize]
    [HttpPost("ticket/{ticketId:int}/no-show")]
    public async Task<IActionResult> NoShow(int ticketId, [FromQuery] string? counterId = null)
    {
        try { await queue.NoShowAsync(ticketId, counterId); return Ok(); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }

    [Authorize]
    [HttpPut("ticket/{ticketId:int}/transfer")]
    public async Task<ActionResult<TicketResponse>> Transfer(int ticketId, [FromBody] TransferTicketRequest req)
    {
        try { return Ok(await queue.TransferAsync(ticketId, req.NewServiceType)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    private ActionResult? CheckBranch(string branchId)
    {
        var tokenBranch = User.FindFirstValue("branch_id");
        return tokenBranch == branchId ? null : Forbid();
    }
}
