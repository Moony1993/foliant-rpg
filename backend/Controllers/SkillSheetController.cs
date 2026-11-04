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
[Route("characters/{charId:int}/skillsheet")]
public class SkillSheetController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly RuleSystemRegistry _rules;
    public SkillSheetController(AppDbContext db, RuleSystemRegistry rules)
    {
        _db = db;
        _rules = rules;
    }

    private Task<Character?> OwnedChar(int charId, bool track = true)
    {
        IQueryable<Character> q = _db.Characters
            .Include(c => c.Items).ThenInclude(i => i.Template)
            .Include(c => c.SkillRanks);
        if (!track) q = q.AsNoTracking();
        return q.FirstOrDefaultAsync(c => c.Id == charId && c.UserId == UserId);
    }

    private SkillSheetDto BuildSheet(Character c)
    {
        var rules = _rules.For(c.RuleSystemId);
        var bonuses = CharacterMapper.EquipmentBonuses(c);
        // Proficiency systems (no ranks): rows come straight from the rules; nothing to spend.
        if (rules.Capability<ISkillRankRules>() == null && rules.Capability<ISkillValueRules>() is { } valueRules)
        {
            var proficiencyRows = valueRules.SkillValues(c, bonuses).Select(v => new SkillRowDto(v.Key, v.Name, v.Ability,
                v.Proficient, false, false, v.Expertise ? 2 : v.Proficient ? 1 : 0, v.Total)).ToList();
            return new SkillSheetDto(proficiencyRows, 0, 0, 0);
        }
        if (rules.Capability<ISkillRankRules>() is not { } rankRules) return new SkillSheetDto(new(), 0, 0, 0);
        var rows = rankRules.Sheet(c, bonuses, CharacterMapper.CarriedWeight(c)).Select(r => new SkillRowDto(r.Key, r.Name, r.Ability, r.IsClassSkill,
            r.TrainedOnly, r.ArmorCheck, r.Ranks, r.Total)).ToList();
        int spent = c.SkillRanks.Sum(s => s.Ranks);
        return new SkillSheetDto(rows, PointsAvailable(c, rules), spent, Math.Max(1, c.Level));
    }

    // Total skill points over the character's career: (class base + Int mod, min 1) per level,
    // + 1 per level for humans (racial "Skilled"). PF1e rule: a permanent Int increase (level-up
    // ability increase, inherent bonus) applies retroactively to every level — unlike some other d20 rules —
    // so the current base Int is correct here, no per-level history needed. An item's Int bonus
    // (headband of vast intelligence) is
    // counted only once it is permanent: PF1e ability bonuses lasting > 1 day count for skill points
    // after being worn 24 hours (real time, like status-effect durations).
    private static int PointsAvailable(Character c, IRuleSystem rules)
    {
        var cutoff = DateTime.UtcNow.AddHours(-24);
        int settledInt = CharacterMapper.EquipmentBonuses(c, i => i.EquippedAt <= cutoff).GetValueOrDefault("Int");
        var permanent = rules.Compute(c, new Dictionary<string, int> { ["Int"] = settledInt }, 0);
        return rules.Capability<ISkillRankRules>()?.SkillPoints(c, permanent.Modifiers.GetValueOrDefault("Int")) ?? 0;
    }

    [HttpGet]
    public async Task<ActionResult<SkillSheetDto>> Get(int charId)
    {
        var c = await OwnedChar(charId, track: false);
        return c == null ? NotFound() : BuildSheet(c);
    }

    // Set ranks for one skill. Ranks are capped at character level (PF1e max ranks per skill).
    [HttpPut]
    public async Task<ActionResult<SkillSheetDto>> SetRank(int charId, SetRankRequest req)
    {
        var c = await OwnedChar(charId);
        if (c == null) return NotFound();
        var rules = _rules.For(c.RuleSystemId);
        if (rules.Capability<ISkillRankRules>() is not { } rankRules)
            return BadRequest(new { message = "This rule system has no skill ranks." });
        var key = rankRules.NormalizeKey(req.SkillKey ?? "");
        if (key == null)
            return BadRequest(new { message = "Unknown skill." });

        int ranks = Math.Clamp(req.Ranks, 0, Math.Max(1, c.Level));
        var existing = c.SkillRanks.FirstOrDefault(s => string.Equals(s.SkillKey, key, StringComparison.OrdinalIgnoreCase));
        // Multi skills take ranks per type; the plain key can only shrink (legacy ranks).
        if (rankRules.IsMultiSkill(key) && ranks > (existing?.Ranks ?? 0))
            return BadRequest(new { message = "Please choose a kind first." });

        // Enforce the point budget: can't spend more ranks than the character has available.
        int available = PointsAvailable(c, rules);
        int prospectiveSpent = c.SkillRanks.Sum(s => s.Ranks) - (existing?.Ranks ?? 0) + ranks;
        if (prospectiveSpent > available)
            return BadRequest(new { message = $"Nicht genug Fertigkeitspunkte ({prospectiveSpent}/{available} belegt)." });

        if (ranks == 0)
        {
            if (existing != null) _db.CharacterSkills.Remove(existing);
        }
        else if (existing != null)
        {
            existing.Ranks = ranks;
        }
        else
        {
            var added = new CharacterSkill { CharacterId = charId, SkillKey = key, Ranks = ranks };
            _db.CharacterSkills.Add(added);
            c.SkillRanks.Add(added);
        }
        await _db.SaveChangesAsync();
        return BuildSheet(c);
    }
}
