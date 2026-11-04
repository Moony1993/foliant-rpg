using System.Text.Json;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Dtos;

namespace Foliant.Api.Services;

/// <summary>Maps a Character (with Items+Templates loaded) to a DTO with computed stats.</summary>
public class CharacterMapper
{
    private readonly RuleSystemRegistry _rules;
    public CharacterMapper(RuleSystemRegistry rules) => _rules = rules;

    /// <summary>
    /// Sum the EffectsJson of all equipped items into one bonus map. Most keys sum; "MaxDex"
    /// is special — armor imposes a *cap*, so we keep the minimum as "MaxDexCap".
    /// </summary>
    public static Dictionary<string, int> EquipmentBonuses(Character c, Func<InventoryItem, bool>? filter = null)
    {
        var totals = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        int? maxDexCap = null;
        // An item that needs attunement only counts while attuned (never set in systems without attunement).
        foreach (var item in c.Items.Where(i => i.EquippedSlot != null && i.Template != null && (filter == null || filter(i))
                     && (!i.Template.RequiresAttunement || i.Attuned)))
        {
            Dictionary<string, int>? effects;
            try { effects = JsonSerializer.Deserialize<Dictionary<string, int>>(item.Template!.EffectsJson); }
            catch { effects = null; }   // ignore malformed effects rather than 500
            if (effects == null) continue;
            foreach (var (k, v) in effects)
            {
                if (k.Equals("MaxDex", StringComparison.OrdinalIgnoreCase))
                    maxDexCap = maxDexCap is int m ? Math.Min(m, v) : v;
                else
                    totals[k] = totals.GetValueOrDefault(k) + v;
            }
        }
        if (maxDexCap is int cap) totals["MaxDexCap"] = cap;
        return totals;
    }

    /// <summary>Total weight of everything the character carries (equipped or not).</summary>
    public static double CarriedWeight(Character c) =>
        c.Items.Where(i => i.Template != null).Sum(i => i.Template!.Weight * i.Quantity);

    /// <summary>Parse the character's feature-choice JSON ({ featureName: optionName }).</summary>
    public static Dictionary<string, string> FeatureChoices(Character c) => CharacterState.ReadFeatureChoices(c);

    /// <summary>Fold the flat Effects of chosen feature options into the bonus map (like equipment).
    /// Situational options carry no Effects and change nothing.</summary>
    private static void AddFeatureBonuses(Dictionary<string, int> totals, Character c, IRuleSystem rules)
    {
        var choices = FeatureChoices(c);
        if (choices.Count == 0) return;
        var features = rules.ClassFeatures(c.Class);
        foreach (var (featName, value) in choices)
        {
            var feat = features.FirstOrDefault(f => f.Name == featName);
            if (feat?.Options == null) continue;
            // Multi-pick features store their picks comma-separated.
            foreach (var optName in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var opt = feat.Options.FirstOrDefault(o => o.Name == optName);
                if (opt?.Effects == null) continue;
                foreach (var (k, v) in opt.Effects)
                    totals[k] = totals.GetValueOrDefault(k) + v;
            }
        }
    }

    /// <summary>Ids of the character's feats (a feat taken for several weapons appears once per instance).</summary>
    public static List<int> FeatIds(Character c) => CharacterState.ReadFeats(c).Select(f => f.Id).ToList();

    public CharacterDto ToDto(Character c) => ToDto(c, reveal: false);

    public int MaxHp(Character c) => ToDto(c).Derived.MaxHp;

    /// <summary>
    /// PF1: gaining max HP (level, Con, Toughness, rage, items) adds as many current HP; losing it takes them away.
    /// Call after the change with the max HP from before it.
    /// </summary>
    public void HpFollowsMax(Character c, int maxBefore)
    {
        int after = MaxHp(c);
        if (after != maxBefore) c.CurrentHp = Math.Clamp(c.CurrentHp + after - maxBefore, 0, after);
    }

    /// <param name="reveal">true = GM view: unidentified items show their real template.</param>
    public CharacterDto ToDto(Character c, bool reveal)
    {
        var rules = _rules.For(c.RuleSystemId);
        var bonuses = EquipmentBonuses(c);
        AddFeatureBonuses(bonuses, c, rules);
        var derived = rules.Compute(c, bonuses, CarriedWeight(c));
        var items = c.Items
            .OrderBy(i => i.GridIndex)
            .Select(i => ToItemDto(i, reveal))
            .ToList();
        // currentHp can never exceed the (equipment-dependent) max — keeps the pools coupled.
        var currentHp = Math.Clamp(c.CurrentHp, 0, derived.MaxHp);
        return new CharacterDto(
            c.Id, c.Name, c.Race, c.Class, c.Level, c.Xp, c.Background, c.Alignment,
            c.Description, c.Age, c.Height, c.Weight, c.PortraitUrl,
            c.Str, c.Dex, c.Con, c.Int, c.Wis, c.Cha,
            currentHp, c.CurrentMana, c.Gold, c.RuleSystemId, derived, items,
            c.Size, c.Speed, c.RaceKey, c.RaceBonusAbility, c.PendingLevelUp, FeatureChoices(c), FeatIds(c),
            c.FavoredClassHp, c.FavoredClassSkill,
            // Optional parts: null when the campaign's rule system doesn't have them.
            rules.Capability<IFeatRules>()?.Slots(c).ToList(), rules.Capability<IFeatRules>()?.GrantedFeats(c).ToList(), CharacterState.ReadFeats(c),
            rules.Capability<IWeaponRules>()?.ProficientWeapons(c).ToList(),
            rules.Capability<IAbilityIncreaseRules>()?.AbilityIncreases(c).ToList(), c.TempHp,
            rules.AbilityKeys.ToDictionary(k => k, k => CharacterState.Score(c, k)), CharacterState.ClassLevels(c).Skip(1).ToList());
    }

    public static InventoryItemDto ToItemDto(InventoryItem i) => ToItemDto(i, reveal: false);

    public static InventoryItemDto ToItemDto(InventoryItem i, bool reveal) => new(
        i.Id, i.ItemTemplateId, i.Quantity, i.GridIndex, i.EquippedSlot?.ToString(),
        i.IsIdentified || reveal ? ToTemplateDto(i.Template!) : Masked(i.Template!), i.IsIdentified, i.Attuned);

    /// <summary>What a player sees of an unidentified item: base shape only, magic hidden.
    /// Bonuses still apply when equipped (EquipmentBonuses reads the real template).</summary>
    private static ItemTemplateDto Masked(ItemTemplate t) => ToTemplateDto(t) with
    {
        Name = $"Unidentified ({t.Category switch
        {
            ItemCategory.Weapon => "Weapon", ItemCategory.Armor => "Armor",
            ItemCategory.Consumable => "Consumable", _ => "Item",
        }})",
        Description = "This item has not been identified yet.",
        Rarity = Rarity.Common.ToString(),
        EffectsJson = "{}", UseEffectsJson = "{}", BonusDamage = "",
        UseStatusEffectName = null, UseStatusEffectDescription = "",
    };

    public static ItemTemplateDto ToTemplateDto(ItemTemplate t) => new(
        t.Id, t.Name, t.Description, t.IconKey, t.Weight, t.Value,
        t.Rarity.ToString(), t.Category.ToString(), t.Slot?.ToString(), t.EffectsJson,
        t.DamageDice, t.DamageBonus, t.CritRange, t.CritMultiplier,
        t.IsUsable, t.UseEffectsJson, t.UseStatusEffectName, t.UseStatusEffectDescription,
        t.UseStatusEffectIcon, t.UseStatusEffectKind, t.UseStatusEffectDurationMinutes, t.BonusDamage,
        t.WeaponKey, t.ArmorType.ToString(), t.SpellFailure, t.AttackBonus, t.RequiresAttunement);
}
