namespace Foliant.Api.Domain.Rules;

/// <summary>How a value is shown: plain number, with sign (+2), distance (ft → m), weight (lb → kg), percent.</summary>
public static class StatFormat
{
    public const string Number = "number", Signed = "signed", Distance = "distance", Weight = "weight", Percent = "percent";
}

/// <summary>
/// One derived value. <paramref name="Key"/> is the field of the derived stats in camelCase
/// ("ac", "initiative") or "save.&lt;Key&gt;" for a saving throw.
/// </summary>
public record StatDef(string Key, string Label, string Format = StatFormat.Number, string? Short = null);

/// <summary>A tile in the dashboard's top row, between hit points and gold. <paramref name="Detail"/> is a template
/// ({key} placeholders) for a small second line; <paramref name="Icon"/> one of <see cref="QuickStatIcons"/>;
/// <paramref name="Short"/> the label on phones, where the tiles are narrow.</summary>
public record QuickStatDef(string Key, string Label, string Format = StatFormat.Number, string? Detail = null, string? Icon = null, string? Short = null);

public static class QuickStatIcons
{
    public static readonly IReadOnlySet<string> All = new HashSet<string> { "shield", "zap", "star", "sparkles", "target", "swords", "footprints", "eye", "heart", "brain" };
    public const int Max = 3;
}

public record AbilityDef(string Key, string Label, string Name);
/// <param name="Caster">The class casts spells (at some level).</param>
/// <param name="Tradition">"arcane", "divine" or null — for prerequisites like "arcane spellcaster".</param>
public record ClassInfo(string Key, string Name, bool Caster = false, string? Tradition = null);

/// <summary>
/// What the UI shows for a rule system — the client renders this instead of hard-coding one system's
/// values. Templates use {key} placeholders filled with derived values.
/// </summary>
/// <param name="SheetStats">Grid on the character sheet.</param>
/// <param name="CombatStats">Combat block on the dashboard and in the GM's character details.</param>
/// <param name="PartyStats">Columns of the GM's party table.</param>
/// <param name="ArmorDetail">Sub line of the armor card, e.g. "RK · Berührung {touchAc} · Flach {flatFootedAc}".</param>
public record SheetLayout(
    string Id, string Name,
    IReadOnlyList<AbilityDef> Abilities,
    IReadOnlyList<ClassInfo> Classes,
    IReadOnlyList<StatDef> Saves,
    IReadOnlyList<StatDef> SheetStats,
    IReadOnlyList<StatDef> CombatStats,
    IReadOnlyList<StatDef> PartyStats,
    string ArmorDetail,
    /// <summary>Backgrounds to pick from (empty = free text).</summary>
    IReadOnlyList<ClassInfo>? Backgrounds = null,
    /// <summary>Armory of the quiver (null = none).</summary>
    IReadOnlyList<Engine.AmmoDef>? Ammunition = null,
    IReadOnlyList<Engine.AmmoMaterialDef>? AmmoMaterials = null,
    /// <summary>Feats page: feats with a choice (key → weapon/skill/school), repeatable feats, tree and prerequisites.</summary>
    FeatUi? Feats = null,
    /// <summary>Sources that count as core rules (null = no "core rulebook only" filter).</summary>
    IReadOnlyList<string>? CoreSources = null,
    /// <summary>Dashboard tiles between hit points and gold (null = armor class and initiative).</summary>
    IReadOnlyList<QuickStatDef>? QuickStats = null,
    /// <summary>One ability increase every N character levels (0 = none).</summary>
    int AbilityIncreaseEvery = 0);

public record FeatUi(IReadOnlyDictionary<string, string> Choices, IReadOnlyList<string> Repeatable, Engine.FeatTreeDef? Tree);
