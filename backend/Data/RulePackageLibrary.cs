using Microsoft.EntityFrameworkCore;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules.Engine;

namespace Foliant.Api.Data;

/// <summary>Brings a package's spells.json and feats.json into the libraries of its system (on install and update).</summary>
public static class RulePackageLibrary
{
    public static async Task SyncAsync(AppDbContext db, string systemId, IReadOnlyList<PackageSpell> spells, IReadOnlyList<PackageFeat> feats)
    {
        if (spells.Count > 0) await SyncSpellsAsync(db, systemId, spells);   // without spells.json the compendium stays as it is
        if (feats.Count > 0) await SyncFeatsAsync(db, systemId, feats);
    }

    /// <summary>Removing a package takes its shipped rows along; homebrew and imported data stay.</summary>
    public static async Task RemoveAsync(AppDbContext db, LoadedPackage? pkg, string systemId)
    {
        if (pkg is { Spells.Count: > 0 }) await SyncSpellsAsync(db, systemId, Array.Empty<PackageSpell>());
        if (pkg is { Feats.Count: > 0 })
            await db.Feats.IgnoreQueryFilters().Where(f => f.RuleSystemId == systemId && f.CampaignId == null && f.CreatedByUserId == null).ExecuteDeleteAsync();
    }

    /// <summary>The package's spell list replaces the system's shipped compendium spells (homebrew and the
    /// copies on characters stay untouched).</summary>
    private static async Task SyncSpellsAsync(AppDbContext db, string systemId, IReadOnlyList<PackageSpell> spells)
    {
        await db.CompendiumSpells.IgnoreQueryFilters()
            .Where(s => s.RuleSystemId == systemId && s.CampaignId == null && s.CreatedByUserId == null).ExecuteDeleteAsync();
        db.CompendiumSpells.AddRange(spells.Select(sp => new CompendiumSpell
        {
            RuleSystemId = systemId, Name = sp.Name, School = sp.School, CastingTime = sp.CastingTime, Range = sp.Range,
            Components = sp.Components, Duration = sp.Duration, SavingThrow = sp.SavingThrow, Damage = sp.Damage, Source = sp.Source,
            Description = string.Join("\n\n", new[] { sp.Concentration ? "Concentration." : null, sp.Ritual ? "Ritual." : null, sp.Description }.Where(x => !string.IsNullOrEmpty(x))),
            ClassLevelsJson = System.Text.Json.JsonSerializer.Serialize(sp.ClassLevels
                ?? sp.Classes.Distinct(StringComparer.OrdinalIgnoreCase).ToDictionary(c => c, _ => sp.Level)),
        }));
    }

    /// <summary>Feats are matched by name and updated in place: characters reference them by id. Shipped feats
    /// the package no longer lists stay, so no character loses one.</summary>
    private static async Task SyncFeatsAsync(AppDbContext db, string systemId, IReadOnlyList<PackageFeat> feats)
    {
        var shipped = (await db.Feats.IgnoreQueryFilters()
                .Where(f => f.RuleSystemId == systemId && f.CampaignId == null && f.CreatedByUserId == null).ToListAsync())
            .GroupBy(f => f.Name, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        foreach (var f in feats)
        {
            if (!shipped.TryGetValue(f.Name, out var row)) db.Feats.Add(row = new FeatTemplate { RuleSystemId = systemId, Name = f.Name });
            row.Type = f.Type; row.Prerequisites = f.Prerequisites; row.Benefit = f.Benefit; row.Source = f.Source;
        }
    }
}
