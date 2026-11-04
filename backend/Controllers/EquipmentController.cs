using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Dtos;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("equipment/{charId:int}")]
public class EquipmentController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly CharacterMapper _mapper;
    public EquipmentController(AppDbContext db, CharacterMapper mapper)
    {
        _db = db;
        _mapper = mapper;
    }

    private Task<Character?> OwnedChar(int charId) => _db.Characters
        .Include(c => c.Items).ThenInclude(i => i.Template)
        .Include(c => c.SkillRanks)
        .FirstOrDefaultAsync(c => c.Id == charId && c.UserId == UserId);

    // Returns the full character so the client can re-render stats immediately.
    [HttpPost("equip")]
    public async Task<ActionResult<CharacterDto>> Equip(int charId, EquipRequest req)
    {
        var c = await OwnedChar(charId);
        var item = c?.Items.FirstOrDefault(i => i.Id == req.InventoryItemId);
        if (c == null || item == null) return NotFound();
        var itemSlot = item.Template?.Slot;
        var fits = itemSlot == req.Slot ||
            (itemSlot == EquipSlot.Ring && (req.Slot == EquipSlot.Ring1 || req.Slot == EquipSlot.Ring2)) ||
            (itemSlot == EquipSlot.Earring && (req.Slot == EquipSlot.Earring1 || req.Slot == EquipSlot.Earring2));
        if (!fits)
            return BadRequest(new { message = "Item does not fit that slot." });

        int maxBefore = _mapper.MaxHp(c);
        // Unequip whatever currently occupies the target slot, then equip this one.
        foreach (var other in c.Items.Where(i => i.EquippedSlot == req.Slot && i != item))
        { other.EquippedSlot = null; other.EquippedAt = null; }
        item.EquippedSlot = req.Slot;
        item.EquippedAt ??= DateTime.UtcNow;   // moving between ring slots keeps the wear time
        _mapper.HpFollowsMax(c, maxBefore);

        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }

    [HttpPost("unequip")]
    public async Task<ActionResult<CharacterDto>> Unequip(int charId, UnequipRequest req)
    {
        var c = await OwnedChar(charId);
        var item = c?.Items.FirstOrDefault(i => i.Id == req.InventoryItemId);
        if (c == null || item == null) return NotFound();
        int maxBefore = _mapper.MaxHp(c);
        item.EquippedSlot = null;
        item.EquippedAt = null;
        _mapper.HpFollowsMax(c, maxBefore);
        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }
}
