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
[Route("characters/{charId:int}/companions")]
public class CompanionsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly CharacterMapper _mapper;
    private readonly RuleSystemRegistry _rules;
    public CompanionsController(AppDbContext db, CharacterMapper mapper, RuleSystemRegistry rules) { _db = db; _mapper = mapper; _rules = rules; }

    /// <summary>Companion rules of the master's system; without them companions are free-form entries.</summary>
    private ICompanionRules? Rules(Character master) => _rules.For(master.RuleSystemId).Capability<ICompanionRules>();
    private IReadOnlyDictionary<string, int> AllowedKinds(Character master) =>
        Rules(master)?.Allowed(master) ?? new Dictionary<string, int>();

    private Task<Character?> Master(int charId) =>
        _db.Characters.Include(c => c.Items).ThenInclude(i => i.Template)
            .FirstOrDefaultAsync(c => c.Id == charId && c.UserId == UserId);

    // Class companions get their bond numbers from the master's level and feature choices.
    private CompanionDto ToDto(Companion c, Character master)
    {
        var rules = Rules(master);
        var bond = rules != null && AllowedKinds(master).TryGetValue(c.Type, out var lvl)
            ? rules.Bond(c.Type, lvl, _mapper.ToDto(master).Derived.MaxHp) : null;
        return new(c.Id, c.Name, c.Type, c.Description, c.Hp, c.Ac, c.Speed, bond,
            rules?.Kinds.Contains(c.Type) == true && bond == null);
    }

    /// <summary>A class companion kind needs the matching class feature choice; one of each kind.</summary>
    private async Task<string?> Invalid(Character master, string type, int? exceptId)
    {
        if (Rules(master)?.Kinds.Contains(type) != true) return null;
        if (!AllowedKinds(master).ContainsKey(type))
            return $"\"{type}\" requires the matching class feature (dashboard).";
        if (await _db.Companions.AnyAsync(x => x.CharacterId == master.Id && x.Type == type && x.Id != exceptId))
            return $"There already is a {type}.";
        return null;
    }

    [HttpGet]
    public async Task<ActionResult<List<CompanionDto>>> List(int charId)
    {
        var master = await Master(charId);
        if (master == null) return NotFound();
        return (await _db.Companions.AsNoTracking().Where(c => c.CharacterId == charId).ToListAsync())
            .Select(c => ToDto(c, master)).ToList();
    }

    /// <summary>Class companion kinds this character may have now (for the type picker).</summary>
    [HttpGet("kinds")]
    public async Task<ActionResult<List<string>>> Kinds(int charId)
    {
        var master = await Master(charId);
        if (master == null) return NotFound();
        return AllowedKinds(master).Keys.ToList();
    }

    [HttpPost]
    public async Task<ActionResult<CompanionDto>> Add(int charId, CompanionInput input)
    {
        var master = await Master(charId);
        if (master == null) return NotFound();
        if (await Invalid(master, input.Type, null) is string error) return BadRequest(new { message = error });
        var c = new Companion
        {
            CharacterId = charId, Name = input.Name, Type = input.Type,
            Description = input.Description, Hp = input.Hp, Ac = input.Ac, Speed = input.Speed,
        };
        _db.Companions.Add(c);
        await _db.SaveChangesAsync();
        return ToDto(c, master);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CompanionDto>> Update(int charId, int id, CompanionInput input)
    {
        var master = await Master(charId);
        var c = await _db.Companions.FirstOrDefaultAsync(x => x.Id == id && x.CharacterId == charId);
        if (c == null || master == null) return NotFound();
        if (input.Type != c.Type && await Invalid(master, input.Type, id) is string error) return BadRequest(new { message = error });
        c.Name = input.Name; c.Type = input.Type; c.Description = input.Description;
        c.Hp = input.Hp; c.Ac = input.Ac; c.Speed = input.Speed;
        await _db.SaveChangesAsync();
        return ToDto(c, master);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int charId, int id)
    {
        var c = await _db.Companions.FirstOrDefaultAsync(x => x.Id == id && x.CharacterId == charId);
        if (c == null || await Master(charId) == null) return NotFound();
        _db.Companions.Remove(c);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
