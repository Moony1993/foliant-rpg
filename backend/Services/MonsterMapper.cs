using System.Text.Json;
using Foliant.Api.Domain;
using Foliant.Api.Dtos;

namespace Foliant.Api.Services;

/// <summary>Maps a Monster (+ its equipped ItemTemplates) to a DTO with effective stats.
/// Effective values = GM-typed base + summed EffectsJson of equipped item templates.</summary>
public static class MonsterMapper
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static List<int> ItemIds(Monster m) => Parse<List<int>>(m.ItemTemplateIdsJson) ?? new();
    public static List<MonsterSkillDto> Skills(Monster m) => Parse<List<MonsterSkillDto>>(m.SkillsJson) ?? new();
    public static List<MonsterAttackDto> Attacks(Monster m) => Parse<List<MonsterAttackDto>>(m.AttacksJson) ?? new();

    /// <summary>Sum numeric effect keys across the given EffectsJson strings (malformed = ignored).</summary>
    public static Dictionary<string, int> SumEffects(IEnumerable<string> effectsJson)
    {
        var totals = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in effectsJson)
        {
            var effects = Parse<Dictionary<string, int>>(raw);
            if (effects == null) continue;
            foreach (var (k, v) in effects)
                totals[k] = totals.GetValueOrDefault(k) + v;
        }
        return totals;
    }

    /// <param name="equipped">The ItemTemplates referenced by the monster's ItemTemplateIdsJson.</param>
    public static MonsterDto ToDto(Monster m, IReadOnlyList<ItemTemplate> equipped)
    {
        var b = SumEffects(equipped.Select(t => t.EffectsJson));
        int Ability(string key, int baseVal) => baseVal + b.GetValueOrDefault(key);
        int ac = m.Ac + b.GetValueOrDefault("NaturalArmor") + b.GetValueOrDefault("Deflection")
                 + b.GetValueOrDefault("Dodge") + b.GetValueOrDefault("Armor") + b.GetValueOrDefault("Shield");

        int effMaxHp = m.MaxHp + b.GetValueOrDefault("MaxHp");

        // Base attacks + one derived attack per equipped weapon (template with damage dice).
        var effAttacks = Attacks(m).ToList();
        effAttacks.AddRange(equipped
            .Where(t => !string.IsNullOrWhiteSpace(t.DamageDice))
            .Select(t => new MonsterAttackDto(t.Name, t.DamageDice, t.DamageBonus, t.CritRange, t.CritMultiplier)));

        return new MonsterDto(
            m.Id, m.Name, m.Size, m.Type, m.Description,
            m.MaxHp, Math.Clamp(m.CurrentHp, 0, effMaxHp), m.Ac, m.Speed,
            m.Str, m.Dex, m.Con, m.Int, m.Wis, m.Cha,
            m.Fort, m.Ref, m.Will,
            Skills(m), Attacks(m), ItemIds(m),
            effMaxHp, ac,
            Ability("Str", m.Str), Ability("Dex", m.Dex), Ability("Con", m.Con),
            Ability("Int", m.Int), Ability("Wis", m.Wis), Ability("Cha", m.Cha),
            m.Fort + b.GetValueOrDefault("Fort"), m.Ref + b.GetValueOrDefault("Ref"), m.Will + b.GetValueOrDefault("Will"),
            effAttacks, equipped.Select(CharacterMapper.ToTemplateDto).ToList());
    }

    /// <summary>Write the input's fields (incl. JSON-serialized lists) onto an entity.</summary>
    public static void Apply(Monster m, MonsterInput i, string ownerId)
    {
        m.CreatedByUserId = ownerId;
        m.Name = i.Name; m.Size = i.Size; m.Type = i.Type; m.Description = i.Description;
        m.MaxHp = i.MaxHp; m.CurrentHp = i.CurrentHp; m.Ac = i.Ac; m.Speed = i.Speed;
        m.Str = i.Str; m.Dex = i.Dex; m.Con = i.Con; m.Int = i.Int; m.Wis = i.Wis; m.Cha = i.Cha;
        m.Fort = i.Fort; m.Ref = i.Ref; m.Will = i.Will;
        m.SkillsJson = JsonSerializer.Serialize(i.Skills, Json);
        m.AttacksJson = JsonSerializer.Serialize(i.Attacks, Json);
        m.ItemTemplateIdsJson = JsonSerializer.Serialize(i.ItemTemplateIds.Distinct().ToList(), Json);
    }

    private static T? Parse<T>(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return default;
        try { return JsonSerializer.Deserialize<T>(raw, Json); }
        catch { return default; }
    }
}
