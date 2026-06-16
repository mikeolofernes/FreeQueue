using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/branches/{branchId}/groups")]
public class ServiceGroupsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ServiceGroupResponse>>> GetGroups(string branchId)
    {
        if (!await db.Branches.AnyAsync(b => b.Id == branchId)) return NotFound();

        var groups = await db.ServiceGroups
            .Where(g => g.BranchId == branchId)
            .OrderBy(g => g.SortOrder).ThenBy(g => g.Id)
            .Include(g => g.Services)
            .ToListAsync();

        return Ok(groups.Select(MapGroup));
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<ServiceGroupResponse>> CreateGroup(string branchId, [FromBody] CreateServiceGroupRequest req)
    {
        if (CheckBranch(branchId) is { } denied) return denied;
        if (!await db.Branches.AnyAsync(b => b.Id == branchId)) return NotFound();

        var maxOrder = await db.ServiceGroups
            .Where(g => g.BranchId == branchId)
            .MaxAsync(g => (int?)g.SortOrder) ?? -1;

        var group = new ServiceGroup
        {
            BranchId = branchId,
            Name = req.Name.Trim(),
            Prefix = req.Prefix?.Trim().ToUpperInvariant(),
            SortOrder = maxOrder + 1,
        };

        db.ServiceGroups.Add(group);
        await db.SaveChangesAsync();

        return Ok(MapGroup(group));
    }

    [Authorize]
    [HttpPut("{groupId:int}")]
    public async Task<ActionResult<ServiceGroupResponse>> UpdateGroup(string branchId, int groupId, [FromBody] UpdateServiceGroupRequest req)
    {
        if (CheckBranch(branchId) is { } denied) return denied;
        var group = await db.ServiceGroups
            .Include(g => g.Services)
            .FirstOrDefaultAsync(g => g.Id == groupId && g.BranchId == branchId);
        if (group == null) return NotFound();

        group.Name = req.Name.Trim();
        group.Prefix = req.Prefix?.Trim().ToUpperInvariant();
        await db.SaveChangesAsync();

        return Ok(MapGroup(group));
    }

    [Authorize]
    [HttpDelete("{groupId:int}")]
    public async Task<IActionResult> DeleteGroup(string branchId, int groupId)
    {
        if (CheckBranch(branchId) is { } denied) return denied;
        var group = await db.ServiceGroups.FirstOrDefaultAsync(g => g.Id == groupId && g.BranchId == branchId);
        if (group == null) return NotFound();

        db.ServiceGroups.Remove(group);
        await db.SaveChangesAsync();

        return NoContent();
    }

    [Authorize]
    [HttpPut("{groupId:int}/services/{serviceId:int}")]
    public async Task<IActionResult> AssignService(string branchId, int groupId, int serviceId)
    {
        if (CheckBranch(branchId) is { } denied) return denied;

        if (!await db.ServiceGroups.AnyAsync(g => g.Id == groupId && g.BranchId == branchId))
            return NotFound("Group not found.");

        var svc = await db.BranchServices.FirstOrDefaultAsync(s => s.Id == serviceId && s.BranchId == branchId);
        if (svc == null) return NotFound("Service not found.");

        svc.ServiceGroupId = groupId;
        await db.SaveChangesAsync();

        return NoContent();
    }

    [Authorize]
    [HttpDelete("{groupId:int}/services/{serviceId:int}")]
    public async Task<IActionResult> RemoveService(string branchId, int groupId, int serviceId)
    {
        if (CheckBranch(branchId) is { } denied) return denied;

        var svc = await db.BranchServices.FirstOrDefaultAsync(s => s.Id == serviceId && s.BranchId == branchId && s.ServiceGroupId == groupId);
        if (svc == null) return NotFound();

        svc.ServiceGroupId = null;
        await db.SaveChangesAsync();

        return NoContent();
    }

    private static ServiceGroupResponse MapGroup(ServiceGroup g) => new(
        g.Id,
        g.Name,
        g.Prefix,
        g.SortOrder,
        g.Services
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Id)
            .Select(s => new BranchServiceResponse(s.Id, s.Name, s.SortOrder, g.Id, g.Name))
            .ToList()
    );

    private ActionResult? CheckBranch(string branchId)
    {
        var tokenBranch = User.FindFirst("branch_id")?.Value;
        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
        if (role == "admin" || tokenBranch == branchId) return null;
        return Forbid();
    }
}
