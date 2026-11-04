namespace Foliant.Api.Domain;

/// <summary>
/// A spell in the shared compendium. PF1e spells have per-class levels, stored as a JSON map
/// (e.g. {"cleric":1,"bard":1}). Players copy compendium spells onto their character.
/// </summary>
public class CompendiumSpell : ICampaignLibrary
{
    public int Id { get; set; }
    /// <summary>null = shipped with the rule system; otherwise homebrew of this campaign.</summary>
    public int? CampaignId { get; set; }
    /// <summary>Rule system the row belongs to; shipped rows are only visible in campaigns of that system.</summary>
    public string RuleSystemId { get; set; } = "pf1e";
    public string Name { get; set; } = "";
    public string School { get; set; } = "";
    public string Description { get; set; } = "";
    public string Range { get; set; } = "";
    public string Duration { get; set; } = "";
    public string CastingTime { get; set; } = "";
    public string Components { get; set; } = "";
    public string SavingThrow { get; set; } = "";
    public string Damage { get; set; } = "";
    /// <summary>Source book, e.g. "SRD 5.1" or a book and page. Empty for homebrew.</summary>
    public string Source { get; set; } = "";
    /// <summary>JSON: class key -> spell level for that class, e.g. {"wizard":3,"sorcerer":3}.</summary>
    public string ClassLevelsJson { get; set; } = "{}";
    /// <summary>Set for player/GM-created (homebrew) spells; null = imported/seeded.</summary>
    public string? CreatedByUserId { get; set; }
    public string CreatedByName { get; set; } = "";
}
