namespace Foliant.Api.Domain.Rules.Engine;

/// <summary>
/// A rule system read from a package: the engine computes, this class maps between the app's
/// character storage and the engine. Optional parts (feats, skill ranks, spells, companions …) are
/// not offered yet, so the app hides them for campaigns of such a system.
/// </summary>
public sealed class DeclarativeRuleSystem : IRuleSystem, ISkillValueRules, ISkillRankRules, IAttunementRules, IAbilityIncreaseRules, IFeatRules, IWeaponRules, ISpellSpecialRules, ICompanionRules, IPerformanceRules
{
    private readonly LoadedPackage _p;
    public DeclarativeRuleSystem(LoadedPackage package)
    {
        _p = package;
        Layout = new SheetLayout(Id, DisplayName, package.Layout.Abilities,
            package.Rules.Classes.Select(c => new ClassInfo(c.Id, c.Name ?? c.Id, c.Spellcasting != null, c.Spellcasting?.Tradition)).ToList(),
            package.Layout.Saves, package.Layout.SheetStats, package.Layout.CombatStats, package.Layout.PartyStats, package.Layout.ArmorDetail,
            package.Rules.Backgrounds.Count == 0 ? null : package.Rules.Backgrounds.Select(b => new ClassInfo(b.Id, b.Name ?? b.Id)).ToList(),
            package.Rules.Ammunition.Count == 0 ? null : package.Rules.Ammunition, package.Rules.AmmoMaterials.Count == 0 ? null : package.Rules.AmmoMaterials,
            package.Rules.FeatSlots.Count == 0 ? null : new FeatUi(package.Rules.FeatChoices, package.Rules.RepeatableFeats, package.Rules.FeatTree),
            package.Rules.CoreSources.Count == 0 ? null : package.Rules.CoreSources,
            package.Layout.QuickStats.Count == 0 ? null : package.Layout.QuickStats, package.Rules.AbilityIncreaseEvery);
        SaveDefinitions = package.Layout.Saves.Select(s => new SaveDef(s.Key[5..], s.Label, "")).ToList();
        Skills = package.Rules.Skills.Select(s => new SkillDef(s.Key, s.Name ?? s.Key, s.Ability, s.TrainedOnly)).ToList();
        Races = package.Rules.Ancestries.Select(a => new RaceDef(a.Id, a.Name ?? a.Id,
            FixedBonuses(a).Where(kv => package.Rules.Abilities.Contains(kv.Key, StringComparer.OrdinalIgnoreCase)).ToDictionary(kv => kv.Key, kv => kv.Value),
            a.AbilityChoice, a.Size, a.Speed, a.Traits.Count > 0 ? a.Traits.ToArray() : a.Text == null ? Array.Empty<string>() : new[] { a.Text })).ToList();
        Weapons = package.Rules.Weapons.Select(w => new WeaponDef(w.Key, w.Name ?? w.Key, Enum.Parse<WeaponProficiency>(w.Category, true),
            Enum.Parse<WeaponUse>(w.Use, true), w.Damage, w.CritRange, w.CritMultiplier, w.Finesse, w.Thrown)).ToList();
        _weapons = Weapons.ToDictionary(w => w.Key, StringComparer.OrdinalIgnoreCase);
    }

    public LoadedPackage Package => _p;

    public int AttunementLimit => _p.Rules.AttunementLimit;

    /// <summary>Optional parts the package actually uses (attunement only with a limit).</summary>
    private bool Ranked => _p.Rules.SkillMode == "ranks";

    public T? Capability<T>() where T : class =>
        (typeof(T) == typeof(IAttunementRules) && _p.Rules.AttunementLimit <= 0)
        || (typeof(T) == typeof(IAbilityIncreaseRules) && _p.Rules.AbilityIncreaseEvery <= 0)
        || (typeof(T) == typeof(ISkillRankRules) && !Ranked)
        || (typeof(T) == typeof(ISkillValueRules) && Ranked)
        || (typeof(T) == typeof(IFeatRules) && _p.Rules.FeatSlots.Count == 0)
        || (typeof(T) == typeof(IWeaponRules) && Weapons.Count == 0)
        || (typeof(T) == typeof(ICompanionRules) && _p.Rules.Companions.Kinds.Count == 0)
        || (typeof(T) == typeof(IPerformanceRules) && _p.Rules.Classes.All(c => c.Performance == null))
        || (typeof(T) == typeof(ISpellSpecialRules) && _p.Rules.SpellSpecials is { SpecialSlot.Count: 0, Opposition.Count: 0, BonusKnown.Count: 0 }) ? null : this as T;

    public EnginePerformance? Performance(Character c, IReadOnlyDictionary<string, int> equipmentBonuses) =>
        Evaluate(c, equipmentBonuses).Performance;
    public string? PerformanceClass(Character c) => ClassLevels(c).Select(x => Class(x.ClassId)!).FirstOrDefault(x => x.Performance != null)?.Id;

    // ── Companions ───────────────────────────────────────────────────────────
    public IReadOnlyList<string> Kinds => _p.Rules.Companions.Kinds.Select(k => k.Name).ToList();
    public IReadOnlyDictionary<string, int> Allowed(Character c) =>
        Evaluate(c, NoBonus).Companions ?? (IReadOnlyDictionary<string, int>)new Dictionary<string, int>();
    public CompanionBond? Bond(string kind, int effectiveLevel, int masterMaxHp) =>
        _p.Compiled.Bond(kind, effectiveLevel, masterMaxHp) is { } b
            ? new CompanionBond(kind, Math.Clamp(effectiveLevel, 1, 20), b.Hp, b.Lines.ToArray()) : null;

    // ── Spellbook specials ───────────────────────────────────────────────────
    public SpellSpecials Specials(Character c, IReadOnlyList<Spell> spells, string? classId = null)
    {
        var sp = Evaluate(c, NoBonus, spellClass: classId).SpellSpecials;
        string School(Spell s) => SpellNames.School(s.School, _p.Rules.SchoolAliases);
        bool Fits(SpellFilter f, Spell s) => f.Keys.Contains(SpellNames.Key(s.Name)) || f.Schools.Contains(School(s));
        return new SpellSpecials(
            sp?.SpecialSlot is { } slot ? spells.Where(s => Fits(slot, s)).Select(s => s.Id).ToList() : null,
            spells.Where(s => sp?.OppositionSchools.Contains(School(s)) == true).Select(s => s.Id).ToList(),
            spells.Where(s => sp?.BonusKnown.Contains(SpellNames.Key(s.Name)) == true).Select(s => s.Id).ToList());
    }

    /// <summary>The increases the level allows (one per <c>abilityIncreaseEvery</c> levels), in level order.</summary>
    public IReadOnlyList<string> AbilityIncreases(Character c)
    {
        if (_p.Rules.AbilityIncreaseEvery <= 0) return Array.Empty<string>();
        List<string> picks;
        try { picks = System.Text.Json.JsonSerializer.Deserialize<List<string>>(c.AbilityIncreasesJson) ?? new(); }
        catch { picks = new(); }
        return picks.Take(Math.Max(1, c.Level) / _p.Rules.AbilityIncreaseEvery).ToList();
    }
    public string Id => _p.Manifest.Id;
    public string DisplayName => _p.Manifest.Name;
    public SheetLayout Layout { get; }
    public IReadOnlyList<string> AbilityKeys => _p.Rules.Abilities;
    public IReadOnlyList<SaveDef> SaveDefinitions { get; }
    public IReadOnlyList<SkillDef> Skills { get; private set; } = Array.Empty<SkillDef>();
    public IReadOnlyList<RaceDef> Races { get; private set; } = Array.Empty<RaceDef>();

    /// <summary>Fixed ability bonuses of an ancestry (for display; the engine applies them itself).</summary>
    private static Dictionary<string, int> FixedBonuses(AncestryDef a) =>
        a.Modifiers.Where(m => int.TryParse(m.Value, out _) && m.When == null).GroupBy(m => m.Target)
            .ToDictionary(g => g.Key, g => g.Sum(m => int.Parse(m.Value)), StringComparer.OrdinalIgnoreCase);

    /// <summary>The character's classes known to the package, primary class first.</summary>
    private List<ClassLevel> ClassLevels(Character c) =>
        CharacterState.ClassLevels(c).Select(x => Class(x.ClassId) is { } cls ? x with { ClassId = cls.Id } : null).OfType<ClassLevel>().ToList();

    private ClassContent? Class(string? id) =>
        _p.Rules.Classes.FirstOrDefault(c => c.Id.Equals(id ?? "", StringComparison.OrdinalIgnoreCase));

    /// <summary>The app stores class-feature picks by feature/option name; the engine wants "class/feature" → option ids.</summary>
    private Dictionary<string, string> EngineChoices(Character c)
    {
        var stored = CharacterState.ReadFeatureChoices(c);
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var cls in ClassLevels(c).Select(x => Class(x.ClassId)!))
        foreach (var (fid, f) in cls.Features)
        {
            if (f.Choice == null || !stored.TryGetValue(f.Name ?? fid, out var picked)) continue;
            if (f.Choice.FreeText || f.Choice.OptionsFrom != null) { result[$"{cls.Id}/{fid}"] = picked; continue; }
            var ids = picked.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .Select(n => f.Choice.Options.FirstOrDefault(o => (o.Name ?? o.Id).Equals(n, StringComparison.OrdinalIgnoreCase))?.Id)
                .OfType<string>();
            result[$"{cls.Id}/{fid}"] = string.Join(",", ids);
        }
        return result;
    }

    public EngineResult Evaluate(Character c, IReadOnlyDictionary<string, int> equipmentBonuses, double carriedWeight = 0,
        IReadOnlyDictionary<string, object>? extraFacts = null, bool ignoreFeatureChoices = false, bool ignoreToggles = false, string? spellClass = null)
    {
        var extraScores = CharacterState.ReadAbilities(c);
        var increases = AbilityIncreases(c).GroupBy(a => a, StringComparer.OrdinalIgnoreCase)
            .Select(g => ("increase", new ModifierDef { Target = g.Key, Value = g.Count().ToString() }));
        var ec = new EngineCharacter
        {
            Level = Math.Max(1, c.Level),
            Abilities = _p.Rules.Abilities.ToDictionary(a => a, a => CharacterState.Score(c, a, extraScores), StringComparer.OrdinalIgnoreCase),
            Classes = ClassLevels(c),
            Ancestry = c.RaceKey,
            // The sheet stores the background id when the package lists backgrounds (free text otherwise).
            Background = string.IsNullOrWhiteSpace(c.Background) ? null : c.Background,
            Choices = EngineChoices(c),
            FeatureChoices = ignoreFeatureChoices ? new(StringComparer.OrdinalIgnoreCase) : CharacterState.ReadFeatureChoices(c),
            SpellClass = spellClass,
            Feats = CharacterState.ReadFeats(c).Select(f => (FeatNames.Key(f.Name), string.IsNullOrWhiteSpace(f.Choice) ? null : f.Choice)).ToList(),
            Tags = new HashSet<string>((ignoreToggles ? new HashSet<string>() : CharacterState.ReadActiveToggles(c)).Select(t => "toggle:" + t)
                .Concat(equipmentBonuses.Keys.Select(k => "item:" + k)), StringComparer.OrdinalIgnoreCase),
            Facts = Facts(c, equipmentBonuses, carriedWeight, extraFacts),
            Weapons = (c.Items ?? new()).Where(i => i.Template?.Category == ItemCategory.Weapon && i.EquippedSlot is EquipSlot.MainHand or EquipSlot.OffHand)
                .OrderBy(i => i.EquippedSlot).Select(i => new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                {
                    ["name"] = i.Template!.Name, ["slot"] = i.EquippedSlot == EquipSlot.OffHand ? "off" : "main", ["key"] = i.Template.WeaponKey ?? "",
                    ["attackBonus"] = (double)i.Template.AttackBonus, ["damageBonus"] = (double)i.Template.DamageBonus,
                    ["dice"] = string.IsNullOrWhiteSpace(i.Template.DamageDice) ? "" : i.Template.DamageDice,
                    ["itemCritRange"] = (double)i.Template.CritRange, ["itemCritMultiplier"] = (double)i.Template.CritMultiplier,
                }).ToList(),
            Ranks = (c.SkillRanks ?? new()).GroupBy(r => r.SkillKey, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Sum(r => r.Ranks), StringComparer.OrdinalIgnoreCase),
            // Item effects on abilities apply directly; every other effect is read explicitly as item.<key>
            // in the package's formulas (avoids counting e.g. an armor check penalty twice).
            ExtraModifiers = equipmentBonuses.Where(kv => _p.Rules.Abilities.Contains(kv.Key, StringComparer.OrdinalIgnoreCase))
                .Select(kv => ("item", new ModifierDef { Target = kv.Key, Value = kv.Value.ToString() }))
                // "Skill:<key>" item effects raise that skill (every kind of it).
                .Concat(equipmentBonuses.Where(kv => kv.Key.StartsWith("Skill:", StringComparison.OrdinalIgnoreCase))
                    .Select(kv => ("item", new ModifierDef { Target = "skill." + kv.Key[6..], Value = kv.Value.ToString() })))
                .Concat(increases).ToList(),
        };
        return _p.Compiled.Evaluate(ec);
    }

    /// <summary>
    /// What the app tells every package (documented contract): item.&lt;effectKey&gt; for each summed item
    /// effect (and the tag item:&lt;effectKey&gt; when present), armor.type (none/light/medium/heavy), armor.base
    /// (10 + armor bonus), shield.bonus, shield.equipped, carried (weight carried), size and baseSpeed (from the
    /// ancestry, else the character's own fields), favoredClassHp, ancestry.choice (picked ability of a flexible ancestry).
    /// </summary>
    private Dictionary<string, object> Facts(Character c, IReadOnlyDictionary<string, int> bonuses, double carriedWeight,
        IReadOnlyDictionary<string, object>? extra)
    {
        var facts = bonuses.ToDictionary(kv => "item." + kv.Key, kv => (object)(double)kv.Value, StringComparer.OrdinalIgnoreCase);
        var worn = (c.Items ?? new()).Where(i => i.EquippedSlot != null && i.Template != null).Select(i => i.Template!).ToList();
        // Several body armors (odd, but possible): the heaviest counts.
        var body = worn.Where(t => t.ArmorType is ArmorType.Light or ArmorType.Medium or ArmorType.Heavy).MaxBy(t => t.ArmorType);
        var shields = worn.Where(t => t.ArmorType is ArmorType.Shield or ArmorType.TowerShield).ToList();
        facts["armor.type"] = body?.ArmorType.ToString().ToLowerInvariant() ?? "none";
        facts["armor.acp"] = (double)(body == null ? 0 : Math.Min(0, Effect(body, "ArmorCheckPenalty")));
        facts["armor.spellFailure"] = (double)(body?.SpellFailure ?? 0);
        facts["shield.type"] = shields.Select(t => t.ArmorType).DefaultIfEmpty(ArmorType.None).Max().ToString().ToLowerInvariant();
        facts["shield.acp"] = (double)shields.Sum(t => Math.Min(0, Effect(t, "ArmorCheckPenalty")));
        facts["shield.spellFailure"] = (double)shields.Sum(t => t.SpellFailure);
        facts["armor.base"] = 10d + bonuses.GetValueOrDefault("ArmorBonus");
        facts["shield.bonus"] = (double)bonuses.GetValueOrDefault("ShieldBonus");
        facts["shield.equipped"] = worn.Any(t => t.ArmorType is ArmorType.Shield or ArmorType.TowerShield);
        var ancestry = _p.Rules.Ancestries.FirstOrDefault(a => a.Id.Equals(c.RaceKey ?? "", StringComparison.OrdinalIgnoreCase));
        facts["carried"] = carriedWeight;
        facts["size"] = (ancestry?.Size ?? c.Size ?? "Medium").ToLowerInvariant();
        facts["baseSpeed"] = (double)(ancestry?.Speed ?? c.Speed);
        facts["favoredClassHp"] = (double)c.FavoredClassHp;
        facts["ancestry.choice"] = c.RaceBonusAbility ?? "";
        facts["favoredClassSkill"] = (double)c.FavoredClassSkill;
        foreach (var (k, v) in extra ?? new Dictionary<string, object>()) facts[k] = v;
        return facts;
    }

    private static int Effect(ItemTemplate t, string key)
    {
        try { return System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, int>>(t.EffectsJson)?.GetValueOrDefault(key) ?? 0; }
        catch (System.Text.Json.JsonException) { return 0; }
    }

    public DerivedStats Compute(Character c, IReadOnlyDictionary<string, int> equipmentBonuses, double carriedWeight)
    {
        var r = Evaluate(c, equipmentBonuses, carriedWeight);
        int V(string key) => r.Values.TryGetValue(key, out var v) ? (int)Math.Floor(v) : 0;
        string[] loads = { "light", "medium", "heavy", "overloaded" };
        return new DerivedStats(
            Modifiers: _p.Rules.Abilities.ToDictionary(a => a, a => V("mod." + a)),
            Scores: _p.Rules.Abilities.ToDictionary(a => a, V),
            Saves: SaveDefinitions.ToDictionary(s => s.Key, s => V("save." + s.Key)),
            MaxHp: Math.Max(1, V("maxHp")), Initiative: V("initiative"),
            Bab: V("bab"), MeleeAttack: V("meleeAttack"), RangedAttack: V("rangedAttack"), Cmb: V("cmb"), Cmd: V("cmd"),
            Ac: V("ac"), TouchAc: V("touchAc"), FlatFootedAc: V("flatFootedAc"), ArmorCheckPenalty: V("armorCheckPenalty"),
            Speed: V("speed"), CarryCapacity: V("carryCapacity"), CarriedWeight: carriedWeight, Load: loads[Math.Clamp(V("loadLevel"), 0, 3)],
            PassivePerception: V("passivePerception"),
            // Budget = every slot the class and race give (counted without class choices, as the built-in rules do).
            FeatBudget: _p.Rules.FeatSlots.Count == 0 ? 0 : Evaluate(c, NoBonus, 0, null, ignoreFeatureChoices: true).FeatSlots.Sum(s => s.Count),
            SpellFailure: Math.Clamp(V("spellFailure"), 0, 100),
            ArmorType: Capitalize(Facts(c, equipmentBonuses, carriedWeight, null)["armor.type"] as string ?? "none"),
            // Per-day maxima ignore temporary toggles (rage raises Con, not the rounds of rage).
            Resources: (CharacterState.ReadActiveToggles(c).Count == 0 ? r : Evaluate(c, equipmentBonuses, carriedWeight, ignoreToggles: true)).Resources
                .Select(x => new DailyResource(x.Id, x.Name, Math.Max(0, x.Max), Math.Clamp(CharacterState.UsedResource(c, x.Id), 0, Math.Max(0, x.Max)),
                    x.Detail ?? "", x.Reset)).ToList(),
            Attacks: r.Attacks?.Select(a => new WeaponAttack(a.Name, a.Hand, a.Bonuses, a.Damage, a.Crit, a.Proficient, a.Notes, a.WeaponKey)).ToList(),
            ClassValues: r.ClassValues?.Select(v => new ClassValue(v.Label, v.Value)).ToList(),
            Situational: r.Situational,
            Toggles: r.Toggles?.Select(t => new AbilityToggle(t.Id, t.Name, t.Effect, t.Active)).ToList(),
            Values: r.Values);
    }

    private static string Capitalize(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s[1..];

    // ── Weapons ──────────────────────────────────────────────────────────────
    private readonly Dictionary<string, WeaponDef> _weapons;
    public IReadOnlyList<WeaponDef> Weapons { get; }
    public WeaponDef? Weapon(string key) => _weapons.GetValueOrDefault(key);
    public IReadOnlyList<string> ProficientWeapons(Character c)
    {
        var tags = Evaluate(c, NoBonus).Tags;
        return _p.Rules.Weapons.Where(w => CompiledRules.Proficient(tags, w)).Select(w => w.Key).ToList();
    }

    // ── Feats ────────────────────────────────────────────────────────────────
    public IReadOnlyList<FeatSlot> Slots(Character c) =>
        Evaluate(c, NoBonus).FeatSlots.Select(s => new FeatSlot(s.Id, s.Label, s.Count, s.IgnorePrereqs, s.Types, s.Names, s.Any)).ToList();
    public IReadOnlyList<string> GrantedFeats(Character c) => Evaluate(c, NoBonus).GrantedFeats;
    public FeatChoiceKind ChoiceOf(string featName) =>
        _p.Rules.FeatChoices.GetValueOrDefault(FeatNames.Key(featName)) switch
        {
            "weapon" => FeatChoiceKind.Weapon, "skill" => FeatChoiceKind.Skill, "school" => FeatChoiceKind.School, _ => FeatChoiceKind.None,
        };
    public bool IsRepeatable(string featName) => _p.Rules.RepeatableFeats.Contains(FeatNames.Key(featName));
    public bool Fits(IReadOnlyList<(string Name, string Type)> feats, IReadOnlyList<FeatSlot> slots) => FeatNames.Fits(feats, slots);

    /// <summary>Package class features in the app's shape; choices become picks in the class-feature UI.</summary>
    public IReadOnlyList<ClassFeature> ClassFeatures(string? className)
    {
        if (Class(className) is not { } cls) return Array.Empty<ClassFeature>();
        var levelOf = cls.Levels.SelectMany(kv => kv.Value.Features.Select(f => (f, kv.Key)))
            .GroupBy(x => x.f).ToDictionary(g => g.Key, g => g.Min(x => x.Key));
        return cls.Features.Where(f => levelOf.ContainsKey(f.Key)).OrderBy(f => levelOf[f.Key])
            .Select(f => f.Value.Choice is not { } ch ? new ClassFeature(levelOf[f.Key], f.Value.Name ?? f.Key, f.Value.Text ?? "")
                : new ClassFeature(levelOf[f.Key], f.Value.Name ?? f.Key, f.Value.Text ?? "",
                    ch.Options.Count == 0 ? null : ch.Options.Select(o => new ClassFeatureOption(o.Name ?? o.Id, o.Text ?? "", null, o.MinLevel)).ToList(),
                    ch.Pick, ch.PickLevels.Count == 0 ? null : ch.PickLevels, ch.Repeat,
                    ch.OptionsFrom == null ? null : cls.Features[ch.OptionsFrom].Name ?? ch.OptionsFrom, ch.FreeText))
            .ToList();
    }

    // ── Ranked skills (skillMode "ranks") ─────────────────────────────────────
    private SkillInfo? SkillInfo(string baseKey) => _p.Rules.Skills.FirstOrDefault(s => s.Key.Equals(baseKey, StringComparison.OrdinalIgnoreCase));

    public IReadOnlyList<RankedSkillRow> Sheet(Character c, IReadOnlyDictionary<string, int> equipmentBonuses, double carriedWeight)
    {
        var skills = Evaluate(c, equipmentBonuses, carriedWeight).Skills.ToDictionary(s => s.Key, StringComparer.OrdinalIgnoreCase);
        var ranked = new HashSet<string>(skills.Values.Where(s => s.Ranks > 0).Select(s => s.Key), StringComparer.OrdinalIgnoreCase);
        return Skills.SelectMany(def => Rows(def, ranked)).Where(r => skills.ContainsKey(r.Key)).Select(r =>
        {
            var s = skills[r.Key];
            return new RankedSkillRow(r.Key, r.Name, s.Ability, s.ClassSkill, s.TrainedOnly, s.ArmorCheck, s.Ranks, (int)Math.Floor(s.Value));
        }).ToList();
    }

    /// <summary>The package's "skillPoints" value, given the (permanent) Int modifier as skillPoints.intMod.</summary>
    public int SkillPoints(Character c, int intModifier) =>
        Evaluate(c, NoBonus, 0, new Dictionary<string, object> { ["skillPoints.intMod"] = (double)intModifier })
            .Values.TryGetValue("skillPoints", out var v) ? (int)Math.Floor(v) : 0;

    /// <summary>Fixed kinds expand (the plain row only while it has legacy ranks); free kinds keep the plain row
    /// (where a new kind is added) plus one row per ranked kind.</summary>
    public IEnumerable<(string Key, string Name)> Rows(SkillDef def, ICollection<string> rankedKeys)
    {
        var info = SkillInfo(def.Key);
        if (info == null) yield break;
        if (info.Types.Count == 0 || rankedKeys.Contains(def.Key)) yield return (def.Key, def.Name);
        foreach (var (k, n) in info.Types) yield return ($"{def.Key}:{k}", $"{def.Name} ({n})");
        if (info.FreeTypes)
            foreach (var k in rankedKeys.Where(k => k.StartsWith(def.Key + ":", StringComparison.OrdinalIgnoreCase)).Order())
                yield return (k, $"{def.Name} ({k[(def.Key.Length + 1)..]})");
    }

    public string? NormalizeKey(string key)
    {
        var parts = key.Split(':', 2);
        var info = SkillInfo(parts[0]);
        if (info == null) return null;
        if (parts.Length == 1) return info.Key;
        var kind = parts[1].Trim();
        if (info.Types.Count > 0) return info.Types.ContainsKey(kind) ? $"{info.Key}:{kind}" : null;
        return info.FreeTypes && kind.Length is > 0 and <= 40 ? $"{info.Key}:{kind}" : null;
    }

    public bool IsMultiSkill(string key) => SkillInfo(key) is { } s && (s.Types.Count > 0 || s.FreeTypes);

    public IReadOnlyList<SkillValue> SkillValues(Character c, IReadOnlyDictionary<string, int> equipmentBonuses) =>
        Evaluate(c, equipmentBonuses).Skills
            .Select(s => new SkillValue(s.Key, s.Name, s.Ability, (int)Math.Floor(s.Value), s.Proficient, s.Expertise)).ToList();

    private static readonly IReadOnlyDictionary<string, int> NoBonus = new Dictionary<string, int>();

    public IReadOnlyList<SpellSlotCount> SpellSlots(Character c, IReadOnlyDictionary<string, int> equipmentBonuses, string? classId = null) =>
        Evaluate(c, equipmentBonuses, spellClass: classId).Spellcasting is { } sc
            ? sc.Slots.OrderBy(kv => kv.Key).Select(kv => new SpellSlotCount(kv.Key, kv.Value, sc.Special)).ToList()
            : Array.Empty<SpellSlotCount>();

    /// <summary>Prepared casters prepare cantrips + slots; known casters get their known count on grade 1 (no per-grade table yet).</summary>
    public SpellcastingInfo? Spellcasting(Character c, string? classId = null) => Evaluate(c, NoBonus, spellClass: classId).Spellcasting is { } sc
        ? new SpellcastingInfo(sc.Prepared, sc.Cantrips, sc.Prepared ? null : sc.KnownByGrade ?? KnownArray(sc), sc.SlotsReset == "short")
        : null;

    // ponytail: spontaneous casters list their total "known" count on grade 1 — split per grade when a package needs it.
    private static int[] KnownArray(EngineSpellcasting sc)
    {
        var known = new int[10];
        known[0] = sc.Cantrips;
        for (int g = 1; g <= 9; g++) known[g] = sc.Slots.ContainsKey(g) ? (g == 1 ? sc.Known ?? 0 : 0) : -1;
        return known;
    }

    public string? CastingAbility(Character c, string? classId = null) =>
        CastingClasses(c).FirstOrDefault(x => classId == null || x.Id.Equals(classId, StringComparison.OrdinalIgnoreCase))?.Spellcasting?.Ability;
    /// <summary>The character's classes that cast spells, primary class first; each has its own spellbook.</summary>
    public SharedSpellSlots? SharedSpellSlots(Character c, IReadOnlyDictionary<string, int> equipmentBonuses) =>
        Evaluate(c, equipmentBonuses).SharedSlots is { } slots && _p.Rules.MulticlassSpellSlots is { } mc
            ? new SharedSpellSlots(mc.Classes, slots) : null;
    public IReadOnlyList<string> CastingClassIds(Character c) => CastingClasses(c).Select(x => x.Id).ToList();
    public IReadOnlyList<ClassContent> CastingClasses(Character c) => ClassLevels(c).Select(x => Class(x.ClassId)!).Where(x => x.Spellcasting != null).ToList();
    public int CasterLevel(Character c, string? classId = null) => Evaluate(c, NoBonus, spellClass: classId).Spellcasting?.CasterLevel ?? 0;
    public IReadOnlySet<string> ClassSkills(string? className) =>
        new HashSet<string>(Class(className)?.ClassSkills ?? new(), StringComparer.OrdinalIgnoreCase);
}
