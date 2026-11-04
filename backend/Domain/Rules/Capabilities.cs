using System.Text.Json;

namespace Foliant.Api.Domain.Rules;

// Optional parts of a rule system. IRuleSystem holds what every system has; anything a system may
// lack (feats, skill ranks, companions, …) is a capability: callers ask
// rules.Capability<IFeatRules>() and get null when the campaign's system doesn't have it.
// These interfaces are the contract a rule plugin fulfils (see docs/PLAN-regel-plugins.md).

/// <summary>One feat slot: <paramref name="Count"/> picks limited to feat types/names (empty = any).</summary>
public record FeatSlot(string Id, string Label, int Count, bool IgnorePrereqs, string[] Types, string[] Names, bool Any = false);

/// <summary>Feats picked into slots (PF1 feats; 5e feats instead of an ability increase).</summary>
public interface IFeatRules
{
    IReadOnlyList<FeatSlot> Slots(Character c);
    /// <summary>Feats the character gets for free (class/race), by name.</summary>
    IReadOnlyList<string> GrantedFeats(Character c);
    /// <summary>What a feat needs to be specified with (weapon, skill, school …).</summary>
    FeatChoiceKind ChoiceOf(string featName);
    bool IsRepeatable(string featName);
    /// <summary>Can these feats (name + type) all be placed into the slots?</summary>
    bool Fits(IReadOnlyList<(string Name, string Type)> feats, IReadOnlyList<FeatSlot> slots);
}

/// <summary>Weapon list and proficiency.</summary>
public interface IWeaponRules
{
    IReadOnlyList<WeaponDef> Weapons { get; }
    WeaponDef? Weapon(string key);
    IReadOnlyList<string> ProficientWeapons(Character c);
}

/// <summary>One row of a ranked skill sheet (multi skills: one row per type).</summary>
public record RankedSkillRow(string Key, string Name, string Ability, bool IsClassSkill, bool TrainedOnly, bool ArmorCheck, int Ranks, int Total);

/// <summary>Skills with spendable ranks per level (PF1). Systems with plain proficiency don't have it.</summary>
public interface ISkillRankRules
{
    /// <summary>The whole skill sheet with totals (ranks, ability, class skill, armor check, racial/class/item bonuses).</summary>
    /// <param name="carriedWeight">Load can raise the armor check penalty on skills.</param>
    IReadOnlyList<RankedSkillRow> Sheet(Character c, IReadOnlyDictionary<string, int> equipmentBonuses, double carriedWeight);
    /// <summary>Skill points over the whole career with this Int modifier (the host passes the permanent one).</summary>
    int SkillPoints(Character c, int intModifier);
    /// <summary>Rows a skill shows on the sheet (multi skills like Craft: one per ranked type).</summary>
    IEnumerable<(string Key, string Name)> Rows(SkillDef def, ICollection<string> rankedKeys);
    /// <summary>Canonical key for user input, or null if unknown.</summary>
    string? NormalizeKey(string key);
    /// <summary>Skill that takes ranks per type (Craft, Perform, …).</summary>
    bool IsMultiSkill(string key);
}

/// <summary>One skill's total with how it came about (proficiency systems).</summary>
public record SkillValue(string Key, string Name, string Ability, int Total, bool Proficient, bool Expertise);

/// <summary>Skills without ranks: proficiency/expertise come from class, ancestry and choices (5e style).</summary>
public interface ISkillValueRules
{
    IReadOnlyList<SkillValue> SkillValues(Character c, IReadOnlyDictionary<string, int> equipmentBonuses);
}

/// <summary>Magic items that need attunement, with a limit per character (5e: 3).</summary>
public interface IAttunementRules
{
    int AttunementLimit { get; }
}

/// <summary>Spell ids of a spellbook that get special treatment.</summary>
public record SpellSpecials(List<int>? SpecialSlotIds, List<int> OppositionIds, List<int> BonusKnownIds);

/// <summary>Domain/school slots, opposition schools, bloodline spells (PF1).</summary>
public interface ISpellSpecialRules
{
    SpellSpecials Specials(Character c, IReadOnlyList<Spell> spells, string? classId = null);
}

/// <summary>Animal companions, familiars, mounts.</summary>
/// <summary>Class performances (bardic performance): rounds per day, DC and the effects for this character.</summary>
public interface IPerformanceRules
{
    Engine.EnginePerformance? Performance(Character c, IReadOnlyDictionary<string, int> equipmentBonuses);
    /// <summary>The class the performances belong to (their chapter goes into its spellbook).</summary>
    string? PerformanceClass(Character c);
}

public interface ICompanionRules
{
    IReadOnlyList<string> Kinds { get; }
    /// <summary>Companion kinds the character may have, with their effective level.</summary>
    IReadOnlyDictionary<string, int> Allowed(Character c);
    CompanionBond? Bond(string kind, int effectiveLevel, int masterMaxHp);
}

/// <summary>Ability score increases at fixed levels.</summary>
public interface IAbilityIncreaseRules
{
    IReadOnlyList<string> AbilityIncreases(Character c);
}

/// <summary>Storage format of rule-agnostic character state (JSON columns). Not rules — every system uses it.</summary>
public static class CharacterState
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static List<CharacterFeat> ReadFeats(Character c)
    {
        try { return JsonSerializer.Deserialize<List<CharacterFeat>>(c.FeatsJson, Json) ?? new(); }
        catch { return new(); }   // malformed column = empty, as before
    }

    /// <summary>Picks for class features that need a choice: { featureName: optionName }.</summary>
    public static Dictionary<string, string> ReadFeatureChoices(Character c)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, string>>(c.FeatureChoicesJson) ?? new(); }
        catch { return new(); }   // malformed column = empty, as before
    }

    /// <summary>Scores of abilities without a column of their own: { abilityKey: score }.</summary>
    public static Dictionary<string, int> ReadAbilities(Character c)
    {
        try { return new(JsonSerializer.Deserialize<Dictionary<string, int>>(c.AbilitiesJson) ?? new(), StringComparer.OrdinalIgnoreCase); }
        catch { return new(StringComparer.OrdinalIgnoreCase); }   // malformed or empty column = none
    }

    /// <summary>Abilities whose key starts like one of the six classic ones use that column; any other lives in AbilitiesJson.</summary>
    public static int Score(Character c, string ability, IReadOnlyDictionary<string, int>? extra = null) => Column(ability) switch
    {
        "str" => c.Str, "dex" => c.Dex, "con" => c.Con, "int" => c.Int, "wis" => c.Wis, "cha" => c.Cha,
        _ => (extra ?? ReadAbilities(c)).GetValueOrDefault(ability, 10),
    };

    /// <summary>Stores scores by ability key: the six classic ones in their columns, the rest in AbilitiesJson.</summary>
    public static void WriteAbilities(Character c, IReadOnlyDictionary<string, int> scores)
    {
        var extra = ReadAbilities(c);
        foreach (var (key, raw) in scores.Take(30))
        {
            if (string.IsNullOrWhiteSpace(key) || key.Length > 20) continue;
            var v = Math.Clamp(raw, 0, 999);
            switch (Column(key))
            {
                case "str": c.Str = v; break;
                case "dex": c.Dex = v; break;
                case "con": c.Con = v; break;
                case "int": c.Int = v; break;
                case "wis": c.Wis = v; break;
                case "cha": c.Cha = v; break;
                default: extra[key] = v; break;
            }
        }
        c.AbilitiesJson = JsonSerializer.Serialize(extra);
    }

    private static string Column(string ability) => ability[..Math.Min(3, ability.Length)].ToLowerInvariant();

    /// <summary>Further classes after the primary one, in the order taken.</summary>
    public static List<Engine.ClassLevel> ReadClasses(Character c)
    {
        try { return (JsonSerializer.Deserialize<List<Engine.ClassLevel>>(c.ClassesJson, Json) ?? new()).Where(x => !string.IsNullOrEmpty(x.ClassId) && x.Level > 0).ToList(); }
        catch { return new(); }   // malformed or empty column = single class
    }

    public static void WriteClasses(Character c, IEnumerable<Engine.ClassLevel> classes) =>
        c.ClassesJson = JsonSerializer.Serialize(classes.Where(x => !string.IsNullOrWhiteSpace(x.ClassId) && x.ClassId.Length <= 64 && x.Level > 0)
            .Take(10).Select(x => new Engine.ClassLevel(x.ClassId.Trim(), Math.Min(x.Level, 30))), Json);

    /// <summary>All classes with their levels, primary class first: it has every level the others don't.</summary>
    public static List<Engine.ClassLevel> ClassLevels(Character c)
    {
        var level = Math.Max(1, c.Level);
        var more = ReadClasses(c).Where(x => !x.ClassId.Equals(c.Class, StringComparison.OrdinalIgnoreCase))
            .GroupBy(x => x.ClassId, StringComparer.OrdinalIgnoreCase).Select(g => new Engine.ClassLevel(g.Key, g.Sum(x => x.Level))).ToList();
        // Never more levels than the character has: later classes give way, the primary class keeps at least one.
        var result = new List<Engine.ClassLevel> { new(c.Class, 1) };
        int left = level - 1;
        foreach (var x in more)
        {
            if (left <= 0) break;
            result.Add(x with { Level = Math.Min(x.Level, left) });
            left -= result[^1].Level;
        }
        result[0] = result[0] with { Level = 1 + left };
        return result;
    }

    /// <summary>Daily resources used since the last rest: { key: count }.</summary>
    public static Dictionary<string, int> ReadUsedResources(Character c)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, int>>(c.ResourcesUsedJson) ?? new(); }
        catch { return new(); }   // malformed column = empty, as before
    }

    /// <summary>Combat options switched on (rage, Power Attack, …).</summary>
    /// <summary>Spent uses of a daily resource. Bardic performance rounds live in the spellbook state.</summary>
    public static int UsedResource(Character c, string key)
    {
        if (key != "performance") return ReadUsedResources(c).GetValueOrDefault(key);
        try { return JsonDocument.Parse(c.SpellStateJson).RootElement.TryGetProperty("performanceRoundsUsed", out var p) ? p.GetInt32() : 0; }
        catch { return 0; }
    }

    public static HashSet<string> ReadActiveToggles(Character c)
    {
        try { return JsonSerializer.Deserialize<HashSet<string>>(c.ActiveAbilitiesJson) ?? new(); }
        catch { return new(); }   // malformed column = empty, as before
    }

    /// <summary>Writes the feats and keeps the legacy id list in sync.</summary>
    public static void WriteFeats(Character c, List<CharacterFeat> feats)
    {
        c.FeatsJson = JsonSerializer.Serialize(feats, Json);
        c.FeatIdsJson = JsonSerializer.Serialize(feats.Select(f => f.Id).Distinct().ToList());
    }
}


// ── Results shared by every rule system ─────────────────────────────────────

public enum WeaponProficiency { Simple, Martial, Exotic }

public enum WeaponUse { Light, OneHanded, TwoHanded, Ranged }

/// <param name="Key">Stable id, also the choice stored for Weapon Focus &amp; co.</param>
/// <param name="Finesse">Can use Dex instead of Str for melee attacks (PF1 Weapon Finesse).</param>
/// <param name="Thrown">Ranged attack adds Str to damage (thrown weapons).</param>
public record WeaponDef(string Key, string Name, WeaponProficiency Proficiency, WeaponUse Use, string Damage,
    int CritRange, int CritMultiplier, bool Finesse = false, bool Thrown = false);

/// <summary>One attack line for an equipped weapon (all iterative attacks, damage, critical).</summary>
public record WeaponAttack(string Name, string Hand, int[] Bonuses, string Damage, string Crit, bool Proficient, string[] Notes, string? WeaponKey = null);

/// <summary>A feat a character has taken; <see cref="Choice"/> for feats like Weapon Focus (weapon), Skill Focus (skill key)
/// or Spell Focus (school).</summary>
public record CharacterFeat(int Id, string Name, string? Choice = null);

/// <summary>What a feat's choice refers to.</summary>
public enum FeatChoiceKind { None, Weapon, Skill, School }

/// <summary>What the class bond grants a companion at the master's level (shown on the companion card).</summary>
public record CompanionBond(string Kind, int EffectiveLevel, int? Hp, string[] Lines);

/// <summary>A per-day resource (uses or rounds) with what is spent today.</summary>
/// <param name="Reset">"short" | "long" when the rule system distinguishes rests; null = every rest refills it.</param>
public record DailyResource(string Key, string Label, int Max, int Used, string Detail, string? Reset = null);

/// <summary>A class value that scales with level (sneak attack dice, monk unarmed damage, DR, …).</summary>
public record ClassValue(string Label, string Value);

/// <summary>An activatable ability the character has, and whether it is switched on.</summary>
public record AbilityToggle(string Key, string Label, string Effect, bool Active);
