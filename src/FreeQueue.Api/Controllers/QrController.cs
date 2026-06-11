using FreeQueue.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/qr")]
[Authorize]
public class QrController(QrTokenService qrTokens) : ControllerBase
{
    [HttpPost("token")]
    public async Task<IActionResult> GenerateToken()
    {
        var branchId = User.FindFirst("branch_id")?.Value;
        if (string.IsNullOrEmpty(branchId))
            return Unauthorized();

        var token = await qrTokens.GenerateAsync(branchId);
        return Ok(new { token, ttlSeconds = 90 });
    }
}
