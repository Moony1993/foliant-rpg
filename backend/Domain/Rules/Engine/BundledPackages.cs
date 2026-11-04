using System.IO.Compression;

namespace Foliant.Api.Domain.Rules.Engine;

/// <summary>Rule packages shipped inside the app (rule-packages/&lt;folder&gt;, embedded at build time). Nothing is
/// installed from them automatically, except PF1 for data from before rule packages (see DbSeeder).</summary>
public static class BundledPackages
{
    /// <summary>The package folder was embedded (private builds ship PF1; the public repo has no bundled package).</summary>
    public static bool Has(string folder) =>
        typeof(BundledPackages).Assembly.GetManifestResourceNames().Any(n => n.StartsWith($"rule-packages/{folder}/", StringComparison.Ordinal));

    /// <summary>The package as a .foliant-rules file (ZIP).</summary>
    public static byte[] Bytes(string folder)
    {
        var asm = typeof(BundledPackages).Assembly;
        var prefix = $"rule-packages/{folder}/";
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
            foreach (var name in asm.GetManifestResourceNames().Where(n => n.StartsWith(prefix, StringComparison.Ordinal)))
            {
                using var src = asm.GetManifestResourceStream(name)!;
                using var dst = zip.CreateEntry(name[prefix.Length..]).Open();
                src.CopyTo(dst);
            }
        return ms.ToArray();
    }

    public static DeclarativeRuleSystem Load(string folder)
    {
        var check = RulePackageLoader.Check(Bytes(folder));
        return check.Package is { } p ? new DeclarativeRuleSystem(p)
            : throw new InvalidOperationException($"Bundled rule package \"{folder}\" is broken: {string.Join(" | ", check.Errors)}");
    }
}
