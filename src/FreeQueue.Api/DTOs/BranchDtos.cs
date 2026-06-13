namespace FreeQueue.Api.DTOs;

public record CreateBranchRequest(
    string Id,
    string Name,
    string? Category = null,
    string? Address = null,
    string? City = null,
    int MaxCapacity = 50,
    int GraceMinutes = 15,
    string? OpensAt = null,
    string? ClosesAt = null
);

public record BranchResponse(
    string Id,
    string Name,
    string? Category,
    string? Address,
    string? City,
    int MaxCapacity,
    int GraceMinutes,
    string? OpensAt,
    string? ClosesAt,
    bool HasKioskPin = false,
    bool IsOpen = true
);

public record SetKioskPinRequest(string? Pin);

public record VerifyKioskPinRequest(string Pin);

public record BranchServiceResponse(int Id, string Name, int SortOrder);

public record CreateBranchServiceRequest(string Name);
