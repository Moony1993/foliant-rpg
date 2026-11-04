namespace Foliant.Api.Domain.Rules;

/// <summary>One saving throw definition (id + which ability governs it).</summary>
public record SaveDef(string Key, string Name, string Ability);

/// <summary>Derived spells-per-day for one spell grade.</summary>
/// <summary>Slots per day for one grade. <paramref name="Special"/> of them are the domain /
/// specialist-school slot, which may only hold a spell of that domain/school.</summary>
public record SpellSlotCount(int Grade, int Total, int Special = 0);
/// <summary>Spell grade → slots, shared by the listed casting classes.</summary>
public record SharedSpellSlots(IReadOnlyList<string> Classes, IReadOnlyDictionary<int, int> Slots);

/// <summary>How a class casts. Prepared casters fill each slot with a specific spell;
/// spontaneous casters spend a slot of a grade on any spell they know.
/// <paramref name="Cantrips"/>: prepared = cantrips prepared per day, spontaneous = cantrips known.
/// <paramref name="Known"/>: spontaneous only, spells known per grade 0–9 (-1 = no access).</summary>
/// <param name="SlotsOnShortRest">Spell slots come back on a short rest too (5e pact magic).</param>
public record SpellcastingInfo(bool Prepared, int Cantrips, int[]? Known, bool SlotsOnShortRest = false);

/// <summary>A skill definition. Armor check penalty applies to all Str/Dex skills in PF1e.</summary>
public record SkillDef(string Key, string Name, string Ability, bool TrainedOnly)
{
    public bool ArmorCheck => Ability is "Str" or "Dex";
}

/// <summary>
/// A playable race. Fixed ability modifiers apply directly; FlexiblePlus2 races grant +2 to a
/// chosen ability instead. Size/Speed become the character's defaults.
/// </summary>
public record RaceDef(string Key, string Name, Dictionary<string, int> AbilityMods,
    bool FlexiblePlus2, string Size, int Speed, string[] Traits);

/// <summary>One selectable option for a class feature that requires a choice
/// (e.g. Ranger combat style). Effects (if any) are flat stat bonuses folded into
/// the derived values like equipment; situational options leave Effects null.</summary>
/// <param name="MinLevel">Option only selectable for a pick gained at this class level or later (e.g. advanced rogue talents).</param>
public record ClassFeatureOption(string Name, string Description, Dictionary<string, int>? Effects = null, int MinLevel = 0);

/// <summary>A class feature gained at a given class level. Options, when present,
/// mean the player must pick <see cref="Picks"/> of them — persisted per character as
/// a feature choice (multiple picks stored comma-separated).</summary>
/// <param name="PickLevels">One further pick at each of these class levels (favored enemy, rage powers, …);
/// overrides <see cref="Picks"/>. Picks are stored in level order.</param>
/// <param name="Repeat">The same option may be picked more than once (e.g. raising one favored enemy twice).</param>
/// <param name="OptionsFrom">Only options already picked for that feature (e.g. which favored enemy to raise).</param>
/// <param name="FreeText">Picks are typed in (long lists the app doesn't catalogue, e.g. hexes).</param>
public record ClassFeature(int Level, string Name, string Description,
    IReadOnlyList<ClassFeatureOption>? Options = null, int Picks = 1,
    IReadOnlyList<int>? PickLevels = null, bool Repeat = false, string? OptionsFrom = null, bool FreeText = false);

/// <summary>Everything the client needs to render + the fully-coupled computed values.</summary>
public record DerivedStats(
    Dictionary<string, int> Modifiers,   // "Str" -> +2, ... (from final scores)
    Dictionary<string, int> Scores,      // final ability scores (base + race + equipment)
    Dictionary<string, int> Saves,       // "Fort" -> 5, ...
    int MaxHp,
    int Initiative,
    // Offense
    int Bab,
    int MeleeAttack,
    int RangedAttack,
    int Cmb,
    int Cmd,
    // Defense
    int Ac,
    int TouchAc,
    int FlatFootedAc,
    int ArmorCheckPenalty,
    int Speed,                           // effective, after encumbrance
    // Load
    int CarryCapacity,                   // max (heavy) load in lbs, size-adjusted
    double CarriedWeight,
    string Load,                         // light | medium | heavy | overloaded
    int PassivePerception,
    int FeatBudget,                      // number of feats the character is entitled to
    // Worn armor and equipped weapons
    int SpellFailure = 0,                // arcane spell failure chance in %
    string ArmorType = "None",           // worn body armor category
    IReadOnlyList<WeaponAttack>? Attacks = null,
    IReadOnlyList<AbilityToggle>? Toggles = null,  // activatable combat options (rage, Power Attack, …)
    IReadOnlyList<string>? Situational = null,     // race/class conditional bonuses, favored enemy/terrain
    IReadOnlyList<DailyResource>? Resources = null, // per-day uses (rage rounds, channel, ki, …) with today's usage
    IReadOnlyList<ClassValue>? ClassValues = null,  // scaling class values (sneak attack, unarmed damage, DR, …)
    IReadOnlyDictionary<string, double>? Values = null   // every value of a rule package by key (layout stats beyond the fixed fields)
);

/// <summary>
/// The swap seam. Add a new game system = add a new implementation and register it.
/// ponytail: one interface, one impl now — justified by explicit "swappable systems" requirement.
/// </summary>
public interface IRuleSystem
{
    string Id { get; }
    string DisplayName { get; }

    /// <summary>What the UI shows for this system (abilities, classes, values and their labels).</summary>
    SheetLayout Layout { get; }

    /// <summary>An optional part of the rules (see Capabilities.cs), or null if this system lacks it.</summary>
    T? Capability<T>() where T : class => this as T;
    IReadOnlyList<string> AbilityKeys { get; }

    /// <param name="equipmentBonuses">
    /// Summed item effects. Ability keys (Str..Cha) raise the effective score; AC keys
    /// (ArmorBonus, ShieldBonus, NaturalArmor, Deflection, Dodge, ArmorCheckPenalty),
    /// MaxDexCap (already the min across armor), and direct derived keys
    /// (MaxHp, Initiative, BAB, Fort/Ref/Will/Resistance) all feed the result.
    /// </param>
    /// <param name="carriedWeight">Total weight of all inventory items (for encumbrance).</param>
    DerivedStats Compute(Character c, IReadOnlyDictionary<string, int> equipmentBonuses, double carriedWeight);

    /// <summary>
    /// Spells per day per grade, derived from class + level + casting ability (incl. bonus spells).
    /// Empty for non-casters. Grade 0 (cantrips) is excluded — those are unlimited/free.
    /// </summary>
    IReadOnlyList<SpellSlotCount> SpellSlots(Character c, IReadOnlyDictionary<string, int> equipmentBonuses, string? classId = null);

    /// <summary>Casting style of the character's class, or null for non-casters.</summary>
    SpellcastingInfo? Spellcasting(Character c, string? classId = null);
    /// <summary>Spellcasting ability ("Int"/"Wis"/"Cha") or null for non-casters.</summary>
    string? CastingAbility(Character c, string? classId = null);
    /// <summary>Ids of the character's classes that cast spells, primary class first (one spellbook each).</summary>
    IReadOnlyList<string> CastingClassIds(Character c);
    /// <summary>Slots several casting classes share (5e multiclassing), or null when each class keeps its own.</summary>
    SharedSpellSlots? SharedSpellSlots(Character c, IReadOnlyDictionary<string, int> equipmentBonuses);
    /// <summary>Caster level (paladins/rangers: class level − 3).</summary>
    int CasterLevel(Character c, string? classId = null);

    // ---- Races ----
    /// <summary>The playable races.</summary>
    IReadOnlyList<RaceDef> Races { get; }

    /// <summary>All class features for a class (across all levels), ordered by level.</summary>
    IReadOnlyList<ClassFeature> ClassFeatures(string? className);

    // ---- Skills ----
    /// <summary>The full skill list (name, governing ability, trained-only flag).</summary>
    IReadOnlyList<SkillDef> Skills { get; }
}
