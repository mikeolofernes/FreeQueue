using FreeQueue.Api.DTOs;
using FreeQueue.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/queue")]
public class QueueController(QueueService queue, IConfiguration config) : ControllerBase
{
    // ── Customer endpoints (public) ───────────────────────────────────────────

    [HttpPost("join")]
    public async Task<ActionResult<TicketResponse>> Join(QrJoinRequest req)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (now > req.QrExp)
            return BadRequest("QR code has expired. Ask staff to refresh.");
        if (!QrSigner.Verify(req.BranchId, req.QrExp, req.QrSig, config["Jwt:Secret"]!))
            return BadRequest("Invalid QR code.");
        try
        {
            return Ok(await queue.JoinQueueAsync(
                new JoinQueueRequest(req.BranchId, req.ServiceType, req.CustomerName, req.Phone)));
        }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [HttpGet("{branchId}/qr-token")]
    [Authorize]
    public IActionResult GetQrToken(string branchId)
    {
        var exp = DateTimeOffset.UtcNow.AddMinutes(2).ToUnixTimeSeconds();
        var sig = QrSigner.Sign(branchId, exp, config["Jwt:Secret"]!);
        return Ok(new { exp, sig });
    }

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

    [HttpPost("ticket/{ticketId:int}/stepaway")]
    public async Task<IActionResult> StepAway(int ticketId)
    {
        try { await queue.StepAwayAsync(ticketId); return Ok(); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
    }

    [HttpPost("ticket/{ticketId:int}/checkin")]
    public async Task<IActionResult> CheckIn(int ticketId)
    {
        try { await queue.CheckInAsync(ticketId); return Ok(); }
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
