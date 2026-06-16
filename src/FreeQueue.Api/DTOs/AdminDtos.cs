namespace FreeQueue.Api.DTOs;

public record AdminSetupRequest(string BranchId, string BranchName, string Username, string Password);

public record AdminBranchResponse(string Id, string Name, string? Category, IEnumerable<AdminAccountResponse> Accounts);

public record AdminAccountResponse(int Id, string Username, string Role, DateTime CreatedAt);

public record AdminCreateBranchRequest(string Id, string Name);

public record AdminCreateAccountRequest(string BranchId, string Username, string Password, string Role = "staff");

public record AdminResetPasswordRequest(string Password);
