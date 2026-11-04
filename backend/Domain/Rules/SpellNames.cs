namespace Foliant.Api.Domain.Rules;

/// <summary>Rule-neutral spell name and school matching for rule packages and PF1.</summary>
public static class SpellNames
{
    /// <summary>"Cure Critical Wounds, Mass" = "Mass Cure Critical Wounds"; brackets, case and punctuation don't count.</summary>
    public static string Key(string name)
    {
        var n = System.Text.RegularExpressions.Regex.Replace(name.ToLowerInvariant().Replace("’", "'"), @"\(.*?\)", "").Trim();
        var m = System.Text.RegularExpressions.Regex.Match(n, @"^(.+?), (mass|greater|lesser|communal)$");
        if (m.Success) n = $"{m.Groups[2].Value} {m.Groups[1].Value}";
        return new string(n.Where(char.IsAsciiLetterLower).ToArray());
    }

    /// <summary>School key of a school text like "conjuration (healing)" (its first word, looked up in the aliases); "" if unknown.</summary>
    public static string School(string? school, IReadOnlyDictionary<string, string> aliases)
    {
        var first = (school ?? "").Trim().Split(' ', '(', '[', ',')[0].ToLowerInvariant();   // package aliases are lower case
        return aliases.GetValueOrDefault(first, "");
    }
}
