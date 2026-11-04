using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Dtos;
using Foliant.Api.Hubs;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("characters/{charId:int}/status")]
public class StatusController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<NotificationHub> _hub;
    public StatusController(AppDbContext db, IHubContext<NotificationHub> hub) { _db = db; _hub = hub; }

    // The GM may manage status effects on every character.
    private Task<bool> Owns(int charId) =>
        _db.Characters.AnyAsync(c => c.Id == charId && (c.UserId == UserId || IsGm));

    /// <summary>Silently refresh the owner's view when someone else (the GM) changed their effects.</summary>
    private async Task NotifyOwner(int charId)
    {
        var ownerId = await _db.Characters.Where(c => c.Id == charId).Select(c => c.UserId).FirstAsync();
        if (ownerId != UserId)
            await _hub.Clients.Group(ownerId).SendAsync("notify", new { type = "character", characterId = charId });
    }

    private static StatusEffectDto ToDto(StatusEffect s) =>
        new(s.Id, s.Name, s.Description, s.Icon, s.Kind, s.ExpiresAt);

    [HttpGet]
    public async Task<ActionResult<List<StatusEffectDto>>> List(int charId)
    {
        if (!await Owns(charId)) return NotFound();
        // Drop expired effects on read so the list stays clean.
        var effects = await _db.StatusEffects.Where(s => s.CharacterId == charId).ToListAsync();
        var expired = effects.Where(s => s.ExpiresAt != null && s.ExpiresAt <= DateTime.UtcNow).ToList();
        if (expired.Count > 0)
        {
            _db.StatusEffects.RemoveRange(expired);
            await _db.SaveChangesAsync();
            effects = effects.Except(expired).ToList();
        }
        return effects.Select(ToDto).ToList();
    }

    [HttpPost]
    public async Task<ActionResult<StatusEffectDto>> Add(int charId, StatusEffectInput input)
    {
        if (!await Owns(charId)) return NotFound();
        var s = new StatusEffect
        {
            CharacterId = charId, Name = input.Name, Description = input.Description,
            Icon = string.IsNullOrWhiteSpace(input.Icon) ? "✨" : input.Icon,
            Kind = input.Kind == "debuff" ? "debuff" : "buff", ExpiresAt = input.ExpiresAt,
        };
        _db.StatusEffects.Add(s);
        await _db.SaveChangesAsync();
        await NotifyOwner(charId);
        return ToDto(s);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int charId, int id)
    {
        var s = await _db.StatusEffects.FirstOrDefaultAsync(x => x.Id == id && x.CharacterId == charId);
        if (s == null || !await Owns(charId)) return NotFound();
        _db.StatusEffects.Remove(s);
        await _db.SaveChangesAsync();
        await NotifyOwner(charId);
        return NoContent();
    }
}
