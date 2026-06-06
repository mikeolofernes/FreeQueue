using FreeQueue.Api.DTOs;
using FreeQueue.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/queue")]
public class QueueController(QueueService queue) : ControllerBase
{
    // ── Customer endpoints ────────────────────────────────────────────────────

    /// <summary>Customer joins the queue (via QR scan or branch search).</summary>
    [HttpPost("join")]
    public async Task<ActionResult<TicketResponse>> Join(JoinQueueRequest req)
    {
        try { return Ok(await queue.JoinQueueAsync(req)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    /// <summary>Get live ticket status and position.</summary>
    [HttpGet("ticket/{ticketId:int}")]
    public async Task<ActionResult<TicketResponse>> GetTicket(int ticketId)
    {
        try { return Ok(await queue.GetTicketAsync(ticketId)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }

    /// <summary>Customer taps "I'm stepping out".</summary>
    [HttpPost("ticket/{ticketId:int}/stepaway")]
    public async Task<IActionResult> StepAway(int ticketId)
    {
        try { await queue.StepAwayAsync(ticketId); return Ok(); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    /// <summary>Customer confirms arrival back at the branch.</summary>
    [HttpPost("ticket/{ticketId:int}/checkin")]
    public async Task<IActionResult> CheckIn(int ticketId)
    {
        try { await queue.CheckInAsync(ticketId); return Ok(); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    /// <summary>Customer voluntarily defers their turn.</summary>
    [HttpPost("ticket/{ticketId:int}/skip")]
    public async Task<IActionResult> Skip(int ticketId)
    {
        try { await queue.SkipAsync(ticketId); return Ok(); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    /// <summary>Customer cancels their spot.</summary>
    [HttpPost("ticket/{ticketId:int}/leave")]
    public async Task<IActionResult> Leave(int ticketId)
    {
        try { await queue.LeaveQueueAsync(ticketId); return Ok(); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    // ── Branch status ─────────────────────────────────────────────────────────

    /// <summary>Live queue status for a branch (Staff Tap dashboard + customer lobby).</summary>
    [HttpGet("{branchId}/status")]
    public async Task<ActionResult<QueueStatusResponse>> GetStatus(string branchId)
    {
        try { return Ok(await queue.GetQueueStatusAsync(branchId)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }

    // ── Staff endpoints ───────────────────────────────────────────────────────

    /// <summary>Staff taps "Done — Call Next". Logs duration and advances the queue.</summary>
    [HttpPost("advance")]
    public async Task<ActionResult<QueueStatusResponse>> Advance(AdvanceQueueRequest req)
    {
        try { return Ok(await queue.AdvanceQueueAsync(req)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    /// <summary>Staff adds a walk-in customer.</summary>
    [HttpPost("walkin")]
    public async Task<ActionResult<TicketResponse>> AddWalkIn(AddWalkInRequest req)
    {
        try { return Ok(await queue.AddWalkInAsync(req)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    /// <summary>Staff undoes the last advance action (up to 5 levels).</summary>
    [HttpPost("{branchId}/undo")]
    public async Task<ActionResult<UndoResponse>> Undo(string branchId) =>
        Ok(await queue.UndoAsync(branchId));

    /// <summary>Staff broadcasts a message to all customers in the queue.</summary>
    [HttpPost("{branchId}/broadcast")]
    public async Task<IActionResult> Broadcast(string branchId, [FromBody] BroadcastRequest req)
    {
        await queue.BroadcastMessageAsync(branchId, req.Message);
        return Ok();
    }
}
