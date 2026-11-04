using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Dtos;
using Foliant.Api.Hubs;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("messages")]
public class MessagesController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;
    private readonly IHubContext<NotificationHub> _hub;
    private readonly PushService _push;
    public MessagesController(AppDbContext db, UserManager<AppUser> users, IHubContext<NotificationHub> hub, PushService push)
    {
        _db = db;
        _users = users;
        _hub = hub;
        _push = push;
    }

    /// <summary>Members of the current campaign (role per user id).</summary>
    private Task<Dictionary<string, string>> Members() =>
        _db.CampaignMembers.Where(m => m.CampaignId == Campaign.CampaignId).ToDictionaryAsync(m => m.UserId, m => m.Role);

    // Everyone in the campaign (players + GM) can message anyone else in it, except themselves.
    [HttpGet("recipients")]
    public async Task<ActionResult<List<RecipientDto>>> Recipients()
    {
        var members = await Members();
        var gmIds = members.Where(m => m.Value == CampaignRoles.Gm).Select(m => m.Key).ToHashSet();
        var memberIds = members.Keys.ToList();
        var users = await _users.Users.AsNoTracking()
            .Where(u => u.Id != UserId && memberIds.Contains(u.Id))
            .OrderBy(u => u.DisplayName)
            .Select(u => new { u.Id, u.DisplayName })
            .ToListAsync();
        // GMs first, so players find them at once.
        return users.Select(u => new RecipientDto(u.Id, u.DisplayName, gmIds.Contains(u.Id)))
            .OrderByDescending(r => r.IsGm).ToList();
    }

    [HttpPost]
    public async Task<IActionResult> Send(ComposeMessageRequest req)
    {
        // Only members of the current campaign can be addressed.
        var members = await Members();
        var recipients = (req.ToAll ? members.Keys : req.RecipientUserIds.Where(members.ContainsKey))
            .Where(id => id != UserId).Distinct().ToArray();
        if (recipients.Length == 0)
            return BadRequest(new { message = "No recipient selected." });

        var due = req.ScheduledFor == null || req.ScheduledFor <= DateTime.UtcNow;
        foreach (var userId in recipients)
            _db.Messages.Add(new Message
            {
                SenderId = UserId,
                RecipientId = userId,
                Subject = req.Subject,
                Body = req.Body,
                IsImportant = req.IsImportant,
                ScheduledFor = req.ScheduledFor,
            });
        await _db.SaveChangesAsync();

        // Push only already-due messages; scheduled ones surface on the next inbox poll.
        if (due)
            foreach (var userId in recipients)
                await _hub.Clients.Group(userId).SendAsync("notify", new
                {
                    type = "message",
                    title = req.IsImportant ? "Important message" : "New message",
                    message = req.Subject,
                });
        if (due)
            _push.Send(recipients, req.IsImportant ? "Important message" : "New message", req.Subject, "/messages");

        return Ok(new { recipients = recipients.Length, scheduled = !due });
    }

    /// <summary>Bug report from any user: lands as an important message with the campaign's GM and
    /// every instance admin who is a member of this campaign.</summary>
    // ponytail: admins outside the campaign don't get it (messages are campaign data); move bug
    // reports to an instance-level inbox if hosts need them.
    [HttpPost("bug-report")]
    public async Task<IActionResult> BugReport(BugReportRequest req)
    {
        var members = await Members();
        var adminIds = (await _users.GetUsersInRoleAsync("Admin")).Select(u => u.Id).ToHashSet();
        var staff = members.Where(m => m.Value == CampaignRoles.Gm || adminIds.Contains(m.Key)).Select(m => m.Key).ToList();
        foreach (var userId in staff)
            _db.Messages.Add(new Message
            {
                SenderId = UserId,
                RecipientId = userId,
                Subject = "🐞 Bug Report",
                Body = string.IsNullOrWhiteSpace(req.Page) ? req.Text : $"Seite: {req.Page}\n\n{req.Text}",
                IsImportant = true,
            });
        await _db.SaveChangesAsync();
        foreach (var userId in staff)
            await _hub.Clients.Group(userId).SendAsync("notify", new { type = "message", title = "Bug Report", message = req.Text.Length > 80 ? req.Text[..80] + "…" : req.Text });
        return Ok(new { recipients = staff.Count });
    }

    // Only messages that are due (not future-scheduled) reach the recipient.
    private IQueryable<Message> Delivered() => _db.Messages
        .Where(m => m.RecipientId == UserId && (m.ScheduledFor == null || m.ScheduledFor <= DateTime.UtcNow));

    [HttpGet]
    public async Task<ActionResult<List<MessageDto>>> Inbox([FromQuery] bool archived = false)
    {
        var msgs = await Delivered().AsNoTracking().Where(m => m.IsArchived == archived)
            .OrderByDescending(m => m.SentAt).ToListAsync();

        var names = await _users.Users
            .Where(u => msgs.Select(m => m.SenderId).Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName);

        return msgs.Select(m => new MessageDto(
            m.Id, names.GetValueOrDefault(m.SenderId, "System"), m.Subject, m.Body,
            m.IsImportant, m.IsRead, m.IsArchived, m.SentAt, m.ScheduledFor)).ToList();
    }

    [HttpGet("unread-count")]
    public async Task<ActionResult<int>> UnreadCount() =>
        await Delivered().CountAsync(m => !m.IsRead && !m.IsArchived);

    [HttpPost("{id:int}/read")]
    public async Task<IActionResult> MarkRead(int id)
    {
        var m = await Delivered().FirstOrDefaultAsync(m => m.Id == id);
        if (m == null) return NotFound();
        m.IsRead = true;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:int}/archive")]
    public async Task<IActionResult> ToggleArchive(int id)
    {
        var m = await Delivered().FirstOrDefaultAsync(m => m.Id == id);
        if (m == null) return NotFound();
        m.IsArchived = !m.IsArchived;
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
