using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Foliant.Api.Domain.Rules.Engine;

// A rule package (.foliant-rules) is a ZIP:
//   manifest.json   id, name, version, license, attribution, …
//   rules.json      RuleDefinition (abilities, stats, stacking, conditions, classes, tables)
//   layout.json     what the sheet shows (PackageLayout)
//   tests/*.json    example characters with expected values — all must pass to install
//   spells.json     optional: the system's spell list (lands in the compendium of that system)
//   feats.json      optional: the system's feat list (lands in the feat library of that system)
// ponytail: one rules.json for v1; split into definition/ and content/ files (plan) once packages grow.

public record PackageManifest
{
    public string Format { get; init; } = "";
    public int ApiVersion { get; init; }
    /// <summary>"system" (a whole rule system) or "extension" (content for one).</summary>
    public string Type { get; init; } = "system";
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string Version { get; init; } = "";
    public string License { get; init; } = "";
    public string? Attribution { get; init; }
    public List<string> Authors { get; init; } = new();
    public List<string> Languages { get; init; } = new();
    public string? Extends { get; init; }
}

/// <summary>layout.json — same meaning as <see cref="SheetLayout"/>; classes come from rules.json.</summary>
public record PackageLayout
{
    public List<AbilityDef> Abilities { get; init; } = new();
    public List<StatDef> Saves { get; init; } = new();
    public List<StatDef> SheetStats { get; init; } = new();
    public List<StatDef> CombatStats { get; init; } = new();
    public List<StatDef> PartyStats { get; init; } = new();
    public string ArmorDetail { get; init; } = "";
    /// <summary>Dashboard tiles between hit points and gold (at most 3); empty = armor class and initiative.</summary>
    public List<QuickStatDef> QuickStats { get; init; } = new();
}

/// <summary>One spell of spells.json; classes are class ids of rules.json.</summary>
public record PackageSpell
{
    public string Name { get; init; } = "";
    public int Level { get; init; }
    public string School { get; init; } = "";
    public List<string> Classes { get; init; } = new();
    public string CastingTime { get; init; } = "";
    public string Range { get; init; } = "";
    public string Components { get; init; } = "";
    public string Duration { get; init; } = "";
    public bool Concentration { get; init; }
    public bool Ritual { get; init; }
    public string Description { get; init; } = "";
    public string SavingThrow { get; init; } = "";
    public string Damage { get; init; } = "";
    public string Source { get; init; } = "";
    /// <summary>Different grade per class (PF1: cleric 1, wizard 2). Replaces Level/Classes when set.</summary>
    public Dictionary<string, int>? ClassLevels { get; init; }
}

/// <summary>One feat of feats.json. Prerequisites and benefit are shown as text.</summary>
public record PackageFeat
{
    public string Name { get; init; } = "";
    public string Type { get; init; } = "";
    public string Prerequisites { get; init; } = "";
    public string Benefit { get; init; } = "";
    public string Source { get; init; } = "";
}

public record PackageTestCharacter
{
    public int Level { get; init; } = 1;
    public List<ClassLevel> Classes { get; init; } = new();
    public string? Ancestry { get; init; }
    public string? Background { get; init; }
    public Dictionary<string, int> Abilities { get; init; } = new();
    public Dictionary<string, string> Choices { get; init; } = new();
    public List<string> Conditions { get; init; } = new();
    public List<string> Tags { get; init; } = new();
    public Dictionary<string, JsonElement> Facts { get; init; } = new();
}

public record PackageTest
{
    public string Name { get; init; } = "";
    public PackageTestCharacter Character { get; init; } = new();
    public Dictionary<string, double> Expect { get; init; } = new();
}

/// <summary>A package that passed every check and test.</summary>
public sealed record LoadedPackage(PackageManifest Manifest, RuleDefinition Rules, PackageLayout Layout,
    CompiledRules Compiled, int TestCount, string Sha256, IReadOnlyList<PackageSpell> Spells, IReadOnlyList<PackageFeat> Feats);

/// <summary>Result of checking a package: either a loaded package or the list of problems.</summary>
public sealed record PackageCheck(LoadedPackage? Package, List<string> Errors, List<string> TestResults);

public static class RulePackageLoader
{
    public const string Format = "foliant-rules";
    public const int ApiVersion = 1;
    public const long MaxUpload = 20L * 1024 * 1024;
    private const long MaxEntry = 10L * 1024 * 1024;
    private const int MaxEntries = 500;
    private const int MaxTests = 200;
    private const int MaxSpells = 3000;
    private const int MaxFeats = 5000;

    // Strict: unknown fields are errors, so typos ("stat" instead of "stats") don't silently do nothing.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    /// <summary>Checks a package completely (format, formulas, layout, tests). Never throws for bad input.</summary>
    public static PackageCheck Check(byte[] zipBytes)
    {
        var errors = new List<string>();
        var results = new List<string>();
        try
        {
            using var zip = new ZipArchive(new MemoryStream(zipBytes), ZipArchiveMode.Read);
            if (zip.Entries.Count > MaxEntries) return Fail("The package contains too many files.");
            // Entry names are only lookup keys — nothing is ever written to disk by name.
            var entries = zip.Entries.GroupBy(e => e.FullName.Replace('\\', '/'), StringComparer.Ordinal)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);

            T? Read<T>(string name, bool required) where T : class
            {
                if (!entries.TryGetValue(name, out var e)) { if (required) errors.Add($"{name} is missing."); return null; }
                var bytes = Bounded(e);
                if (bytes == null) { errors.Add($"{name} is too large."); return null; }
                try { return JsonSerializer.Deserialize<T>(bytes, Json) ?? throw new JsonException("empty"); }
                catch (JsonException ex) { errors.Add($"{name}: {Clean(ex)}"); return null; }
            }

            var manifest = Read<PackageManifest>("manifest.json", true);
            if (manifest == null) return new PackageCheck(null, errors, results);
            if (manifest.Format != Format) errors.Add($"manifest.json: format must be \"{Format}\".");
            if (manifest.ApiVersion < 1 || manifest.ApiVersion > ApiVersion)
                errors.Add($"manifest.json: apiVersion {manifest.ApiVersion} is not supported (this version supports {ApiVersion}).");
            if (!System.Text.RegularExpressions.Regex.IsMatch(manifest.Id, @"^[a-z0-9][a-z0-9._-]{1,63}$"))
                errors.Add("manifest.json: id must be lower case (a–z, 0–9, . _ -), e.g. \"community.minimal-w6\".");
            if (string.IsNullOrWhiteSpace(manifest.Name)) errors.Add("manifest.json: name is missing.");
            if (!System.Text.RegularExpressions.Regex.IsMatch(manifest.Version, @"^\d+\.\d+\.\d+$")) errors.Add("manifest.json: give the version in the format 1.0.0.");
            if (string.IsNullOrWhiteSpace(manifest.License)) errors.Add("manifest.json: license is missing (e.g. \"CC-BY-4.0\" or \"OGL-1.0a\").");
            if (manifest.Type == "extension") errors.Add("Extensions (type \"extension\") are not supported yet.");
            else if (manifest.Type != "system") errors.Add("manifest.json: type must be \"system\".");

            var rules = Read<RuleDefinition>("rules.json", true);
            var layout = Read<PackageLayout>("layout.json", true);
            var spells = Read<List<PackageSpell>>("spells.json", false) ?? new List<PackageSpell>();
            var feats = Read<List<PackageFeat>>("feats.json", false) ?? new List<PackageFeat>();
            if (rules == null || layout == null || errors.Count > 0) return new PackageCheck(null, errors, results);

            CompiledRules compiled;
            try { compiled = CompiledRules.Compile(rules); }
            catch (RuleException ex) { errors.Add($"rules.json: {ex.Message}"); return new PackageCheck(null, errors, results); }

            // Layout may only show what the rules define.
            var known = new HashSet<string>(rules.Stats.Select(s => s.Key).Concat(rules.Abilities), StringComparer.OrdinalIgnoreCase);
            foreach (var a in layout.Abilities.Where(a => !rules.Abilities.Contains(a.Key, StringComparer.OrdinalIgnoreCase)))
                errors.Add($"layout.json: ability \"{a.Key}\" is not defined in rules.json.");
            foreach (var s in layout.Saves.Concat(layout.SheetStats).Concat(layout.CombatStats).Concat(layout.PartyStats))
            {
                if (!known.Contains(s.Key) && !BuiltInFields.Contains(s.Key)) errors.Add($"layout.json: value \"{s.Key}\" is not defined in rules.json.");
                if (s.Format is not (StatFormat.Number or StatFormat.Signed or StatFormat.Distance or StatFormat.Weight or StatFormat.Percent))
                    errors.Add($"layout.json: format \"{s.Format}\" for \"{s.Key}\" does not exist.");
            }
            if (layout.QuickStats.Count > QuickStatIcons.Max) errors.Add($"layout.json: at most {QuickStatIcons.Max} quickStats.");
            foreach (var q in layout.QuickStats)
            {
                if (!known.Contains(q.Key) && !BuiltInFields.Contains(q.Key)) errors.Add($"layout.json: quickStats value \"{q.Key}\" is not defined in rules.json.");
                if (q.Format is not (StatFormat.Number or StatFormat.Signed or StatFormat.Distance or StatFormat.Weight or StatFormat.Percent))
                    errors.Add($"layout.json: format \"{q.Format}\" for quickStats \"{q.Key}\" does not exist.");
                if (q.Icon != null && !QuickStatIcons.All.Contains(q.Icon))
                    errors.Add($"layout.json: icon \"{q.Icon}\" for quickStats \"{q.Key}\" does not exist ({string.Join(", ", QuickStatIcons.All)}).");
            }
            foreach (var s in layout.Saves.Where(s => !s.Key.StartsWith("save.")))
                errors.Add($"layout.json: saving throw \"{s.Key}\" must start with \"save.\".");

            if (spells.Count > MaxSpells) errors.Add($"spells.json: at most {MaxSpells} spells.");
            var classIds = new HashSet<string>(rules.Classes.Select(c => c.Id), StringComparer.OrdinalIgnoreCase);
            foreach (var (sp, i) in spells.Take(MaxSpells).Select((sp, i) => (sp, i)))
            {
                var at = $"spells.json[{i}]{(string.IsNullOrWhiteSpace(sp.Name) ? "" : $" \"{sp.Name}\"")}";
                if (string.IsNullOrWhiteSpace(sp.Name) || sp.Name.Length > 200) errors.Add($"{at}: name missing or too long.");
                if (sp.Level is < 0 or > 9) errors.Add($"{at}: level must be 0–9.");
                foreach (var c in sp.Classes.Concat(sp.ClassLevels?.Keys ?? Enumerable.Empty<string>()).Where(c => !classIds.Contains(c)))
                    errors.Add($"{at}: class \"{c}\" does not exist in rules.json.");
                if (sp.ClassLevels?.Values.Any(l => l is < 0 or > 9) == true) errors.Add($"{at}: level must be 0–9.");
                if (sp.Description.Length > 20_000) errors.Add($"{at}: description too long.");
            }
            foreach (var dup in spells.GroupBy(sp => sp.Name, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
                errors.Add($"spells.json: \"{dup.Key}\" is duplicated.");
            if (feats.Count > MaxFeats) errors.Add($"feats.json: at most {MaxFeats} feats.");
            foreach (var (f, i) in feats.Take(MaxFeats).Select((f, i) => (f, i)))
            {
                if (string.IsNullOrWhiteSpace(f.Name) || f.Name.Length > 200) errors.Add($"feats.json[{i}]: name missing or too long.");
                if (f.Benefit.Length + f.Prerequisites.Length > 20_000) errors.Add($"feats.json[{i}] \"{f.Name}\": text too long.");
            }
            // Characters keep feats by id and an update matches by name, so names must be unique.
            foreach (var dup in feats.GroupBy(f => f.Name, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
                errors.Add($"feats.json: \"{dup.Key}\" is duplicated.");

            var testEntries = entries.Keys.Where(k => k.StartsWith("tests/") && k.EndsWith(".json")).Order().ToList();
            if (testEntries.Count == 0) errors.Add("The package needs at least one test under tests/*.json.");
            if (testEntries.Count > MaxTests) errors.Add($"At most {MaxTests} test files.");
            int count = 0;
            foreach (var name in testEntries.Take(MaxTests))
            {
                var test = Read<PackageTest>(name, true);
                if (test == null) continue;
                count++;
                var failures = RunTest(compiled, test);
                results.Add(failures.Count == 0 ? $"✓ {test.Name}" : $"✗ {test.Name}: {string.Join("; ", failures)}");
                errors.AddRange(failures.Select(f => $"{name} \"{test.Name}\": {f}"));
            }
            if (errors.Count > 0) return new PackageCheck(null, errors, results);
            return new PackageCheck(new LoadedPackage(manifest, rules, layout, compiled, count, Convert.ToHexString(SHA256.HashData(zipBytes)), spells, feats), errors, results);
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException or ArgumentException)
        {
            return Fail("The file is not a valid ZIP archive.");
        }

        PackageCheck Fail(string msg) { errors.Add(msg); return new PackageCheck(null, errors, results); }
    }

    /// <summary>Derived fields every system has even without a formula (host-computed).</summary>
    private static readonly HashSet<string> BuiltInFields = new(StringComparer.OrdinalIgnoreCase) { "carriedWeight" };

    public static EngineCharacter ToEngine(PackageTestCharacter t) => new()
    {
        Level = t.Level,
        Classes = t.Classes,
        Ancestry = t.Ancestry,
        Background = t.Background,
        Abilities = new Dictionary<string, int>(t.Abilities, StringComparer.OrdinalIgnoreCase),
        Choices = new Dictionary<string, string>(t.Choices, StringComparer.OrdinalIgnoreCase),
        Conditions = new HashSet<string>(t.Conditions, StringComparer.OrdinalIgnoreCase),
        Tags = new HashSet<string>(t.Tags, StringComparer.OrdinalIgnoreCase),
        Facts = t.Facts.ToDictionary(kv => kv.Key, kv => kv.Value.ValueKind switch
        {
            JsonValueKind.Number => (object)kv.Value.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => kv.Value.ToString(),
        }, StringComparer.OrdinalIgnoreCase),
    };

    private static List<string> RunTest(CompiledRules rules, PackageTest test)
    {
        try
        {
            var values = rules.Evaluate(ToEngine(test.Character)).Values;
            return test.Expect
                .Where(e => !values.TryGetValue(e.Key, out var v) || Math.Abs(v - e.Value) > 1e-9)
                .Select(e => values.TryGetValue(e.Key, out var v) ? $"{e.Key} expected {e.Value}, computed {v}" : $"{e.Key} does not exist")
                .ToList();
        }
        catch (RuleException ex) { return new List<string> { ex.Message }; }
    }

    private static byte[]? Bounded(ZipArchiveEntry e)
    {
        if (e.Length > MaxEntry) return null;
        using var s = e.Open();
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = s.Read(chunk, 0, chunk.Length)) > 0)
        {
            if (buffer.Length + read > MaxEntry) return null;   // the size in the zip header can lie
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }

    // System.Text.Json messages mention .NET type names — keep the part a package author can act on.
    private static string Clean(JsonException ex)
    {
        var field = System.Text.RegularExpressions.Regex.Match(ex.Message, @"property '([^']*)' could not be mapped");
        var head = field.Success ? $"unknown field \"{field.Groups[1].Value}\"" : ex.Message.Split(". Path:")[0].Split(" Path:")[0].TrimEnd('.');
        var line = ex.LineNumber is long l ? $" (line {l + 1})" : "";
        return ex.Path is { Length: > 1 } path ? $"{head} at {path}{line}" : head + line;
    }
}
