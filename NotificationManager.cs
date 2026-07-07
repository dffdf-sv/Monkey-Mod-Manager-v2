using System;
using System.Collections.Generic;

namespace MonkeModManager;
public class Notification
{
    public string Title { get; }
    public string Message { get; }
    public bool IsRead { get; set; }

    public Notification(string title, string message)
    {
        Title = title;
        Message = message;
        IsRead = false;
    }
}

public class NotificationManager
{
    public List<Notification> Notifications { get; } = new();

    public int UnreadCount => Notifications.FindAll(n => !n.IsRead).Count;

    public event Action? OnChanged;

    public void ShowNotification(string title, string message)
    {
        Notifications.Add(new Notification(title, message));
        OnChanged?.Invoke();
    }

    public void MarkAllAsRead()
    {
        foreach (var n in Notifications)
            n.IsRead = true;

        OnChanged?.Invoke();
    }
}