using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Hubs;
using WebPush;

namespace Foliant.Api.Services;

/// <summary>
/// Web Push to installed apps / browsers. VAPID keys come from config (Push:PublicKey, Push:PrivateKey,
/// Push:Subject); without config a key pair is generated once into vapid-keys.json (dev).
/// </summary>
public class PushService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<PushService> _log;
    private readonly VapidDetails _vapid;
    private readonly WebPushClient _client = new();

    public string PublicKey => _vapid.PublicKey;

    public PushService(IConfiguration cfg, IWebHostEnvironment env, IServiceScopeFactory scopes, ILogger<PushService> log)
    {
        _scopes = scopes;
        _log = log;
        var subject = cfg["Push:Subject"] ?? "mailto:gm@foliant.local";
        if (cfg["Push:PublicKey"] is { Length: > 0 } pub && cfg["Push:PrivateKey"] is { Length: > 0 } priv)
        {
            _vapid = new VapidDetails(subject, pub, priv);
            return;
        }
        // ponytail: file-based keys unless Push:PublicKey/PrivateKey are set. Push:KeyFile moves the file onto a volume
        // (Docker: /data), so the keys survive new images; default is next to the app.
        var file = cfg["Push:KeyFile"] is { Length: > 0 } f ? f : Path.Combine(env.ContentRootPath, "vapid-keys.json");
        if (File.Exists(file))
        {
            var k = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(file))!;
            _vapid = new VapidDetails(subject, k["publicKey"], k["privateKey"]);
        }
        else
        {
            var keys = VapidHelper.GenerateVapidKeys();
            File.WriteAllText(file, JsonSerializer.Serialize(new { publicKey = keys.PublicKey, privateKey = keys.PrivateKey }));
            _vapid = new VapidDetails(subject, keys.PublicKey, keys.PrivateKey);
        }
    }

    /// <summary>Fire-and-forget push to the given users. Skips users with the app open (they get SignalR)
    /// unless <paramref name="evenIfOnline"/>. Dead subscriptions are removed.</summary>
    public void Send(IEnumerable<string> userIds, string title, string body, string url = "/", bool evenIfOnline = false)
    {
        var targets = userIds.Distinct().Where(u => evenIfOnline || !NotificationHub.IsOnline(u)).ToList();
        if (targets.Count == 0) return;
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var devices = await db.PushDevices.Where(d => targets.Contains(d.UserId)).ToListAsync();
                var payload = JsonSerializer.Serialize(new { title, body, url });
                foreach (var d in devices)
                {
                    try { await _client.SendNotificationAsync(new PushSubscription(d.Endpoint, d.P256dh, d.Auth), payload, _vapid); }
                    catch (WebPushException ex) when (ex.StatusCode is System.Net.HttpStatusCode.Gone or System.Net.HttpStatusCode.NotFound)
                    { db.PushDevices.Remove(d); }
                    catch (Exception ex) { _log.LogWarning(ex, "Push to {Endpoint} failed", d.Endpoint); }
                }
                await db.SaveChangesAsync();
            }
            catch (Exception ex) { _log.LogWarning(ex, "Push send failed"); }
        });
    }
}
