using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/appointments")]
public class AppointmentsController(AppDbContext db) : ControllerBase
{
    // Public: book an appointment
    [HttpPost("{branchId}")]
    public async Task<ActionResult<AppointmentResponse>> Book(string branchId, [FromBody] CreateAppointmentRequest req)
    {
        if (!await db.Branches.AnyAsync(b => b.Id == branchId))
            return NotFound("Branch not found.");

        if (req.ScheduledAt <= DateTime.UtcNow)
            return BadRequest("Scheduled time must be in the future.");

        var appt = new Appointment
        {
            BranchId = branchId,
            ServiceType = req.ServiceType,
            CustomerName = req.CustomerName,
            Phone = req.Phone,
            ScheduledAt = req.ScheduledAt,
            Notes = req.Notes,
        };

        db.Appointments.Add(appt);
        await db.SaveChangesAsync();

        return Ok(Map(appt));
    }

    // Public: get upcoming appointments for a branch (for display)
    [HttpGet("{branchId}")]
    public async Task<ActionResult<IEnumerable<AppointmentResponse>>> GetUpcoming(string branchId, [FromQuery] int days = 7)
    {
        var from = DateTime.UtcNow;
        var to = from.AddDays(days);

        var appts = await db.Appointments
            .Where(a => a.BranchId == branchId && a.ScheduledAt >= from && a.ScheduledAt <= to && a.Status != "cancelled")
            .OrderBy(a => a.ScheduledAt)
            .ToListAsync();

        return Ok(appts.Select(Map));
    }

    // Staff: update appointment status
    [Authorize]
    [HttpPut("{branchId}/{id:int}/status")]
    public async Task<ActionResult<AppointmentResponse>> UpdateStatus(string branchId, int id, [FromBody] UpdateAppointmentStatusRequest req)
    {
        var tokenBranch = User.FindFirst("branch_id")?.Value;
        if (tokenBranch != branchId) return Forbid();

        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == id && a.BranchId == branchId);
        if (appt == null) return NotFound();

        appt.Status = req.Status;
        await db.SaveChangesAsync();
        return Ok(Map(appt));
    }

    // Staff: cancel appointment
    [Authorize]
    [HttpDelete("{branchId}/{id:int}")]
    public async Task<IActionResult> Cancel(string branchId, int id)
    {
        var tokenBranch = User.FindFirst("branch_id")?.Value;
        if (tokenBranch != branchId) return Forbid();

        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == id && a.BranchId == branchId);
        if (appt == null) return NotFound();

        appt.Status = "cancelled";
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static AppointmentResponse Map(Appointment a) => new(
        a.Id, a.BranchId, a.ServiceType, a.CustomerName, a.Phone,
        a.ScheduledAt, a.Status, a.Notes, a.CreatedAt);
}
