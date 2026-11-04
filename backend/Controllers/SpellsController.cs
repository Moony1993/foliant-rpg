using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Dtos;
using Foliant.Api.Services;
using System.Text.Json;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("characters/{charId:int}/spells")]
public class SpellsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly RuleSystemRegistry _rules;
    public SpellsController(AppDbContext db, RuleSystemRegistry rules)
    {
        _db = db;
        _rules = rules;
    }

    private Task<bool> Owns(int charId) =>
        _db.Characters.AnyAsync(c => c.Id == charId && c.UserId == UserId);

    // Load the character with equipment so casting-stat item bonuses count toward slots.
    private Task<Character?> OwnedWithItems(int charId, bool track = true)
    {
        IQueryable<Character> q = _db.Characters
            .Include(c => c.Items).ThenInclude(i => i.Template);
        if (!track) q = q.AsNoTracking();
        return q.FirstOrDefaultAsync(c => c.Id == charId && c.UserId == UserId);
    }

    private static SpellDto ToDto(Spell s) => new(s.Id, s.Name, s.Description, s.Grade,
        s.Damage, s.Range, s.Cost, s.Duration, s.Prepared, s.School, s.SavingThrow, s.ClassId);

    [HttpGet]
    public async Task<ActionResult<List<SpellDto>>> List(int charId)
    {
        if (!await Owns(charId)) return NotFound();
        return (await _db.Spells.AsNoTracking().Where(s => s.CharacterId == charId).OrderBy(s => s.Grade).ThenBy(s => s.Name).ToListAsync())
            .Select(ToDto).ToList();
    }

    [HttpPost]
    public async Task<ActionResult<SpellDto>> Create(int charId, SpellInput input)
    {
        if (!await Owns(charId)) return NotFound();
        var s = new Spell { CharacterId = charId };
        Apply(s, input);
        _db.Spells.Add(s);
        await _db.SaveChangesAsync();
        return ToDto(s);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<SpellDto>> Update(int charId, int id, SpellInput input)
    {
        var s = await _db.Spells.FirstOrDefaultAsync(x => x.Id == id && x.CharacterId == charId);
        if (s == null || !await Owns(charId)) return NotFound();
        Apply(s, input);
        await _db.SaveChangesAsync();
        return ToDto(s);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int charId, int id)
    {
        var s = await _db.Spells.FirstOrDefaultAsync(x => x.Id == id && x.CharacterId == charId);
        if (s == null || !await Owns(charId)) return NotFound();
        _db.Spells.Remove(s);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---- Spell slots (derived from class + level + casting ability) ----
    [HttpGet("/characters/{charId:int}/spellslots")]
    public async Task<ActionResult<List<SpellSlotDto>>> Slots(int charId)
    {
        var c = await OwnedWithItems(charId, track: false);
        if (c == null) return NotFound();
        var result = new List<SpellSlotDto>();
        bool pool = false;
        foreach (var classId in _rules.For(c.RuleSystemId).CastingClassIds(c))
        {
            var book = await Spellbook(c, ReadState(c), classId);
            if (book.Shared && pool) continue;   // the shared pool once, not per class
            pool |= book.Shared;
            result.AddRange(book.Grades.Where(g => g.Grade > 0).Select(g => new SpellSlotDto(g.Grade, g.Total, Spent(book, g.Grade), book.Shared ? null : classId)));
        }
        return result;
    }

    // ---- Spell tracker ----
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static SpellStateDto ReadState(Character c)
    {
        try { return JsonSerializer.Deserialize<SpellStateDto>(c.SpellStateJson, Json) ?? Empty(); }
        catch (JsonException) { return Empty(); }
    }
    private static SpellStateDto Empty() => new(new(), new());

    private static int Spent(SpellbookDto b, int grade) => b.Type == "prepared"
        ? b.State.Prepared.GetValueOrDefault(grade)?.Count(s => s.Used) ?? 0
        : b.State.Used.GetValueOrDefault(grade);

    /// <summary>Derived slot counts + the stored state, normalised against them: prepared lists
    /// are trimmed/padded to the slot count (a level-down or lower casting stat shrinks them),
    /// spells that no longer exist or are above the slot's grade are dropped, counts clamped.</summary>
    /// <param name="stored">The whole stored state (every class); the book's own part is read from it.</param>
    private async Task<SpellbookDto> Spellbook(Character c, SpellStateDto stored, string? requestedClass = null)
    {
        var rules = _rules.For(c.RuleSystemId);
        // One spellbook per casting class; the first one's state is the top level (as before multiclassing).
        var casting = rules.CastingClassIds(c).ToList();
        var classId = casting.FirstOrDefault(x => x.Equals(requestedClass, StringComparison.OrdinalIgnoreCase)) ?? casting.FirstOrDefault();
        bool first = classId == null || classId == casting[0];
        var state = first ? stored : stored.Classes?.GetValueOrDefault(classId!) ?? Empty();
        var info = rules.Spellcasting(c, classId);
        // Performances go into their class's book (the first book when that class doesn't cast).
        var perfRules = rules.Capability<IPerformanceRules>();
        var perfClass = perfRules?.PerformanceClass(c);
        bool hasPerformance = perfClass != null && (perfClass.Equals(classId, StringComparison.OrdinalIgnoreCase) || first && !casting.Contains(perfClass));
        var performance = hasPerformance ? perfRules!.Performance(c, CharacterMapper.EquipmentBonuses(c)) : null;
        int roundsUsed = Math.Clamp(stored.PerformanceRoundsUsed, 0, 999);
        if (info == null) return new SpellbookDto(null, new(), Empty() with { PerformanceRoundsUsed = roundsUsed }, Performance: performance);

        var slots = rules.SpellSlots(c, CharacterMapper.EquipmentBonuses(c), classId);
        // Classes that share a pool (5e multiclassing) cast their prepared or known spells from the pool's slots.
        var shared = rules.SharedSpellSlots(c, CharacterMapper.EquipmentBonuses(c)) is { } pool
            && pool.Classes.Contains(classId!, StringComparer.OrdinalIgnoreCase) ? pool : null;
        bool prepare = info.Prepared && shared == null;
        var grades = new List<SpellGradeDto>();
        if (info.Prepared ? info.Cantrips > 0 : info.Known?[0] > 0)
            grades.Add(new SpellGradeDto(0, prepare ? info.Cantrips : 0, 0, info.Prepared ? (shared == null ? null : info.Cantrips) : info.Known?[0]));
        if (shared == null)
            grades.AddRange(slots.OrderBy(s => s.Grade)
                .Select(s => new SpellGradeDto(s.Grade, s.Total, s.Special, info.Known?[s.Grade])));
        else
            grades.AddRange(shared.Slots.OrderBy(kv => kv.Key)
                .Select(kv => new SpellGradeDto(kv.Key, kv.Value, 0, info.Prepared || info.Known?[kv.Key] is null or < 0 ? null : info.Known[kv.Key])));

        // Missing keys (stored "{}", partial client payloads) deserialize as null.
        var prepIn = state.Prepared ?? new();
        var usedIn = (shared == null ? state.Used : stored.SharedUsed) ?? new();
        // The book's spells: its own, and in the first book those without a (known) class.
        var spells = (await _db.Spells.AsNoTracking().Where(s => s.CharacterId == c.Id).ToListAsync())
            .Where(s => s.ClassId.Equals(classId, StringComparison.OrdinalIgnoreCase) || first && !casting.Contains(s.ClassId, StringComparer.OrdinalIgnoreCase)).ToList();
        var spellGrade = spells.ToDictionary(s => s.Id, s => s.Grade);
        // Domain/school slot, opposition schools, bloodline spells — only systems that have them.
        var specials = rules.Capability<ISpellSpecialRules>()?.Specials(c, spells, classId) ?? new SpellSpecials(null, new(), new());
        var specialIds = specials.SpecialSlotIds;
        var oppositionIds = specials.OppositionIds;
        var bloodlineIds = specials.BonusKnownIds;
        var prepared = new Dictionary<int, List<PreparedSlotDto>>();
        var used = new Dictionary<int, int>();
        foreach (var g in grades)
        {
            if (prepare)
            {
                var have = prepIn.GetValueOrDefault(g.Grade) ?? new();
                prepared[g.Grade] = Enumerable.Range(0, g.Total).Select(i =>
                {
                    var s = i < have.Count ? have[i] : null;
                    var ok = s?.SpellId is int id && spellGrade.TryGetValue(id, out var sg) && sg <= g.Grade
                        // the last Special slots of a grade only take domain/school spells
                        && (i < g.Total - g.Special || specialIds == null || specialIds.Contains(id));
                    // Cantrips are never used up (PF1e: cast at will).
                    return ok ? new PreparedSlotDto(s!.SpellId, s.Used && g.Grade > 0) : new PreparedSlotDto(null, false);
                }).ToList();
            }
            else if (g.Grade > 0)
                used[g.Grade] = Math.Clamp(usedIn.GetValueOrDefault(g.Grade), 0, g.Total);
        }
        var ability = rules.CastingAbility(c, classId);
        int castingMod = ability == null ? 0
            : rules.Compute(c, CharacterMapper.EquipmentBonuses(c), 0).Modifiers.GetValueOrDefault(ability);
        return new SpellbookDto(prepare ? "prepared" : "spontaneous", grades,
            new(prepared, used, roundsUsed),
            ability, castingMod, rules.CasterLevel(c, classId), specialIds, oppositionIds, bloodlineIds, performance,
            classId, casting.Count > 1 ? casting : null, shared != null);
    }

    [HttpGet("/characters/{charId:int}/spellbook")]
    public async Task<ActionResult<SpellbookDto>> GetSpellbook(int charId, [FromQuery] string? classId = null)
    {
        var c = await OwnedWithItems(charId, track: false);
        if (c == null) return NotFound();
        return await Spellbook(c, ReadState(c), classId);
    }

    /// <summary>Replaces the tracker state (prepare, cast, rest are all client-side edits of it);
    /// stored normalised, so the client can't exceed its slots or slot foreign spells.</summary>
    [HttpPut("/characters/{charId:int}/spellbook")]
    public async Task<ActionResult<SpellbookDto>> SaveSpellbook(int charId, SpellStateDto state, [FromQuery] string? classId = null)
    {
        var c = await OwnedWithItems(charId);
        if (c == null) return NotFound();
        // The client sends one book's state; the other books stay as stored.
        var stored = ReadState(c);
        var casting = _rules.For(c.RuleSystemId).CastingClassIds(c);
        var id = casting.FirstOrDefault(x => x.Equals(classId, StringComparison.OrdinalIgnoreCase)) ?? casting.FirstOrDefault();
        bool first = id == null || id == casting[0];
        var incoming = state with { Classes = null };
        // A book on a shared pool sends the pool's counters as its Used.
        var probe = stored with { SharedUsed = incoming.Used };
        var book = await Spellbook(c, first ? incoming with { Classes = stored.Classes, SharedUsed = incoming.Used }
            : probe with { Classes = new(stored.Classes ?? new()) { [id!] = incoming } }, id);
        var own = book.Shared ? (first ? stored with { Classes = null } : stored.Classes?.GetValueOrDefault(id!) ?? Empty()) : book.State;
        var classes = new Dictionary<string, SpellStateDto>(stored.Classes ?? new());
        if (!first) classes[id!] = own with { PerformanceRoundsUsed = 0, Classes = null, SharedUsed = null };
        // Performance rounds belong to the book that shows the performances.
        int rounds = book.Performance != null ? Math.Clamp(incoming.PerformanceRoundsUsed, 0, 999) : stored.PerformanceRoundsUsed;
        var whole = (first ? own : stored) with { PerformanceRoundsUsed = rounds };
        c.SpellStateJson = JsonSerializer.Serialize(whole with
        {
            Classes = classes.Count > 0 ? classes : null,
            SharedUsed = book.Shared ? book.State.Used : stored.SharedUsed,
        }, Json);
        await _db.SaveChangesAsync();
        return book with { State = book.State with { PerformanceRoundsUsed = rounds } };
    }

    private static void Apply(Spell s, SpellInput i)
    {
        s.Name = i.Name; s.Description = i.Description; s.Grade = i.Grade; s.Damage = i.Damage;
        s.Range = i.Range; s.Cost = i.Cost; s.Duration = i.Duration; s.Prepared = i.Prepared;
        s.School = i.School; s.SavingThrow = i.SavingThrow; s.ClassId = i.ClassId.Trim();
    }
}
