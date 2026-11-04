using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Dtos;
using Foliant.Api.Hubs;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("characters")]
public class CharactersController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly CharacterMapper _mapper;
    private readonly IHubContext<NotificationHub> _hub;
    private readonly RuleSystemRegistry _rules;
    public CharactersController(AppDbContext db, CharacterMapper mapper, IHubContext<NotificationHub> hub, RuleSystemRegistry rules)
    {
        _db = db;
        _mapper = mapper;
        _hub = hub;
        _rules = rules;
    }

    private IQueryable<Character> Owned() => _db.Characters
        .Include(c => c.Items).ThenInclude(i => i.Template)
        .Include(c => c.SkillRanks)
        .Where(c => c.UserId == UserId);

    /// <summary>Own characters, or any character for the GM (HP, rest at the table).</summary>
    private IQueryable<Character> Editable() => _db.Characters
        .Include(c => c.Items).ThenInclude(i => i.Template)
        .Include(c => c.SkillRanks)
        .Where(c => c.UserId == UserId || IsGm);

    /// <summary>Silently refresh the owner's view when the GM changed their character.</summary>
    private Task NotifyOwner(Character c) => c.UserId == UserId
        ? Task.CompletedTask
        : _hub.Clients.Group(c.UserId).SendAsync("notify", new { type = "character", characterId = c.Id });

    [HttpGet]
    public async Task<ActionResult<List<CharacterDto>>> List() =>
        (await Owned().AsNoTracking().ToListAsync()).Select(_mapper.ToDto).ToList();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CharacterDto>> Get(int id)
    {
        var c = await Owned().AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
        return c == null ? NotFound() : _mapper.ToDto(c);
    }

    [HttpPost]
    public async Task<ActionResult<CharacterDto>> Create(CharacterInput input)
    {
        // The campaign decides the rule system, not the client.
        var c = new Character { UserId = UserId, RuleSystemId = Campaign.RuleSystemId };
        Apply(c, input, favoredClassOpen: true);   // creation = choosing the 1st-level bonus
        c.CurrentHp = _mapper.ToDto(c).Derived.MaxHp;   // new characters start at full HP
        _db.Characters.Add(c);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = c.Id }, _mapper.ToDto(c));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CharacterDto>> Update(int id, CharacterInput input)
    {
        var c = await Owned().FirstOrDefaultAsync(c => c.Id == id);
        if (c == null) return NotFound();
        // Favored class bonuses can only be assigned while a GM-granted level up is pending.
        // The level belongs to the GM (level up / down); a player's save keeps it.
        int keepLevel = c.Level, maxBefore = _mapper.MaxHp(c);
        Apply(c, input, favoredClassOpen: c.PendingLevelUp);
        if (!IsGm) c.Level = keepLevel;
        _mapper.HpFollowsMax(c, maxBefore);
        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }

    /// <summary>
    /// Live preview while editing: the derived values the input would give, with the character's
    /// equipment and feats (when <paramref name="id"/> is set). Nothing is saved — the server is the
    /// only place that computes rules, the client just shows the result.
    /// </summary>
    [HttpPost("preview")]
    public async Task<ActionResult<DerivedStats>> Preview(CharacterInput input, [FromQuery] int? id)
    {
        Character c;
        if (id != null)
        {
            var existing = await Owned().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (existing == null) return NotFound();
            c = existing;
            int keepLevel = c.Level;
            Apply(c, input, favoredClassOpen: c.PendingLevelUp);
            if (!IsGm) c.Level = keepLevel;
        }
        else
        {
            c = new Character { UserId = UserId, RuleSystemId = Campaign.RuleSystemId };
            Apply(c, input, favoredClassOpen: true);
        }
        return _mapper.ToDto(c).Derived;
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var c = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id && c.UserId == UserId);
        if (c == null) return NotFound();
        _db.Characters.Remove(c);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Player acknowledges a GM-granted level up (clears the pending badge).</summary>
    [HttpPost("{id:int}/ack-levelup")]
    public async Task<IActionResult> AckLevelUp(int id)
    {
        var c = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id && c.UserId == UserId);
        if (c == null) return NotFound();
        c.PendingLevelUp = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Adjust current HP by a delta (positive = heal, negative = damage). Clamps to 0..maxHp.</summary>
    [HttpPatch("{id:int}/hp")]
    public async Task<ActionResult<HpResult>> UpdateHp(int id, HpUpdateRequest req)
    {
        var c = await Editable().FirstOrDefaultAsync(c => c.Id == id);
        if (c == null) return NotFound();
        var delta = req.Delta;
        // Damage eats temporary hit points first.
        if (delta < 0 && c.TempHp > 0)
        {
            var absorbed = Math.Min(c.TempHp, -delta);
            c.TempHp -= absorbed;
            delta += absorbed;
        }
        var derived = _mapper.ToDto(c).Derived;
        c.CurrentHp = Math.Clamp(c.CurrentHp + delta, 0, derived.MaxHp);
        await _db.SaveChangesAsync();
        await NotifyOwner(c);
        return new HpResult(c.CurrentHp, c.TempHp);
    }

    /// <summary>Set temporary hit points (they don't stack — the new value replaces the old one).</summary>
    [HttpPatch("{id:int}/temp-hp")]
    public async Task<ActionResult<HpResult>> SetTempHp(int id, TempHpRequest req)
    {
        var c = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id && (c.UserId == UserId || IsGm));
        if (c == null) return NotFound();
        c.TempHp = req.Value;
        await _db.SaveChangesAsync();
        await NotifyOwner(c);
        return new HpResult(c.CurrentHp, c.TempHp);
    }

    /// <summary>Player spends gold (always reduces, never increases). Clamps at 0.</summary>
    [HttpPatch("{id:int}/gold")]
    public async Task<ActionResult<int>> SpendGold(int id, GoldSpendRequest req)
    {
        if (req.Amount <= 0) return BadRequest(new { message = "The amount must be positive." });
        var c = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id && c.UserId == UserId);
        if (c == null) return NotFound();
        c.Gold = Math.Max(0, c.Gold - req.Amount);
        await _db.SaveChangesAsync();
        return c.Gold;
    }

    /// <summary>Set (or clear) the player's pick for a class feature that requires a choice.</summary>
    [HttpPatch("{id:int}/feature-choice")]
    public async Task<ActionResult<CharacterDto>> SetFeatureChoice(int id, FeatureChoiceRequest req)
    {
        var c = await Owned().FirstOrDefaultAsync(c => c.Id == id);
        if (c == null) return NotFound();

        var choices = CharacterMapper.FeatureChoices(c);
        if (string.IsNullOrWhiteSpace(req.Option)) choices.Remove(req.Feature);
        else choices[req.Feature] = req.Option;
        c.FeatureChoicesJson = System.Text.Json.JsonSerializer.Serialize(choices);

        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }

    /// <summary>Set how much of a daily resource is spent today (bardic performance lives in the spellbook state).</summary>
    [HttpPatch("{id:int}/resources")]
    public async Task<ActionResult<CharacterDto>> SetResource(int id, ResourceRequest req)
    {
        var c = await Owned().FirstOrDefaultAsync(c => c.Id == id);
        if (c == null) return NotFound();
        var res = _mapper.ToDto(c).Derived.Resources?.FirstOrDefault(r => r.Key == req.Key);
        if (res == null) return BadRequest(new { message = "The character does not have this resource." });
        int used = Math.Clamp(req.Used, 0, res.Max);
        if (req.Key == "performance")
        {
            var state = System.Text.Json.Nodes.JsonNode.Parse(string.IsNullOrWhiteSpace(c.SpellStateJson) ? "{}" : c.SpellStateJson) as System.Text.Json.Nodes.JsonObject ?? new();
            state["performanceRoundsUsed"] = used;
            c.SpellStateJson = state.ToJsonString();
        }
        else
        {
            var all = CharacterState.ReadUsedResources(c);
            all[req.Key] = used;
            c.ResourcesUsedJson = System.Text.Json.JsonSerializer.Serialize(all);
        }
        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }

    /// <summary>Rest (8 hours): daily resources, spell slots and bardic performance back to full.</summary>
    /// <summary>Rest. <paramref name="kind"/> "short" refills only what comes back on a short rest
    /// (resources marked "short", spell slots of pact magic); anything else is a full (long) rest.</summary>
    [HttpPost("{id:int}/rest")]
    public async Task<ActionResult<CharacterDto>> Rest(int id, [FromQuery] string? kind = null)
    {
        var c = await Editable().FirstOrDefaultAsync(c => c.Id == id);
        if (c == null) return NotFound();
        bool shortRest = kind == "short";
        var rules = _rules.For(c.RuleSystemId);
        if (shortRest)
        {
            var used = CharacterState.ReadUsedResources(c);
            foreach (var r in _mapper.ToDto(c).Derived.Resources ?? new List<DailyResource>())
                if (r.Reset == "short") used.Remove(r.Key);
            c.ResourcesUsedJson = System.Text.Json.JsonSerializer.Serialize(used);
        }
        else c.ResourcesUsedJson = "{}";
        // Spell state: prepared spells stay, every slot is unused again (same as the spellbook's rest).
        // One state per casting class: the first at the top level, the others under "classes".
        if (System.Text.Json.Nodes.JsonNode.Parse(string.IsNullOrWhiteSpace(c.SpellStateJson) ? "{}" : c.SpellStateJson) is System.Text.Json.Nodes.JsonObject state)
        {
            static void Refill(System.Text.Json.Nodes.JsonObject book)
            {
                if (book["prepared"] is System.Text.Json.Nodes.JsonObject prepared)
                    foreach (var (_, slots) in prepared)
                        if (slots is System.Text.Json.Nodes.JsonArray arr)
                            foreach (var slot in arr.OfType<System.Text.Json.Nodes.JsonObject>()) slot["used"] = false;
                book["used"] = new System.Text.Json.Nodes.JsonObject();
            }
            var casting = rules.CastingClassIds(c);
            bool Refills(string classId) => !shortRest || rules.Spellcasting(c, classId)?.SlotsOnShortRest == true;
            if (casting.Count > 0 && Refills(casting[0])) Refill(state);
            if (state["classes"] is System.Text.Json.Nodes.JsonObject books)
                foreach (var (classId, book) in books)
                    if (book is System.Text.Json.Nodes.JsonObject b && Refills(classId)) Refill(b);
            if (!shortRest) { state["performanceRoundsUsed"] = 0; state["sharedUsed"] = new System.Text.Json.Nodes.JsonObject(); }

            c.SpellStateJson = state.ToJsonString();
        }
        await _db.SaveChangesAsync();
        await NotifyOwner(c);
        return _mapper.ToDto(c);
    }

    /// <summary>Switch a combat option (rage, Power Attack, …) on or off. Only options the character has.</summary>
    [HttpPatch("{id:int}/toggles")]
    public async Task<ActionResult<CharacterDto>> SetToggle(int id, ToggleRequest req)
    {
        var c = await Owned().FirstOrDefaultAsync(c => c.Id == id);
        if (c == null) return NotFound();
        var dto = _mapper.ToDto(c);
        if (req.Active && dto.Derived.Toggles?.Any(t => t.Key == req.Key) != true)
            return BadRequest(new { message = "The character does not have this ability." });
        var on = CharacterState.ReadActiveToggles(c);
        if (req.Active) on.Add(req.Key); else on.Remove(req.Key);
        c.ActiveAbilitiesJson = System.Text.Json.JsonSerializer.Serialize(on);
        _mapper.HpFollowsMax(c, dto.Derived.MaxHp);
        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }

    /// <summary>Set the ability score increases (one per 4 levels: 4th, 8th, …), in level order.</summary>
    [HttpPatch("{id:int}/ability-increases")]
    public async Task<ActionResult<CharacterDto>> SetAbilityIncreases(int id, AbilityIncreasesRequest req)
    {
        var c = await Owned().FirstOrDefaultAsync(c => c.Id == id);
        if (c == null) return NotFound();
        string[] valid = { "Str", "Dex", "Con", "Int", "Wis", "Cha" };
        if (req.Abilities.Any(a => !valid.Contains(a))) return BadRequest(new { message = "Unknown ability." });
        if (req.Abilities.Count > Math.Max(1, c.Level) / 4)
            return BadRequest(new { message = $"At level {c.Level} there are only {Math.Max(1, c.Level) / 4} ability increases." });
        int maxBefore = _mapper.MaxHp(c);
        c.AbilityIncreasesJson = System.Text.Json.JsonSerializer.Serialize(req.Abilities);
        _mapper.HpFollowsMax(c, maxBefore);
        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }

    /// <summary>
    /// Add or remove a feat. Feats like Weapon Focus need a choice (weapon/skill/school) and may be taken once
    /// per choice; "Extra …" feats may be repeated. Every feat must fit a slot (general, class bonus lists).
    /// Prerequisites are checked in the client.
    /// </summary>
    [HttpPatch("{id:int}/feats")]
    public async Task<ActionResult<CharacterDto>> SetFeat(int id, FeatSelectRequest req)
    {
        var c = await Owned().FirstOrDefaultAsync(c => c.Id == id);
        if (c == null) return NotFound();
        if (_rules.For(c.RuleSystemId).Capability<IFeatRules>() is not { } featRules)
            return BadRequest(new { message = "This rule system has no feats." });

        var feats = CharacterState.ReadFeats(c);
        var choice = string.IsNullOrWhiteSpace(req.Choice) ? null : req.Choice.Trim();
        if (req.Add)
        {
            var feat = await _db.Feats.FindAsync(req.FeatId);
            if (feat == null) return BadRequest(new { message = "Unknown feat." });
            var kind = featRules.ChoiceOf(feat.Name);
            if (kind != FeatChoiceKind.None && choice == null)
                return BadRequest(new { message = "This feat needs a choice (weapon, skill or school)." });
            if (kind == FeatChoiceKind.None) choice = null;
            bool repeatable = featRules.IsRepeatable(feat.Name);
            bool taken = feats.Any(f => f.Id == feat.Id && string.Equals(f.Choice, choice, StringComparison.OrdinalIgnoreCase));
            if (taken && !repeatable) return _mapper.ToDto(c);

            var next = feats.Append(new CharacterFeat(feat.Id, feat.Name, choice)).ToList();
            var ids = next.Select(f => f.Id).Distinct().ToList();
            var types = await _db.Feats.Where(f => ids.Contains(f.Id)).ToDictionaryAsync(f => f.Id, f => f.Type);
            if (!featRules.Fits(next.Select(f => (f.Name, types.GetValueOrDefault(f.Id, ""))).ToList(), featRules.Slots(c)))
                return BadRequest(new { message = "No free feat slot this feat fits into." });
            feats = next;
        }
        else
        {
            // Remove one instance: the one with this choice, or the last one if no choice is given.
            var hit = feats.FindLastIndex(f => f.Id == req.FeatId && (choice == null || string.Equals(f.Choice, choice, StringComparison.OrdinalIgnoreCase)));
            if (hit >= 0) feats.RemoveAt(hit);
        }

        int maxBefore = _mapper.MaxHp(c);
        CharacterState.WriteFeats(c, feats);
        _mapper.HpFollowsMax(c, maxBefore);
        await _db.SaveChangesAsync();
        return _mapper.ToDto(c);
    }


    private static void Apply(Character c, CharacterInput i, bool favoredClassOpen)
    {
        c.Name = i.Name; c.Race = i.Race; c.Class = i.Class;
        // Level is managed by the GM via /gm/levelup and /gm/leveldown; Update() restores it for players.
        // PendingLevelUp is intentionally not reset by a plain character save.
        c.Level = i.Level; c.Xp = i.Xp;
        c.Background = i.Background; c.Alignment = i.Alignment; c.Description = i.Description;
        c.Age = i.Age; c.Height = i.Height; c.Weight = i.Weight; c.PortraitUrl = i.PortraitUrl;
        c.Str = i.Str; c.Dex = i.Dex; c.Con = i.Con; c.Int = i.Int; c.Wis = i.Wis; c.Cha = i.Cha;
        if (i.Abilities != null) CharacterState.WriteAbilities(c, i.Abilities);
        if (i.Multiclass != null) CharacterState.WriteClasses(c, i.Multiclass);
        c.CurrentHp = i.CurrentHp; c.CurrentMana = i.CurrentMana; c.Gold = i.Gold;
        c.Size = i.Size; c.Speed = i.Speed;
        c.RaceKey = i.RaceKey; c.RaceBonusAbility = i.RaceBonusAbility;
        // One favored class bonus per level. Only assignable at creation or during a pending level
        // up, and only added — a level's choice is permanent, earlier picks can't be reshuffled.
        if (favoredClassOpen)
        {
            int level = Math.Max(1, c.Level);
            // Max/Min instead of Clamp: after a GM lowers the level, old picks may exceed the cap.
            c.FavoredClassHp = Math.Max(c.FavoredClassHp, Math.Min(i.FavoredClassHp, level - c.FavoredClassSkill));
            c.FavoredClassSkill = Math.Max(c.FavoredClassSkill, Math.Min(i.FavoredClassSkill, level - c.FavoredClassHp));
        }
    }
}
