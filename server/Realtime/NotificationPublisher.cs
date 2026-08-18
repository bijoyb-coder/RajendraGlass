using Dapper;
using Microsoft.AspNetCore.SignalR;
using RajendraGlass.Api.Data;
using RajendraGlass.Api.Models;

namespace RajendraGlass.Api.Realtime;

public interface INotificationPublisher
{
    Task PublishToUserAsync(int userId, string type, string title, string? message = null, string? link = null);
    Task PublishToRoleAsync(string role, string type, string title, string? message = null, string? link = null);
}

/// <summary>
/// Persists every notification (so it survives a refresh / shows up for a user who was offline)
/// and pushes it live over SignalR in the same call. Domain events are raised from controllers
/// after their transaction has committed (SDD 10.1: "a rolled-back operation never emits a false
/// notification").
/// </summary>
public class NotificationPublisher(IDbConnectionFactory db, IHubContext<NotificationHub> hub) : INotificationPublisher
{
    public async Task PublishToUserAsync(int userId, string type, string title, string? message = null, string? link = null)
    {
        var dto = Persist(userId: userId, role: null, type, title, message, link);
        await hub.Clients.Group($"user:{userId}").SendAsync("notification", dto);
    }

    public async Task PublishToRoleAsync(string role, string type, string title, string? message = null, string? link = null)
    {
        var dto = Persist(userId: null, role: role, type, title, message, link);
        await hub.Clients.Group($"role:{role}").SendAsync("notification", dto);
    }

    private NotificationDto Persist(int? userId, string? role, string type, string title, string? message, string? link)
    {
        using var conn = db.CreateConnection();
        var id = conn.ExecuteScalar<long>(
            @"INSERT INTO Security.Notification (UserId, Role, Type, Title, Message, Link)
              OUTPUT INSERTED.NotificationId
              VALUES (@userId, @role, @type, @title, @message, @link)",
            new { userId, role, type, title, message, link });

        return new NotificationDto
        {
            NotificationId = id,
            Type = type,
            Title = title,
            Message = message,
            Link = link,
            IsRead = false,
            CreatedOn = DateTime.UtcNow,
        };
    }
}
