namespace FreeQueue.Api.Services;

public enum NotificationChannel { Sms, WhatsApp, Viber }

public interface ISmsService
{
    Task SendAsync(string to, string message, NotificationChannel channel = NotificationChannel.Sms);
}
