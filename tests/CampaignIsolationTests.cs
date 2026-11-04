using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Services;
using Xunit;

namespace Foliant.Tests;

/// <summary>Campaign isolation lives in the DbContext (global query filters + stamping on save),
/// so these tests guard it for every controller at once.</summary>
public class CampaignIsolationTests : IDisposable
{
    private readonly SqliteConnection _conn = new("DataSource=:memory:");
    private const string UserId = "u1";

    public CampaignIsolationTests()
    {
        _conn.Open();
        using var db = Db(null);
        db.Database.EnsureCreated();
        db.Users.Add(new AppUser { Id = UserId, UserName = "u1", DisplayName = "U1" });
        db.Campaigns.AddRange(new Campaign { Id = 1, Name = "A" }, new Campaign { Id = 2, Name = "B" });
        db.SaveChanges();
    }

    public void Dispose() => _conn.Dispose();

    private AppDbContext Db(int? campaignId, string ruleSystem = "pf1e")
    {
        var ctx = new CampaignContext();
        if (campaignId is int id) ctx.Set(id, CampaignRoles.Gm, ruleSystem);
        return new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options, ctx);
    }

    [Fact]
    public void Campaign_data_is_invisible_to_other_campaigns()
    {
        using (var a = Db(1))
        {
            a.Characters.Add(new Character { UserId = UserId, Name = "Held A" });
            a.ChatMessages.Add(new ChatMessage { UserId = UserId, Text = "nur A" });
            a.SaveChanges();
        }
        using var b = Db(2);
        Assert.Empty(b.Characters);
        Assert.Empty(b.ChatMessages);
        using var a2 = Db(1);
        Assert.Equal("Held A", Assert.Single(a2.Characters).Name);
    }

    [Fact]
    public void New_rows_land_in_the_current_campaign()
    {
        using var a = Db(2);
        var m = new Monster { Name = "Drache" };
        a.Monsters.Add(m);
        a.SaveChanges();
        Assert.Equal(2, m.CampaignId);
    }

    [Fact]
    public void Owned_rows_without_campaign_are_refused()
    {
        using var none = Db(null);
        none.Monsters.Add(new Monster { Name = "Waise" });
        Assert.Throws<InvalidOperationException>(() => none.SaveChanges());
    }

    [Fact]
    public void Official_library_is_shared_homebrew_stays_in_its_campaign()
    {
        using (var a = Db(1))
        {
            a.ItemTemplates.Add(new ItemTemplate { Name = "Offiziell" });                        // no creator = shipped
            a.ItemTemplates.Add(new ItemTemplate { Name = "Homebrew A", CreatedByUserId = UserId });
            a.SaveChanges();
        }
        using var b = Db(2);
        Assert.Equal(new[] { "Offiziell" }, b.ItemTemplates.Select(t => t.Name).ToArray());
        using var a2 = Db(1);
        Assert.Equal(2, a2.ItemTemplates.Count());
        Assert.Null(a2.ItemTemplates.Single(t => t.Name == "Offiziell").CampaignId);
    }

    [Fact]
    public void Without_a_campaign_nothing_campaign_bound_is_visible()
    {
        using (var a = Db(1))
        {
            a.Notes.Add(new Note { UserId = UserId, Title = "geheim" });
            a.SaveChanges();
        }
        using var none = Db(null);
        Assert.Empty(none.Notes);
    }

    [Fact]
    public void Shipped_library_is_only_visible_in_campaigns_of_its_rule_system()
    {
        using (var seed = Db(null))
        {
            seed.CompendiumSpells.Add(new CompendiumSpell { Name = "PF1-Feuerball", RuleSystemId = "pf1e" });
            seed.CompendiumSpells.Add(new CompendiumSpell { Name = "5e-Fireball", RuleSystemId = "srd.5e-2014" });
            seed.SaveChanges();
        }
        using var pf = Db(1, "pf1e");
        Assert.Equal(new[] { "PF1-Feuerball" }, pf.CompendiumSpells.Select(s => s.Name).ToArray());
        using var dnd = Db(2, "srd.5e-2014");
        Assert.Equal(new[] { "5e-Fireball" }, dnd.CompendiumSpells.Select(s => s.Name).ToArray());
        // Homebrew of a 5e campaign is stamped with its system.
        var brew = new CompendiumSpell { Name = "Eigener Zauber", CreatedByUserId = UserId };
        dnd.CompendiumSpells.Add(brew);
        dnd.SaveChanges();
        Assert.Equal("srd.5e-2014", brew.RuleSystemId);
        Assert.Equal(2, brew.CampaignId);
    }
}
