using Foliant.Api.Domain.Rules.Engine;
using Xunit;

namespace Foliant.Tests;

/// <summary>The declarative rule engine: formula language, stats, modifiers, stacking, choices, safety.</summary>
public class RuleEngineTests
{
    // A tiny 5e-like system, written the way a rule package would be.
    private static RuleDefinition Mini(string stacking = "sum") => new()
    {
        Abilities = new() { "STR", "DEX", "CON", "INT", "WIS", "CHA" },
        Stacking = new StackingRule { Rule = stacking, AlwaysStack = new() { "dodge" } },
        Tables = new() { ["prof"] = new double[] { 2, 2, 2, 2, 3, 3, 3, 3, 4 } },
        Stats = new()
        {
            new StatFormula { Key = "prof", Expr = "table('prof', level)" },
            new StatFormula { Key = "initiative", Expr = "mod(DEX)" },
            new StatFormula
            {
                Key = "ac", Pick = "max", Plus = "shield.bonus",
                Options = new()
                {
                    new StatOption { When = "armor.type == 'none'", Expr = "10 + mod(DEX)" },
                    new StatOption { When = "armor.type == 'medium'", Expr = "armor.base + min(mod(DEX), 2)" },
                    new StatOption { When = "armor.type == 'heavy'", Expr = "armor.base" },
                    new StatOption { When = "armor.type == 'none' && has('feature:unarmored-defense')", Expr = "10 + mod(DEX) + mod(CON)" },
                },
            },
            new StatFormula { Key = "save.STR", Expr = "mod(STR) + (has('prof:save.STR') ? prof : 0)" },
            new StatFormula { Key = "save.DEX", Expr = "mod(DEX) + (has('prof:save.DEX') ? prof : 0)" },
            new StatFormula { Key = "attack", Expr = "mod(STR) + prof" },
            new StatFormula { Key = "skill.perception", Expr = "mod(WIS) + (has('prof:perception') ? prof : 0)" },
            new StatFormula { Key = "passivePerception", Expr = "10 + skill('perception')" },
        },
        Conditions = new()
        {
            new ConditionDef { Id = "shaken", Modifiers = new() { new ModifierDef { Target = "attack", Value = "-2" }, new ModifierDef { Target = "save.*", Value = "-2" } } },
        },
        Classes = new()
        {
            new ClassContent
            {
                Id = "fighter", HitDie = 10,
                Levels = new() { [1] = new LevelGrant { Features = new() { "fighting-style", "second-wind" } }, [2] = new LevelGrant { Features = new() { "action-surge" } } },
                Features = new()
                {
                    ["fighting-style"] = new FeatureDef
                    {
                        Choice = new ChoiceDef
                        {
                            Options = new()
                            {
                                new ChoiceOption { Id = "defense", Modifiers = new() { new ModifierDef { Target = "ac", Value = "1", When = "armor.type != 'none'" } } },
                                new ChoiceOption { Id = "dueling", Modifiers = new() { new ModifierDef { Target = "attack", Value = "2" } } },
                            },
                        },
                    },
                    ["second-wind"] = new FeatureDef { Resource = new ResourceDef { Id = "second-wind", Max = "1", Reset = "short" } },
                    ["action-surge"] = new FeatureDef { Resource = new ResourceDef { Id = "action-surge", Max = "level >= 17 ? 2 : 1", Reset = "short" } },
                },
            },
            new ClassContent
            {
                Id = "barbarian",
                Levels = new() { [1] = new LevelGrant { Features = new() { "unarmored-defense" } } },
                Features = new() { ["unarmored-defense"] = new FeatureDef() },
            },
        },
    };

    private static EngineCharacter Fighter(int level = 3, string? style = "defense", string armor = "heavy") => new()
    {
        Level = level,
        Abilities = new(StringComparer.OrdinalIgnoreCase) { ["STR"] = 16, ["DEX"] = 12, ["CON"] = 14, ["INT"] = 10, ["WIS"] = 13, ["CHA"] = 8 },
        Classes = new() { new ClassLevel("fighter", level) },
        Choices = style == null ? new() : new(StringComparer.OrdinalIgnoreCase) { ["fighter/fighting-style"] = style },
        Tags = new(StringComparer.OrdinalIgnoreCase) { "prof:save.STR", "prof:perception" },
        Facts = new(StringComparer.OrdinalIgnoreCase) { ["armor.type"] = armor, ["armor.base"] = 16, ["shield.bonus"] = 2 },
    };

    [Fact]
    public void Computes_a_level_3_fighter()
    {
        var r = CompiledRules.Compile(Mini()).Evaluate(Fighter());
        Assert.Equal(2, r.Values["prof"]);
        Assert.Equal(16 + 2 + 1, r.Values["ac"]);                 // chain mail + shield + Defense style
        Assert.Equal(3 + 2, r.Values["save.STR"]);                // proficient
        Assert.Equal(1, r.Values["save.DEX"]);                    // not proficient
        Assert.Equal(10 + 1 + 2, r.Values["passivePerception"]);  // WIS 13 + proficiency
        Assert.Equal(new[] { "second-wind", "action-surge" }, r.Resources.Select(x => x.Id));
        Assert.Empty(r.OpenChoices);
    }

    [Fact]
    public void Best_armor_option_wins_and_conditions_apply()
    {
        var rules = CompiledRules.Compile(Mini());
        var barb = Fighter(armor: "none") with { Classes = new() { new ClassLevel("barbarian", 1) }, Choices = new() };
        Assert.Equal(10 + 1 + 2 + 2, rules.Evaluate(barb).Values["ac"]);   // DEX + CON beats DEX only; + shield
        var shaken = Fighter() with { Conditions = new(StringComparer.OrdinalIgnoreCase) { "shaken" } };
        var r = rules.Evaluate(shaken);
        Assert.Equal(3 + 2 - 2, r.Values["attack"]);
        Assert.Equal(5 - 2, r.Values["save.STR"]);                 // wildcard target save.*
    }

    [Fact]
    public void Missing_choice_is_reported_as_open()
    {
        var r = CompiledRules.Compile(Mini()).Evaluate(Fighter(style: null));
        var open = Assert.Single(r.OpenChoices);
        Assert.Equal("fighter/fighting-style", open.Key);
        Assert.Equal(new[] { "defense", "dueling" }, open.Options);
        Assert.Equal(16 + 2, r.Values["ac"]);                      // no Defense bonus
    }

    [Fact]
    public void Highest_per_type_stacking()
    {
        var item = (string src, string type, string v) => (src, new ModifierDef { Target = "ac", Value = v, Type = type });
        var c = Fighter(style: null) with
        {
            ExtraModifiers = new()
            {
                item("ring", "deflection", "1"), item("spell", "deflection", "2"),   // only the higher deflection counts
                item("boots", "dodge", "1"), item("feat", "dodge", "1"),             // dodge always stacks
                item("curse", "deflection", "-1"),                                    // penalties add up
            },
        };
        Assert.Equal(18 + 2 + 2 - 1, CompiledRules.Compile(Mini("highest-per-type")).Evaluate(c).Values["ac"]);
        Assert.Equal(18 + 1 + 2 + 1 + 1 - 1, CompiledRules.Compile(Mini("sum")).Evaluate(c).Values["ac"]);
    }

    [Fact]
    public void Level_scaling_resources()
    {
        var r = CompiledRules.Compile(Mini()).Evaluate(Fighter(level: 17));
        Assert.Equal(2, r.Resources.Single(x => x.Id == "action-surge").Max);
        Assert.Equal(4, r.Values["prof"]);   // past the table's end the last entry counts
    }

    [Fact]
    public void Cycles_are_rejected_when_compiling()
    {
        var def = Mini() with { Stats = new() { new StatFormula { Key = "a", Expr = "b + 1" }, new StatFormula { Key = "b", Expr = "stat('a')" } } };
        var ex = Assert.Throws<RuleException>(() => CompiledRules.Compile(def));
        Assert.Contains("Circular reference", ex.Message);
    }

    [Theory]
    [InlineData("1 +", "Expression expected")]
    [InlineData("system('rm')", "Unknown function")]
    [InlineData("'offen", "not closed")]
    [InlineData("(1", "\")\" expected")]
    public void Bad_formulas_name_the_problem(string formula, string expected)
    {
        var def = Mini() with { Stats = new() { new StatFormula { Key = "x", Expr = formula } } };
        var ex = Assert.Throws<RuleException>(() => CompiledRules.Compile(def));
        Assert.Contains("stats[x]", ex.Message);
        Assert.Contains(expected, ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Formula_language_basics()
    {
        var scope = new MiniScope();
        double N(string f) => Expr.Parse(f).EvaluateNumber(scope);
        Assert.Equal(7, N("1 + 2 * 3"));
        Assert.Equal(9, N("(1 + 2) * 3"));
        Assert.Equal(-1, N("floor((9 - 10) / 2)"));                // PF/5e modifier of 9
        Assert.Equal(5, N("level*2+1"));                           // no spaces needed
        Assert.Equal(1, N("armor.type == 'LIGHT' ? 1 : 0"));       // text compare ignores case
        Assert.Equal(1, N("!(1 > 2) && 2 >= 2 && 1 != 2"));
        Assert.Throws<RuleException>(() => Expr.Parse(new string('(', 100) + "1" + new string(')', 100)));   // too deep
        Assert.Throws<RuleException>(() => Expr.Parse(string.Join("+", Enumerable.Repeat("1", 1500))));      // too long
    }

    [Fact]
    public void Ancestry_class_grants_skills_and_spellcasting()
    {
        var def = new RuleDefinition
        {
            Abilities = new() { "STR", "DEX", "CON", "INT", "WIS", "CHA" },
            Tables = new() { ["prof"] = new double[] { 2, 2, 2, 2, 3 }, ["full1"] = new double[] { 2, 3, 4, 4, 4 }, ["full2"] = new double[] { 0, 0, 2, 3, 3 } },
            Stats = new()
            {
                new StatFormula { Key = "prof", Expr = "table('prof', level)" },
                new StatFormula { Key = "maxHp", Expr = "hitDie + mod(CON) + (level - 1) * (floor(hitDie / 2) + 1 + mod(CON))" },
                new StatFormula { Key = "save.INT", Expr = "mod(INT) + (has('prof:save.INT') ? prof : 0)" },
                new StatFormula { Key = "spellDc", Expr = "8 + prof + castingMod" },
                new StatFormula { Key = "speed", Expr = "ancestry.speed" },
            },
            SkillFormula = "mod(ability) + (proficient ? prof : 0) + (expertise ? prof : 0)",
            Skills = new() { new SkillInfo { Key = "arcana", Name = "Arkane Kunde", Ability = "INT" }, new SkillInfo { Key = "stealth", Ability = "DEX" } },
            Ancestries = new()
            {
                new AncestryDef { Id = "gnome", Speed = 25, Size = "Small", Grants = new() { "trait:darkvision" },
                    Modifiers = new() { new ModifierDef { Target = "INT", Value = "2" } } },
            },
            Classes = new()
            {
                new ClassContent
                {
                    Id = "wizard", HitDie = 6, Grants = new() { "prof:save.INT", "prof:save.WIS" },
                    Spellcasting = new SpellcastingDef { Ability = "INT", Prepared = true, Cantrips = "level >= 4 ? 4 : 3",
                        Slots = new() { [1] = "table('full1', level)", [2] = "table('full2', level)" } },
                    Levels = new() { [1] = new LevelGrant { Features = new() { "skills", "scholar" } } },
                    Features = new()
                    {
                        ["skills"] = new FeatureDef { Choice = new ChoiceDef { Pick = 1, Options = new()
                        {
                            new ChoiceOption { Id = "arcana", Grants = new() { "prof:skill.arcana" } },
                            new ChoiceOption { Id = "stealth", Grants = new() { "prof:skill.stealth" } },
                        } } },
                        ["scholar"] = new FeatureDef { Grants = new() { "expertise:skill.arcana" } },
                    },
                },
            },
        };
        var c = new EngineCharacter
        {
            Level = 3, Ancestry = "gnome",
            Abilities = new(StringComparer.OrdinalIgnoreCase) { ["STR"] = 8, ["DEX"] = 14, ["CON"] = 14, ["INT"] = 15, ["WIS"] = 12, ["CHA"] = 10 },
            Classes = new() { new ClassLevel("wizard", 3) },
            Choices = new(StringComparer.OrdinalIgnoreCase) { ["wizard/skills"] = "arcana" },
        };
        var r = CompiledRules.Compile(def).Evaluate(c);
        Assert.Equal(17, r.Values["INT"]);                               // 15 + gnome 2
        Assert.Equal(25, r.Values["speed"]);
        Assert.Equal(6 + 2 + 2 * (3 + 1 + 2), r.Values["maxHp"]);        // max die at 1st, average after
        Assert.Equal(3 + 2, r.Values["save.INT"]);                       // class grant
        Assert.Equal(8 + 2 + 3, r.Values["spellDc"]);
        var arcana = r.Skills.Single(s => s.Key == "arcana");
        Assert.True(arcana.Proficient && arcana.Expertise);
        Assert.Equal(3 + 2 + 2, arcana.Value);
        Assert.Equal(2, r.Skills.Single(s => s.Key == "stealth").Value); // not chosen: DEX mod only
        Assert.Contains("trait:darkvision", r.Tags);
        Assert.Equal(3, r.Spellcasting!.Cantrips);
        Assert.Equal(new Dictionary<int, int> { [1] = 4, [2] = 2 }, r.Spellcasting.Slots);
    }

    private sealed class MiniScope : IExprScope
    {
        public object? Resolve(string name) => name switch { "level" => 2d, "armor.type" => "light", _ => null };
        public object? Call(string name, object?[] args) => name == "floor" ? Math.Floor(Expr.ToNumber(args[0])) : throw new RuleException("nope");
    }
}
