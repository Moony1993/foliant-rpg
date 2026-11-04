using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Services;

namespace Foliant.Api.Hubs;

/// <summary>
/// Real-time push to players. Clients receive "notify" (item grants / messages).
/// Group per userId so the server can target individual players, plus the group of the campaign
/// the client currently shows (<see cref="CampaignContext.Group"/>) for campaign-wide events.
/// Also tracks online presence for the GM's player list.
/// </summary>
[Authorize]
public class NotificationHub : Hub
{
    // ponytail: in-memory presence — fine for one App Service instance. Use a backplane/Redis if you scale out.
    private static readonly ConcurrentDictionary<string, int> Online = new();

    private readonly AppDbContext _db;
    public NotificationHub(AppDbContext db) => _db = db;

    public static bool IsOnline(string userId) => Online.TryGetValue(userId, out var n) && n > 0;

    private string? UserId => Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

    public override async Task OnConnectedAsync()
    {
        if (UserId is { } uid)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, uid);
            // Only the campaign the client is looking at (?campaignId=, same fallback as the HTTP API:
            // oldest membership) — otherwise chat/map events of another campaign would leak into this view.
            // The client reconnects when it switches campaigns.
            int? requested = int.TryParse(Context.GetHttpContext()?.Request.Query["campaignId"], out var id) ? id : null;
            var mine = _db.CampaignMembers.Where(m => m.UserId == uid);
            var cid = requested != null
                ? await mine.Where(m => m.CampaignId == requested).Select(m => (int?)m.CampaignId).FirstOrDefaultAsync()
                : await mine.OrderBy(m => m.JoinedAt).ThenBy(m => m.CampaignId).Select(m => (int?)m.CampaignId).FirstOrDefaultAsync();
            if (cid != null) await Groups.AddToGroupAsync(Context.ConnectionId, CampaignContext.Group(cid.Value));
            Online.AddOrUpdate(uid, 1, (_, n) => n + 1);
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? ex)
    {
        if (UserId is { } uid)
            Online.AddOrUpdate(uid, 0, (_, n) => Math.Max(0, n - 1));
        await base.OnDisconnectedAsync(ex);
    }
}
