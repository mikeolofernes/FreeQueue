using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace FreeQueue.Api.Services;

public class SmsService(HttpClient http, IConfiguration config, ILogger<SmsService> logger) : ISmsService
{
    private readonly string _accountSid   = config["Sms:AccountSid"]   ?? "";
    private readonly string _authToken    = config["Sms:AuthToken"]    ?? "";
    private readonly string _fromSms      = config["Sms:FromNumber"]   ?? "";
    private readonly string _fromWhatsApp = config["Sms:WhatsAppFrom"] ?? "";
    private readonly string _viberToken   = config["Sms:ViberToken"]   ?? "";

    public async Task SendAsync(string to, string message, NotificationChannel channel = NotificationChannel.Sms)
    {
        switch (channel)
        {
            case NotificationChannel.WhatsApp:
                await SendWhatsAppAsync(to, message);
                break;
            case NotificationChannel.Viber:
                await SendViberAsync(to, message);
                break;
            default:
                await SendSmsAsync(to, message);
                break;
        }
    }

    private async Task SendSmsAsync(string to, string message)
    {
        if (string.IsNullOrEmpty(_accountSid) || string.IsNullOrEmpty(_fromSms))
        {
            logger.LogInformation("[SMS stub] → {To}: {Message}", to, message);
            return;
        }
        await SendTwilioAsync(to, _fromSms, message);
    }

    private async Task SendWhatsAppAsync(string to, string message)
    {
        if (string.IsNullOrEmpty(_accountSid) || string.IsNullOrEmpty(_fromWhatsApp))
        {
            logger.LogInformation("[WhatsApp stub] → {To}: {Message}", to, message);
            return;
        }
        // Twilio WhatsApp uses whatsapp: prefix on both numbers
        var waTo   = to.StartsWith("whatsapp:") ? to : $"whatsapp:{to}";
        var waFrom = _fromWhatsApp.StartsWith("whatsapp:") ? _fromWhatsApp : $"whatsapp:{_fromWhatsApp}";
        await SendTwilioAsync(waTo, waFrom, message);
    }

    private async Task SendViberAsync(string to, string message)
    {
        if (string.IsNullOrEmpty(_viberToken))
        {
            logger.LogInformation("[Viber stub] → {To}: {Message}", to, message);
            return;
        }

        var payload = new
        {
            receiver = to,
            min_api_version = 1,
            sender = new { name = "QueueFree" },
            message = new { type = "text", text = message }
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, "https://chatapi.viber.com/pa/send_message");
        req.Headers.Add("X-Viber-Auth-Token", _viberToken);
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        var res = await http.SendAsync(req);
        if (!res.IsSuccessStatusCode)
            logger.LogWarning("Viber message to {To} failed — HTTP {Status}", to, res.StatusCode);
    }

    private async Task SendTwilioAsync(string to, string from, string message)
    {
        var url = $"https://api.twilio.com/2010-04-01/Accounts/{_accountSid}/Messages.json";
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_accountSid}:{_authToken}"));

        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
        req.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["To"]   = to,
            ["From"] = from,
            ["Body"] = message,
        });

        var res = await http.SendAsync(req);
        if (!res.IsSuccessStatusCode)
            logger.LogWarning("Twilio message to {To} failed — HTTP {Status}", to, res.StatusCode);
    }
}
