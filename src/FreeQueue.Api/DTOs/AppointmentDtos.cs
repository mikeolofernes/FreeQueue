namespace FreeQueue.Api.DTOs;

public record CreateAppointmentRequest(
    string ServiceType,
    string CustomerName,
    string? Phone,
    DateTime ScheduledAt,
    string? Notes = null
);

public record AppointmentResponse(
    int Id,
    string BranchId,
    string ServiceType,
    string CustomerName,
    string? Phone,
    DateTime ScheduledAt,
    string Status,
    string? Notes,
    DateTime CreatedAt
);

public record UpdateAppointmentStatusRequest(string Status);

public record AnalyticsResponse(
    string BranchId,
    int TotalServedToday,
    int CurrentlyWaiting,
    double AvgWaitMinutes,
    IReadOnlyList<HourlyStats> HourlyBreakdown,
    IReadOnlyList<ServiceStats> ServiceBreakdown,
    double CsatScore
);

public record HourlyStats(int Hour, int Count, double AvgDurationSecs);

public record ServiceStats(string ServiceType, int Count, double AvgDurationSecs);
