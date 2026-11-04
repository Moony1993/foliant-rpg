using Microsoft.AspNetCore.Identity;

namespace Foliant.Api.Domain;

public class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = "";
    public bool MustChangePassword { get; set; }
    public List<Character> Characters { get; set; } = new();
}

public class Character : ICampaignOwned
{
    public int Id { get; set; }
    public int CampaignId { get; set; }
    public string UserId { get; set; } = "";
    public AppUser? User { get; set; }

    public string Name { get; set; } = "";
    public string Race { get; set; } = "";
    /// <summary>Primary class; it has every level not given to <see cref="ClassesJson"/>.</summary>
    public string Class { get; set; } = "";
    /// <summary>Character level (all classes together).</summary>
    public int Level { get; set; } = 1;
    /// <summary>Further classes (multiclass) in the order taken, JSON array e.g. [{"classId":"mage","level":2}].</summary>
    public string ClassesJson { get; set; } = "[]";
    public int Xp { get; set; }
    public string Background { get; set; } = "";
    public string Alignment { get; set; } = "";
    public string Description { get; set; } = "";
    public int Age { get; set; }
    public int Height { get; set; }         // cm
    public int Weight { get; set; }         // kg
    public string? PortraitUrl { get; set; }

    // Ability scores
    public int Str { get; set; } = 10;
    public int Dex { get; set; } = 10;
    public int Con { get; set; } = 10;
    public int Int { get; set; } = 10;
    public int Wis { get; set; } = 10;
    public int Cha { get; set; } = 10;
    /// <summary>Scores of rule-package abilities that have no column above (e.g. a system with eight abilities),
    /// JSON object by ability key, e.g. {"MU":12,"KL":14}. Keys matching Str…Cha by their first three letters use the columns.</summary>
    public string AbilitiesJson { get; set; } = "{}";

    // Current resource pools (max values are derived)
    public int CurrentHp { get; set; }
    /// <summary>Temporary hit points (rage, spells, …) — damage takes them first.</summary>
    public int TempHp { get; set; }
    public int CurrentMana { get; set; }
    public int Gold { get; set; }

    public string RuleSystemId { get; set; } = "pf1e";

    // Rules inputs for full coupling.
    public string Size { get; set; } = "Medium";     // Fine..Colossal
    public int Speed { get; set; } = 30;             // base land speed (ft)
    public string? RaceKey { get; set; }             // mechanical race (null = homebrew/none)
    public string? RaceBonusAbility { get; set; }    // for flexible +2 races (human/half-elf/half-orc)

    public List<InventoryItem> Items { get; set; } = new();
    public List<CharacterSkill> SkillRanks { get; set; } = new();
    /// <summary>Set by GM when granting a level up; cleared when player acknowledges.</summary>
    public bool PendingLevelUp { get; set; }

    /// <summary>Player's picks for class features that require a choice, as a JSON
    /// object { featureName: optionName }, e.g. {"Kampfstil":"Bogen"}.</summary>
    public string FeatureChoicesJson { get; set; } = "{}";

    /// <summary>Legacy: selected feat template ids, JSON array e.g. [3,17,42]. Superseded by
    /// <see cref="FeatsJson"/> (kept in sync for older readers).</summary>
    public string FeatIdsJson { get; set; } = "[]";

    /// <summary>Taken feats with name and choice, JSON array of
    /// <see cref="Rules.CharacterFeat"/>, e.g. [{"id":3,"name":"Weapon Focus","choice":"Longbow"}].</summary>
    public string FeatsJson { get; set; } = "[]";

    /// <summary>Ability score increases (+1 at 4th, 8th, 12th, 16th, 20th level) in level order,
    /// JSON array e.g. ["Dex","Dex","Str"]. Kept apart from the starting scores (Str…Cha).</summary>
    public string AbilityIncreasesJson { get; set; } = "[]";

    /// <summary>Switched-on combat options (toggles of the rule system), JSON array e.g. ["rage","power_attack"].</summary>
    public string ActiveAbilitiesJson { get; set; } = "[]";

    /// <summary>Daily resources spent today (resources of the rule system), JSON object e.g. {"rage":3,"channel":1}.</summary>
    public string ResourcesUsedJson { get; set; } = "{}";

    /// <summary>Spell tracker state (see SpellStateDto): prepared spell per slot and which
    /// slots are spent. Slot counts themselves are always derived from the rules.</summary>
    public string SpellStateJson { get; set; } = "{}";

    /// <summary>Ammunition the character carries (arrows, bolts …), JSON array of AmmoDto.</summary>
    public string AmmoJson { get; set; } = "[]";

    /// <summary>PF1e favored class bonus: each level in the favored class (single-class here, so
    /// every level) grants +1 HP or +1 skill rank. Counts of each choice; together ≤ Level.</summary>
    public int FavoredClassHp { get; set; }
    public int FavoredClassSkill { get; set; }
}

public class ItemTemplate : ICampaignLibrary
{
    public int Id { get; set; }
    /// <summary>null = shipped with the rule system; otherwise homebrew of this campaign.</summary>
    public int? CampaignId { get; set; }
    /// <summary>Rule system the row belongs to; shipped rows are only visible in campaigns of that system.</summary>
    public string RuleSystemId { get; set; } = "pf1e";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string IconKey { get; set; } = "default";
    public double Weight { get; set; }
    public int Value { get; set; }
    public Rarity Rarity { get; set; }
    public ItemCategory Category { get; set; }
    public EquipSlot? Slot { get; set; }
    /// <summary>JSON object of stat bonuses, e.g. {"Str":2,"MaxHp":5}. Summed when equipped.</summary>
    public string EffectsJson { get; set; } = "{}";
    /// <summary>Damage dice notation, e.g. "1d8" (empty = non-weapon).</summary>
    public string DamageDice { get; set; } = "";
    public int DamageBonus { get; set; }
    /// <summary>Critical hit on natural X or higher (default 20).</summary>
    public int CritRange { get; set; } = 20;
    /// <summary>Critical hit multiplier, e.g. 2 = ×2 (default 2).</summary>
    public int CritMultiplier { get; set; } = 2;
    /// <summary>Free-text extra weapon damage / on-hit properties, e.g. "1d6 Feuer; bei Treffer vergiftet".
    /// Descriptive (shown in the tooltip); there is no automatic combat resolution.</summary>
    public string BonusDamage { get; set; } = "";
    /// <summary>Base weapon (key in the rule system's weapon list) for weapons: proficiency, Weapon Focus &amp; co.,
    /// finesse, one-/two-handed. Null = no base weapon (generic attack only).</summary>
    public string? WeaponKey { get; set; }
    /// <summary>Bonus on attack rolls with this weapon (masterwork +1, or the enhancement bonus of a magic weapon).</summary>
    public int AttackBonus { get; set; }
    /// <summary>Armor category for armor and shields; None for everything else.</summary>
    public ArmorType ArmorType { get; set; }
    /// <summary>Arcane spell failure chance in percent (armor and shields).</summary>
    public int SpellFailure { get; set; }
    /// <summary>Effects only apply while the wearer is attuned to it (5e). Ignored by systems without attunement.</summary>
    public bool RequiresAttunement { get; set; }
    public string? CreatedByUserId { get; set; }   // null = system seed

    /// <summary>Whether a player can consume this item from their inventory.</summary>
    public bool IsUsable { get; set; }
    /// <summary>JSON delta applied once on use, e.g. {"CurrentHp":20} (heals) or {"CurrentHp":-10}
    /// (damages). Supported keys: CurrentHp, CurrentMana.</summary>
    public string UseEffectsJson { get; set; } = "{}";
    /// <summary>Name of a status effect to apply on use (null = none triggered).</summary>
    public string? UseStatusEffectName { get; set; }
    public string UseStatusEffectDescription { get; set; } = "";
    public string UseStatusEffectIcon { get; set; } = "✨";
    public string UseStatusEffectKind { get; set; } = "buff";   // buff | debuff
    /// <summary>Minutes until the triggered status effect expires; null = until manually removed.</summary>
    public int? UseStatusEffectDurationMinutes { get; set; }
}

public class InventoryItem
{
    public int Id { get; set; }
    public int CharacterId { get; set; }
    public Character? Character { get; set; }
    public int ItemTemplateId { get; set; }
    public ItemTemplate? Template { get; set; }
    public int Quantity { get; set; } = 1;
    public int GridIndex { get; set; }             // position in inventory grid
    public EquipSlot? EquippedSlot { get; set; }   // non-null = equipped
    /// <summary>When it was put on (UTC); PF1e: ability bonuses become permanent after 24h worn.</summary>
    public DateTime? EquippedAt { get; set; }
    /// <summary>Per-instance: false = player sees a masked template until the GM identifies it.</summary>
    public bool IsIdentified { get; set; } = true;
    /// <summary>The owner is attuned to this item (limit per rule system, see IAttunementRules).</summary>
    public bool Attuned { get; set; }
}

/// <summary>A GM-owned monster/NPC stat block. Values are GM-typed; equipped item
/// templates (referenced by id) add their EffectsJson bonuses on top.</summary>
public class Monster : ICampaignOwned
{
    public int Id { get; set; }
    public int CampaignId { get; set; }
    public string CreatedByUserId { get; set; } = "";   // GM owner
    public string Name { get; set; } = "";
    public string Size { get; set; } = "Medium";
    public string Type { get; set; } = "";               // freeform, e.g. "Goblinoid"
    public string Description { get; set; } = "";

    // Combat (GM-typed base values)
    public int MaxHp { get; set; }
    public int CurrentHp { get; set; }
    public int Ac { get; set; } = 10;
    public int Speed { get; set; } = 30;

    // Ability scores
    public int Str { get; set; } = 10;
    public int Dex { get; set; } = 10;
    public int Con { get; set; } = 10;
    public int Int { get; set; } = 10;
    public int Wis { get; set; } = 10;
    public int Cha { get; set; } = 10;

    // Saving throws
    public int Fort { get; set; }
    public int Ref { get; set; }
    public int Will { get; set; }

    /// <summary>Skills as JSON array [{name,bonus}].</summary>
    public string SkillsJson { get; set; } = "[]";
    /// <summary>Attacks as JSON array [{name,damageDice,bonus,critRange,critMultiplier}].</summary>
    public string AttacksJson { get; set; } = "[]";
    /// <summary>Equipped item template ids, JSON array e.g. [3,17].</summary>
    public string ItemTemplateIdsJson { get; set; } = "[]";
}

public class Message : ICampaignOwned
{
    public int Id { get; set; }
    public int CampaignId { get; set; }
    public string SenderId { get; set; } = "";
    public string RecipientId { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public bool IsImportant { get; set; }
    public bool IsRead { get; set; }
    public bool IsArchived { get; set; }
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    /// <summary>If set and in the future, the message is hidden from the recipient until then.</summary>
    public DateTime? ScheduledFor { get; set; }
}

/// <summary>A sticky-note card on the dashboard, owned by a user.</summary>
public class Note : ICampaignOwned
{
    public int Id { get; set; }
    public int CampaignId { get; set; }
    [System.ComponentModel.DataAnnotations.MaxLength(450)]
    public string UserId { get; set; } = "";
    public AppUser? User { get; set; }
    public string Title { get; set; } = "";
    public string Content { get; set; } = "";
    /// <summary>Tailwind colour key, e.g. "zinc", "amber", "sky", "rose", "emerald".</summary>
    public string Color { get; set; } = "zinc";
    public bool IsPinned { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>A feat in the compendium (crawled from the SRD). Characters reference these
/// by id via Character.FeatIdsJson.</summary>
public class FeatTemplate : ICampaignLibrary
{
    public int Id { get; set; }
    /// <summary>null = shipped with the rule system; otherwise homebrew of this campaign.</summary>
    public int? CampaignId { get; set; }
    /// <summary>Rule system the row belongs to; shipped rows are only visible in campaigns of that system.</summary>
    public string RuleSystemId { get; set; } = "pf1e";
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";
    public string Prerequisites { get; set; } = "";
    public string Benefit { get; set; } = "";
    public string Source { get; set; } = "";
    /// <summary>Set for player/GM-created (homebrew) feats; null = imported/seeded.</summary>
    public string? CreatedByUserId { get; set; }
    public string CreatedByName { get; set; } = "";
}

/// <summary>A temporary buff/debuff on a character, shown on the dashboard.</summary>
public class StatusEffect
{
    public int Id { get; set; }
    public int CharacterId { get; set; }
    public Character? Character { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Icon { get; set; } = "✨";
    public string Kind { get; set; } = "buff";   // buff | debuff
    public DateTime? ExpiresAt { get; set; }
}
