using System.IO.Compression;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Domain.Rules.Engine;
using Xunit;

namespace Foliant.Tests;

/// <summary>The example package in rule-packages/minimal-w6 must load, pass its own tests and run as a rule system.</summary>
public class RulePackageTests
{
    private static string PackageDir(string name = "minimal-w6", [System.Runtime.CompilerServices.CallerFilePath] string here = "") =>
        Path.Combine(Path.GetDirectoryName(here)!, "..", "rule-packages", name);

    /// <summary>Zips a package folder (same as `zip -r` in the README), optionally with files replaced.</summary>
    private static byte[] Zip(Dictionary<string, string>? replace = null, string package = "minimal-w6")
    {
        var dir = PackageDir(package);
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
        {
            foreach (var file in Directory.EnumerateFiles(dir, "*.json", SearchOption.AllDirectories))
            {
                var name = Path.GetRelativePath(dir, file).Replace('\\', '/');
                var text = replace != null && replace.TryGetValue(name, out var r) ? r : File.ReadAllText(file);
                using var w = new StreamWriter(zip.CreateEntry(name).Open());
                w.Write(text);
            }
        }
        return ms.ToArray();
    }

    [Fact]
    public void Example_package_loads_and_its_tests_pass()
    {
        var check = RulePackageLoader.Check(Zip());
        Assert.True(check.Package != null, string.Join("\n", check.Errors));
        Assert.Equal(2, check.Package!.TestCount);
        Assert.All(check.TestResults, t => Assert.StartsWith("✓", t));
    }

    [Fact]
    public void Runs_as_a_rule_system_for_a_stored_character()
    {
        var system = new DeclarativeRuleSystem(RulePackageLoader.Check(Zip()).Package!);
        var c = new Character
        {
            Class = "kaempfer", Level = 2, Str = 15, Dex = 12, Con = 14, Int = 9, Wis = 10, Cha = 8,
            FeatureChoicesJson = "{\"Kampfstil\":\"Waffe\"}",   // stored by name, as the class-feature UI does
        };
        var d = system.Compute(c, new Dictionary<string, int> { ["Armor"] = 2 }, 0);
        Assert.Equal(18, d.MaxHp);
        Assert.Equal(13, d.Ac);                         // 10 + DEX 1 + armor 2, no shield style
        Assert.Equal(4, d.Values!["attack"]);           // STR 2 + bonus 1 + Waffe 1
        Assert.Equal(2, d.Saves["Body"]);
        Assert.Equal(new[] { "Zäh", "Kampfstil" }, system.ClassFeatures("kaempfer").Select(f => f.Name));
        Assert.Equal("Kämpfer", system.Layout.Classes.First().Name);
    }

    [Fact]
    public void A_failing_package_test_blocks_the_install_and_says_why()
    {
        var wrong = File.ReadAllText(Path.Combine(PackageDir(), "tests", "kaempfer-2.json")).Replace("\"maxHp\": 18", "\"maxHp\": 99");
        var check = RulePackageLoader.Check(Zip(new() { ["tests/kaempfer-2.json"] = wrong }));
        Assert.Null(check.Package);
        Assert.Contains(check.Errors, e => e.Contains("maxHp expected 99, computed 18"));
    }

    [Theory]
    [InlineData("manifest.json", "{\"format\":\"foliant-rules\",\"apiVersion\":1,\"type\":\"system\",\"id\":\"Böse ID\",\"name\":\"x\",\"version\":\"1\",\"license\":\"\"}", "id must be lower case")]
    [InlineData("manifest.json", "{\"format\":\"foliant-rules\",\"apiVersion\":7,\"type\":\"system\",\"id\":\"a.b\",\"name\":\"x\",\"version\":\"1.0.0\",\"license\":\"x\"}", "apiVersion 7")]
    [InlineData("layout.json", "{\"abilities\":[],\"sheetStats\":[{\"key\":\"gibtsnicht\",\"label\":\"x\"}]}", "\"gibtsnicht\" is not defined in rules.json")]
    [InlineData("layout.json", "{\"abilitys\":[]}", "unknown field \"abilitys\"")]
    [InlineData("rules.json", "{\"stats\":[\n {\"key\":\"a\",\"exp\":\"1\"}]}", "rules.json: unknown field \"exp\" at $.stats[0].exp (line 2)")]
    [InlineData("layout.json", "{\"abilities\":[],\"quickStats\":[{\"key\":\"maxHp\",\"label\":\"x\",\"icon\":\"dragon\"}]}", "icon \"dragon\"")]
    [InlineData("layout.json", "{\"abilities\":[],\"quickStats\":[{\"key\":\"a\",\"label\":\"a\"},{\"key\":\"b\",\"label\":\"b\"},{\"key\":\"c\",\"label\":\"c\"},{\"key\":\"d\",\"label\":\"d\"}]}", "at most 3 quickStats")]
    public void Broken_packages_are_rejected_with_a_reason(string file, string content, string expected)
    {
        var check = RulePackageLoader.Check(Zip(new() { [file] = content }));
        Assert.Null(check.Package);
        Assert.Contains(check.Errors, e => e.Contains(expected));
    }

    /// <summary>The complete example in docs/rule-package-reference.md: every ```json block starting with "// file: x" is file x.</summary>
    private static byte[] ReferenceExample()
    {
        var doc = File.ReadAllText(Path.Combine(PackageDir(), "..", "..", "docs", "rule-package-reference.md"));
        var blocks = System.Text.RegularExpressions.Regex.Matches(doc, @"```json\n// file: (\S+)\n(.*?)```", System.Text.RegularExpressions.RegexOptions.Singleline);
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
            foreach (System.Text.RegularExpressions.Match b in blocks)
            {
                using var w = new StreamWriter(zip.CreateEntry(b.Groups[1].Value).Open());
                w.Write(b.Groups[2].Value);
            }
        return ms.ToArray();
    }

    [Fact]
    public void Reference_example_package_loads_and_runs()
    {
        var check = RulePackageLoader.Check(ReferenceExample());
        Assert.True(check.Package != null, string.Join("\n", check.Errors));
        Assert.Equal(4, check.Package!.TestCount);

        // Attack lines and toggles only show in the app; evaluate them once so their formulas run too.
        var result = check.Package.Compiled.Evaluate(new EngineCharacter
        {
            Level = 5, Classes = new() { new ClassLevel("fighter", 5) },
            Abilities = new(StringComparer.OrdinalIgnoreCase) { ["STR"] = 16, ["DEX"] = 14, ["CON"] = 14, ["INT"] = 10, ["WIS"] = 10, ["CHA"] = 10 },
            Tags = new(StringComparer.OrdinalIgnoreCase) { "toggle:fury" },
            Feats = new() { ("weaponfocus", "longsword") },
            Weapons = new() { new(StringComparer.OrdinalIgnoreCase) { ["name"] = "Longsword +1", ["slot"] = "main", ["key"] = "longsword",
                ["attackBonus"] = 1d, ["damageBonus"] = 1d, ["dice"] = "", ["itemCritRange"] = 20d, ["itemCritMultiplier"] = 2d } },
        });
        var attack = Assert.Single(result.Attacks!);
        Assert.Equal(new[] { 9, 9 }, attack.Bonuses);   // STR 18 (fury) → +4, prof +3, item +1, focus +1; two attacks
        Assert.Equal("1d8 + 5", attack.Damage);
        Assert.Equal("Blade drill: reroll 1s on damage", Assert.Single(attack.Notes));
        Assert.Contains(result.Toggles!, t => t.Id == "fury" && t.Active && t.Effect == "+2 STR, −2 AC for 3 rounds");
    }

    /// <summary>A stored character with two classes: each class's features, resources and casting use its own level.</summary>
    [Fact]
    public void Multiclass_character_uses_class_levels()
    {
        var system = new DeclarativeRuleSystem(RulePackageLoader.Check(ReferenceExample()).Package!);
        var c = new Character
        {
            Class = "fighter", Level = 5, ClassesJson = "[{\"classId\":\"mage\",\"level\":2}]",
            Str = 14, Dex = 12, Con = 14, Int = 14, Wis = 10, Cha = 8,
            FeatureChoicesJson = "{\"Fighting Style\":\"Defense\",\"Arcane School\":\"Evocation\",\"Arcane Bond\":\"Bonded Object\"}",
        };
        var d = system.Compute(c, new Dictionary<string, int>(), 0);
        Assert.Equal(40, d.MaxHp);
        Assert.Equal(2, d.Resources.Single(r => r.Key == "second-wind").Max);   // fighter level 3, not character level 5
        Assert.Contains(d.Resources, r => r.Key == "bonded-object");             // the mage's pick counts
        Assert.Equal(new[] { (1, 3) }, system.SpellSlots(c, new Dictionary<string, int>()).Select(s => (s.Grade, s.Total)));   // mage level 2
        Assert.Equal(2, system.CasterLevel(c));
        Assert.Equal("INT", system.CastingAbility(c));

        // 5e: every class has "hit-dice" (max = its level) — one pool with all of them.
        var srd = new DeclarativeRuleSystem(RulePackageLoader.Check(Zip(package: "srd5e-en")).Package!);
        var five = new Character { Class = "fighter", Level = 5, ClassesJson = "[{\"classId\":\"wizard\",\"level\":2}]", Con = 14 };
        Assert.Equal(5, srd.Compute(five, new Dictionary<string, int>(), 0).Resources.Single(r => r.Key == "hit-dice").Max);
    }

    /// <summary>Two casting classes: one spellbook each, with the slots of its own class level.</summary>
    [Fact]
    public void Every_casting_class_has_its_own_spellbook()
    {
        var system = new DeclarativeRuleSystem(RulePackageLoader.Check(ReferenceExample()).Package!);
        var c = new Character { Class = "mage", Level = 5, ClassesJson = "[{\"classId\":\"fighter\",\"level\":1},{\"classId\":\"bard\",\"level\":2}]", Int = 14, Cha = 14 };
        var none = new Dictionary<string, int>();
        Assert.Equal(new[] { "mage", "bard" }, system.CastingClassIds(c));
        Assert.Equal(new[] { (1, 3) }, system.SpellSlots(c, none, "mage").Select(s => (s.Grade, s.Total)));   // mage level 2
        Assert.Equal(new[] { (1, 3) }, system.SpellSlots(c, none, "bard").Select(s => (s.Grade, s.Total)));   // bard level 2
        Assert.Equal("CHA", system.CastingAbility(c, "bard"));
        Assert.False(system.Spellcasting(c, "bard")!.Prepared);
        Assert.Null(system.SharedSpellSlots(c, none));

        // 5e: wizard 3 / cleric 2 cast from one pool of a 5th-level caster; a paladin counts half.
        var srd = new DeclarativeRuleSystem(RulePackageLoader.Check(Zip(package: "srd5e-en")).Package!);
        var five = new Character { Class = "wizard", Level = 5, ClassesJson = "[{\"classId\":\"cleric\",\"level\":2}]" };
        Assert.Equal(new Dictionary<int, int> { [1] = 4, [2] = 3, [3] = 2 }, srd.SharedSpellSlots(five, none)!.Slots);
        five.ClassesJson = "[{\"classId\":\"paladin\",\"level\":3}]";
        Assert.Equal(new Dictionary<int, int> { [1] = 4, [2] = 2 }, srd.SharedSpellSlots(five, none)!.Slots);   // 2 + floor(3/2) = 3
        five.ClassesJson = "[{\"classId\":\"fighter\",\"level\":3}]";
        Assert.Null(srd.SharedSpellSlots(five, none));   // only one casting class
    }

    /// <summary>5e: an ability score improvement taken as "Feat" opens a feat slot; feat effects count.</summary>
    [Fact]
    public void Srd5e_feat_instead_of_ability_increase()
    {
        var pkg = RulePackageLoader.Check(Zip(package: "srd5e-en")).Package!;
        Assert.Equal(53, pkg.Feats.Count);
        var system = new DeclarativeRuleSystem(pkg);
        var asi = system.ClassFeatures("wizard").Where(f => f.Options?.Any(o => o.Name == "Feat") == true).Take(2).Select(f => f.Name).ToList();
        var c = new Character { Class = "wizard", Level = 8, Dex = 14 };
        Assert.Empty(system.Slots(c));   // no feat picked: no slot
        c.FeatureChoicesJson = System.Text.Json.JsonSerializer.Serialize(asi.ToDictionary(n => n, _ => "Feat"));
        Assert.Equal(2, system.Slots(c).Single().Count);
        var before = system.Compute(c, new Dictionary<string, int>(), 0).Initiative;
        CharacterState.WriteFeats(c, new() { new CharacterFeat(1, "Watchful") });
        Assert.Equal(before + 2, system.Compute(c, new Dictionary<string, int>(), 0).Initiative);
    }

    [Fact]
    public void Levels_beyond_the_character_level_are_cut_and_the_primary_class_keeps_one()
    {
        var c = new Character { Class = "fighter", Level = 3, ClassesJson = "[{\"classId\":\"mage\",\"level\":5},{\"classId\":\"bard\",\"level\":1}]" };
        Assert.Equal(new[] { ("fighter", 1), ("mage", 2) }, CharacterState.ClassLevels(c).Select(x => (x.ClassId, x.Level)));
        c.ClassesJson = "";   // column added to an old database
        Assert.Equal(new[] { ("fighter", 3) }, CharacterState.ClassLevels(c).Select(x => (x.ClassId, x.Level)));
    }

    [Fact]
    public void Abilities_beyond_the_classic_six_are_stored_by_key()
    {
        var c = new Character { AbilitiesJson = "" };
        CharacterState.WriteAbilities(c, new Dictionary<string, int> { ["STR"] = 15, ["MU"] = 13, ["Courage"] = 70 });
        Assert.Equal(15, c.Str);
        Assert.Equal(13, CharacterState.Score(c, "MU"));
        Assert.Equal(70, CharacterState.Score(c, "courage"));
        Assert.Equal(10, CharacterState.Score(c, "KL"));   // never set
    }

    [Fact]
    public void Not_a_zip_is_rejected()
    {
        var check = RulePackageLoader.Check(new byte[] { 1, 2, 3 });
        Assert.Null(check.Package);
        Assert.Contains("not a valid ZIP", check.Errors.Single());
    }

    [Fact]
    public void Dnd5e_srd_package_loads_and_its_tests_pass()
    {
        var check = RulePackageLoader.Check(Zip(package: "srd5e"));
        Assert.True(check.Package != null, string.Join("\n", check.Errors));
        Assert.Equal(8, check.Package!.TestCount);
    }

    /// <summary>"Core rulebook only" comes from the package: 5e has no such split, so its library is never filtered.</summary>
    [Fact]
    public void Core_sources_come_from_the_package()
    {
        Assert.Null(new DeclarativeRuleSystem(RulePackageLoader.Check(Zip(package: "srd5e")).Package!).Layout.CoreSources);
        Assert.Null(new DeclarativeRuleSystem(RulePackageLoader.Check(Zip()).Package!).Layout.CoreSources);
    }

    /// <summary>The English edition is generated from the German one: same rules and tests, English texts.</summary>
    [Fact]
    public void Dnd5e_english_edition_matches_the_german_one()
    {
        var de = RulePackageLoader.Check(Zip(package: "srd5e")).Package!;
        var check = RulePackageLoader.Check(Zip(package: "srd5e-en"));
        Assert.True(check.Package != null, string.Join("\n", check.Errors));
        var en = check.Package!;
        Assert.Equal(de.TestCount, en.TestCount);
        Assert.Equal(de.Manifest.Version, en.Manifest.Version);
        Assert.Equal(de.Rules.Classes.Select(c => c.Id), en.Rules.Classes.Select(c => c.Id));
        Assert.Equal(de.Spells.Count, en.Spells.Count);
        Assert.Equal("Wizard", en.Rules.Classes.Single(c => c.Id == "wizard").Name);
        Assert.Contains(en.Spells, s => s.Name == "Fireball" && s.School == "Evocation");
    }

    [Fact]
    public void Dnd5e_spell_slots_known_and_pact_magic()
    {
        var system = new DeclarativeRuleSystem(RulePackageLoader.Check(Zip(package: "srd5e")).Package!);
        Character Char(string cls, int level) => new() { Class = cls, Level = level, Str = 10, Dex = 10, Con = 10, Int = 16, Wis = 14, Cha = 16 };
        var none = new Dictionary<string, int>();
        string Slots(string cls, int level) => string.Join(" ", system.SpellSlots(Char(cls, level), none).Select(s => $"{s.Grade}:{s.Total}"));
        Assert.Equal("1:4 2:3 3:2", Slots("wizard", 5));                 // full caster
        Assert.Equal("1:4 2:2", Slots("paladin", 5));                    // half caster from level 2
        Assert.Equal("", Slots("paladin", 1));
        Assert.Equal("3:2", Slots("warlock", 5));                         // pact magic: all slots of one grade
        Assert.Equal("5:4", Slots("warlock", 20));
        Assert.Equal("1:4 2:3 3:3 4:3 5:3 6:2 7:2 8:1 9:1", Slots("cleric", 20));
        var sorc = system.Spellcasting(Char("sorcerer", 4))!;
        Assert.False(sorc.Prepared);
        Assert.Equal(5, sorc.Cantrips);
        Assert.Equal("CHA", system.CastingAbility(Char("sorcerer", 4)));
        Assert.Null(system.Spellcasting(Char("fighter", 5)));
    }

    [Fact]
    public void Attunement_only_where_the_package_sets_a_limit()
    {
        IRuleSystem w6 = new DeclarativeRuleSystem(RulePackageLoader.Check(Zip()).Package!);
        IRuleSystem dnd = new DeclarativeRuleSystem(RulePackageLoader.Check(Zip(package: "srd5e")).Package!);
        Assert.Null(w6.Capability<IAttunementRules>());
        Assert.Equal(3, dnd.Capability<IAttunementRules>()!.AttunementLimit);
        Assert.NotNull(dnd.Capability<ISkillValueRules>());
        Assert.True(dnd.Spellcasting(new Character { Class = "warlock", Level = 3, Cha = 16 })!.SlotsOnShortRest);
        Assert.False(dnd.Spellcasting(new Character { Class = "wizard", Level = 3, Int = 16 })!.SlotsOnShortRest);
    }

    [Fact]
    public void Dnd5e_spells_load_and_bad_spells_are_rejected()
    {
        var pkg = RulePackageLoader.Check(Zip(package: "srd5e")).Package!;
        Assert.Equal(319, pkg.Spells.Count);
        var fireball = pkg.Spells.Single(s => s.Name.EndsWith("(Fireball)"));
        Assert.Equal(3, fireball.Level);
        Assert.Equal(new[] { "sorcerer", "wizard" }, fireball.Classes);
        Assert.Equal("45 m", fireball.Range);

        var bad = "[{\"name\":\"X\",\"level\":12,\"classes\":[\"necromancer\"]}]";
        var check = RulePackageLoader.Check(Zip(new() { ["spells.json"] = bad }, "srd5e"));
        Assert.Contains(check.Errors, e => e.Contains("level must be 0–9"));
        Assert.Contains(check.Errors, e => e.Contains("class \"necromancer\""));
    }
}
