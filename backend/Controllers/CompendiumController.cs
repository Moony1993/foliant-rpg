using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Dtos;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("compendium")]
public class CompendiumController : ApiControllerBase
{
    private readonly AppDbContext _db;
    public CompendiumController(AppDbContext db) => _db = db;

    private static Dictionary<string, int> Levels(CompendiumSpell s)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, int>>(s.ClassLevelsJson) ?? new(); }
        catch { return new(); }
    }

    /// <summary>Browse spells, optionally filtered by casting class, grade, and name search.</summary>
    [HttpGet("spells")]
    public async Task<ActionResult<List<CompendiumSpellDto>>> Spells(
        [FromQuery] string? className, [FromQuery] int? grade, [FromQuery] string? search, [FromQuery] bool coreOnly = false)
    {
        var q = _db.CompendiumSpells.AsNoTracking();
        // "Core rulebook only" uses the sources the rule package names; a system without them has no such filter.
        var core = CampaignRules.Layout.CoreSources ?? Array.Empty<string>();
        if (!string.IsNullOrWhiteSpace(search))
            q = q.Where(s => s.Name.Contains(search));
        var all = await q.OrderBy(s => s.Name).ToListAsync();

        var result = new List<CompendiumSpellDto>();
        foreach (var s in all)
        {
            if (coreOnly && core.Count > 0 && !core.Any(c => s.Source.Contains(c, StringComparison.OrdinalIgnoreCase))) continue;
            var levels = Levels(s);
            // Grade for the requested class (or the lowest available if no class filter).
            int spellGrade;
            if (!string.IsNullOrWhiteSpace(className))
            {
                if (!levels.TryGetValue(className, out spellGrade)) continue;   // class can't cast it
            }
            else spellGrade = levels.Count > 0 ? levels.Values.Min() : 0;

            if (grade.HasValue && spellGrade != grade.Value) continue;
            // The list only needs a teaser; the full text is copied server-side when a spell is learned.
            var teaser = s.Description.Length > 240 ? s.Description[..240].TrimEnd() + "…" : s.Description;
            result.Add(new CompendiumSpellDto(s.Id, s.Name, s.School, spellGrade, teaser,
                s.Range, s.Duration, s.CastingTime, s.Components, s.SavingThrow, s.Damage,
                s.CreatedByUserId, s.CreatedByName, levels, s.Source));
        }
        return result;
    }

    /// <summary>Create a homebrew spell (any user). It joins the shared compendium for everyone.</summary>
    [HttpPost("spells")]
    public async Task<ActionResult<CompendiumSpellDto>> CreateSpell(CreateSpellRequest req)
    {
        var name = req.Name.Trim();
        if (await _db.CompendiumSpells.AnyAsync(s => s.Name == name))
            return Conflict(new { message = "A spell with this name already exists." });
        var levels = req.ClassLevels
            .Where(kv => !string.IsNullOrWhiteSpace(kv.Key))
            .ToDictionary(kv => kv.Key.Trim().ToLowerInvariant(), kv => Math.Clamp(kv.Value, 0, 9));
        if (levels.Count == 0) return BadRequest(new { message = "Give at least one class." });
        var author = (await _db.Users.FindAsync(UserId))?.DisplayName ?? "";
        var s = new CompendiumSpell
        {
            Name = name, School = req.School ?? "", Description = req.Description ?? "", Range = req.Range ?? "",
            Duration = req.Duration ?? "", CastingTime = req.CastingTime ?? "", Components = req.Components ?? "",
            SavingThrow = req.SavingThrow ?? "", Damage = req.Damage ?? "",
            ClassLevelsJson = JsonSerializer.Serialize(levels), CreatedByUserId = UserId, CreatedByName = author,
        };
        _db.CompendiumSpells.Add(s);
        await _db.SaveChangesAsync();
        return new CompendiumSpellDto(s.Id, s.Name, s.School, levels.Values.Min(), s.Description, s.Range, s.Duration,
            s.CastingTime, s.Components, s.SavingThrow, s.Damage, s.CreatedByUserId, s.CreatedByName, levels);
    }

    /// <summary>Delete a compendium spell: its creator, or a GM/Admin. Copies on characters stay.</summary>
    [HttpDelete("spells/{id:int}")]
    public async Task<IActionResult> DeleteSpell(int id)
    {
        var s = await _db.CompendiumSpells.FindAsync(id);
        if (s == null) return NotFound();
        // Official spells are shared by every campaign: only the instance admin removes them.
        if (s.CampaignId == null ? !IsAdmin : s.CreatedByUserId != UserId && !IsGm) return Forbid();
        _db.CompendiumSpells.Remove(s);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Copy a compendium spell into one of the character's spellbooks (grade resolved for that class).</summary>
    [HttpPost("/characters/{charId:int}/spells/from-compendium/{spellId:int}")]
    public async Task<ActionResult<SpellDto>> AddToCharacter(int charId, int spellId, [FromQuery] string? classId = null)
    {
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == charId && c.UserId == UserId);
        if (character == null) return NotFound();
        var src = await _db.CompendiumSpells.FindAsync(spellId);
        if (src == null) return NotFound();

        var levels = Levels(src);
        // The spell's level for the book's class, else for the first of the character's classes that has it, else its lowest.
        int grade = (classId != null && levels.TryGetValue(classId, out var own) ? own : (int?)null)
            ?? CharacterState.ClassLevels(character).Select(x => levels.TryGetValue(x.ClassId, out var g) ? g : (int?)null).FirstOrDefault(g => g != null)
            ?? (levels.Count > 0 ? levels.Values.Min() : 0);

        var spell = new Spell
        {
            CharacterId = charId, Name = src.Name, Description = src.Description, Grade = grade,
            Damage = src.Damage, Range = src.Range, Cost = src.Components, Duration = src.Duration,
            School = src.School, SavingThrow = src.SavingThrow, ClassId = classId?.Trim() ?? "",
        };
        _db.Spells.Add(spell);
        await _db.SaveChangesAsync();
        return new SpellDto(spell.Id, spell.Name, spell.Description, spell.Grade, spell.Damage,
            spell.Range, spell.Cost, spell.Duration, spell.Prepared, spell.School, spell.SavingThrow, spell.ClassId);
    }

    /// <summary>Bulk-import spells into the compendium (Admin/GM). Path for the full SRD dataset.</summary>
    [HttpPost("import")]
    [Authorize(Roles = "Admin")]   // official library, shared by all campaigns
    public async Task<IActionResult> Import(List<ImportSpellDto> spells, [FromQuery] bool replace = false)
    {
        // replace=true makes the import the single source of truth for official spells: matching
        // names are updated, official entries missing from the import (and duplicate rows) are
        // removed. Homebrew (CreatedByUserId set) is never touched, and characters keep their
        // learned spells — those are independent copies. Admin only: it rewrites the whole library.

        // The SRD import is PF1 data: work on PF1 rows only, whatever campaign the admin is in.
        var existing = await _db.CompendiumSpells.IgnoreQueryFilters().Where(s => s.RuleSystemId == "pf1e" && (s.CampaignId == null || s.CampaignId == _db.CurrentCampaignId)).ToListAsync();
        var byName = new Dictionary<string, CompendiumSpell>(StringComparer.OrdinalIgnoreCase);
        var duplicates = new List<CompendiumSpell>();
        foreach (var e in existing.Where(e => e.CreatedByUserId == null).OrderBy(e => e.Id))
            if (!byName.TryAdd(e.Name, e)) duplicates.Add(e);

        int added = 0, updated = 0, removed = 0;
        var imported = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var s in spells)
        {
            if (string.IsNullOrWhiteSpace(s.Name) || !imported.Add(s.Name)) continue;
            if (byName.TryGetValue(s.Name, out var row))
            {
                if (!replace) continue;  // plain import stays idempotent by name
                updated++;
            }
            else
            {
                if (existing.Any(e => e.CreatedByUserId != null && string.Equals(e.Name, s.Name, StringComparison.OrdinalIgnoreCase)))
                    continue;  // a homebrew spell already owns this name
                row = new CompendiumSpell();
                _db.CompendiumSpells.Add(row);
                added++;
            }
            row.Name = s.Name; row.School = s.School; row.Description = s.Description; row.Range = s.Range;
            row.Duration = s.Duration; row.CastingTime = s.CastingTime; row.Components = s.Components;
            row.SavingThrow = s.SavingThrow; row.Damage = s.Damage;
            if (s.Source != null) row.Source = s.Source;
            row.ClassLevelsJson = JsonSerializer.Serialize(s.ClassLevels ?? new());
        }
        if (replace)
        {
            var stale = byName.Values.Where(e => !imported.Contains(e.Name)).Concat(duplicates).ToList();
            _db.CompendiumSpells.RemoveRange(stale);
            removed = stale.Count;
        }
        await _db.SaveChangesAsync();
        return Ok(new { added, updated, removed, total = await _db.CompendiumSpells.IgnoreQueryFilters().CountAsync(s => s.RuleSystemId == "pf1e" && s.CampaignId == null) });
    }
}
