using BCrypt.Net;
using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminController(AppDbContext db, IConfiguration config) : ControllerBase
{
    [HttpPost("login")]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("admin-login")]
    public ActionResult<AdminLoginResponse> Login([FromBody] AdminLoginRequest req)
    {
        var adminPassword = config["Admin:Password"];
        if (string.IsNullOrEmpty(adminPassword) || req.Password != adminPassword)
            return Unauthorized("Invalid admin password.");

        return new AdminLoginResponse(BuildToken());
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
                    .Select(a => new AdminAccountResponse(a.Id, a.Username, a.CreatedAt))));
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
            Name = req.Name.Trim(),
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

        var account = new StaffAccount
        {
            BranchId = req.BranchId,
            Username = req.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
        };
        db.StaffAccounts.Add(account);
        await db.SaveChangesAsync();

        return Ok(new AdminAccountResponse(account.Id, account.Username, account.CreatedAt));
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

    private string BuildToken()
    {
        var secret = config["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret not configured.");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.Role, "admin"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var token = new JwtSecurityToken(
            issuer: "freequeue",
            audience: "freequeue-staff",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
