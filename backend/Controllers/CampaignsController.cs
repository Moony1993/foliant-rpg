using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Dtos;
using Foliant.Api.Hubs;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

public record CampaignSummaryDto(int Id, string Name, string Description, string RuleSystemId, string RuleSystemName,
    string? ImageUrl, string Role, int MemberCount, string GmName);
public record CampaignMemberDto(string UserId, string DisplayName, string UserName, string Role, bool Online, int CharacterCount);
public record CampaignDetailDto(int Id, string Name, string Description, string RuleSystemId, string RuleSystemName,
    string? ImageUrl, string MyRole, bool HasCharacters, List<CampaignMemberDto> Members);
public record CreateCampaignRequest([Required, MaxLength(100)] string Name, [MaxLength(2000)] string? Description, [Required] string RuleSystemId);
public record UpdateCampaignRequest([Required, MaxLength(100)] string Name, [MaxLength(2000)] string? Description, string? ImageUrl, string? RuleSystemId);
public record TransferGmRequest([Required] string UserId);
public record CreateInviteRequest([Range(1, 365)] int? ExpiresInDays, [Range(1, 100)] int? MaxUses);
public record InviteDto(int Id, string Code, DateTime CreatedAt, DateTime? ExpiresAt, int? MaxUses, int Uses, bool Valid);
public record InviteInfoDto(string CampaignName, string RuleSystemName, string GmName, bool Valid);
public record RegisterViaInviteRequest([Required, MinLength(3), MaxLength(40), RegularExpression("^[a-zA-Z0-9._-]+$")] string Username,
    [Required, MaxLength(60)] string DisplayName, [Required, MinLength(6)] string Password);
public record RuleSystemDto(string Id, string Name);

/// <summary>Campaigns, their members and invite links. Works on campaign ids from the route, so the
/// caller's role is checked per campaign here (not via the X-Campaign-Id context).</summary>
[ApiController]
[Authorize]
public class CampaignsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;
    private readonly RuleSystemRegistry _rules;
    private readonly JwtTokenService _jwt;
    private readonly CampaignTransfer _transfer;

    public CampaignsController(AppDbContext db, UserManager<AppUser> users, RuleSystemRegistry rules, JwtTokenService jwt, CampaignTransfer transfer)
    {
        _db = db; _users = users; _rules = rules; _jwt = jwt; _transfer = transfer;
    }

    private string SystemName(string id) => _rules.All.FirstOrDefault(s => s.Id == id)?.DisplayName ?? id;

    private Task<string?> RoleIn(int campaignId) =>
        _db.CampaignMembers.Where(m => m.CampaignId == campaignId && m.UserId == UserId).Select(m => m.Role).FirstOrDefaultAsync();

    private static bool IsValid(CampaignInvite i) =>
        !i.Revoked && (i.ExpiresAt == null || i.ExpiresAt > DateTime.UtcNow) && (i.MaxUses == null || i.Uses < i.MaxUses);

    [HttpGet("rules/systems")]
    public List<RuleSystemDto> Systems() => _rules.All.Select(s => new RuleSystemDto(s.Id, s.DisplayName)).ToList();

    // ── Campaigns ────────────────────────────────────────────────────────────
    [HttpGet("campaigns")]
    public async Task<List<CampaignSummaryDto>> Mine()
    {
        var rows = await _db.CampaignMembers.AsNoTracking().Where(m => m.UserId == UserId)
            .Join(_db.Campaigns, m => m.CampaignId, c => c.Id, (m, c) => new { c, m.Role, m.JoinedAt })
            .OrderBy(x => x.JoinedAt).ToListAsync();
        var ids = rows.Select(r => r.c.Id).ToList();
        var members = await _db.CampaignMembers.AsNoTracking().Where(m => ids.Contains(m.CampaignId))
            .Select(m => new { m.CampaignId, m.Role, m.User!.DisplayName }).ToListAsync();
        return rows.Select(r => new CampaignSummaryDto(r.c.Id, r.c.Name, r.c.Description, r.c.RuleSystemId, SystemName(r.c.RuleSystemId),
            r.c.ImageUrl, r.Role, members.Count(m => m.CampaignId == r.c.Id),
            members.FirstOrDefault(m => m.CampaignId == r.c.Id && m.Role == CampaignRoles.Gm)?.DisplayName ?? "?")).ToList();
    }

    /// <summary>The campaign this request runs in (header or oldest membership); 204 when the user has none.</summary>
    [HttpGet("campaigns/current")]
    public async Task<ActionResult<CampaignDetailDto>> Current()
    {
        if (Campaign.CampaignId is not int id) return NoContent();
        var c = await _db.Campaigns.AsNoTracking().FirstAsync(x => x.Id == id);
        var members = await _db.CampaignMembers.AsNoTracking().Where(m => m.CampaignId == id)
            .Select(m => new { m.UserId, m.Role, m.User!.DisplayName, m.User.UserName }).ToListAsync();
        var charCounts = await _db.Characters.GroupBy(x => x.UserId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);
        return new CampaignDetailDto(c.Id, c.Name, c.Description, c.RuleSystemId, SystemName(c.RuleSystemId), c.ImageUrl,
            Campaign.Role!, charCounts.Count > 0,
            members.OrderByDescending(m => m.Role == CampaignRoles.Gm).ThenBy(m => m.DisplayName)
                .Select(m => new CampaignMemberDto(m.UserId, m.DisplayName, m.UserName!, m.Role,
                    NotificationHub.IsOnline(m.UserId), charCounts.GetValueOrDefault(m.UserId))).ToList());
    }

    /// <summary>Accounts with the global GM role (or Admin) may open campaigns; the creator is their GM.</summary>
    [HttpPost("campaigns")]
    [Authorize(Roles = "GM,Admin")]
    public async Task<ActionResult<CampaignSummaryDto>> Create(CreateCampaignRequest req)
    {
        if (_rules.All.All(s => s.Id != req.RuleSystemId)) return BadRequest(new { message = "Unknown rule system." });
        var c = new Campaign
        {
            Name = req.Name.Trim(), Description = req.Description?.Trim() ?? "", RuleSystemId = req.RuleSystemId, CreatedByUserId = UserId,
            Members = { new CampaignMember { UserId = UserId, Role = CampaignRoles.Gm } },
        };
        _db.Campaigns.Add(c);
        await _db.SaveChangesAsync();
        var me = await _users.FindByIdAsync(UserId);
        return new CampaignSummaryDto(c.Id, c.Name, c.Description, c.RuleSystemId, SystemName(c.RuleSystemId), null,
            CampaignRoles.Gm, 1, me?.DisplayName ?? "?");
    }

    [HttpPut("campaigns/{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateCampaignRequest req)
    {
        if (await RoleIn(id) != CampaignRoles.Gm) return NotFound();
        var c = await _db.Campaigns.FirstAsync(x => x.Id == id);
        if (req.RuleSystemId != null && req.RuleSystemId != c.RuleSystemId)
        {
            if (_rules.All.All(s => s.Id != req.RuleSystemId)) return BadRequest(new { message = "Unknown rule system." });
            // Changing the rules would break every character sheet.
            if (await _db.Characters.IgnoreQueryFilters().AnyAsync(x => x.CampaignId == id))
                return Conflict(new { message = "The rule system can no longer be changed because characters already exist." });
            c.RuleSystemId = req.RuleSystemId;
        }
        c.Name = req.Name.Trim();
        c.Description = req.Description?.Trim() ?? "";
        c.ImageUrl = string.IsNullOrWhiteSpace(req.ImageUrl) ? null : req.ImageUrl;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Deletes the campaign with all its data (characters, maps, monsters, chat, homebrew, …).</summary>
    // ponytail: uploaded images (maps, portraits) stay in storage; add a cleanup job if storage matters.
    [HttpDelete("campaigns/{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        if (await RoleIn(id) != CampaignRoles.Gm) return NotFound();
        await using var tx = await _db.Database.BeginTransactionAsync();
        // Characters first: their inventory may reference this campaign's homebrew items.
        await _db.Characters.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.Monsters.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.Messages.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.Notes.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.BattleMaps.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.MapAssets.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.SchedulePolls.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.ChatMessages.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.ItemTemplates.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.Feats.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.CompendiumSpells.IgnoreQueryFilters().Where(e => e.CampaignId == id).ExecuteDeleteAsync();
        await _db.Campaigns.Where(c => c.Id == id).ExecuteDeleteAsync();   // members + invites cascade
        await tx.CommitAsync();
        return NoContent();
    }

    // ── Export / import ──────────────────────────────────────────────────────
    /// <summary>Download the campaign as .foliant file. Without characters = template to share with other GMs.</summary>
    [HttpGet("campaigns/{id:int}/export")]
    public async Task<IActionResult> Export(int id, [FromQuery] bool withCharacters = false)
    {
        if (await RoleIn(id) != CampaignRoles.Gm) return NotFound();
        var (zip, fileName) = await _transfer.ExportAsync(id, UserId, withCharacters, Request);
        return File(zip, "application/zip", fileName);
    }

    /// <summary>Create a new campaign from a .foliant file; the importer becomes its GM.</summary>
    [HttpPost("campaigns/import")]
    [Authorize(Roles = "GM,Admin")]
    [RequestSizeLimit(CampaignTransfer.MaxUpload)]
    [RequestFormLimits(MultipartBodyLengthLimit = CampaignTransfer.MaxUpload)]
    public async Task<ActionResult<CampaignTransfer.ImportResult>> Import(IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest(new { message = "No file." });
        var me = await _users.FindByIdAsync(UserId);
        try
        {
            await using var stream = file.OpenReadStream();
            return await _transfer.ImportAsync(stream, UserId, me?.DisplayName ?? "", Request);
        }
        catch (CampaignTransfer.ImportException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    // ── Members ──────────────────────────────────────────────────────────────
    /// <summary>GM removes a player. Their characters stay with the campaign (the GM can delete them).</summary>
    [HttpDelete("campaigns/{id:int}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(int id, string userId)
    {
        if (await RoleIn(id) != CampaignRoles.Gm) return NotFound();
        var m = await _db.CampaignMembers.FirstOrDefaultAsync(x => x.CampaignId == id && x.UserId == userId);
        if (m == null) return NotFound();
        if (m.Role == CampaignRoles.Gm) return BadRequest(new { message = "The GM cannot be removed." });
        _db.CampaignMembers.Remove(m);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>A player leaves. The GM must hand over the campaign (or delete it) instead.</summary>
    [HttpPost("campaigns/{id:int}/leave")]
    public async Task<IActionResult> Leave(int id)
    {
        var m = await _db.CampaignMembers.FirstOrDefaultAsync(x => x.CampaignId == id && x.UserId == UserId);
        if (m == null) return NotFound();
        if (m.Role == CampaignRoles.Gm) return BadRequest(new { message = "As GM, hand over or delete the campaign first." });
        _db.CampaignMembers.Remove(m);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Hand the GM role to another member (exactly one GM per campaign).</summary>
    [HttpPost("campaigns/{id:int}/transfer-gm")]
    public async Task<IActionResult> TransferGm(int id, TransferGmRequest req)
    {
        if (await RoleIn(id) != CampaignRoles.Gm) return NotFound();
        var members = await _db.CampaignMembers.Where(x => x.CampaignId == id && (x.UserId == UserId || x.UserId == req.UserId)).ToListAsync();
        var target = members.FirstOrDefault(x => x.UserId == req.UserId);
        if (target == null || req.UserId == UserId) return BadRequest(new { message = "Can only be handed over to another member." });
        target.Role = CampaignRoles.Gm;
        members.First(x => x.UserId == UserId).Role = CampaignRoles.Player;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Invites ──────────────────────────────────────────────────────────────
    private static InviteDto ToDto(CampaignInvite i) => new(i.Id, i.Code, i.CreatedAt, i.ExpiresAt, i.MaxUses, i.Uses, IsValid(i));

    [HttpGet("campaigns/{id:int}/invites")]
    public async Task<ActionResult<List<InviteDto>>> Invites(int id)
    {
        if (await RoleIn(id) != CampaignRoles.Gm) return NotFound();
        var list = await _db.CampaignInvites.AsNoTracking().Where(i => i.CampaignId == id && !i.Revoked)
            .OrderByDescending(i => i.CreatedAt).ToListAsync();
        return list.Select(ToDto).ToList();
    }

    [HttpPost("campaigns/{id:int}/invites")]
    public async Task<ActionResult<InviteDto>> CreateInvite(int id, CreateInviteRequest req)
    {
        if (await RoleIn(id) != CampaignRoles.Gm) return NotFound();
        var invite = new CampaignInvite
        {
            CampaignId = id, CreatedByUserId = UserId, MaxUses = req.MaxUses,
            Code = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(16)),   // 128 bit, unguessable
            ExpiresAt = req.ExpiresInDays is int d ? DateTime.UtcNow.AddDays(d) : null,
        };
        _db.CampaignInvites.Add(invite);
        await _db.SaveChangesAsync();
        return ToDto(invite);
    }

    [HttpDelete("campaigns/{id:int}/invites/{inviteId:int}")]
    public async Task<IActionResult> RevokeInvite(int id, int inviteId)
    {
        if (await RoleIn(id) != CampaignRoles.Gm) return NotFound();
        var invite = await _db.CampaignInvites.FirstOrDefaultAsync(i => i.Id == inviteId && i.CampaignId == id);
        if (invite == null) return NotFound();
        invite.Revoked = true;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Public: what an invite link leads to (shown before login/registration).</summary>
    [AllowAnonymous]
    [HttpGet("invites/{code}")]
    public async Task<ActionResult<InviteInfoDto>> InviteInfo(string code)
    {
        var invite = await _db.CampaignInvites.AsNoTracking().FirstOrDefaultAsync(i => i.Code == code);
        if (invite == null) return NotFound(new { message = "Invitation not found." });
        var c = await _db.Campaigns.AsNoTracking().FirstAsync(x => x.Id == invite.CampaignId);
        var gm = await _db.CampaignMembers.Where(m => m.CampaignId == c.Id && m.Role == CampaignRoles.Gm)
            .Select(m => m.User!.DisplayName).FirstOrDefaultAsync();
        return new InviteInfoDto(c.Name, SystemName(c.RuleSystemId), gm ?? "?", IsValid(invite));
    }

    /// <summary>Logged-in user joins via invite. Joining twice is harmless and doesn't use up the link.</summary>
    [HttpPost("invites/{code}/join")]
    public async Task<ActionResult<CampaignSummaryDto>> Join(string code)
    {
        var invite = await _db.CampaignInvites.FirstOrDefaultAsync(i => i.Code == code);
        if (invite == null) return BadRequest(new { message = "The invitation is invalid or has expired." });
        // Already a member: fine even if the link has run out meanwhile.
        if (await _db.CampaignMembers.AnyAsync(m => m.CampaignId == invite.CampaignId && m.UserId == UserId))
            return Ok(new { campaignId = invite.CampaignId });
        if (!IsValid(invite)) return BadRequest(new { message = "The invitation is invalid or has expired." });
        _db.CampaignMembers.Add(new CampaignMember { CampaignId = invite.CampaignId, UserId = UserId, Role = CampaignRoles.Player });
        invite.Uses++;
        await _db.SaveChangesAsync();
        return Ok(new { campaignId = invite.CampaignId });
    }

    /// <summary>Registration is only possible with a valid invite: creates a player account, joins the
    /// campaign and logs in.</summary>
    [AllowAnonymous]
    [HttpPost("invites/{code}/register")]
    public async Task<ActionResult<LoginResponse>> Register(string code, RegisterViaInviteRequest req)
    {
        var invite = await _db.CampaignInvites.FirstOrDefaultAsync(i => i.Code == code);
        if (invite == null || !IsValid(invite)) return BadRequest(new { message = "The invitation is invalid or has expired." });
        if (await _users.FindByNameAsync(req.Username) != null) return Conflict(new { message = "This username is already taken." });

        var user = new AppUser { UserName = req.Username, DisplayName = req.DisplayName.Trim() };
        var result = await _users.CreateAsync(user, req.Password);
        if (!result.Succeeded) return BadRequest(new { message = string.Join(" ", result.Errors.Select(e => e.Description)) });
        await _users.AddToRoleAsync(user, "Player");
        _db.CampaignMembers.Add(new CampaignMember { CampaignId = invite.CampaignId, UserId = user.Id, Role = CampaignRoles.Player });
        invite.Uses++;
        await _db.SaveChangesAsync();

        var roles = await _users.GetRolesAsync(user);
        return new LoginResponse(_jwt.Create(user, roles), user.Id, user.DisplayName, roles.ToArray(), false);
    }
}
