using BCrypt.Net;
using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, IConfiguration config) : ControllerBase
{
    /// <summary>Staff login — returns a JWT valid for 12 hours.</summary>
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest req)
    {
        var account = await db.StaffAccounts
            .FirstOrDefaultAsync(a => a.BranchId == req.BranchId && a.Username == req.Username);

        if (account == null || !BCrypt.Net.BCrypt.Verify(req.Password, account.PasswordHash))
            return Unauthorized("Invalid branch, username, or password.");

        var token = BuildToken(account.BranchId, account.Username);
        return new LoginResponse(token, account.BranchId, account.Username);
    }

    /// <summary>
    /// Create or update a staff account for a branch.
    /// In production, restrict this endpoint to an admin role.
    /// </summary>
    [HttpPost("setup")]
    public async Task<IActionResult> Setup(SetPasswordRequest req)
    {
        if (!await db.Branches.AnyAsync(b => b.Id == req.BranchId))
            return NotFound($"Branch '{req.BranchId}' not found.");

        var account = await db.StaffAccounts
            .FirstOrDefaultAsync(a => a.BranchId == req.BranchId && a.Username == req.Username);

        var hash = BCrypt.Net.BCrypt.HashPassword(req.Password);

        if (account == null)
        {
            db.StaffAccounts.Add(new StaffAccount
            {
                BranchId = req.BranchId,
                Username = req.Username,
                PasswordHash = hash,
            });
        }
        else
        {
            account.PasswordHash = hash;
        }

        await db.SaveChangesAsync();
        return Ok(new { message = $"Account '{req.Username}' ready for branch '{req.BranchId}'." });
    }

    private string BuildToken(string branchId, string username)
    {
        var secret = config["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret not configured.");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim("branch_id", branchId),
            new Claim(ClaimTypes.Name, username),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var token = new JwtSecurityToken(
            issuer: "freequeue",
            audience: "freequeue-staff",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(12),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
