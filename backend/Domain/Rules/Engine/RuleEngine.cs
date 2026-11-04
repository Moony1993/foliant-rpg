namespace Foliant.Api.Domain.Rules.Engine;

/// <summary>
/// A rule package compiled once: every formula parsed and checked, stat dependencies free of cycles.
/// <see cref="Evaluate"/> then computes a character's values lazily (each stat once, in dependency order).
/// </summary>
public sealed class CompiledRules
{
    private static readonly HashSet<string> Functions = new(StringComparer.OrdinalIgnoreCase)
    {
        "floor", "ceil", "round", "abs", "min", "max", "clamp", "pow", "mod", "has", "table", "skill", "stat", "count", "pickcount", "ranks", "pick", "perclass", "classhas",
    };

    internal readonly RuleDefinition Def;
    internal readonly Expr AbilityModifier;
    internal readonly Dictionary<string, CompiledStat> Stats = new(StringComparer.OrdinalIgnoreCase);
    internal readonly HashSet<string> Abilities;
    internal readonly Dictionary<string, ClassContent> Classes;
    internal readonly Dictionary<string, ConditionDef> Conditions;
    private readonly Dictionary<ModifierDef, (Expr Value, Expr? When)> _modifiers = new(ReferenceEqualityComparer.Instance);
    private readonly Dictionary<ResourceDef, Expr> _resources = new(ReferenceEqualityComparer.Instance);

    /// <param name="SkillAbility">Set for skills computed with the package's skill formula.</param>
    internal sealed record CompiledStat(string Key, Expr? Base, string Pick, List<(Expr? When, Expr Value)> Options, Expr? Plus, string? SkillAbility = null);
    internal readonly Dictionary<string, AncestryDef> Ancestries;
    internal readonly Dictionary<SpellcastingDef, (Expr Cantrips, Dictionary<int, Expr> Slots, Expr? Known)> Casting = new(ReferenceEqualityComparer.Instance);

    private CompiledRules(RuleDefinition def)
    {
        Def = def;
        Abilities = new HashSet<string>(def.Abilities, StringComparer.OrdinalIgnoreCase);
        Classes = def.Classes.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase);
        Conditions = def.Conditions.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase);
        Ancestries = def.Ancestries.ToDictionary(a => a.Id, StringComparer.OrdinalIgnoreCase);
        AbilityModifier = Parse(def.AbilityModifier, "abilityModifier");
    }

    /// <summary>Compiles a package definition; RuleException names the place of the first error.</summary>
    public static CompiledRules Compile(RuleDefinition def)
    {
        var r = new CompiledRules(def);
        foreach (var s in def.Stats)
        {
            if (string.IsNullOrWhiteSpace(s.Key)) throw new RuleException("A value (stats) has no key.");
            var at = $"stats[{s.Key}]";
            if (r.Stats.ContainsKey(s.Key)) throw new RuleException($"{at}: defined twice.");
            if (r.Abilities.Contains(s.Key)) throw new RuleException($"{at}: has the same name as an ability.");
            if (s.Expr == null && s.Options.Count == 0) throw new RuleException($"{at}: needs expr or options.");
            if (s.Pick is not ("max" or "min" or "first")) throw new RuleException($"{at}: pick must be max, min or first.");
            r.Stats[s.Key] = new CompiledStat(s.Key,
                s.Expr == null ? null : r.Parse(s.Expr, $"{at}.expr"), s.Pick,
                s.Options.Select((o, i) => (o.When == null ? null : r.Parse(o.When, $"{at}.options[{i}].when"), r.Parse(o.Expr, $"{at}.options[{i}].expr"))).ToList(),
                s.Plus == null ? null : r.Parse(s.Plus, $"{at}.plus"));
        }
        // Skills become values "skill.<key>" unless the package defines that value itself.
        var skillFormula = def.Skills.Count > 0 ? r.Parse(def.SkillFormula, "skillFormula") : null;
        foreach (var sk in def.Skills)
        {
            var at = $"skills[{sk.Key}]";
            if (string.IsNullOrWhiteSpace(sk.Key)) throw new RuleException("A skill (skills) has no key.");
            if (!r.Abilities.Contains(sk.Ability)) throw new RuleException($"{at}: ability \"{sk.Ability}\" does not exist.");
            if (!r.Stats.ContainsKey("skill." + sk.Key))
                r.Stats["skill." + sk.Key] = new CompiledStat("skill." + sk.Key, skillFormula, "max", new(), null, sk.Ability);
        }
        foreach (var a in def.Ancestries)
        {
            r.AddModifiers(a.Modifiers, $"ancestries[{a.Id}]");
            foreach (var res in a.Resources) r.AddResource(res, $"ancestries[{a.Id}].resources[{res.Id}]");
        }
        foreach (var b in def.Backgrounds) r.AddModifiers(b.Modifiers, $"backgrounds[{b.Id}]");
        foreach (var c in def.Conditions) r.AddModifiers(c.Modifiers, $"conditions[{c.Id}]");
        foreach (var cls in def.Classes)
        {
            if (cls.Spellcasting is { } sc)
            {
                var at = $"classes[{cls.Id}].spellcasting";
                if (!r.Abilities.Contains(sc.Ability)) throw new RuleException($"{at}: ability \"{sc.Ability}\" does not exist.");
                r.Casting[sc] = (r.Parse(sc.Cantrips, $"{at}.cantrips"),
                    sc.Slots.ToDictionary(kv => kv.Key, kv => r.Parse(kv.Value, $"{at}.slots[{kv.Key}]")),
                    sc.Known == null ? null : r.Parse(sc.Known, $"{at}.known"));
                r.Precompile(sc.Special, $"{at}.special");
                if (sc.CasterLevel != null) r.Precompile(sc.CasterLevel, $"{at}.casterLevel");
                foreach (var (g, f) in sc.KnownByGrade)
                    if (g is < 0 or > 9) throw new RuleException($"{at}.knownByGrade: level {g} does not exist.");
                    else r.Precompile(f, $"{at}.knownByGrade[{g}]");
                if (sc.Tradition is not (null or "arcane" or "divine")) throw new RuleException($"{at}.tradition must be \"arcane\" or \"divine\".");
            }
            if (cls.Performance is { } pf)
            {
                var at = $"classes[{cls.Id}].performance";
                r.Precompile(pf.Rounds, $"{at}.rounds");
                r.Precompile(pf.Dc, $"{at}.dc");
                foreach (var e in pf.List)
                {
                    if (string.IsNullOrWhiteSpace(e.Name)) throw new RuleException($"{at}.list: name missing.");
                    r.CheckTemplate(e.Effect, $"{at}.list[{e.Name}].effect");
                }
            }
            foreach (var (lvl, grant) in cls.Levels)
                foreach (var f in grant.Features)
                    if (!cls.Features.ContainsKey(f)) throw new RuleException($"classes[{cls.Id}].levels[{lvl}]: feature \"{f}\" is not defined.");
            foreach (var (id, f) in cls.Features)
            {
                var at = $"classes[{cls.Id}].features[{id}]";
                r.AddModifiers(f.Modifiers, at);
                if (f.Resource != null) r.AddResource(f.Resource, $"{at}.resource");
                if (f.Choice != null)
                {
                    var ch = f.Choice;
                    if (ch.OptionsFrom != null && !cls.Features.ContainsKey(ch.OptionsFrom)) throw new RuleException($"{at}.choice.optionsFrom: feature \"{ch.OptionsFrom}\" is not defined.");
                    bool open = ch.FreeText || ch.OptionsFrom != null;
                    int needed = ch.Repeat ? 1 : ch.PickLevels.Count > 0 ? ch.PickLevels.Count : ch.Pick;
                    if (ch.Pick < 1 || (!open && ch.Options.Count < needed))
                        throw new RuleException($"{at}.choice: too few options.");
                    foreach (var o in f.Choice.Options)
                    {
                        r.AddModifiers(o.Modifiers, $"{at}.choice[{o.Id}]");
                        if (o.Resource != null) r.AddResource(o.Resource, $"{at}.choice[{o.Id}].resource");
                    }
                }
            }
        }
        foreach (var (key, fx) in def.FeatEffects) r.AddModifiers(fx.Modifiers.Where(m => !m.Target.Contains("{choice}")), $"featEffects[{key}]");
        foreach (var fx in def.FeatEffects.Values)
            foreach (var m in fx.Modifiers.Where(m => m.Target.Contains("{choice}")))
            {   // checked once with a stand-in target; the real one is filled per feat
                r.Late(m.Value);
                if (m.When != null) r.Late(m.When);
            }
        foreach (var slot in def.FeatSlots)
            r.Slots[slot] = (slot.Count == null ? null : r.Parse(slot.Count, $"featSlots[{slot.Id}].count"),
                slot.When == null ? null : r.Parse(slot.When, $"featSlots[{slot.Id}].when"));
        foreach (var cls in def.Classes)
            foreach (var g in cls.FeatGrants)
                r.Grants[g] = g.When == null ? null : r.Parse(g.When, $"classes[{cls.Id}].featGrants.when");
        var weaponKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var w in def.Weapons)
        {
            if (string.IsNullOrWhiteSpace(w.Key) || !weaponKeys.Add(w.Key)) throw new RuleException($"weapons: key \"{w.Key}\" is missing or duplicated.");
            if (!Enum.TryParse<WeaponProficiency>(w.Category, true, out _)) throw new RuleException($"weapons[{w.Key}].category must be simple, martial or exotic.");
            if (!Enum.TryParse<WeaponUse>(w.Use, true, out _)) throw new RuleException($"weapons[{w.Key}].use must be light, oneHanded, twoHanded or ranged.");
            if (w.CritRange is < 2 or > 20 || w.CritMultiplier is < 2 or > 6) throw new RuleException($"weapons[{w.Key}]: critical range 2–20, multiplier 2–6.");
        }
        foreach (var t in def.Toggles)
        {
            var at = $"toggles[{t.Id}]";
            if (string.IsNullOrWhiteSpace(t.Id) || def.Toggles.Count(x => x.Id == t.Id) > 1) throw new RuleException($"{at}: id missing or duplicated.");
            r.AddModifiers(t.Modifiers, at);
            r.ToggleWhen[t] = t.When == null ? null : r.Parse(t.When, $"{at}.when");
            r.CheckTemplate(t.Name, $"{at}.name");
            r.CheckTemplate(t.Effect, $"{at}.effect");
        }
        foreach (var cls in def.Classes)
            foreach (var v in cls.Values)
            {
                var at = $"classes[{cls.Id}].values[{v.Label}]";
                if (v.When != null) r.Whens[v] = r.Parse(v.When, $"{at}.when");
                r.CheckTemplate(v.Value, at);
            }
        foreach (var (sit, i) in def.Situational.Select((x, i) => (x, i)))
        {
            var at = $"situational[{i}]";
            if (sit.When != null) r.Whens[sit] = r.Parse(sit.When, $"{at}.when");
            r.CheckTemplate(sit.Text.Replace("{pick}", "x"), at);
        }
        foreach (var (list, rules) in new[] { ("specialSlot", def.SpellSpecials.SpecialSlot), ("opposition", def.SpellSpecials.Opposition), ("bonusKnown", def.SpellSpecials.BonusKnown) })
            foreach (var (rule, i) in rules.Select((x, i) => (x, i)))
            {
                var at = $"spellSpecials.{list}[{i}]";
                if (rule.Match is not ("list" or "school")) throw new RuleException($"{at}.match must be list or school.");
                if (rule.When != null) r.Whens[rule] = r.Parse(rule.When, $"{at}.when");
                if (rule.Take != null) r.Precompile(rule.Take, $"{at}.take");
            }
        foreach (var (a, i) in (def.Attacks.Weapon == null ? def.Attacks.Extra : def.Attacks.Extra.Prepend(def.Attacks.Weapon)).Select((x, i) => (x, i)))
        {
            var at = a == def.Attacks.Weapon ? "attacks.weapon" : $"attacks.extra[{i - (def.Attacks.Weapon == null ? 0 : 1)}]";
            if (a.When != null) r.Whens[a] = r.Parse(a.When, $"{at}.when");
            foreach (var v in a.Values) r.Precompile(v.Expr, $"{at}.values[{v.Key}]");
            foreach (var (src, part) in new[] { (a.Count, "count"), (a.Bonus, "bonus"), (a.Repeat, "repeat"), (a.Proficient, "proficient") }) r.Precompile(src, $"{at}.{part}");
            foreach (var t in new[] { a.Name ?? "", a.Hand, a.Damage, a.Crit }) r.CheckTemplate(t, at);
            foreach (var n in a.Notes)
            {
                r.CheckTemplate(n.Text, $"{at}.notes");
                if (n.When != null) r.Whens[n] = r.Parse(n.When, $"{at}.notes.when");
            }
        }
        foreach (var k in def.Companions.Kinds)
        {
            var at = $"companions.kinds[{k.Name}]";
            if (k.Hp != null) r.Precompile(k.Hp, $"{at}.hp");
            foreach (var line in k.Lines) r.CheckTemplate(line, $"{at}.lines");
        }
        foreach (var g in def.Companions.Grants)
        {
            var at = $"companions.grants[{g.Kind}]";
            if (!def.Companions.Kinds.Any(k => k.Name == g.Kind)) throw new RuleException($"{at}: companion kind \"{g.Kind}\" is not defined.");
            if (g.When != null) r.Whens[g] = r.Parse(g.When, $"{at}.when");
            r.Precompile(g.Level, $"{at}.level");
        }
        foreach (var (name, spells) in def.SpellLists) r.SpellListKeys[name] = spells.Select(SpellNames.Key).ToList();
        if (def.MulticlassSpellSlots is { } mc)
        {
            foreach (var id in mc.Classes.Where(id => !def.Classes.Any(c => c.Id == id && c.Spellcasting != null)))
                throw new RuleException($"multiclassSpellSlots.classes: \"{id}\" is not a class with spellcasting.");
            foreach (var (g, f) in mc.Slots)
                if (g is < 1 or > 9) throw new RuleException($"multiclassSpellSlots.slots: level {g} does not exist.");
                else r.Precompile(f, $"multiclassSpellSlots.slots[{g}]");
        }
        r.CheckCycles();
        return r;
    }

    private Expr Parse(string source, string at)
    {
        Expr e;
        try { e = Expr.Parse(source); }
        catch (RuleException ex) { throw new RuleException($"{at}: {ex.Message}"); }
        foreach (var (fn, arg) in e.Calls)
        {
            if (!Functions.Contains(fn)) throw new RuleException($"{at}: unknown function \"{fn}\".");
            // perclass('formula'): the formula is text, so check it now, not on first use.
            if (fn.Equals("perclass", StringComparison.OrdinalIgnoreCase))
                _late[arg ?? throw new RuleException($"{at}: perclass needs a formula in quotes, e.g. perclass('level * hitDie').")] = Parse(arg, $"{at} perclass");
        }
        return e;
    }

    private void AddModifiers(IEnumerable<ModifierDef> mods, string at)
    {
        foreach (var m in mods)
        {
            if (string.IsNullOrWhiteSpace(m.Target)) throw new RuleException($"{at}: modifier without target.");
            _modifiers[m] = (Parse(m.Value, $"{at}.modifier[{m.Target}].value"), m.When == null ? null : Parse(m.When, $"{at}.modifier[{m.Target}].when"));
        }
    }

    private void AddResource(ResourceDef res, string at)
    {
        _resources[res] = Parse(res.Max, $"{at}.max");
        if (res.When != null) Whens[res] = Parse(res.When, $"{at}.when");
        if (res.Name != null) CheckTemplate(res.Name, $"{at}.name");
        if (res.Detail != null) CheckTemplate(res.Detail, $"{at}.detail");
        if (res.Reset is not (null or "short" or "long")) throw new RuleException($"{at}.reset must be short, long or null.");
    }

    /// <summary>Conditions of resources, class values and situational lines.</summary>
    internal readonly Dictionary<object, Expr> Whens = new(ReferenceEqualityComparer.Instance);
    internal bool Holds(object def, IExprScope scope) => !Whens.TryGetValue(def, out var w) || w.EvaluateBool(scope);

    internal (Expr Value, Expr? When) Modifier(ModifierDef m) =>
        _modifiers.TryGetValue(m, out var c) ? c : (Late(m.Value), m.When == null ? null : Late(m.When));

    internal Expr Resource(ResourceDef r) => _resources[r];

    // Formulas that only exist at evaluation time (feat modifiers with their choice filled in).
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, Expr> _late = new();
    internal Expr Late(string source) => _late.GetOrAdd(source, src => Parse(src, "feat"));
    internal readonly Dictionary<FeatSlotDef, (Expr? Count, Expr? When)> Slots = new(ReferenceEqualityComparer.Instance);
    internal readonly Dictionary<FeatGrant, Expr?> Grants = new(ReferenceEqualityComparer.Instance);
    /// <summary>A companion kind's hp and lines at an effective level (clamped 1–20); null for an unknown kind.</summary>
    internal (int? Hp, List<string> Lines)? Bond(string kind, int effectiveLevel, int masterHp)
    {
        if (Def.Companions.Kinds.FirstOrDefault(k => k.Name == kind) is not { } def) return null;
        var scope = new Evaluation(this, new EngineCharacter
        {
            Level = Math.Clamp(effectiveLevel, 1, 20),
            Facts = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase) { ["masterHp"] = (double)masterHp },
        });
        return (def.Hp == null ? null : (int)Math.Floor(Late(def.Hp).EvaluateNumber(scope)), def.Lines.Select(scope.Text).ToList());
    }

    /// <summary>Proficient = tag prof:weapon.&lt;key&gt; or prof:weapon.&lt;category&gt;; category:weapon.&lt;key&gt;=&lt;category&gt; moves the weapon.</summary>
    public static bool Proficient(IReadOnlySet<string> tags, WeaponInfo w)
    {
        var category = tags.FirstOrDefault(t => t.StartsWith($"category:weapon.{w.Key}=", StringComparison.OrdinalIgnoreCase))?.Split('=')[1] ?? w.Category;
        return tags.Contains("prof:weapon." + w.Key) || tags.Contains("prof:weapon." + category);
    }

    internal readonly Dictionary<string, List<string>> SpellListKeys = new(StringComparer.OrdinalIgnoreCase);
    internal readonly Dictionary<ToggleDef, Expr?> ToggleWhen = new(ReferenceEqualityComparer.Instance);

    internal static readonly System.Text.RegularExpressions.Regex TemplatePart = new(@"\{([^{}]+)\}");
    /// <summary>Parses every {formula} of a text template now, so errors show up when the package loads.</summary>
    /// <summary>Parses a formula now (errors at load) for later use through <see cref="Late"/>.</summary>
    internal void Precompile(string source, string at) => _late[source] = Parse(source, at);

    internal void CheckTemplate(string text, string at)
    {
        foreach (System.Text.RegularExpressions.Match m in TemplatePart.Matches(text)) _late[m.Groups[1].Value] = Parse(m.Groups[1].Value, at);
    }

    /// <summary>Static cycle check over stat formulas (modifiers are checked at evaluation time).</summary>
    private void CheckCycles()
    {
        var state = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);   // 1 = visiting, 2 = done
        IEnumerable<string> Deps(CompiledStat s) =>
            new[] { s.Base, s.Plus }.Concat(s.Options.SelectMany(o => new[] { o.When, o.Value })).OfType<Expr>()
                .SelectMany(e => e.Identifiers.Concat(e.Calls.Where(c => c.Function is "skill" or "stat" && c.Arg != null)
                    .Select(c => c.Function == "skill" ? "skill." + c.Arg : c.Arg!)))
                .Where(Stats.ContainsKey);
        void Visit(string key, Stack<string> path)
        {
            if (state.GetValueOrDefault(key) == 2) return;
            if (state.GetValueOrDefault(key) == 1)
                throw new RuleException($"Circular reference: {string.Join(" → ", path.Reverse().SkipWhile(k => !k.Equals(key, StringComparison.OrdinalIgnoreCase)))} → {key}");
            state[key] = 1;
            path.Push(key);
            foreach (var d in Deps(Stats[key])) Visit(d, path);
            path.Pop();
            state[key] = 2;
        }
        foreach (var key in Stats.Keys) Visit(key, new Stack<string>());
    }

    public EngineResult Evaluate(EngineCharacter c) => new Evaluation(this, c).Run();
}

/// <summary>One evaluation of one character. Not thread-safe; create per call.</summary>
internal sealed class Evaluation : IExprScope
{
    private readonly CompiledRules _r;
    private readonly EngineCharacter _c;
    private readonly List<(string Source, ModifierDef Mod)> _mods = new();
    private readonly HashSet<string> _tags;
    private readonly List<string> _features = new();
    private readonly List<OpenChoice> _open = new();
    private readonly List<(ResourceDef Def, ClassLevel? Class)> _resources = new();
    private ClassLevel? _class;   // class whose own formula is evaluated: "level" is its class level
    private readonly Dictionary<string, double> _values = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _computing = new(StringComparer.OrdinalIgnoreCase);
    private double? _score;   // parameter of the ability-modifier formula
    private SkillParams? _skill;   // parameters of the skill formula
    private sealed record SkillParams(string Key, string Ability, bool Proficient, bool Expertise, int Ranks, bool ClassSkill, bool ArmorCheck, bool TrainedOnly);

    public Evaluation(CompiledRules r, EngineCharacter c)
    {
        _r = r; _c = c;
        _tags = new HashSet<string>(c.Tags, StringComparer.OrdinalIgnoreCase);
        foreach (var cond in c.Conditions) _tags.Add("condition:" + cond);
        foreach (var g in r.Def.Grants) _tags.Add(g);
    }

    public EngineResult Run()
    {
        if (_c.Ancestry != null && _r.Ancestries.TryGetValue(_c.Ancestry, out var anc))
        {
            _tags.Add("ancestry:" + anc.Id);
            foreach (var g in anc.Grants) _tags.Add(g);
            foreach (var m in anc.Modifiers) _mods.Add(($"ancestry:{anc.Id}", m));
            _resources.AddRange(anc.Resources.Select(r => (r, (ClassLevel?)null)));
        }
        if (_c.Background != null && _r.Def.Backgrounds.FirstOrDefault(b => b.Id.Equals(_c.Background, StringComparison.OrdinalIgnoreCase)) is { } bg)
        {
            _tags.Add("background:" + bg.Id);
            foreach (var g in bg.Grants) _tags.Add(g);
            foreach (var m in bg.Modifiers) _mods.Add(($"background:{bg.Id}", m));
        }
        for (int i = 0; i < _c.Feats.Count; i++)
        {
            var (key, choice) = _c.Feats[i];
            _tags.Add("feat:" + key);
            if (!string.IsNullOrEmpty(choice)) _tags.Add($"feat:{key}:{choice}");
            if (!_r.Def.FeatEffects.TryGetValue(key, out var fx)) continue;
            foreach (var g in fx.Grants) _tags.Add(g.Replace("{choice}", choice ?? ""));
            foreach (var m in fx.Modifiers)
                _mods.Add(($"feat:{key}#{i}", m.Target.Contains("{choice}") ? m with { Target = m.Target.Replace("{choice}", choice ?? "") } : m));
        }
        CollectFeatures();
        foreach (var cond in _c.Conditions)
            if (_r.Conditions.TryGetValue(cond, out var def))
                foreach (var m in def.Modifiers) _mods.Add(($"condition:{def.Id}", m));
        _mods.AddRange(_c.ExtraModifiers);
        var toggles = new List<(ToggleDef Def, bool On)>();
        foreach (var t in _r.Def.Toggles)
        {
            if (_r.ToggleWhen[t] is { } w && !w.EvaluateBool(this)) continue;
            bool on = _tags.Contains("toggle:" + t.Id);
            if (on)
            {
                _tags.Add("active:" + t.Id);
                foreach (var m in t.Modifiers) _mods.Add(($"toggle:{t.Id}", m));
            }
            toggles.Add((t, on));
        }
        _values.Clear();   // a when may have read a value before the toggle modifiers were in

        foreach (var a in _r.Abilities) { _values[a] = Score(a); _values["mod." + a] = Mod(_values[a]); }
        foreach (var key in _r.Stats.Keys) Stat(key);
        var resources = _resources.Select(x => InClass(x.Class, () => !_r.Holds(x.Def, this) ? null : new EngineResource(x.Def.Id, Text(x.Def.Name ?? x.Def.Id),
            (int)Math.Floor(_r.Resource(x.Def).EvaluateNumber(this)), x.Def.Reset, x.Def.Detail == null ? null : Text(x.Def.Detail)))).OfType<EngineResource>()
            // The same resource from several classes (hit dice) is one pool.
            .GroupBy(r => r.Id, StringComparer.OrdinalIgnoreCase).Select(g => g.First() with { Max = g.Sum(r => r.Max) }).ToList();
        var classValues = _c.Classes.Where(cl => _r.Classes.ContainsKey(cl.ClassId))
            .SelectMany(cl => InClass(cl, () => _r.Classes[cl.ClassId].Values.Where(v => _r.Holds(v, this)).Select(v => (v.Label, Text(v.Value))).ToList())).ToList();
        var situational = new List<string>();
        foreach (var sit in _r.Def.Situational.Where(x => _r.Holds(x, this)))
        {
            if (sit.ForEachPick == null) { situational.Add(Text(sit.Text)); continue; }
            var picks = Picks(sit.ForEachPick);
            if (sit.PickLevels.Count > 0) picks = picks.Take(sit.PickLevels.Count(l => _c.Level >= l)).ToList();
            situational.AddRange(picks.Select(p => Text(sit.Text.Replace("{pick}", p))));
        }
        var skills = new List<EngineSkill>();
        foreach (var sk in _r.Def.Skills)
        {
            skills.Add(Skill(sk, sk.Key, sk.Name ?? sk.Key));
            // Kinds: every fixed one, and every free-text one the character has ranks in.
            foreach (var (k, n) in sk.Types) skills.Add(Skill(sk, $"{sk.Key}:{k}", $"{sk.Name ?? sk.Key} ({n})"));
            if (sk.FreeTypes)
                foreach (var k in _c.Ranks.Keys.Where(k => k.StartsWith(sk.Key + ":", StringComparison.OrdinalIgnoreCase)).Order())
                    skills.Add(Skill(sk, k, $"{sk.Name ?? sk.Key} ({k[(sk.Key.Length + 1)..]})"));
        }
        return new EngineResult(_values, _open, resources, _features, skills, Spellcasting(), _tags, _granted, FeatSlots(),
            toggles.Select(t => new EngineToggle(t.Def.Id, Text(t.Def.Name), Text(t.Def.Effect), t.On)).ToList(), classValues, situational, SpellSpecials(),
            _r.Def.Companions.Grants.Where(g => _r.Holds(g, this))
                .GroupBy(g => g.Kind).ToDictionary(g => g.Key, g => (int)Math.Floor(_r.Late(g.Last().Level).EvaluateNumber(this))),
            Attacks(), Performance(), SharedSlots());
    }

    /// <summary>Slots shared by the casting classes listed in multiclassSpellSlots, once the character has two of them.</summary>
    private IReadOnlyDictionary<int, int>? SharedSlots()
    {
        if (_r.Def.MulticlassSpellSlots is not { } mc
            || _c.Classes.Count(x => mc.Classes.Contains(x.ClassId, StringComparer.OrdinalIgnoreCase)) < 2) return null;
        return mc.Slots.Select(kv => (kv.Key, Count: (int)Math.Floor(_r.Late(kv.Value).EvaluateNumber(this))))
            .Where(x => x.Count > 0).ToDictionary(x => x.Key, x => x.Count);
    }

    /// <summary>Performances of the first class that has them; effect texts can read {dc}.</summary>
    private EnginePerformance? Performance()
    {
        foreach (var (classId, level) in _c.Classes)
        {
            if (!_r.Classes.TryGetValue(classId, out var cls) || cls.Performance is not { } pf) continue;
            var outer = _class;
            _class = new ClassLevel(classId, level);
            try {
            var dc = (int)Math.Floor(_r.Late(pf.Dc).EvaluateNumber(this));
            var scope = new AttackScope(this, new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase) { ["dc"] = (double)dc }, Array.Empty<string>());
            return new EnginePerformance(pf.Name, pf.Book, pf.Item, pf.Tab, Math.Max(0, (int)Math.Floor(_r.Late(pf.Rounds).EvaluateNumber(this))), dc,
                pf.Start.LastOrDefault(s => s.From <= level)?.Text ?? "",
                pf.List.Select(e => new EnginePerformanceEntry(e.Name, e.Level, e.Short, Text(e.Effect, scope))).ToList());
            } finally { _class = outer; }
        }
        return null;
    }

    private bool IsClassSkill(string baseKey) =>
        _c.Classes.Any(x => _r.Classes.GetValueOrDefault(x.ClassId)?.ClassSkills.Contains(baseKey, StringComparer.OrdinalIgnoreCase) == true);

    /// <summary>A skill row: the base skill uses its cached value; a kind ("craft:Schmied") uses its own ranks
    /// but the base skill's formula and modifiers (a Craft bonus counts for every Craft).</summary>
    private EngineSkill Skill(SkillInfo sk, string key, string name)
    {
        int ranks = _c.Ranks.GetValueOrDefault(key);
        double value = key.Equals(sk.Key, StringComparison.OrdinalIgnoreCase) ? _values["skill." + sk.Key] : SkillFormula(sk, key, ranks);
        return new EngineSkill(key, name, sk.Ability, value, _tags.Contains("prof:skill." + sk.Key), _tags.Contains("expertise:skill." + sk.Key),
            ranks, IsClassSkill(sk.Key), sk.TrainedOnly, sk.ArmorCheck);
    }

    private double SkillFormula(SkillInfo sk, string key, int ranks)
    {
        var outer = _skill;
        _skill = new SkillParams(sk.Key, sk.Ability, _tags.Contains("prof:skill." + sk.Key), _tags.Contains("expertise:skill." + sk.Key),
            ranks, IsClassSkill(sk.Key), sk.ArmorCheck, sk.TrainedOnly);
        // Modifiers are evaluated inside the skill's scope too, so they can read its "ranks" (skill feats
        // grow at 10 ranks). A kind ("craft:Schmied") gets the base skill's modifiers and its own.
        try
        {
            return _r.Stats["skill." + sk.Key].Base!.EvaluateNumber(this) + Modifiers("skill." + sk.Key)
                + (key.Equals(sk.Key, StringComparison.OrdinalIgnoreCase) ? 0 : Modifiers("skill." + key));
        }
        finally { _skill = outer; }
    }

    /// <summary>Casting of the first class that casts (multiclass casting tables: later).</summary>
    private EngineSpellcasting? Spellcasting()
    {
        return SpellClass() is { } x ? InClass(x, () => Spellcasting(_r.Classes[x.ClassId].Spellcasting!, x.Level)) : null;
    }

    /// <summary>The class whose spellbook is evaluated: the requested one, else the first that casts.</summary>
    private ClassLevel? SpellClass() => _c.Classes.FirstOrDefault(x =>
        _r.Classes.TryGetValue(x.ClassId, out var cls) && cls.Spellcasting != null
        && (_c.SpellClass == null || x.ClassId.Equals(_c.SpellClass, StringComparison.OrdinalIgnoreCase)));

    private EngineSpellcasting Spellcasting(SpellcastingDef sc, int classLevel)
    {
        {
            var (cantrips, slots, known) = _r.Casting[sc];
            var perGrade = slots.Select(kv => (kv.Key, Count: (int)Math.Floor(kv.Value.EvaluateNumber(this))))
                .Where(x => x.Count > 0).ToDictionary(x => x.Key, x => x.Count);
            return new EngineSpellcasting(sc.Ability, sc.Prepared, (int)Math.Floor(cantrips.EvaluateNumber(this)), perGrade,
                known == null ? null : (int)Math.Floor(known.EvaluateNumber(this)), sc.SlotsReset,
                sc.KnownByGrade.Count == 0 ? null : Enumerable.Range(0, 10)
                    .Select(g => sc.KnownByGrade.TryGetValue(g, out var f) ? (int)Math.Floor(_r.Late(f).EvaluateNumber(this)) : -1).ToArray(),
                (int)Math.Floor(_r.Late(sc.Special).EvaluateNumber(this)),
                sc.CasterLevel == null ? classLevel : (int)Math.Floor(_r.Late(sc.CasterLevel).EvaluateNumber(this)));
        }
    }

    /// <summary>Evaluates a class's own formulas (resources, values, casting, its features' modifiers) with
    /// "level" = that class's level. Values computed meanwhile are cached for the whole character, so they reset it.</summary>
    private T InClass<T>(ClassLevel? cls, Func<T> f)
    {
        var outer = _class;
        _class = cls;
        try { return f(); }
        finally { _class = outer; }
    }

    /// <summary>"feature:fighter/x" or "choice:fighter/x:y" → the fighter's class level.</summary>
    private ClassLevel? ClassOf(string source)
    {
        var colon = source.IndexOf(':');
        if (colon < 0 || source[..colon] is not ("feature" or "choice")) return null;
        var slash = source.IndexOf('/', colon);
        var id = slash < 0 ? null : source[(colon + 1)..slash];
        return _c.Classes.FirstOrDefault(x => x.ClassId.Equals(id, StringComparison.OrdinalIgnoreCase));
    }

    private readonly List<string> _granted = new();

    private EngineSpellSpecials? SpellSpecials() => InClass(SpellClass(), SpellSpecialsInClass);

    private EngineSpellSpecials? SpellSpecialsInClass()
    {
        var sp = _r.Def.SpellSpecials;
        if (sp.SpecialSlot.Count + sp.Opposition.Count + sp.BonusKnown.Count == 0) return null;
        (HashSet<string> Keys, HashSet<string> Schools) Collect(IEnumerable<SpellPickRule> rules)
        {
            var keys = new HashSet<string>(); var schools = new HashSet<string>();
            foreach (var rule in rules)
            {
                var picks = Picks(rule.Feature);
                if (rule.FirstOnly) picks = picks.Take(1).ToList();
                if (rule.FirstOnly && picks.Count == 0) picks.Add("");
                if (rule.Match == "school") { schools.UnionWith(picks.Select(p => SpellNames.School(p, _r.Def.SchoolAliases))); continue; }
                int? take = rule.Take == null ? null : (int)Math.Floor(_r.Late(rule.Take).EvaluateNumber(this));
                foreach (var p in picks)
                    if (_r.SpellListKeys.TryGetValue(rule.Prefix + p, out var list)) keys.UnionWith(take is int n ? list.Take(n) : list);
            }
            return (keys, schools);
        }
        var slotRule = sp.SpecialSlot.FirstOrDefault(x => _r.Holds(x, this));
        var slot = slotRule == null ? ((HashSet<string>, HashSet<string>)?)null : Collect(new[] { slotRule });
        return new EngineSpellSpecials(slot is { } s ? new SpellFilter(s.Item1, s.Item2) : null,
            Collect(sp.Opposition.Where(x => _r.Holds(x, this))).Schools.Where(x => x != "").ToHashSet(), Collect(sp.BonusKnown.Where(x => _r.Holds(x, this))).Keys);
    }

    private List<string> Picks(string feature) =>
        (_c.FeatureChoices.GetValueOrDefault(feature) ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList();

    private List<EngineFeatSlot> FeatSlots()
    {
        var result = new List<EngineFeatSlot>();
        static string[] Keys(IEnumerable<string> names) => names.Select(FeatNames.Key).ToArray();
        foreach (var def in _r.Def.FeatSlots)
        {
            var (count, when) = _r.Slots[def];
            if (when != null && !when.EvaluateBool(this)) continue;
            var types = def.Types.ToArray();
            if (def.GainedAt.Count > 0)
            {
                var tiers = def.TiersByChoice is { } tc
                    ? tc.Options.GetValueOrDefault(Picks(tc.Feature).FirstOrDefault() ?? "") ?? new List<FeatTier>()
                    : def.Tiers;
                foreach (var gained in def.GainedAt.Where(l => _c.Level >= l))
                    result.Add(new EngineFeatSlot(def.Id, def.Label, 1, def.IgnorePrereqs, types,
                        Keys(tiers.Where(t => gained >= t.Level).SelectMany(t => t.Feats)), def.Any));
                continue;
            }
            int n = count == null ? 1 : (int)Math.Floor(count.EvaluateNumber(this));
            if (n <= 0) continue;
            var names = def.NamesByChoice is { } nc
                ? nc.Options.GetValueOrDefault(Picks(nc.Feature).FirstOrDefault() ?? "") ?? new List<string>()
                : def.Names;
            result.Add(new EngineFeatSlot(def.Id, def.Label, n, def.IgnorePrereqs, types, Keys(names), def.Any));
        }
        return result;
    }

    private ClassContent? FirstClass() =>
        _c.Classes.Select(x => _r.Classes.GetValueOrDefault(x.ClassId)).FirstOrDefault(x => x != null);

    /// <summary>The class of the formula being evaluated (perclass, a class's own formulas), else the primary class.</summary>
    private ClassContent? ScopeClass() => _class is { } c ? _r.Classes.GetValueOrDefault(c.ClassId) : FirstClass();

    private void CollectFeatures()
    {
        foreach (var (classId, classLevel) in _c.Classes)
        {
            if (!_r.Classes.TryGetValue(classId, out var cls)) continue;
            _tags.Add("class:" + cls.Id);
            foreach (var g in cls.Grants) _tags.Add(g);
            foreach (var fg in cls.FeatGrants.Where(g => g.Level <= classLevel))
                if (_r.Grants[fg] is not { } w || InClass(new ClassLevel(cls.Id, classLevel), () => w.EvaluateBool(this)))
                    foreach (var f in fg.Feats) { _granted.Add(f); _tags.Add("feat:" + FeatNames.Key(f)); }
            foreach (var (lvl, grant) in cls.Levels.OrderBy(kv => kv.Key))
            {
                if (lvl > classLevel) continue;
                foreach (var fid in grant.Features)
                {
                    var f = cls.Features[fid];
                    _features.Add($"{cls.Id}/{fid}");
                    _tags.Add("feature:" + fid);
                    _tags.Add($"feature:{cls.Id}/{fid}");
                    foreach (var m in f.Modifiers) _mods.Add(($"feature:{cls.Id}/{fid}", m));
                    foreach (var g in f.Grants) _tags.Add(g);
                    if (f.Resource != null) _resources.Add((f.Resource, new ClassLevel(cls.Id, classLevel)));
                    if (f.Choice == null) continue;
                    var key = $"{cls.Id}/{fid}";
                    int wanted = f.Choice.PickLevels.Count > 0 ? f.Choice.PickLevels.Count(l => l <= classLevel) : f.Choice.Pick;
                    var raw = (_c.Choices.GetValueOrDefault(key) ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Take(wanted).ToList();
                    var picks = raw.Select(p => f.Choice.Options.FirstOrDefault(o => o.Id.Equals(p, StringComparison.OrdinalIgnoreCase)))
                        .OfType<ChoiceOption>().ToList();
                    // Free-text picks and picks among another feature's picks have no option objects.
                    int made = f.Choice.FreeText || f.Choice.OptionsFrom != null ? raw.Count : picks.Count;
                    if (made < wanted)
                        _open.Add(new OpenChoice(key, cls.Id, fid, wanted - made, f.Choice.Options.Select(o => o.Id).ToList()));
                    foreach (var o in picks)
                    {
                        _tags.Add($"choice:{key}:{o.Id}");
                        foreach (var g in o.Grants) _tags.Add(g);
                        foreach (var m in o.Modifiers) _mods.Add(($"choice:{key}:{o.Id}", m));
                        if (o.Resource != null) _resources.Add((o.Resource, new ClassLevel(cls.Id, classLevel)));
                    }
                }
            }
        }
    }

    /// <summary>Fills a text template: every {formula} becomes its value (whole numbers without decimals).</summary>
    internal string Text(string template, IExprScope scope) => CompiledRules.TemplatePart.Replace(template, m => Expr.Show(_r.Late(m.Groups[1].Value).Evaluate(scope)));

    private List<EngineAttack> Attacks()
    {
        var result = new List<EngineAttack>();
        var weapons = _r.Def.Weapons.ToDictionary(w => w.Key, StringComparer.OrdinalIgnoreCase);
        WeaponInfo? Base(Dictionary<string, object> item) => item.GetValueOrDefault("key") is string k ? weapons.GetValueOrDefault(k) : null;
        var off = _c.Weapons.FirstOrDefault(w => Equals(w.GetValueOrDefault("slot"), "off"));
        var common = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
        {
            ["weapons.count"] = (double)_c.Weapons.Count,
            ["weapons.melee"] = (double)_c.Weapons.Count(w => Base(w)?.Use != "ranged"),
            ["weapons.offLight"] = off != null && Base(off)?.Use == "light",
        };
        void Add(AttackDef def, Dictionary<string, object> facts, IReadOnlyList<string> groups, WeaponInfo? w)
        {
            var scope = new AttackScope(this, facts, groups);
            if (_r.Whens.TryGetValue(def, out var when) && !when.EvaluateBool(scope)) return;
            foreach (var v in def.Values) scope.Locals[v.Key] = _r.Late(v.Expr).Evaluate(scope);
            var bonuses = new List<int>();
            int count = (int)Math.Floor(_r.Late(def.Count).EvaluateNumber(scope));
            for (int i = 0; i < Math.Max(1, count); i++)
            {
                scope.Locals["i"] = (double)i;
                int b = (int)Math.Floor(_r.Late(def.Bonus).EvaluateNumber(scope));
                bonuses.AddRange(Enumerable.Repeat(b, Math.Max(1, (int)Math.Floor(_r.Late(def.Repeat).EvaluateNumber(scope)))));
            }
            scope.Locals.Remove("i");
            var notes = def.Notes.Where(n => !_r.Whens.TryGetValue(n, out var nw) || nw.EvaluateBool(scope)).Select(n => Text(n.Text, scope)).ToArray();
            result.Add(new EngineAttack(def.Name == null ? facts.GetValueOrDefault("weapon.name") as string ?? "" : Text(def.Name, scope),
                Text(def.Hand, scope), bonuses.ToArray(), Text(def.Damage, scope), Text(def.Crit, scope),
                _r.Late(def.Proficient).EvaluateBool(scope), notes, w?.Key));
        }
        if (_r.Def.Attacks.Weapon is { } weaponAttack)
            foreach (var item in _c.Weapons)
            {
                var w = Base(item);
                var facts = new Dictionary<string, object>(common, StringComparer.OrdinalIgnoreCase);
                foreach (var (k, v) in item) facts["weapon." + k] = v is int n ? (double)n : v;
                facts["weapon.key"] = w?.Key ?? "";
                facts["weapon.known"] = w != null;
                facts["weapon.proficient"] = w == null || CompiledRules.Proficient(_tags, w);
                if (w != null)
                {
                    facts["weapon.use"] = w.Use; facts["weapon.finesse"] = w.Finesse; facts["weapon.thrown"] = w.Thrown;
                    facts["weapon.damage"] = w.Damage; facts["weapon.critRange"] = (double)w.CritRange; facts["weapon.critMultiplier"] = (double)w.CritMultiplier;
                }
                Add(weaponAttack, facts, w?.Groups ?? new List<string>(), w);
            }
        foreach (var extra in _r.Def.Attacks.Extra) Add(extra, common, Array.Empty<string>(), null);
        return result;
    }

    /// <summary>Attack formulas: their own values and weapon facts first, then everything of the character.</summary>
    private sealed class AttackScope(Evaluation outer, IReadOnlyDictionary<string, object> facts, IReadOnlyList<string> groups) : IExprScope
    {
        public readonly Dictionary<string, object?> Locals = new(StringComparer.OrdinalIgnoreCase);
        public object? Resolve(string name) =>
            Locals.TryGetValue(name, out var v) ? v : facts.TryGetValue(name, out var f) ? f : outer.Resolve(name);
        public object? Call(string name, object?[] args) =>
            name.Equals("has", StringComparison.OrdinalIgnoreCase) && args.Length > 0 && args[0] is string t
                && t.StartsWith("weapon.group:", StringComparison.OrdinalIgnoreCase)
                ? groups.Contains(t["weapon.group:".Length..], StringComparer.OrdinalIgnoreCase)
                : outer.Call(name, args);
    }

    internal string Text(string template) => CompiledRules.TemplatePart.Replace(template, m => Expr.Show(_r.Late(m.Groups[1].Value).Evaluate(this)));

    private double Score(string ability) =>
        Cached(ability, () => _c.Abilities.GetValueOrDefault(ability) + Modifiers(ability));

    private double Mod(double score)
    {
        var outer = _score;
        _score = score;
        try { return _r.AbilityModifier.EvaluateNumber(this); }
        finally { _score = outer; }
    }

    private double Stat(string key) => Cached(key, () =>
    {
        var s = _r.Stats[key];
        double value;
        if (s.SkillAbility != null)
        {
            var info = _r.Def.Skills.First(x => x.Key.Equals(key[6..], StringComparison.OrdinalIgnoreCase));
            return SkillFormula(info, info.Key, _c.Ranks.GetValueOrDefault(info.Key));   // modifiers included
        }
        else if (s.Base != null) value = s.Base.EvaluateNumber(this);
        else
        {
            var applicable = s.Options.Where(o => o.When == null || o.When.EvaluateBool(this)).Select(o => o.Value.EvaluateNumber(this)).ToList();
            value = applicable.Count == 0 ? 0 : s.Pick switch { "min" => applicable.Min(), "first" => applicable[0], _ => applicable.Max() };
        }
        if (s.Plus != null) value += s.Plus.EvaluateNumber(this);
        return value + Modifiers(key);
    });

    private double Cached(string key, Func<double> compute)
    {
        if (_values.TryGetValue(key, out var v)) return v;
        if (!_computing.Add(key)) throw new RuleException($"Circular reference through modifiers at \"{key}\".");
        var outer = _class;
        _class = null;
        try { return _values[key] = compute(); }
        finally { _computing.Remove(key); _class = outer; }
    }

    // "save.*" / "skill.k_*": prefix match; anything else exact.
    private static bool Targets(string target, string key) =>
        target.EndsWith('*') ? key.StartsWith(target[..^1], StringComparison.OrdinalIgnoreCase)
            : target.Equals(key, StringComparison.OrdinalIgnoreCase);

    /// <summary>Sum of the modifiers on a value, following the package's stacking rule.</summary>
    private double Modifiers(string key)
    {
        var active = new List<(string Source, string? Type, double Value)>();
        foreach (var (source, m) in _mods)
        {
            if (!Targets(m.Target, key)) continue;
            var (value, when) = _r.Modifier(m);
            var owner = ClassOf(source) ?? _class;
            if (when != null && !InClass(owner, () => when.EvaluateBool(this))) continue;
            active.Add((source, m.Type, InClass(owner, () => value.EvaluateNumber(this))));
        }
        // The same source never counts twice on one value.
        active = active.GroupBy(a => (a.Source, a.Type)).Select(g => g.MaxBy(a => a.Value)).ToList();
        var stacking = _r.Def.Stacking;
        if (stacking.Rule != "highest-per-type") return active.Sum(a => a.Value);
        double total = active.Where(a => a.Value < 0).Sum(a => a.Value);   // penalties always add up
        foreach (var g in active.Where(a => a.Value >= 0).GroupBy(a => a.Type ?? "", StringComparer.OrdinalIgnoreCase))
            total += g.Key.Length == 0 || stacking.AlwaysStack.Contains(g.Key, StringComparer.OrdinalIgnoreCase)
                ? g.Sum(a => a.Value) : g.Max(a => a.Value);
        return total;
    }

    // ── IExprScope ───────────────────────────────────────────────────────────
    public object? Resolve(string name)
    {
        if (_score != null && name.Equals("score", StringComparison.OrdinalIgnoreCase)) return _score.Value;
        if (_skill is { } sk)
            switch (name.ToLowerInvariant())
            {
                case "skill": return sk.Key;
                case "ability": return sk.Ability;
                case "proficient": return sk.Proficient;
                case "expertise": return sk.Expertise;
                case "ranks": return (double)sk.Ranks;
                case "classskill": return sk.ClassSkill;
                case "armorcheck": return sk.ArmorCheck;
                case "trainedonly": return sk.TrainedOnly;
            }
        if (name.Equals("class.skillRanks", StringComparison.OrdinalIgnoreCase)) return (double)(ScopeClass()?.SkillRanks ?? 0);
        if (name.Equals("hitDie", StringComparison.OrdinalIgnoreCase)) return (double)(ScopeClass()?.HitDie ?? 0);
        if (name.Equals("characterLevel", StringComparison.OrdinalIgnoreCase)) return (double)_c.Level;
        if (name.Equals("class", StringComparison.OrdinalIgnoreCase)) return (_class ?? _c.Classes.FirstOrDefault())?.ClassId ?? "";
        if (name.Equals("castingMod", StringComparison.OrdinalIgnoreCase))
            return _c.Classes.Select(x => _r.Classes.GetValueOrDefault(x.ClassId)?.Spellcasting).FirstOrDefault(x => x != null) is { } cast
                ? Mod(Score(cast.Ability)) : 0d;
        // ancestry.speed / ancestry.size come from the package's ancestry; other ancestry.* names are host facts.
        if ((name.Equals("ancestry.speed", StringComparison.OrdinalIgnoreCase) || name.Equals("ancestry.size", StringComparison.OrdinalIgnoreCase))
            && _c.Ancestry != null && _r.Ancestries.TryGetValue(_c.Ancestry, out var a))
            return name.EndsWith("speed", StringComparison.OrdinalIgnoreCase) ? (double)a.Speed : a.Size;
        if (name.Equals("level", StringComparison.OrdinalIgnoreCase)) return (double)(_class?.Level ?? _c.Level);
        if (name.StartsWith("level.", StringComparison.OrdinalIgnoreCase))
            return (double)(_c.Classes.FirstOrDefault(x => x.ClassId.Equals(name[6..], StringComparison.OrdinalIgnoreCase))?.Level ?? 0);
        if (_r.Abilities.Contains(name)) return Score(name);
        if (_r.Stats.ContainsKey(name)) return Stat(name);
        if (_c.Facts.TryGetValue(name, out var fact)) return fact is int i ? (double)i : fact;
        return null;   // unknown facts read as 0 / empty
    }

    public object? Call(string name, object?[] args)
    {
        double N(int i) => i < args.Length ? Expr.ToNumber(args[i]) : throw new RuleException($"{name}: argument {i + 1} is missing.");
        string S(int i) => i < args.Length && args[i] is string s ? s : throw new RuleException($"{name}: text expected as argument {i + 1}.");
        switch (name)
        {
            case "floor": return Math.Floor(N(0));
            case "ceil": return Math.Ceiling(N(0));
            case "round": return Math.Round(N(0), MidpointRounding.AwayFromZero);
            case "abs": return Math.Abs(N(0));
            case "min": return args.Length == 0 ? throw new RuleException("min: no arguments.") : args.Select(a => Expr.ToNumber(a)).Min();
            case "max": return args.Length == 0 ? throw new RuleException("max: no arguments.") : args.Select(a => Expr.ToNumber(a)).Max();
            case "clamp": return Math.Clamp(N(0), N(1), Math.Max(N(1), N(2)));
            case "pow": return Math.Pow(N(0), Math.Clamp(N(1), -16, 16));   // bounded exponent
            case "mod":
                // mod(DEX) or mod('DEX'): the ability's modifier; mod(14): modifier of a raw score.
                return args.Length > 0 && args[0] is string ab ? Mod(Score(ab)) : Mod(N(0));
            case "has": return _tags.Contains(S(0));
            case "count": return (double)_tags.Count(t => t.StartsWith(S(0), StringComparison.OrdinalIgnoreCase));
            case "table":
            {
                var t = S(0);
                if (!_r.Def.Tables.TryGetValue(t, out var row)) throw new RuleException($"table: table \"{t}\" does not exist.");
                if (row.Length == 0) return 0d;
                return row[Math.Clamp((int)N(1), 1, row.Length) - 1];
            }
            case "pickcount":
            {
                // pickcount('Feature', 'Option', level1, level2, …): how often Option was picked among the picks the levels allow.
                var allowed = args.Skip(2).Count(a => _c.Level >= Expr.ToNumber(a));
                var picks = Picks(S(0));
                return (double)(args.Length > 2 ? picks.Take(allowed) : picks).Count(p => p.Equals(S(1), StringComparison.OrdinalIgnoreCase));
            }
            case "skill":
                return _r.Stats.ContainsKey("skill." + S(0)) ? Stat("skill." + S(0)) : throw new RuleException($"skill: skill \"{S(0)}\" does not exist.");
            case "pick":
            {
                // pick('Feature', n): the n-th pick (1 = first) of a class feature, or '' when there is none.
                var picks = Picks(S(0));
                int n = args.Length > 1 ? (int)N(1) : 1;
                return n >= 1 && n <= picks.Count ? picks[n - 1] : "";
            }
            case "ranks": return (double)_c.Ranks.GetValueOrDefault(S(0));
            case "stat": return _r.Stats.ContainsKey(S(0)) ? Stat(S(0)) : 0d;
            // classhas('tag'): the class being evaluated (perclass, its own formulas; else the primary class) grants the tag.
            case "classhas": return ScopeClass()?.Grants.Contains(S(0), StringComparer.OrdinalIgnoreCase) == true;
            case "perclass":
            {
                // perclass('formula'): the formula once per class (level, hitDie, class.skillRanks of that class), summed.
                // Without a class of the package (homebrew class), once for the whole character.
                var f = _r.Late(S(0));
                var known = _c.Classes.Where(x => _r.Classes.ContainsKey(x.ClassId)).ToList();
                return known.Count == 0 ? InClass(null, () => f.EvaluateNumber(this)) : known.Sum(x => InClass(x, () => f.EvaluateNumber(this)));
            }
            default: throw new RuleException($"Unknown function \"{name}\".");
        }
    }
}
