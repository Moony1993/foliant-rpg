namespace Foliant.Api.Domain.Rules;

/// <summary>Rule-agnostic feat helpers shared by built-in and package rule systems.</summary>
public static class FeatNames
{
    /// <summary>Comparable key of a feat name: lower case letters only, "Combat Expertise, Improved" →
    /// "improvedcombatexpertise" (so "Improved Combat Expertise" matches too).</summary>
    public static string Key(string name)
    {
        var n = name.ToLowerInvariant().Replace("’", "").Replace("'", "").Trim();
        var m = System.Text.RegularExpressions.Regex.Match(n, @"^(.+?), (improved|greater|great|lesser|minor)$");
        if (m.Success) n = $"{m.Groups[2].Value} {m.Groups[1].Value}";
        return new string(n.Where(char.IsAsciiLetterLower).ToArray());
    }

    public static bool Accepts(FeatSlot s, string featName, string featType) =>
        s.Any || s.Names.Contains(Key(featName))
        || s.Types.Any(t => featType.Contains(t, StringComparison.OrdinalIgnoreCase));

    /// <summary>True if every feat can be put into its own slot (augmenting-path matching).</summary>
    public static bool Fits(IReadOnlyList<(string Name, string Type)> feats, IReadOnlyList<FeatSlot> slots)
    {
        var units = slots.OrderBy(s => s.Any).SelectMany(s => Enumerable.Repeat(s, s.Count)).ToList();
        if (feats.Count > units.Count) return false;
        var owner = new int[units.Count];
        Array.Fill(owner, -1);
        bool Place(int f, bool[] seen)
        {
            for (int u = 0; u < units.Count; u++)
            {
                if (seen[u] || !Accepts(units[u], feats[f].Name, feats[f].Type)) continue;
                seen[u] = true;
                if (owner[u] < 0 || Place(owner[u], seen)) { owner[u] = f; return true; }
            }
            return false;
        }
        for (int f = 0; f < feats.Count; f++)
            if (!Place(f, new bool[units.Count])) return false;
        return true;
    }
}
