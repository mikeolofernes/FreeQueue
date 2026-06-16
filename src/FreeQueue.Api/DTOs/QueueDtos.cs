namespace FreeQueue.Api.DTOs;

public record JoinQueueRequest(
    string BranchId,
    string ServiceType,
    string? CustomerName,
    string? Phone,
    bool Priority = false
);

public record KioskJoinRequest(
    string ServiceType,
    string? CustomerName,
    string? Phone,
    string? KioskPin,
    bool Priority = false
);

public record AdvanceQueueRequest(
    string BranchId,
    int TicketNumber,
    string ServiceType,
    int DurationSecs,
    string? CounterId = null
);

public record AddWalkInRequest(
    string BranchId,
    string ServiceType,
    string? CustomerName,
    string? Phone,
    bool Priority = false
);

public record BroadcastRequest(
    string BranchId,
    string Message
);

public record TransferTicketRequest(string NewServiceType);

public record TicketResponse(
    int Id,
    string BranchId,
    int TicketNumber,
    string DisplayNumber,
    string ServiceType,
    string? CustomerName,
    string Status,
    int PeopleAhead,
    DateTime JoinedAt,
    WaitEstimateDto? WaitEstimate,
    string? ViewToken,
    bool Priority = false,
    string? CounterId = null
);

public record QueueStatusResponse(
    string BranchId,
    int? CurrentTicketNumber,
    string? CurrentServiceType,
    int ActiveCount,
    int ServedToday,
    int PeopleWaiting,
    WaitEstimateDto? WaitEstimate,
    bool IsOpen = true,
    IReadOnlyList<int>? NextTicketNumbers = null,
    string? CounterId = null,
    int? CurrentTicketId = null,
    string? CurrentDisplayNumber = null,
    IReadOnlyList<string>? NextDisplayNumbers = null,
    // Populated only on callNext responses — the specific ticket just called for this counter
    int? CalledTicketId = null,
    string? CalledDisplayNumber = null,
    string? CalledServiceType = null
);

public record NowServingEntry(string DisplayNumber, string? ServiceType, string? CounterId);

public record GroupStatusItem(
    int? GroupId,
    string GroupName,
    string? Prefix,
    int PeopleWaiting,
    IReadOnlyList<NowServingEntry> NowServing
);

public record WaitEstimateDto(
    int EstimatedMinutes,
    string Confidence,
    double AvgServiceSecs
);

public record UndoResponse(bool Success, string Message);

public record RateTicketRequest(int Rating);
