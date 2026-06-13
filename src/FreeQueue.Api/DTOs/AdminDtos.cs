namespace FreeQueue.Api.DTOs;

public record AdminLoginRequest(string Password);
public record AdminLoginResponse(string Token);

public record AdminBranchResponse(
    string Id,
    string Name,
    string? Category,
    IEnumerable<AdminAccountResponse> Accounts);

public record AdminAccountResponse(int Id, string Username, DateTime CreatedAt);

public record AdminCreateBranchRequest(string Id, string Name);
public record AdminCreateAccountRequest(string BranchId, string Username, string Password);
public record AdminResetPasswordRequest(string Password);
