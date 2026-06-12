using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/branches")]
public class BranchesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<BranchResponse>> GetAll() =>
        await db.Branches.Select(b => Map(b)).ToListAsync();

    [HttpGet("{id}")]
    public async Task<ActionResult<BranchResponse>> Get(string id)
    {
        var branch = await db.Branches.FindAsync(id);
        return branch == null ? NotFound() : Map(branch);
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<BranchResponse>> Create(CreateBranchRequest req)
    {
        if (await db.Branches.AnyAsync(b => b.Id == req.Id))
            return Conflict($"Branch '{req.Id}' already exists.");

        var branch = new Branch
        {
            Id = req.Id,
            Name = req.Name,
            Category = req.Category,
            Address = req.Address,
            City = req.City,
            MaxCapacity = req.MaxCapacity,
            GraceMinutes = req.GraceMinutes,
            OpensAt = req.OpensAt != null ? TimeOnly.Parse(req.OpensAt) : null,
            ClosesAt = req.ClosesAt != null ? TimeOnly.Parse(req.ClosesAt) : null,
        };

        db.Branches.Add(branch);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = branch.Id }, Map(branch));
    }

    [Authorize]
    [HttpPut("{id}")]
    public async Task<ActionResult<BranchResponse>> Update(string id, CreateBranchRequest req)
    {
        var branch = await db.Branches.FindAsync(id);
        if (branch == null) return NotFound();

        branch.Name = req.Name;
        branch.Category = req.Category;
        branch.Address = req.Address;
        branch.City = req.City;
        branch.MaxCapacity = req.MaxCapacity;
        branch.GraceMinutes = req.GraceMinutes;
        branch.OpensAt = req.OpensAt != null ? TimeOnly.Parse(req.OpensAt) : null;
        branch.ClosesAt = req.ClosesAt != null ? TimeOnly.Parse(req.ClosesAt) : null;

        await db.SaveChangesAsync();
        return Map(branch);
    }

    [HttpPost("{id}/kiosk-verify")]
    public async Task<IActionResult> VerifyKioskPin(string id, [FromBody] VerifyKioskPinRequest req)
    {
        var branch = await db.Branches.FindAsync(id);
        if (branch == null) return NotFound();
        if (branch.KioskPin == null || branch.KioskPin == req.Pin.Trim())
            return Ok(new { valid = true });
        return Unauthorized(new { valid = false });
    }

    [Authorize]
    [HttpPut("{id}/kiosk-pin")]
    public async Task<IActionResult> SetKioskPin(string id, [FromBody] SetKioskPinRequest req)
    {
        var branch = await db.Branches.FindAsync(id);
        if (branch == null) return NotFound();

        branch.KioskPin = string.IsNullOrWhiteSpace(req.Pin) ? null : req.Pin.Trim();
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static BranchResponse Map(Branch b) => new(
        b.Id, b.Name, b.Category, b.Address, b.City, b.MaxCapacity, b.GraceMinutes,
        b.OpensAt?.ToString("HH:mm"), b.ClosesAt?.ToString("HH:mm"),
        HasKioskPin: b.KioskPin != null);
}
