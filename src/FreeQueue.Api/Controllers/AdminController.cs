using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminController(AppDbContext db) : ControllerBase
{
    // Public: check if any admin account exists
    [HttpGet("needs-setup")]
    public async Task<ActionResult<object>> NeedsSetup()
    {
        var hasAdmin = await db.StaffAccounts.AnyAsync(a => a.Role == "admin");
        return Ok(new { needsSetup = !hasAdmin });
    }

    // Public (runs once): create first branch + admin account
    [HttpPost("setup")]
    public async Task<IActionResult> Setup(AdminSetupRequest req)
    {
        if (await db.StaffAccounts.AnyAsync(a => a.Role == "admin"))
            return Conflict("Admin already set up.");

        // Create branch if it doesn't exist
        if (!await db.Branches.AnyAsync(b => b.Id == req.BranchId))
        {
            db.Branches.Add(new Branch { Id = req.BranchId, Name = req.BranchName });
            await db.SaveChangesAsync();
        }

        var hash = BCrypt.Net.BCrypt.HashPassword(req.Password);
        db.StaffAccounts.Add(new StaffAccount
        {
            BranchId = req.BranchId,
            Username = req.Username,
            PasswordHash = hash,
            Role = "admin",
        });
        await db.SaveChangesAsync();

        return Ok(new { message = "Admin account created." });
    }

    // ── All below require admin role ──────────────────────────────────────────

    [Authorize(Roles = "admin")]
    [HttpGet("overview")]
    public async Task<ActionResult<IEnumerable<AdminBranchResponse>>> GetOverview()
    {
        var branches = await db.Branches
            .Include(b => b.Services)
            .ToListAsync();

        var accounts = await db.StaffAccounts.ToListAsync();

        return Ok(branches.Select(b => new AdminBranchResponse(
            b.Id,
            b.Name,
            b.Category,
            accounts
                .Where(a => a.BranchId == b.Id)
                .Select(a => new AdminAccountResponse(a.Id, a.Username, a.Role, a.CreatedAt))
        )));
    }

    [Authorize(Roles = "admin")]
    [HttpPost("branches")]
    public async Task<ActionResult<AdminBranchResponse>> CreateBranch(AdminCreateBranchRequest req)
    {
        if (await db.Branches.AnyAsync(b => b.Id == req.Id))
            return Conflict($"Branch '{req.Id}' already exists.");

        var branch = new Branch { Id = req.Id, Name = req.Name };
        db.Branches.Add(branch);
        await db.SaveChangesAsync();

        return Ok(new AdminBranchResponse(branch.Id, branch.Name, branch.Category, []));
    }

    [Authorize(Roles = "admin")]
    [HttpPost("accounts")]
    public async Task<ActionResult<AdminAccountResponse>> CreateAccount(AdminCreateAccountRequest req)
    {
        if (!await db.Branches.AnyAsync(b => b.Id == req.BranchId))
            return NotFound($"Branch '{req.BranchId}' not found.");

        if (await db.StaffAccounts.AnyAsync(a => a.Username == req.Username))
            return Conflict($"Username '{req.Username}' already exists.");

        var hash = BCrypt.Net.BCrypt.HashPassword(req.Password);
        var account = new StaffAccount
        {
            BranchId = req.BranchId,
            Username = req.Username,
            PasswordHash = hash,
            Role = req.Role,
        };
        db.StaffAccounts.Add(account);
        await db.SaveChangesAsync();

        return Ok(new AdminAccountResponse(account.Id, account.Username, account.Role, account.CreatedAt));
    }

    [Authorize(Roles = "admin")]
    [HttpPut("accounts/{id:int}/password")]
    public async Task<IActionResult> ResetPassword(int id, AdminResetPasswordRequest req)
    {
        var account = await db.StaffAccounts.FindAsync(id);
        if (account == null) return NotFound();
        account.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Roles = "admin")]
    [HttpDelete("accounts/{id:int}")]
    public async Task<IActionResult> DeleteAccount(int id)
    {
        var account = await db.StaffAccounts.FindAsync(id);
        if (account == null) return NotFound();
        db.StaffAccounts.Remove(account);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
