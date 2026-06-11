namespace FreeQueue.Api.Services;

public interface ISmsService
{
    Task SendAsync(string to, string message);
}
