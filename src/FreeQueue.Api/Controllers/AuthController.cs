using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
    [EnableRateLimiting("auth-login")]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest req)
    {
        var account = await db.StaffAccounts
            .FirstOrDefaultAsync(a => a.Username == req.Username);

        if (account == null || !BCrypt.Net.BCrypt.Verify(req.Password, account.PasswordHash))
            return Unauthorized("Invalid username or password.");

        // Auto-apply default kiosk PIN hash to the branch on login
        if (account.DefaultKioskPin != null)
        {
            var branch = await db.Branches.FindAsync(account.BranchId);
            if (branch != null)
            {
                branch.KioskPin = account.DefaultKioskPin;
                await db.SaveChangesAsync();
            }
        }

        var token = BuildToken(account.BranchId, account.Username, account.Role);
        return new LoginResponse(token, account.BranchId, account.Username, account.Role, account.DefaultKioskPin != null);
    }

    [Authorize]
    [HttpPut("default-pin")]
    public async Task<IActionResult> SetDefaultPin([FromBody] SetDefaultPinRequest req)
    {
        var username = User.FindFirstValue(ClaimTypes.Name);
        var account = await db.StaffAccounts.FirstOrDefaultAsync(a => a.Username == username);
        if (account == null) return NotFound();

        var hashedPin = string.IsNullOrWhiteSpace(req.Pin) ? null : BCrypt.Net.BCrypt.HashPassword(req.Pin.Trim());
        account.DefaultKioskPin = hashedPin;

        // Mirror to branch immediately so it takes effect without re-login
        var branch = await db.Branches.FindAsync(account.BranchId);
        if (branch != null) branch.KioskPin = hashedPin;

        await db.SaveChangesAsync();
        return NoContent();
    }

    private string BuildToken(string branchId, string username, string role)
    {
        var secret = config["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret not configured.");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim("branch_id", branchId),
            new Claim(ClaimTypes.Name, username),
            new Claim(ClaimTypes.Role, role),
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
