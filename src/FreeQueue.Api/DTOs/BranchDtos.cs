namespace FreeQueue.Api.DTOs;

public record CreateBranchRequest(
    string Id,
    string Name,
    string? Address,
    string? City,
    int MaxCapacity = 50,
    int GraceMinutes = 15,
    string? OpensAt = null,
    string? ClosesAt = null
);

public record BranchResponse(
    string Id,
    string Name,
    string? Address,
    string? City,
    int MaxCapacity,
    int GraceMinutes,
    string? OpensAt,
    string? ClosesAt
);
