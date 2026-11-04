using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Dtos;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("inventory/{charId:int}")]
public class InventoryController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly CharacterMapper _mapper;
    private readonly RuleSystemRegistry _rules;
    public InventoryController(AppDbContext db, CharacterMapper mapper, RuleSystemRegistry rules)
    {
        _db = db;
        _mapper = mapper;
        _rules = rules;
    }

    private Task<Character?> OwnedChar(int charId) => _db.Characters
        .Include(c => c.Items).ThenInclude(i => i.Template)
        .FirstOrDefaultAsync(c => c.Id == charId && c.UserId == UserId);

    private Task<Character?> OwnedCharForUse(int charId) => _db.Characters
        .Include(c => c.Items).ThenInclude(i => i.Template)
        .Include(c => c.SkillRanks)
        .FirstOrDefaultAsync(c => c.Id == charId && c.UserId == UserId);

    [HttpPost("items")]
    public async Task<ActionResult<InventoryItemDto>> Add(int charId, AddItemRequest req)
    {
        var c = await OwnedChar(charId);
        if (c == null) return NotFound();
        var template = await _db.ItemTemplates.FindAsync(req.ItemTemplateId);
        if (template == null) return BadRequest(new { message = "Unknown item template." });

        var item = new InventoryItem
        {
            CharacterId = charId, ItemTemplateId = req.ItemTemplateId,
            Quantity = Math.Max(1, req.Quantity), GridIndex = req.GridIndex,
        };
        _db.InventoryItems.Add(item);
        await _db.SaveChangesAsync();
        item.Template = template;
        return CharacterMapper.ToItemDto(item);
    }

    [HttpPut("move")]
    public async Task<IActionResult> Move(int charId, MoveItemRequest req)
    {
        var c = await OwnedChar(charId);
        var item = c?.Items.FirstOrDefault(i => i.Id == req.InventoryItemId);
        if (item == null) return NotFound();
        item.GridIndex = req.GridIndex;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Attune to (or end attunement with) an item that requires it, within the system's limit.</summary>
    [HttpPatch("items/{itemId:int}/attune")]
    public async Task<ActionResult<CharacterDto>> Attune(int charId, int itemId, AttuneRequest req)
    {
        var c = await OwnedCharForUse(charId);
        var item = c?.Items.FirstOrDefault(i => i.Id == itemId);
        if (c == null || item?.Template == null) return NotFound();
        if (_rules.For(c.RuleSystemId).Capability<IAttunementRules>() is not { AttunementLimit: > 0 } att)
            return BadRequest(new { message = "This rule system has no attunement." });
        if (!item.Template.RequiresAttunement) return BadRequest(new { message = "This item needs no attunement." });
        if (req.Attuned && !item.Attuned && c.Items.Count(i => i.Attuned) >= att.AttunementLimit)
            return BadRequest(new { message = $"You are already attuned to {att.AttunementLimit} items." });
        int maxBefore = _mapper.MaxHp(c);
        item.Attuned = req.Attuned;
        _mapper.HpFollowsMax(c, maxBefore);
        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }

    [HttpDelete("items/{itemId:int}")]
    public async Task<IActionResult> Delete(int charId, int itemId)
    {
        var c = await OwnedChar(charId);
        var item = c?.Items.FirstOrDefault(i => i.Id == itemId);
        if (item == null) return NotFound();
        _db.InventoryItems.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("items/{itemId:int}/use")]
    public async Task<ActionResult<CharacterDto>> Use(int charId, int itemId)
    {
        var c = await OwnedCharForUse(charId);
        if (c == null) return NotFound();
        var item = c.Items.FirstOrDefault(i => i.Id == itemId);
        if (item?.Template == null) return NotFound();
        if (!item.Template.IsUsable) return BadRequest(new { message = "This item cannot be used." });

        var derived = _mapper.ToDto(c).Derived;
        Dictionary<string, int>? effects;
        try { effects = JsonSerializer.Deserialize<Dictionary<string, int>>(item.Template.UseEffectsJson); }
        catch { effects = null; }   // ignore malformed effects rather than 500
        if (effects != null)
        {
            if (effects.TryGetValue("CurrentHp", out var hpDelta))
                c.CurrentHp = Math.Clamp(c.CurrentHp + hpDelta, 0, derived.MaxHp);
            if (effects.TryGetValue("CurrentMana", out var manaDelta))
                c.CurrentMana = Math.Max(0, c.CurrentMana + manaDelta);
        }

        if (!string.IsNullOrWhiteSpace(item.Template.UseStatusEffectName))
        {
            _db.StatusEffects.Add(new StatusEffect
            {
                CharacterId = charId,
                Name = item.Template.UseStatusEffectName,
                Description = item.Template.UseStatusEffectDescription,
                Icon = string.IsNullOrWhiteSpace(item.Template.UseStatusEffectIcon) ? "✨" : item.Template.UseStatusEffectIcon,
                Kind = item.Template.UseStatusEffectKind == "debuff" ? "debuff" : "buff",
                ExpiresAt = item.Template.UseStatusEffectDurationMinutes is int m ? DateTime.UtcNow.AddMinutes(m) : null,
            });
        }

        item.Quantity -= 1;
        if (item.Quantity <= 0) _db.InventoryItems.Remove(item);

        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }
}
