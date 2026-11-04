using Foliant.Api.Domain.Rules.Engine;
using System.IO.Compression;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Services;
using Xunit;

namespace Foliant.Tests;

/// <summary>Export → import must rebuild the campaign with fresh ids and every reference rewired.</summary>
public class CampaignTransferTests : IDisposable
{
    private readonly SqliteConnection _conn = new("DataSource=:memory:");
    private const string Gm = "gm";

    private sealed class Env : Microsoft.AspNetCore.Hosting.IWebHostEnvironment
    {
        public string WebRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ApplicationName { get; set; } = "test";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public string EnvironmentName { get; set; } = Environments.Development;
    }

    public CampaignTransferTests()
    {
        _conn.Open();
        using var db = Db(null);
        db.Database.EnsureCreated();
        db.Users.Add(new AppUser { Id = Gm, UserName = "gm", DisplayName = "GM" });
        db.Campaigns.Add(new Campaign { Id = 1, Name = "Quelle", RuleSystemId = SystemId, Members = { new CampaignMember { UserId = Gm, Role = CampaignRoles.Gm } } });
        db.ItemTemplates.Add(new ItemTemplate { Name = "Langschwert", RuleSystemId = SystemId });                // official (shipped)
        db.Feats.Add(new FeatTemplate { Name = "Waffenfokus", RuleSystemId = SystemId });                         // official (shipped)
        db.SaveChanges();
    }

    public void Dispose() => _conn.Dispose();

    private AppDbContext Db(int? campaignId)
    {
        var ctx = new CampaignContext();
        if (campaignId is int id) ctx.Set(id, CampaignRoles.Gm, SystemId);
        return new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options, ctx);
    }

    // Any installed system will do; the example package ships with every copy of the repo (PF1 does not).
    private const string SystemId = "example.minimal-w6";
    private static readonly IRuleSystem W6 = LoadExample();

    private static IRuleSystem LoadExample([System.Runtime.CompilerServices.CallerFilePath] string here = "")
    {
        var dir = Path.Combine(Path.GetDirectoryName(here)!, "..", "rule-packages", "minimal-w6");
        using var ms = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Create, true))
            foreach (var file in Directory.EnumerateFiles(dir, "*.json", SearchOption.AllDirectories))
            {
                using var w = zip.CreateEntry(Path.GetRelativePath(dir, file).Replace('\\', '/')).Open();
                w.Write(File.ReadAllBytes(file));
            }
        return new DeclarativeRuleSystem(RulePackageLoader.Check(ms.ToArray()).Package!);
    }

    private static CampaignTransfer Transfer(AppDbContext db) => new(db,
        new MediaStorage(new ConfigurationBuilder().Build(), new Env()), new RuleSystemRegistry(new IRuleSystem[] { W6 }));

    [Fact]
    public async Task Backup_round_trip_rewires_all_references()
    {
        int homebrewId, officialItemId, officialFeatId, monsterId;
        using (var a = Db(1))
        {
            var brew = new ItemTemplate { Name = "Familienaxt", CreatedByUserId = Gm, RuleSystemId = SystemId };
            a.ItemTemplates.Add(brew);
            a.SaveChanges();
            homebrewId = brew.Id;
            officialItemId = a.ItemTemplates.Single(t => t.Name == "Langschwert").Id;
            officialFeatId = a.Feats.Single().Id;
            var m = new Monster { Name = "Ork", CreatedByUserId = Gm, ItemTemplateIdsJson = $"[{homebrewId},{officialItemId}]" };
            a.Monsters.Add(m);
            var ch = new Character
            {
                UserId = Gm, Name = "Brakka", FeatsJson = $"[{{\"id\":{officialFeatId},\"name\":\"Waffenfokus\"}}]",
                Items = { new InventoryItem { ItemTemplateId = homebrewId, Quantity = 1 } },
            };
            a.Characters.Add(ch);
            a.SaveChanges();
            monsterId = m.Id;
            var map = new BattleMap { Name = "Höhle", CreatedByUserId = Gm,
                TokensJson = $"[{{\"id\":\"t1\",\"kind\":\"monster\",\"refId\":{monsterId}}},{{\"id\":\"t2\",\"kind\":\"character\",\"refId\":{ch.Id}}}]" };
            a.BattleMaps.Add(map);
            a.SaveChanges();
        }

        byte[] zip;
        using (var a = Db(1)) zip = (await Transfer(a).ExportAsync(1, Gm, withCharacters: true, new DefaultHttpContext().Request)).Zip;

        CampaignTransfer.ImportResult result;
        using (var any = Db(1)) result = await Transfer(any).ImportAsync(new MemoryStream(zip), Gm, "GM", new DefaultHttpContext().Request);

        Assert.Empty(result.Warnings);
        using var b = Db(result.CampaignId);
        var newBrew = b.ItemTemplates.Single(t => t.Name == "Familienaxt" && t.CampaignId == result.CampaignId);
        Assert.NotEqual(homebrewId, newBrew.Id);
        var monster = b.Monsters.Single();
        Assert.Equal($"[{newBrew.Id},{officialItemId}]", monster.ItemTemplateIdsJson);                    // homebrew remapped, official by name
        var brakka = b.Characters.Include(c => c.Items).Single();
        Assert.Equal(newBrew.Id, Assert.Single(brakka.Items).ItemTemplateId);
        Assert.Contains($"\"id\":{officialFeatId}", brakka.FeatsJson);
        var tokens = b.BattleMaps.Single().TokensJson;
        Assert.Contains($"\"refId\":{monster.Id}", tokens);
        Assert.Contains($"\"refId\":{brakka.Id}", tokens);
        // The source campaign is untouched and still separate.
        using var a2 = Db(1);
        Assert.Equal("Brakka", a2.Characters.Single().Name);
    }

    [Fact]
    public async Task Garbage_is_rejected_with_a_message()
    {
        using var db = Db(1);
        var ex = await Assert.ThrowsAsync<CampaignTransfer.ImportException>(() =>
            Transfer(db).ImportAsync(new MemoryStream(Encoding.UTF8.GetBytes("kein zip")), Gm, "GM", new DefaultHttpContext().Request));
        Assert.Contains("not a valid", ex.Message);

        using var ms = new MemoryStream();
        using (var z = new ZipArchive(ms, ZipArchiveMode.Create, true))
        using (var w = new StreamWriter(z.CreateEntry("manifest.json").Open())) w.Write("{\"format\":\"foliant-campaign\",\"formatVersion\":99}");
        ms.Position = 0;
        await Assert.ThrowsAsync<CampaignTransfer.ImportException>(() => Transfer(db).ImportAsync(ms, Gm, "GM", new DefaultHttpContext().Request));
    }
}
