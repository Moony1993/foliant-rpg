namespace Foliant.Api.Domain;

/// <summary>A character-owned ability. Prereq + Tier drive the skill-tree layout/unlock.</summary>
public class Skill
{
    public int Id { get; set; }
    public int CharacterId { get; set; }
    public Character? Character { get; set; }

    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Type { get; set; } = "";        // category, e.g. Combat / Magic / Utility
    public int Rank { get; set; } = 1;
    public int MaxRank { get; set; } = 1;
    public int Cooldown { get; set; }              // rounds/seconds; 0 = none
    public bool IsPassive { get; set; }
    public bool Unlocked { get; set; }

    public int? RequiresSkillId { get; set; }      // prerequisite (same character); null = root
    public int Tier { get; set; }                  // tree depth (column/row)
}

/// <summary>A character-owned spell.</summary>
public class Spell
{
    public int Id { get; set; }
    public int CharacterId { get; set; }
    public Character? Character { get; set; }

    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int Grade { get; set; }                 // Zaubergrad 0-9
    public string Damage { get; set; } = "";       // e.g. "3d6 fire"
    public string Range { get; set; } = "";        // e.g. "30 ft"
    public string Cost { get; set; } = "";         // e.g. "1 slot" / mana
    public string Duration { get; set; } = "";     // e.g. "Concentration, 1 min"
    public bool Prepared { get; set; }
    /// <summary>School as in the compendium (e.g. "evocation" or "Hervorrufung"): Spell Focus, specialist slot.</summary>
    public string School { get; set; } = "";
    /// <summary>Saving throw text (e.g. "Reflex half", "none"): the spell's DC is shown when it allows a save.</summary>
    public string SavingThrow { get; set; } = "";
    /// <summary>Spellbook (casting class) the spell belongs to; "" = the first class that casts.</summary>
    public string ClassId { get; set; } = "";
}
// Spell slots are no longer stored — they're derived from class+level+casting ability
// by the rule system (IRuleSystem.SpellSlots). See SpellsController.Slots.

/// <summary>An animal, mount, or companion belonging to a character.</summary>
public class Companion
{
    public int Id { get; set; }
    public int CharacterId { get; set; }
    public Character? Character { get; set; }
    public string Name { get; set; } = "";
    public string Type { get; set; } = "Begleiter";   // Tier | Reittier | Begleiter
    public string Description { get; set; } = "";
    public int Hp { get; set; }
    public int Ac { get; set; }
    public int Speed { get; set; }
}

/// <summary>Ranks a character has invested in one PF1e skill (by skill key).</summary>
public class CharacterSkill
{
    public int Id { get; set; }
    public int CharacterId { get; set; }
    public Character? Character { get; set; }
    public string SkillKey { get; set; } = "";
    public int Ranks { get; set; }
}
