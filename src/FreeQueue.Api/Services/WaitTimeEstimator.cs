using FreeQueue.Api.Data;
using FreeQueue.Api.DTOs;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Services;

public class WaitTimeEstimator(AppDbContext db)
{
    // Day-of-week multipliers (0=Sun … 6=Sat). Tune per real data.
    private static readonly double[] DayMultipliers = [1.10, 1.20, 1.05, 1.00, 0.95, 0.90, 1.00];

    // Hour-of-day multipliers. Lunch rush (11–13) and morning peak (8–9) are slower.
    private static readonly double[] HourMultipliers =
        [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.15, 1.20, 1.10, 1.25, 1.30, 1.15, 1.05, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

    // Service-type modifiers relative to a generic baseline.
    private static readonly Dictionary<string, double> ServiceModifiers = new(StringComparer.OrdinalIgnoreCase)
    {
        ["new account"] = 1.80,
        ["new account opening"] = 1.80,
        ["consultation"] = 1.30,
        ["cash deposit"] = 0.70,
        ["deposit"] = 0.70,
        ["withdrawal"] = 0.80,
        ["cashier"] = 0.90,
    };

    public async Task<WaitEstimateDto> EstimateAsync(string branchId, string serviceType, int peopleAhead = 1)
    {
        var recent = await db.QueueTransactions
            .Where(t => t.BranchId == branchId && t.ServiceType == serviceType && t.DurationSecs > 0)
            .OrderByDescending(t => t.CreatedAt)
            .Take(10)
            .Select(t => t.DurationSecs)
            .ToListAsync();

        double avgSecs;
        string confidence;

        if (recent.Count == 0)
        {
            // No data — fall back to global average for this service type
            avgSecs = GetFallbackSecs(serviceType);
            confidence = "Rough guess";
        }
        else
        {
            avgSecs = WeightedAverage(recent);
            confidence = recent.Count switch
            {
                < 5 => "Rough guess",
                < 20 => "Fair estimate",
                < 50 => "Based on today's pace",
                _ => "High confidence"
            };
        }

        var now = DateTime.UtcNow;
        var dayMult = DayMultipliers[(int)now.DayOfWeek];
        var hourMult = HourMultipliers[now.Hour];
        var svcMult = ServiceModifiers.GetValueOrDefault(serviceType, 1.0);

        var adjustedSecs = avgSecs * dayMult * hourMult * svcMult;
        var totalMins = (int)Math.Ceiling(adjustedSecs * peopleAhead / 60.0);

        return new WaitEstimateDto(totalMins, confidence, Math.Round(avgSecs, 1));
    }

    private static double WeightedAverage(List<int> durations)
    {
        // Most recent = weight N, oldest = weight 1
        double weightedSum = 0;
        double weightSum = 0;
        for (int i = 0; i < durations.Count; i++)
        {
            double weight = durations.Count - i;
            weightedSum += durations[i] * weight;
            weightSum += weight;
        }
        return weightedSum / weightSum;
    }

    private static double GetFallbackSecs(string serviceType) =>
        ServiceModifiers.TryGetValue(serviceType, out var mod)
            ? 300 * mod   // 5-min baseline
            : 300;
}
