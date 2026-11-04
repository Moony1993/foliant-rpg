using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Hubs;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

public record PollVoteDto(string UserId, string Name, string Answer);
public record PollOptionDto(int Id, DateTime StartsAt, List<PollVoteDto> Votes);
public record PollMemberDto(string UserId, string Name);
public record PollDto(int Id, string Title, string Description, DateTime CreatedAt, int? ChosenOptionId,
    List<PollOptionDto> Options, List<PollMemberDto> Members);
public record CreatePollRequest([Required, MaxLength(200)] string Title, string? Description, [MinLength(1)] List<DateTime> Options);
public record VoteRequest(int OptionId, string Answer);
public record ChooseRequest(int? OptionId);
public record ChatMessageDto(int Id, string UserId, string UserName, string Text, DateTime CreatedAt);
public record ChatSendRequest([Required, MaxLength(2000)] string Text);
public record PushSubscribeRequest([Required] string Endpoint, [Required] string P256dh, [Required] string Auth);
public record PushUnsubscribeRequest([Required] string Endpoint);

/// <summary>Group features: scheduling polls, group chat and Web Push registration.</summary>
[ApiController]
[Authorize]
public class CommunityController : ApiControllerBase
{
    private static readonly string[] Answers = { "yes", "maybe", "no" };
    private static readonly TimeZoneInfo Berlin = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");

    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;
    private readonly IHubContext<NotificationHub> _hub;
    private readonly PushService _push;

    public CommunityController(AppDbContext db, UserManager<AppUser> users, IHubContext<NotificationHub> hub, PushService push)
    {
        _db = db; _users = users; _hub = hub; _push = push;
    }

    private static string FormatDate(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Berlin)
            .ToString("ddd dd.MM. HH:mm", new System.Globalization.CultureInfo("de-DE")) + " Uhr";

    /// <summary>Members of the current campaign.</summary>
    private Task<List<AppUser>> Members() =>
        _db.CampaignMembers.Where(m => m.CampaignId == Campaign.CampaignId).Select(m => m.User!)
            .OrderBy(u => u.DisplayName).ToListAsync();

    /// <summary>Live event to everyone in the current campaign.</summary>
    private IClientProxy CampaignClients => _hub.Clients.Group(CampaignContext.Group(Campaign.CampaignId!.Value));

    private Task Refresh(string type) => CampaignClients.SendAsync("notify", new { type });

    // ── Polls ────────────────────────────────────────────────────────────────
    [HttpGet("polls")]
    public async Task<List<PollDto>> Polls()
    {
        var polls = await _db.SchedulePolls.AsNoTracking()
            .Include(p => p.Options).ThenInclude(o => o.Votes)
            .OrderByDescending(p => p.CreatedAt).Take(20).ToListAsync();
        var members = await Members();
        var names = members.ToDictionary(u => u.Id, u => u.DisplayName);
        var memberDtos = members.Select(u => new PollMemberDto(u.Id, u.DisplayName)).ToList();
        return polls.Select(p => new PollDto(p.Id, p.Title, p.Description, p.CreatedAt, p.ChosenOptionId,
            p.Options.OrderBy(o => o.StartsAt).Select(o => new PollOptionDto(o.Id, o.StartsAt,
                o.Votes.Select(v => new PollVoteDto(v.UserId, names.GetValueOrDefault(v.UserId, "?"), v.Answer)).ToList())).ToList(),
            memberDtos)).ToList();
    }

    [HttpPost("polls")]
    [CampaignGm]
    public async Task<IActionResult> CreatePoll(CreatePollRequest req)
    {
        var poll = new SchedulePoll
        {
            Title = req.Title.Trim(), Description = req.Description?.Trim() ?? "", CreatedByUserId = UserId,
            Options = req.Options.Distinct().Select(d => new PollOption { StartsAt = d.ToUniversalTime() }).ToList(),
        };
        _db.SchedulePolls.Add(poll);
        await _db.SaveChangesAsync();
        await CampaignClients.SendAsync("notify", new { type = "poll", title = "New scheduling poll", message = poll.Title });
        _push.Send((await Members()).Select(u => u.Id).Where(id => id != UserId), "New scheduling poll", poll.Title, "/polls");
        return Ok(new { poll.Id });
    }

    [HttpPut("polls/{id:int}/vote")]
    public async Task<IActionResult> Vote(int id, VoteRequest req)
    {
        var option = await _db.PollOptions.FirstOrDefaultAsync(o => o.Id == req.OptionId && o.PollId == id);
        if (option == null) return NotFound();
        var vote = await _db.PollVotes.FirstOrDefaultAsync(v => v.OptionId == option.Id && v.UserId == UserId);
        if (!Answers.Contains(req.Answer)) { if (vote != null) _db.PollVotes.Remove(vote); }  // anything else = clear
        else if (vote == null) _db.PollVotes.Add(new PollVote { OptionId = option.Id, UserId = UserId, Answer = req.Answer });
        else vote.Answer = req.Answer;
        await _db.SaveChangesAsync();
        await Refresh("poll-update");
        return NoContent();
    }

    /// <summary>GM fixes the date (or reopens with null). Everyone is told.</summary>
    [HttpPost("polls/{id:int}/choose")]
    [CampaignGm]
    public async Task<IActionResult> Choose(int id, ChooseRequest req)
    {
        var poll = await _db.SchedulePolls.Include(p => p.Options).FirstOrDefaultAsync(p => p.Id == id);
        if (poll == null) return NotFound();
        var option = req.OptionId == null ? null : poll.Options.FirstOrDefault(o => o.Id == req.OptionId);
        if (req.OptionId != null && option == null) return BadRequest();
        poll.ChosenOptionId = option?.Id;
        await _db.SaveChangesAsync();
        if (option != null)
        {
            var when = FormatDate(option.StartsAt);
            await CampaignClients.SendAsync("notify", new { type = "poll", title = "Date set! 📅", message = $"{poll.Title}: {when}" });
            _push.Send((await Members()).Select(u => u.Id).Where(u => u != UserId), "Date set! 📅", $"{poll.Title}: {when}", "/polls");
        }
        else await Refresh("poll-update");
        return NoContent();
    }

    [HttpDelete("polls/{id:int}")]
    [CampaignGm]
    public async Task<IActionResult> DeletePoll(int id)
    {
        var poll = await _db.SchedulePolls.FindAsync(id);
        if (poll == null) return NotFound();
        _db.SchedulePolls.Remove(poll);
        await _db.SaveChangesAsync();
        await Refresh("poll-update");
        return NoContent();
    }

    // ── Chat ─────────────────────────────────────────────────────────────────
    private static ChatMessageDto ToDto(ChatMessage m) => new(m.Id, m.UserId, m.UserName, m.Text, m.CreatedAt);

    /// <summary>Latest 100 messages (oldest first); pass <paramref name="before"/> to page back.</summary>
    [HttpGet("chat")]
    public async Task<List<ChatMessageDto>> Chat(int? before)
    {
        var q = _db.ChatMessages.AsNoTracking();
        if (before != null) q = q.Where(m => m.Id < before);
        var page = await q.OrderByDescending(m => m.Id).Take(100).ToListAsync();
        page.Reverse();
        return page.Select(ToDto).ToList();
    }

    [HttpPost("chat")]
    public async Task<ActionResult<ChatMessageDto>> SendChat(ChatSendRequest req)
    {
        var text = req.Text.Trim();
        if (text.Length == 0) return BadRequest();
        var me = await _users.FindByIdAsync(UserId);
        var m = new ChatMessage { UserId = UserId, UserName = me?.DisplayName ?? "?", Text = text };
        _db.ChatMessages.Add(m);
        await _db.SaveChangesAsync();
        var dto = ToDto(m);
        await CampaignClients.SendAsync("notify", new { type = "chat", chat = dto });
        _push.Send((await Members()).Select(u => u.Id).Where(u => u != UserId),
            $"💬 {m.UserName}", text.Length > 120 ? text[..120] + "…" : text, "/chat");
        return dto;
    }

    // ── Web Push ─────────────────────────────────────────────────────────────
    [HttpGet("push/key")]
    public string PushKey() => _push.PublicKey;

    [HttpPost("push/subscribe")]
    public async Task<IActionResult> Subscribe(PushSubscribeRequest req)
    {
        var d = await _db.PushDevices.FirstOrDefaultAsync(x => x.Endpoint == req.Endpoint);
        if (d == null) _db.PushDevices.Add(d = new PushDevice { Endpoint = req.Endpoint });
        d.UserId = UserId; d.P256dh = req.P256dh; d.Auth = req.Auth;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("push/unsubscribe")]
    public async Task<IActionResult> Unsubscribe(PushUnsubscribeRequest req)
    {
        await _db.PushDevices.Where(x => x.Endpoint == req.Endpoint && x.UserId == UserId).ExecuteDeleteAsync();
        return NoContent();
    }

    [HttpPost("push/test")]
    public IActionResult TestPush()
    {
        _push.Send(new[] { UserId }, "Foliant", "Notifications work ✓", "/", evenIfOnline: true);
        return NoContent();
    }
}
