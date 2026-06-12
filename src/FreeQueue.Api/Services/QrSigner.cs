using System.Security.Cryptography;
using System.Text;

namespace FreeQueue.Api.Services;

public static class QrSigner
{
    public static string Sign(string branchId, long exp, string secret)
    {
        var data = Encoding.UTF8.GetBytes($"{branchId}:{exp}");
        var key = Encoding.UTF8.GetBytes(secret);
        var hash = HMACSHA256.HashData(key, data);
        return Convert.ToBase64String(hash).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static bool Verify(string branchId, long exp, string sig, string secret)
    {
        var expected = Sign(branchId, exp, secret);
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(expected),
            Encoding.ASCII.GetBytes(sig));
    }
}
