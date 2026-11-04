using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Domain;
using Foliant.Api.Services;

namespace Foliant.Api.Data;

public class AppDbContext : IdentityDbContext<AppUser>
{
    private readonly CampaignContext? _campaign;

    public AppDbContext(DbContextOptions<AppDbContext> options, CampaignContext? campaign = null) : base(options)
        => _campaign = campaign;

    /// <summary>Campaign of the current request; null outside a request (seeder, background jobs)
    /// or for a user without campaign — then campaign data is simply invisible.</summary>
    public int? CurrentCampaignId => _campaign?.CampaignId;
    /// <summary>Rule system of the current campaign ("pf1e" outside a request).</summary>
    public string CurrentRuleSystemId => _campaign?.RuleSystemId ?? "pf1e";

    public DbSet<Campaign> Campaigns => Set<Campaign>();
    public DbSet<CampaignMember> CampaignMembers => Set<CampaignMember>();
    public DbSet<CampaignInvite> CampaignInvites => Set<CampaignInvite>();
    public DbSet<RulePackageRecord> RulePackages => Set<RulePackageRecord>();

    public DbSet<Character> Characters => Set<Character>();
    public DbSet<ItemTemplate> ItemTemplates => Set<ItemTemplate>();
    public DbSet<InventoryItem> InventoryItems => Set<InventoryItem>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Skill> Skills => Set<Skill>();
    public DbSet<Spell> Spells => Set<Spell>();
    public DbSet<StatusEffect> StatusEffects => Set<StatusEffect>();
    public DbSet<CharacterSkill> CharacterSkills => Set<CharacterSkill>();
    public DbSet<CompendiumSpell> CompendiumSpells => Set<CompendiumSpell>();
    public DbSet<Companion> Companions => Set<Companion>();
    public DbSet<Note> Notes => Set<Note>();
    public DbSet<FeatTemplate> Feats => Set<FeatTemplate>();
    public DbSet<Monster> Monsters => Set<Monster>();
    public DbSet<BattleMap> BattleMaps => Set<BattleMap>();
    public DbSet<MapAsset> MapAssets => Set<MapAsset>();
    public DbSet<SchedulePoll> SchedulePolls => Set<SchedulePoll>();
    public DbSet<PollOption> PollOptions => Set<PollOption>();
    public DbSet<PollVote> PollVotes => Set<PollVote>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<PushDevice> PushDevices => Set<PushDevice>();

    /// <summary>All DateTimes are stored as UTC. SQLite/SQL Server hand them back as Unspecified — stamp
    /// them UTC on read so the JSON carries a "Z" and browsers don't shift them into local time.</summary>
    protected override void ConfigureConventions(ModelConfigurationBuilder c)
    {
        c.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        c.Properties<DateTime?>().HaveConversion<UtcDateTimeConverter>();
    }

    private class UtcDateTimeConverter : Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTime, DateTime>
    {
        public UtcDateTimeConverter() : base(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc)) { }
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<CampaignMember>().HasKey(m => new { m.CampaignId, m.UserId });
        b.Entity<CampaignMember>().HasOne<Campaign>().WithMany(c => c.Members).HasForeignKey(m => m.CampaignId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<CampaignMember>().HasOne(m => m.User).WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<CampaignInvite>().HasIndex(i => i.Code).IsUnique();
        b.Entity<RulePackageRecord>().HasIndex(p => p.PackageId).IsUnique();
        b.Entity<CampaignInvite>().HasOne<Campaign>().WithMany().HasForeignKey(i => i.CampaignId).OnDelete(DeleteBehavior.Cascade);

        // Campaign isolation: every query only sees the current campaign's rows (library data also
        // sees the shipped rows, CampaignId == null). Code that must cross campaigns (seeder,
        // background jobs) uses IgnoreQueryFilters() explicitly.
        b.Entity<Character>().HasQueryFilter(e => e.CampaignId == CurrentCampaignId);
        b.Entity<Monster>().HasQueryFilter(e => e.CampaignId == CurrentCampaignId);
        b.Entity<Message>().HasQueryFilter(e => e.CampaignId == CurrentCampaignId);
        b.Entity<Note>().HasQueryFilter(e => e.CampaignId == CurrentCampaignId);
        b.Entity<BattleMap>().HasQueryFilter(e => e.CampaignId == CurrentCampaignId);
        b.Entity<MapAsset>().HasQueryFilter(e => e.CampaignId == CurrentCampaignId);
        b.Entity<SchedulePoll>().HasQueryFilter(e => e.CampaignId == CurrentCampaignId);
        b.Entity<ChatMessage>().HasQueryFilter(e => e.CampaignId == CurrentCampaignId);
        // Shipped library rows belong to a rule system: a 5e campaign must not see PF1 spells.
        b.Entity<ItemTemplate>().HasQueryFilter(e => e.CampaignId == null ? e.RuleSystemId == CurrentRuleSystemId : e.CampaignId == CurrentCampaignId);
        b.Entity<FeatTemplate>().HasQueryFilter(e => e.CampaignId == null ? e.RuleSystemId == CurrentRuleSystemId : e.CampaignId == CurrentCampaignId);
        b.Entity<CompendiumSpell>().HasQueryFilter(e => e.CampaignId == null ? e.RuleSystemId == CurrentRuleSystemId : e.CampaignId == CurrentCampaignId);
        foreach (var t in new[] { typeof(Character), typeof(Monster), typeof(Message), typeof(Note), typeof(BattleMap),
                     typeof(MapAsset), typeof(SchedulePoll), typeof(ChatMessage), typeof(ItemTemplate), typeof(FeatTemplate), typeof(CompendiumSpell) })
            b.Entity(t).HasIndex(nameof(ICampaignOwned.CampaignId));

        b.Entity<Character>()
            .HasOne(c => c.User).WithMany(u => u.Characters)
            .HasForeignKey(c => c.UserId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<InventoryItem>()
            .HasOne(i => i.Character).WithMany(c => c.Items)
            .HasForeignKey(i => i.CharacterId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<InventoryItem>()
            .HasOne(i => i.Template).WithMany()
            .HasForeignKey(i => i.ItemTemplateId).OnDelete(DeleteBehavior.Restrict);

        b.Entity<SchedulePoll>().HasMany(p => p.Options).WithOne().HasForeignKey(o => o.PollId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<PollOption>().HasMany(o => o.Votes).WithOne().HasForeignKey(v => v.OptionId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<PollVote>().HasIndex(v => new { v.OptionId, v.UserId }).IsUnique();
        b.Entity<ChatMessage>().HasIndex(m => m.CreatedAt);

        b.Entity<Note>()
            .HasOne(n => n.User).WithMany()
            .HasForeignKey(n => n.UserId).OnDelete(DeleteBehavior.Cascade);

        foreach (var fk in new[]
        {
            b.Entity<Skill>().HasOne(s => s.Character).WithMany().HasForeignKey(s => s.CharacterId).Metadata,
            b.Entity<Spell>().HasOne(s => s.Character).WithMany().HasForeignKey(s => s.CharacterId).Metadata,
            b.Entity<StatusEffect>().HasOne(s => s.Character).WithMany().HasForeignKey(s => s.CharacterId).Metadata,
            b.Entity<CharacterSkill>().HasOne(s => s.Character).WithMany(c => c.SkillRanks).HasForeignKey(s => s.CharacterId).Metadata,
            b.Entity<Companion>().HasOne(s => s.Character).WithMany().HasForeignKey(s => s.CharacterId).Metadata,
        })
            fk.DeleteBehavior = DeleteBehavior.Cascade;
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampCampaign();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken ct = default)
    {
        StampCampaign();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);
    }

    /// <summary>New rows land in the current campaign automatically. Owned data without a campaign
    /// is refused, so nothing can end up orphaned or in the wrong campaign by accident.</summary>
    private void StampCampaign()
    {
        foreach (var e in ChangeTracker.Entries().Where(e => e.State == EntityState.Added))
        {
            switch (e.Entity)
            {
                case ICampaignOwned o when o.CampaignId == 0:
                    o.CampaignId = CurrentCampaignId
                        ?? throw new InvalidOperationException($"{e.Entity.GetType().Name} needs a campaign, but the request has none.");
                    break;
                // Homebrew (has a creator) belongs to the current campaign; official rows (admin import, seed) stay shipped.
                case ICampaignLibrary l when l.CampaignId == null && l.CreatedByUserId != null && CurrentCampaignId != null:
                    l.CampaignId = CurrentCampaignId;
                    l.RuleSystemId = CurrentRuleSystemId;
                    break;
            }
        }
    }
}
