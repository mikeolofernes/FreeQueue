using StackExchange.Redis;

namespace FreeQueue.Api.Services;

public class QrTokenService(IConnectionMultiplexer redis)
{
    private const int TtlSeconds = 90;

    private static string Key(string token) => $"qr:{token}";

    public async Task<string> GenerateAsync(string branchId)
    {
        var token = Guid.NewGuid().ToString("N");
        var db = redis.GetDatabase();
        await db.StringSetAsync(Key(token), branchId, TimeSpan.FromSeconds(TtlSeconds));
        return token;
    }

    // Validates the token belongs to the given branch and deletes it atomically (single-use).
    public async Task<bool> ValidateAndConsumeAsync(string token, string branchId)
    {
        var db = redis.GetDatabase();
        var value = await db.StringGetDeleteAsync(Key(token));
        return value.HasValue && (string?)value == branchId;
    }
}
