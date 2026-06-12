using FreeQueue.Api.DTOs;
using FreeQueue.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/queue")]
public class QueueController(QueueService queue) : ControllerBase
{
    // ── Customer endpoints (public) ───────────────────────────────────────────

    [EnableRateLimiting("kiosk")]
    [HttpPost("{branchId}/kiosk-join")]
    public async Task<ActionResult<TicketResponse>> KioskJoin(string branchId, [FromBody] KioskJoinRequest req)
    {
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
    public async Task<IActionResult> TicketViewed(int ticketId)
    {
        await queue.NotifyTicketViewedAsync(ticketId);
        return Ok();
    }

    [HttpPost("ticket/{ticketId:int}/leave")]
    public async Task<IActionResult> Leave(int ticketId)
    {
        try { await queue.LeaveQueueAsync(ticketId); return Ok(); }
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
    public async Task<ActionResult<QueueStatusResponse>> CallNext(string branchId)
    {
        try { return Ok(await queue.CallNextAsync(branchId)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }

    [Authorize]
    [HttpPost("advance")]
    public async Task<ActionResult<QueueStatusResponse>> Advance(AdvanceQueueRequest req)
    {
        try { return Ok(await queue.AdvanceQueueAsync(req)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [Authorize]
    [HttpPost("walkin")]
    public async Task<ActionResult<TicketResponse>> AddWalkIn(AddWalkInRequest req)
    {
        try { return Ok(await queue.AddWalkInAsync(req)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [Authorize]
    [HttpPost("{branchId}/undo")]
    public async Task<ActionResult<UndoResponse>> Undo(string branchId) =>
        Ok(await queue.UndoAsync(branchId));

    [Authorize]
    [HttpPost("{branchId}/broadcast")]
    public async Task<IActionResult> Broadcast(string branchId, [FromBody] BroadcastRequest req)
    {
        await queue.BroadcastMessageAsync(branchId, req.Message);
        return Ok();
    }
}
