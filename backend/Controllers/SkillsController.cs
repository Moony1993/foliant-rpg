using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Dtos;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("characters/{charId:int}/skills")]
public class SkillsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    public SkillsController(AppDbContext db) => _db = db;

    private Task<bool> Owns(int charId) =>
        _db.Characters.AnyAsync(c => c.Id == charId && c.UserId == UserId);

    private static SkillDto ToDto(Skill s) => new(s.Id, s.Name, s.Description, s.Type, s.Rank,
        s.MaxRank, s.Cooldown, s.IsPassive, s.Unlocked, s.RequiresSkillId, s.Tier);

    [HttpGet]
    public async Task<ActionResult<List<SkillDto>>> List(int charId)
    {
        if (!await Owns(charId)) return NotFound();
        return (await _db.Skills.AsNoTracking().Where(s => s.CharacterId == charId).OrderBy(s => s.Tier).ThenBy(s => s.Id).ToListAsync())
            .Select(ToDto).ToList();
    }

    [HttpPost]
    public async Task<ActionResult<SkillDto>> Create(int charId, SkillInput input)
    {
        if (!await Owns(charId)) return NotFound();
        var s = new Skill { CharacterId = charId };
        Apply(s, input);
        _db.Skills.Add(s);
        await _db.SaveChangesAsync();
        return ToDto(s);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<SkillDto>> Update(int charId, int id, SkillInput input)
    {
        var s = await _db.Skills.FirstOrDefaultAsync(x => x.Id == id && x.CharacterId == charId);
        if (s == null || !await Owns(charId)) return NotFound();
        Apply(s, input);
        await _db.SaveChangesAsync();
        return ToDto(s);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int charId, int id)
    {
        var s = await _db.Skills.FirstOrDefaultAsync(x => x.Id == id && x.CharacterId == charId);
        if (s == null || !await Owns(charId)) return NotFound();
        _db.Skills.Remove(s);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Unlock respects the tree: a skill unlocks only if its prerequisite is already unlocked.
    [HttpPost("{id:int}/unlock")]
    public async Task<ActionResult<SkillDto>> Unlock(int charId, int id)
    {
        var s = await _db.Skills.FirstOrDefaultAsync(x => x.Id == id && x.CharacterId == charId);
        if (s == null || !await Owns(charId)) return NotFound();
        if (s.RequiresSkillId is int reqId)
        {
            var prereq = await _db.Skills.FirstOrDefaultAsync(x => x.Id == reqId && x.CharacterId == charId);
            if (prereq is null || !prereq.Unlocked)
                return BadRequest(new { message = "Prerequisite is not unlocked yet." });
        }
        s.Unlocked = true;
        await _db.SaveChangesAsync();
        return ToDto(s);
    }

    private static void Apply(Skill s, SkillInput i)
    {
        s.Name = i.Name; s.Description = i.Description; s.Type = i.Type;
        s.Rank = i.Rank; s.MaxRank = i.MaxRank; s.Cooldown = i.Cooldown;
        s.IsPassive = i.IsPassive; s.Unlocked = i.Unlocked;
        s.RequiresSkillId = i.RequiresSkillId; s.Tier = i.Tier;
    }
}
