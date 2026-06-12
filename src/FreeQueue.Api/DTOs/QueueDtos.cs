namespace FreeQueue.Api.DTOs;

public record JoinQueueRequest(
    string BranchId,
    string ServiceType,
    string? CustomerName,
    string? Phone
);

public record KioskJoinRequest(
    string ServiceType,
    string? CustomerName,
    string? Phone
);

public record AdvanceQueueRequest(
    string BranchId,
    int TicketNumber,
    string ServiceType,
    int DurationSecs
);

public record AddWalkInRequest(
    string BranchId,
    string ServiceType,
    string? CustomerName,
    string? Phone
);

public record BroadcastRequest(
    string BranchId,
    string Message
);

public record TicketResponse(
    int Id,
    string BranchId,
    int TicketNumber,
    string ServiceType,
    string? CustomerName,
    string Status,
    int PeopleAhead,
    DateTime JoinedAt,
    WaitEstimateDto? WaitEstimate
);

public record QueueStatusResponse(
    string BranchId,
    int? CurrentTicketNumber,
    string? CurrentServiceType,
    int ActiveCount,
    int ServedToday,
    int PeopleWaiting,
    WaitEstimateDto? WaitEstimate
);

public record WaitEstimateDto(
    int EstimatedMinutes,
    string Confidence,
    double AvgServiceSecs
);

public record UndoResponse(bool Success, string Message);
