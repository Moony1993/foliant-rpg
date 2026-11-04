using System.Text.Json;
namespace Foliant.Api.Domain.Rules.Engine;

// Shape of a declarative rule package (deserialized from its JSON files). Every formula is a
// string in the Expr language; the engine compiles and checks them once when the package loads.

public record RuleDefinition
{
    /// <summary>Formula from a score (parameter "score") to its modifier.</summary>
    public string AbilityModifier { get; init; } = "floor((score - 10) / 2)";
    /// <summary>Ability keys, e.g. STR, DEX … — usable as identifiers (final score) and in mod(…).</summary>
    public List<string> Abilities { get; init; } = new();
    public List<StatFormula> Stats { get; init; } = new();
    public StackingRule Stacking { get; init; } = new();
    public List<ConditionDef> Conditions { get; init; } = new();
    public List<ClassContent> Classes { get; init; } = new();
    /// <summary>Lookup tables, read with table('name', index) (index 1 = first entry, e.g. level 1).</summary>
    public Dictionary<string, double[]> Tables { get; init; } = new();
    /// <summary>Skills; each becomes the value "skill.&lt;key&gt;" computed with <see cref="SkillFormula"/>
    /// (unless stats defines that key itself).</summary>
    public List<SkillInfo> Skills { get; init; } = new();
    /// <summary>Parameters: skill (its key), ability (key of its ability), proficient / expertise (tags
    /// "prof:skill.&lt;key&gt;" / "expertise:skill.&lt;key&gt;"), ranks, classSkill, armorCheck, trainedOnly.</summary>
    public string SkillFormula { get; init; } = "mod(ability)";
    /// <summary>"proficiency" (5e: proficient/expertise from tags) or "ranks" (PF1: points spent per skill).</summary>
    public string SkillMode { get; init; } = "proficiency";
    /// <summary>Peoples/ancestries (races).</summary>
    public List<AncestryDef> Ancestries { get; init; } = new();
    /// <summary>One ability increase (+1, chosen by the player) every N character levels (0 = none). PF1: 4.</summary>
    public int AbilityIncreaseEvery { get; init; }
    /// <summary>Effects of feats by feat key (see FeatNames.Key). "{choice}" in targets/values/grants is the
    /// feat's chosen weapon/skill/school.</summary>
    public Dictionary<string, FeatEffectDef> FeatEffects { get; init; } = new();
    /// <summary>Feats that need a choice: feat key → "weapon" | "skill" | "school".</summary>
    public Dictionary<string, string> FeatChoices { get; init; } = new();
    /// <summary>Feat keys that may be taken again with stacking effects.</summary>
    public List<string> RepeatableFeats { get; init; } = new();
    /// <summary>Feat slots; empty = the system has no feats.</summary>
    public List<FeatSlotDef> FeatSlots { get; init; } = new();
    /// <summary>How many items a character can be attuned to at once (0 = the system has no attunement).</summary>
    public int AttunementLimit { get; init; }
    /// <summary>Backgrounds (origin, profession) — same shape as an ancestry without size/speed.</summary>
    public List<BackgroundDef> Backgrounds { get; init; } = new();
    /// <summary>Tags every character has, e.g. "prof:weapon.unarmed".</summary>
    public List<string> Grants { get; init; } = new();
    /// <summary>Weapons. Proficient = tag "prof:weapon.&lt;key&gt;" or "prof:weapon.&lt;category&gt;"; the tag
    /// "category:weapon.&lt;key&gt;=&lt;category&gt;" moves a weapon into another category for that character
    /// (racial weapons: exotic counts as martial).</summary>
    public List<WeaponInfo> Weapons { get; init; } = new();
    /// <summary>Activatable options (rage, Power Attack, fighting defensively …).</summary>
    public List<ToggleDef> Toggles { get; init; } = new();
    /// <summary>Situational bonuses (senses, conditional saves, favored enemies …), in this order.</summary>
    public List<SituationalDef> Situational { get; init; } = new();
    /// <summary>Named spell lists (domain, bloodline …) by spell name; matched via SpellNames.Key.</summary>
    public Dictionary<string, List<string>> SpellLists { get; init; } = new();
    /// <summary>School names (any language, first word, lower case) → school key, e.g. "hervorrufung" → "evocation".</summary>
    public Dictionary<string, string> SchoolAliases { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public SpellSpecialsDef SpellSpecials { get; init; } = new();
    public CompanionsDef Companions { get; init; } = new();
    public AttacksDef Attacks { get; init; } = new();
    /// <summary>Sources (or parts of them) that count as the core rules, for the "core rulebook only" filter of the
    /// spell library, the feats page and the armory. Empty = the system has no such distinction (no filter).</summary>
    public List<string> CoreSources { get; init; } = new();
    /// <summary>How the feats page groups and checks feats (tree branches, prerequisite texts); null = plain list.</summary>
    public FeatTreeDef? FeatTree { get; init; }
    /// <summary>Spell slots shared by several casting classes (5e multiclassing); null = every class has its own.</summary>
    public MulticlassSpellSlotsDef? MulticlassSpellSlots { get; init; }
    /// <summary>Ammunition players can take from the armory (quiver); empty = no armory.</summary>
    public List<AmmoDef> Ammunition { get; init; } = new();
    /// <summary>Special materials that can be applied to ammunition from the armory.</summary>
    public List<AmmoMaterialDef> AmmoMaterials { get; init; } = new();
}

/// <summary>When a character casts with two or more of <see cref="Classes"/>, those classes share one pool of slots:
/// spell grade → formula (character-wide, usually a table by a combined caster level via perclass).</summary>
public record MulticlassSpellSlotsDef
{
    public List<string> Classes { get; init; } = new();
    public Dictionary<int, string> Slots { get; init; } = new();
}

/// <summary>Feats page data of a system whose feats come with prerequisite texts (PF1 style).</summary>
public record FeatTreeDef
{
    /// <summary>Tree branch (melee, ranged, maneuver, defense, magic) → feat keys that start it; a feat joins the
    /// first branch whose seed it is or (transitively) requires. Everything else goes to "general".</summary>
    public Dictionary<string, List<string>> Seeds { get; init; } = new();
    /// <summary>Class feature named in prerequisite texts (lower case, English) → feature names on the sheet that
    /// satisfy it: a name, or [feature, chosen option]. An empty list = the system has no such feature.</summary>
    public Dictionary<string, List<JsonElement>> FeatureRequirements { get; init; } = new();
    /// <summary>Ancestries that can appear in prerequisite texts (letters only, lower case): a feat naming another one
    /// is a racial feat the character can't take.</summary>
    public List<string> Ancestries { get; init; } = new();
}

/// <summary>One kind of ammunition. Bonuses come on top of the firing weapon; <see cref="Core"/> = core rulebook
/// (filter "core only"); <see cref="Original"/> is the source name, kept for search and as identity.</summary>
public record AmmoDef
{
    public string Name { get; init; } = "";
    public string Original { get; init; } = "";
    public int Pack { get; init; } = 1;
    public string Weapon { get; init; } = "";
    public bool Core { get; init; }
    public int AttackBonus { get; init; }
    public int DamageBonus { get; init; }
    public string ExtraDamage { get; init; } = "";
    public string Notes { get; init; } = "";
}

public record AmmoMaterialDef
{
    public string Name { get; init; } = "";
    public int DamageBonus { get; init; }
    public string Note { get; init; } = "";
}

/// <summary>A class's performances (e.g. bardic performance): rounds per day, save DC and the list, shown as an
/// own chapter of the spellbook. Effect texts are templates; besides the usual values they can read {dc}.</summary>
public record PerformanceDef
{
    /// <summary>The ability itself, e.g. "Bardischer Auftritt".</summary>
    public string Name { get; init; } = "";
    /// <summary>Chapter heading, e.g. "Liederbuch".</summary>
    public string Book { get; init; } = "";
    /// <summary>What one entry is called, e.g. "Bardenlied".</summary>
    public string Item { get; init; } = "";
    /// <summary>Label of the chapter ribbon, e.g. "Lieder".</summary>
    public string Tab { get; init; } = "";
    public string Rounds { get; init; } = "0";
    public string Dc { get; init; } = "0";
    /// <summary>Action to start one, by class level: the last entry with From ≤ level applies.</summary>
    public List<PerformanceStep> Start { get; init; } = new();
    public List<PerformanceEntry> List { get; init; } = new();
}

public record PerformanceStep
{
    public int From { get; init; } = 1;
    public string Text { get; init; } = "";
}

public record PerformanceEntry
{
    public string Name { get; init; } = "";
    public int Level { get; init; } = 1;
    public string Short { get; init; } = "";
    public string Effect { get; init; } = "";
}

/// <summary>Attack lines. <see cref="Weapon"/> is evaluated once per equipped weapon (main hand first), <see cref="Extra"/>
/// once each (unarmed strike, flurry …). Formulas there also read weapon.* (see <see cref="AttackDef"/>), weapons.count,
/// weapons.melee (weapons that aren't ranged), weapons.offLight and has('weapon.group:&lt;group&gt;').</summary>
public record AttacksDef
{
    public AttackDef? Weapon { get; init; }
    public List<AttackDef> Extra { get; init; } = new();
}

/// <summary>weapon.name, .slot ("main"/"off"), .key ("" without a base weapon), .known, .use, .finesse, .thrown,
/// .damage, .critRange, .critMultiplier (base weapon), .proficient, .attackBonus, .damageBonus, .dice,
/// .itemCritRange, .itemCritMultiplier (the item). <see cref="Values"/> are computed in order and readable by name;
/// attack i (0 = first) has bonus <see cref="Bonus"/> and appears <see cref="Repeat"/> times.</summary>
public record AttackDef
{
    public string? When { get; init; }
    /// <summary>Text template; default: the weapon's name.</summary>
    public string? Name { get; init; }
    public string Hand { get; init; } = "";
    public List<NamedFormula> Values { get; init; } = new();
    public string Count { get; init; } = "1";
    public string Bonus { get; init; } = "0";
    public string Repeat { get; init; } = "1";
    public string Damage { get; init; } = "";
    public string Crit { get; init; } = "20/×2";
    public string Proficient { get; init; } = "true";
    public List<NoteDef> Notes { get; init; } = new();
}

public record NamedFormula
{
    public string Key { get; init; } = "";
    public string Expr { get; init; } = "0";
}

public record NoteDef
{
    public string Text { get; init; } = "";
    public string? When { get; init; }
}

public record EngineAttack(string Name, string Hand, int[] Bonuses, string Damage, string Crit, bool Proficient, string[] Notes, string? WeaponKey);

/// <summary>Class companions (animal companion, familiar …). A grant gives a kind at an effective level.</summary>
public record CompanionsDef
{
    public List<CompanionKindDef> Kinds { get; init; } = new();
    public List<CompanionGrant> Grants { get; init; } = new();
}

/// <summary>Hp and lines are evaluated with "level" = the effective level (1–20) and "masterHp".</summary>
public record CompanionKindDef
{
    public string Name { get; init; } = "";
    public string? Hp { get; init; }
    /// <summary>Text templates.</summary>
    public List<string> Lines { get; init; } = new();
}

public record CompanionGrant
{
    public string Kind { get; init; } = "";
    public string? When { get; init; }
    public string Level { get; init; } = "level";
}

/// <summary>Spellbook rules hanging on class-feature picks. <see cref="SpecialSlot"/>: the first rule that applies
/// decides which spells fit the special (domain/school) slot; none = not restricted. <see cref="Opposition"/>:
/// schools that cost two slots. <see cref="BonusKnown"/>: spells known on top (bloodline).</summary>
public record SpellSpecialsDef
{
    public List<SpellPickRule> SpecialSlot { get; init; } = new();
    public List<SpellPickRule> Opposition { get; init; } = new();
    public List<SpellPickRule> BonusKnown { get; init; } = new();
}

/// <param name="Match">"list": the picks name spell lists (with <see cref="Prefix"/>); "school": the picks name schools.</param>
public record SpellPickRule
{
    public string? When { get; init; }
    public string Feature { get; init; } = "";
    public string Match { get; init; } = "list";
    public string Prefix { get; init; } = "";
    public bool FirstOnly { get; init; }
    /// <summary>Only the first N spells of each list (formula); null = all.</summary>
    public string? Take { get; init; }
}

/// <summary>Spells allowed by spell key or by school key.</summary>
public record SpellFilter(IReadOnlySet<string> Keys, IReadOnlySet<string> Schools);
public record EngineSpellSpecials(SpellFilter? SpecialSlot, IReadOnlySet<string> OppositionSchools, IReadOnlySet<string> BonusKnown);


/// <summary>Offered while <see cref="When"/> holds; while switched on (tag "toggle:&lt;id&gt;") its modifiers apply.
/// Name and Effect are text templates: every {formula} is replaced by its value.</summary>
public record ToggleDef
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string Effect { get; init; } = "";
    /// <summary>Formula on tags only (has, count, level …): it is checked before the values are computed.</summary>
    public string? When { get; init; }
    public List<ModifierDef> Modifiers { get; init; } = new();
}

/// <param name="Category">simple | martial | exotic.</param>
/// <param name="Use">light | oneHanded | twoHanded | ranged.</param>
public record WeaponInfo
{
    public string Key { get; init; } = "";
    public string? Name { get; init; }
    public string Category { get; init; } = "simple";
    public string Use { get; init; } = "oneHanded";
    public string Damage { get; init; } = "";
    public int CritRange { get; init; } = 20;
    public int CritMultiplier { get; init; } = 2;
    public bool Finesse { get; init; }
    public bool Thrown { get; init; }
    /// <summary>Weapon groups (fighter weapon training and the like).</summary>
    public List<string> Groups { get; init; } = new();
}

public record BackgroundDef
{
    public string Id { get; init; } = "";
    public string? Name { get; init; }
    public string? Text { get; init; }
    public List<ModifierDef> Modifiers { get; init; } = new();
    public List<string> Grants { get; init; } = new();
}

public record SkillInfo
{
    public string Key { get; init; } = "";
    public string? Name { get; init; }
    public string Ability { get; init; } = "";
    public bool TrainedOnly { get; init; }
    public bool ArmorCheck { get; init; }
    /// <summary>Fixed kinds taken separately, e.g. Perform: { "sing": "Gesang" } → rows "perform:sing".</summary>
    public Dictionary<string, string> Types { get; init; } = new();
    /// <summary>Free-text kinds taken separately (Craft, Profession) → rows "craft:&lt;text&gt;".</summary>
    public bool FreeTypes { get; init; }
}

public record AncestryDef
{
    public string Id { get; init; } = "";
    public string? Name { get; init; }
    public string Size { get; init; } = "Medium";
    public int Speed { get; init; } = 30;
    public string? Text { get; init; }
    public List<ModifierDef> Modifiers { get; init; } = new();
    /// <summary>Tags the ancestry unlocks, e.g. "prof:skill.perception", "trait:darkvision".</summary>
    public List<string> Grants { get; init; } = new();
    public List<ResourceDef> Resources { get; init; } = new();
    /// <summary>Short trait lines for the race picker (default: <see cref="Text"/>).</summary>
    public List<string> Traits { get; init; } = new();
    /// <summary>The player picks an ability for a bonus (read as ancestry.choice).</summary>
    public bool AbilityChoice { get; init; }
}

/// <summary>How a class casts. Slot counts per spell grade are formulas (usually table lookups by level).</summary>
public record SpellcastingDef
{
    public string Ability { get; init; } = "";
    /// <summary>true = prepares spells from a list (wizard, cleric); false = knows a fixed set (sorcerer, bard).</summary>
    public bool Prepared { get; init; } = true;
    public string Cantrips { get; init; } = "0";
    /// <summary>Spell grade → slots per day.</summary>
    public Dictionary<int, string> Slots { get; init; } = new();
    /// <summary>Spontaneous casters: spells known (total, all grades).</summary>
    public string? Known { get; init; }
    /// <summary>When used slots come back: "long" (default) or "short" (pact magic).</summary>
    public string SlotsReset { get; init; } = "long";
    /// <summary>Spontaneous casters: spells known per grade (0 = cantrips); grades left out = no access.</summary>
    public Dictionary<int, string> KnownByGrade { get; init; } = new();
    /// <summary>Extra slots per grade that only take special spells (domain, school); already in the slot counts.</summary>
    public string Special { get; init; } = "0";
    /// <summary>Default: the character level.</summary>
    public string? CasterLevel { get; init; }
    /// <summary>Kind of magic for prerequisites like "arcane spellcaster": "arcane", "divine" or none.</summary>
    public string? Tradition { get; init; }
}

/// <summary>A derived value: one formula, or the best/worst/first applicable option; plus modifiers targeting it.</summary>
public record StatFormula
{
    public string Key { get; init; } = "";
    public string? Expr { get; init; }
    /// <summary>"max" | "min" | "first" — how to combine applicable <see cref="Options"/>.</summary>
    public string Pick { get; init; } = "max";
    public List<StatOption> Options { get; init; } = new();
    /// <summary>Added after the base value (e.g. shield bonus on top of the best armor option).</summary>
    public string? Plus { get; init; }
}

public record StatOption
{
    public string? When { get; init; }
    public string Expr { get; init; } = "0";
}

/// <summary>Changes a value: target = stat key, ability key or wildcard ("save.*").</summary>
public record ModifierDef
{
    public string Target { get; init; } = "";
    public string Value { get; init; } = "0";
    /// <summary>Bonus type for stacking (deflection, morale …); null = untyped.</summary>
    public string? Type { get; init; }
    public string? When { get; init; }
}

/// <summary>"sum": everything adds up. "highest-per-type": per bonus type only the highest bonus counts
/// (untyped and <see cref="AlwaysStack"/> types add up); penalties always add up.</summary>
public record StackingRule
{
    public string Rule { get; init; } = "sum";
    public List<string> AlwaysStack { get; init; } = new();
}

public record ConditionDef
{
    public string Id { get; init; } = "";
    public string? Name { get; init; }
    public string? Icon { get; init; }
    public string Kind { get; init; } = "debuff";
    public string? Text { get; init; }
    public List<ModifierDef> Modifiers { get; init; } = new();
}

public record ClassContent
{
    public string Id { get; init; } = "";
    public string? Name { get; init; }
    public int HitDie { get; init; }
    /// <summary>Class level → what it grants.</summary>
    public Dictionary<int, LevelGrant> Levels { get; init; } = new();
    public Dictionary<string, FeatureDef> Features { get; init; } = new();
    /// <summary>Tags from taking the class, e.g. saving-throw proficiencies "prof:save.STR".</summary>
    public List<string> Grants { get; init; } = new();
    /// <summary>Class skills (ranks systems), base skill keys.</summary>
    public List<string> ClassSkills { get; init; } = new();
    /// <summary>Skill ranks per level before the Int modifier (readable as class.skillRanks).</summary>
    public int SkillRanks { get; init; }
    /// <summary>Feats the class grants outright (proficiencies, feat-like class features). They cost no slot.</summary>
    public List<FeatGrant> FeatGrants { get; init; } = new();
    public SpellcastingDef? Spellcasting { get; init; }
    public List<ClassValueDef> Values { get; init; } = new();
    public PerformanceDef? Performance { get; init; }
}

public record FeatEffectDef
{
    public List<ModifierDef> Modifiers { get; init; } = new();
    public List<string> Grants { get; init; } = new();
}

public record FeatGrant
{
    public int Level { get; init; } = 1;
    public List<string> Feats { get; init; } = new();
    public string? When { get; init; }
}

/// <summary>A kind of feat slot. Count and when are formulas; tiered slots come one per level in
/// <see cref="GainedAt"/>, each limited to the feats unlocked at that level (static or by a class choice).</summary>
public record FeatSlotDef
{
    public string Id { get; init; } = "";
    public string Label { get; init; } = "";
    public string? Count { get; init; }
    public string? When { get; init; }
    public bool IgnorePrereqs { get; init; }
    public bool Any { get; init; }
    public List<string> Types { get; init; } = new();
    /// <summary>Allowed feats (names); empty with no types and not Any = none.</summary>
    public List<string> Names { get; init; } = new();
    /// <summary>Allowed feats by a class-feature choice: feature name and option → names.</summary>
    public ChoiceNames? NamesByChoice { get; init; }
    public List<int> GainedAt { get; init; } = new();
    public List<FeatTier> Tiers { get; init; } = new();
    public ChoiceTiers? TiersByChoice { get; init; }
}

public record FeatTier
{
    public int Level { get; init; }
    public List<string> Feats { get; init; } = new();
}

public record ChoiceNames
{
    public string Feature { get; init; } = "";
    public Dictionary<string, List<string>> Options { get; init; } = new();
}

public record ChoiceTiers
{
    public string Feature { get; init; } = "";
    public Dictionary<string, List<FeatTier>> Options { get; init; } = new();
}

public record LevelGrant
{
    public List<string> Features { get; init; } = new();
}

public record FeatureDef
{
    public string? Name { get; init; }
    public string? Text { get; init; }
    public List<ModifierDef> Modifiers { get; init; } = new();
    public ResourceDef? Resource { get; init; }
    public ChoiceDef? Choice { get; init; }
    public List<string> Grants { get; init; } = new();
}

/// <summary>A pool used up and refilled on rest; <see cref="Max"/> is a formula.</summary>
public record ResourceDef
{
    public string Id { get; init; } = "";
    public string? Name { get; init; }
    public string Max { get; init; } = "1";
    /// <summary>When it refills: "short", "long", or null for every rest.</summary>
    public string? Reset { get; init; } = "long";
    /// <summary>Text template shown with it (default: when it refills).</summary>
    public string? Detail { get; init; }
    /// <summary>Formula; the resource only exists while it holds.</summary>
    public string? When { get; init; }
}

/// <summary>A class value that scales with level (sneak attack dice …); Value is a text template.</summary>
public record ClassValueDef
{
    public string Label { get; init; } = "";
    public string Value { get; init; } = "";
    public string? When { get; init; }
}

/// <summary>A situational bonus line (text template). With <see cref="ForEachPick"/> one line per pick of that
/// class feature (by name; with <see cref="PickLevels"/> only the picks the level allows), "{pick}" is the pick.</summary>
public record SituationalDef
{
    public string Text { get; init; } = "";
    public string? When { get; init; }
    public string? ForEachPick { get; init; }
    public List<int> PickLevels { get; init; } = new();
}

/// <summary>The player picks <see cref="Pick"/> of the options; becomes a step of the level-up assistant.</summary>
public record ChoiceDef
{
    public int Pick { get; init; } = 1;
    public List<ChoiceOption> Options { get; init; } = new();
    /// <summary>One further pick at each of these class levels (overrides <see cref="Pick"/>); picks are stored in level order.</summary>
    public List<int> PickLevels { get; init; } = new();
    /// <summary>The same option may be picked more than once.</summary>
    public bool Repeat { get; init; }
    /// <summary>Feature id (same class) whose picks are the options, e.g. raising one favored enemy.</summary>
    public string? OptionsFrom { get; init; }
    /// <summary>The player writes the pick freely (no options).</summary>
    public bool FreeText { get; init; }
}

public record ChoiceOption
{
    public string Id { get; init; } = "";
    public string? Name { get; init; }
    public string? Text { get; init; }
    /// <summary>Only for picks gained at this class level or later.</summary>
    public int MinLevel { get; init; }
    public List<ModifierDef> Modifiers { get; init; } = new();
    public ResourceDef? Resource { get; init; }
    /// <summary>Tags the pick unlocks, e.g. "prof:skill.athletics".</summary>
    public List<string> Grants { get; init; } = new();
}

// ── engine input / output ────────────────────────────────────────────────────

public record ClassLevel(string ClassId, int Level);

/// <summary>Everything the engine needs about a character; the host fills it from its storage.</summary>
public record EngineCharacter
{
    public int Level { get; init; } = 1;
    public Dictionary<string, int> Abilities { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public List<ClassLevel> Classes { get; init; } = new();
    /// <summary>Ancestry (race) id, or null.</summary>
    public string? Ancestry { get; init; }
    /// <summary>Background id, or null.</summary>
    public string? Background { get; init; }
    /// <summary>"classId/featureId" → picked option id(s), comma separated for several picks.</summary>
    public Dictionary<string, string> Choices { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Taken feats as (feat key, choice); order = order taken.</summary>
    public List<(string Key, string? Choice)> Feats { get; init; } = new();
    /// <summary>Stored class-feature choices by feature name (picks comma separated), for pickcount(…).</summary>
    public Dictionary<string, string> FeatureChoices { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Skill ranks by skill key ("stealth", "craft:Schmied").</summary>
    public Dictionary<string, int> Ranks { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Active condition ids.</summary>
    public HashSet<string> Conditions { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Free tags tested with has(…), e.g. "prof:perception", "toggle:rage".</summary>
    public HashSet<string> Tags { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Host-provided facts read as identifiers, e.g. armor.type = "light", armor.base = 13.</summary>
    public Dictionary<string, object> Facts { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>Equipped weapons (main hand first) as item facts: name, slot, key, attackBonus, damageBonus, dice,
    /// itemCritRange, itemCritMultiplier.</summary>
    public List<Dictionary<string, object>> Weapons { get; init; } = new();
    /// <summary>Class whose spellbook is evaluated (spellcasting, spell specials); null = the first class that casts.</summary>
    public string? SpellClass { get; init; }
    /// <summary>Modifiers from outside the package (equipped items, spells cast on the character).</summary>
    public List<(string Source, ModifierDef Modifier)> ExtraModifiers { get; init; } = new();
}

public record OpenChoice(string Key, string ClassId, string FeatureId, int Missing, List<string> Options);
public record EngineResource(string Id, string Name, int Max, string? Reset, string? Detail = null);
/// <param name="Key">Skill key, for kinds "&lt;skill&gt;:&lt;kind&gt;".</param>
public record EngineSkill(string Key, string Name, string Ability, double Value, bool Proficient, bool Expertise,
    int Ranks = 0, bool ClassSkill = false, bool TrainedOnly = false, bool ArmorCheck = false);
/// <summary>Spellcasting of the character's class: casting ability, prepared or known, cantrips and slots per grade.</summary>
public record EngineSpellcasting(string Ability, bool Prepared, int Cantrips, IReadOnlyDictionary<int, int> Slots, int? Known, string SlotsReset = "long",
    int[]? KnownByGrade = null, int Special = 0, int CasterLevel = 1);

public record EngineToggle(string Id, string Name, string Effect, bool Active);

public record EngineFeatSlot(string Id, string Label, int Count, bool IgnorePrereqs, string[] Types, string[] Names, bool Any);

public record EngineResult(
    IReadOnlyDictionary<string, double> Values,
    IReadOnlyList<OpenChoice> OpenChoices,
    IReadOnlyList<EngineResource> Resources,
    IReadOnlyList<string> Features,
    IReadOnlyList<EngineSkill> Skills,
    EngineSpellcasting? Spellcasting,
    IReadOnlySet<string> Tags,
    IReadOnlyList<string> GrantedFeats,
    IReadOnlyList<EngineFeatSlot> FeatSlots,
    IReadOnlyList<EngineToggle>? Toggles = null,
    IReadOnlyList<(string Label, string Value)>? ClassValues = null,
    IReadOnlyList<string>? Situational = null,
    EngineSpellSpecials? SpellSpecials = null,
    IReadOnlyDictionary<string, int>? Companions = null,
    IReadOnlyList<EngineAttack>? Attacks = null,
    EnginePerformance? Performance = null,
    IReadOnlyDictionary<int, int>? SharedSlots = null);

public record EnginePerformance(string Name, string Book, string Item, string Tab, int Rounds, int Dc, string Start,
    IReadOnlyList<EnginePerformanceEntry> List);
public record EnginePerformanceEntry(string Name, int Level, string Short, string Effect);
