namespace FreeQueue.Api.Services;

public static class KioskPinCrypto
{
    public static string? Hash(string? pin) =>
        string.IsNullOrWhiteSpace(pin) ? null : BCrypt.Net.BCrypt.HashPassword(pin.Trim());

    public static bool Verify(string? input, string hash) =>
        BCrypt.Net.BCrypt.Verify(input?.Trim() ?? "", hash);
}
