namespace FreeQueue.Api.DTOs;

public record LoginRequest(string Username, string Password);
public record LoginResponse(string Token, string BranchId, string Username);
public record SetPasswordRequest(string BranchId, string Username, string Password);
