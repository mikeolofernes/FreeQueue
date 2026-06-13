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
    /// <summary>Returns whether the initial admin account has been created yet.</summary>
    [HttpGet("needs-setup")]
    public async Task<IActionResult> NeedsSetup() =>
        Ok(new { needsSetup = !await db.StaffAccounts.AnyAsync(a => a.Role == "admin") });

    /// <summary>Creates the first admin account. Locked out once any admin exists.</summary>
    [HttpPost("setup")]
    public async Task<IActionResult> Setup([FromBody] AdminSetupRequest req)
    {
        if (await db.StaffAccounts.AnyAsync(a => a.Role == "admin"))
            return Conflict("An admin account already exists.");

        if (await db.StaffAccounts.AnyAsync(a => a.Username == req.Username))
            return Conflict($"Username '{req.Username}' is already taken.");

        if (!await db.Branches.AnyAsync(b => b.Id == req.BranchId))
        {
            db.Branches.Add(new Branch
            {
                Id = req.BranchId.Trim(),
                Name = req.BranchName.Trim() != string.Empty ? req.BranchName.Trim() : req.BranchId.Trim(),
                MaxCapacity = 50,
                GraceMinutes = 15,
            });
            await db.SaveChangesAsync();
        }

        db.StaffAccounts.Add(new StaffAccount
        {
            BranchId = req.BranchId.Trim(),
            Username = req.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = "admin",
        });
        await db.SaveChangesAsync();

        return Ok(new { message = "Admin account created." });
    }

    [Authorize(Roles = "admin")]
    [HttpGet("overview")]
    public async Task<IEnumerable<AdminBranchResponse>> Overview()
    {
        var branches = await db.Branches.OrderBy(b => b.Name).ToListAsync();
        var accounts = await db.StaffAccounts.OrderBy(a => a.Username).ToListAsync();

        return branches.Select(b => new AdminBranchResponse(
            b.Id, b.Name, b.Category,
            accounts.Where(a => a.BranchId == b.Id)
                    .Select(a => new AdminAccountResponse(a.Id, a.Username, a.Role, a.CreatedAt))));
    }

    [Authorize(Roles = "admin")]
    [HttpPost("branches")]
    public async Task<ActionResult<AdminBranchResponse>> CreateBranch([FromBody] AdminCreateBranchRequest req)
    {
        if (await db.Branches.AnyAsync(b => b.Id == req.Id))
            return Conflict($"Branch '{req.Id}' already exists.");

        var branch = new Branch
        {
            Id = req.Id.Trim(),
            Name = req.Name.Trim() != string.Empty ? req.Name.Trim() : req.Id.Trim(),
            MaxCapacity = 50,
            GraceMinutes = 15,
        };
        db.Branches.Add(branch);
        await db.SaveChangesAsync();

        return Ok(new AdminBranchResponse(branch.Id, branch.Name, branch.Category, []));
    }

    [Authorize(Roles = "admin")]
    [HttpPost("accounts")]
    public async Task<ActionResult<AdminAccountResponse>> CreateAccount([FromBody] AdminCreateAccountRequest req)
    {
        if (!await db.Branches.AnyAsync(b => b.Id == req.BranchId))
            return NotFound($"Branch '{req.BranchId}' not found.");

        if (await db.StaffAccounts.AnyAsync(a => a.Username == req.Username))
            return Conflict($"Username '{req.Username}' is already taken.");

        var role = req.Role == "admin" ? "admin" : "staff";
        var account = new StaffAccount
        {
            BranchId = req.BranchId,
            Username = req.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = role,
        };
        db.StaffAccounts.Add(account);
        await db.SaveChangesAsync();

        return Ok(new AdminAccountResponse(account.Id, account.Username, account.Role, account.CreatedAt));
    }

    [Authorize(Roles = "admin")]
    [HttpPut("accounts/{id:int}/password")]
    public async Task<IActionResult> ResetPassword(int id, [FromBody] AdminResetPasswordRequest req)
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
