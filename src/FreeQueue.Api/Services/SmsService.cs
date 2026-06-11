using System.Net.Http.Headers;
using System.Text;

namespace FreeQueue.Api.Services;

public class SmsService(HttpClient http, IConfiguration config, ILogger<SmsService> logger) : ISmsService
{
    private readonly string _accountSid = config["Sms:AccountSid"] ?? "";
    private readonly string _authToken  = config["Sms:AuthToken"]  ?? "";
    private readonly string _from       = config["Sms:FromNumber"] ?? "";

    public async Task SendAsync(string to, string message)
    {
        if (string.IsNullOrEmpty(_accountSid) || string.IsNullOrEmpty(_from))
        {
            logger.LogInformation("[SMS stub] → {To}: {Message}", to, message);
            return;
        }

        var url = $"https://api.twilio.com/2010-04-01/Accounts/{_accountSid}/Messages.json";
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_accountSid}:{_authToken}"));

        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
        req.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["To"]   = to,
            ["From"] = _from,
            ["Body"] = message,
        });

        var res = await http.SendAsync(req);
        if (!res.IsSuccessStatusCode)
            logger.LogWarning("SMS to {To} failed — HTTP {Status}", to, res.StatusCode);
    }
}
