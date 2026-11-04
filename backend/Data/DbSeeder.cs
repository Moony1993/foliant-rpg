using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Foliant.Api.Domain;

namespace Foliant.Api.Data;

public static class DbSeeder
{
    public static readonly string[] Roles = { "Player", "GM", "Admin" };

    public static async Task SeedAsync(IServiceProvider sp)
    {
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var cfg = scope.ServiceProvider.GetRequiredService<IConfiguration>();

        // SQL Server (production): migrations are applied by the CI/CD pipeline
        // BEFORE the app is deployed — nothing to do here at startup.
        // SQLite (development): EnsureCreated creates the full schema from the
        // current model in one shot, avoiding the cross-provider migration issues.
        if (!db.Database.IsSqlServer())
        {
            await db.Database.EnsureCreatedAsync();
            await SyncSqliteSchemaAsync(db);
            // Rows from before library data had a rule system were all PF1 (the schema sync adds the column empty).
            await db.ItemTemplates.IgnoreQueryFilters().Where(e => e.RuleSystemId == "").ExecuteUpdateAsync(u => u.SetProperty(e => e.RuleSystemId, "pf1e"));
            await db.Feats.IgnoreQueryFilters().Where(e => e.RuleSystemId == "").ExecuteUpdateAsync(u => u.SetProperty(e => e.RuleSystemId, "pf1e"));
            await db.CompendiumSpells.IgnoreQueryFilters().Where(e => e.RuleSystemId == "").ExecuteUpdateAsync(u => u.SetProperty(e => e.RuleSystemId, "pf1e"));
        }

        foreach (var r in Roles)
            if (!await roles.RoleExistsAsync(r))
                await roles.CreateAsync(new IdentityRole(r));

        // Seed admin (also GM) from config, so the very first login works out of the box.
        var adminName = cfg["Seed:AdminUser"] ?? "admin";
        if (await users.FindByNameAsync(adminName) == null)
        {
            var admin = new AppUser { UserName = adminName, DisplayName = "Game Master", MustChangePassword = true };
            // No default password: without Seed:AdminPassword a random one is generated and logged once
            // (it must be changed at the first login anyway).
            var password = cfg["Seed:AdminPassword"];
            if (string.IsNullOrEmpty(password))
            {
                // Fixed tail: Identity's default rules want a digit, an upper- and a lowercase letter.
                password = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(12)) + "Aa1";
                scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Setup")
                    .LogWarning("Created admin user '{User}' with the one-time password: {Password}", adminName, password);
            }
            var created = await users.CreateAsync(admin, password);
            if (!created.Succeeded)
                throw new InvalidOperationException("Could not create the admin user: " + string.Join(" ", created.Errors.Select(e => e.Description)));
            await users.AddToRolesAsync(admin, new[] { "Admin", "GM" });
        }

        if (!await db.ItemTemplates.AnyAsync())
        {
            db.ItemTemplates.AddRange(SeedItems());
            await db.SaveChangesAsync();
        }

        await EnsureDefaultCampaignAsync(db, users);
        await InstallPf1ForOldDataAsync(db, scope.ServiceProvider);
        await LoadRulePackagesAsync(db, scope.ServiceProvider);
    }

    /// <summary>Campaigns from before rule packages run on PF1: if one uses "pf1e", the PF1 package shipped with the
    /// app (private builds only, see BundledPackages) is installed, and updated when the shipped version is newer —
    /// like an admin upload, libraries included. A fresh install gets no rule system.</summary>
    private static async Task InstallPf1ForOldDataAsync(AppDbContext db, IServiceProvider sp)
    {
        if (!Domain.Rules.Engine.BundledPackages.Has("pf1e") || !await db.Campaigns.AnyAsync(c => c.RuleSystemId == "pf1e")) return;
        var row = await db.RulePackages.FirstOrDefaultAsync(r => r.PackageId == "pf1e");
        var bytes = Domain.Rules.Engine.BundledPackages.Bytes("pf1e");
        var check = Domain.Rules.Engine.RulePackageLoader.Check(bytes);
        if (check.Package is not { } pkg)
        {
            sp.GetRequiredService<ILoggerFactory>().CreateLogger("RulePackages")
                .LogError("Bundled PF1 package cannot be installed: {Errors}", string.Join(" | ", check.Errors));
            return;
        }
        var m = pkg.Manifest;
        if (row != null && Version.Parse(row.Version) >= Version.Parse(m.Version)) return;
        if (row == null) db.RulePackages.Add(row = new RulePackageRecord { PackageId = m.Id });
        row.Name = m.Name; row.Version = m.Version; row.License = m.License; row.Sha256 = pkg.Sha256; row.Data = bytes; row.InstalledAt = DateTime.UtcNow;
        await RulePackageLibrary.SyncAsync(db, m.Id, pkg.Spells, pkg.Feats);
        await db.SaveChangesAsync();
    }

    /// <summary>Registers every installed rule package. A package that no longer passes its checks
    /// (e.g. after an engine update) is skipped with a log entry instead of stopping the app.</summary>
    private static async Task LoadRulePackagesAsync(AppDbContext db, IServiceProvider sp)
    {
        var registry = sp.GetRequiredService<Domain.Rules.RuleSystemRegistry>();
        var log = sp.GetRequiredService<ILoggerFactory>().CreateLogger("RulePackages");
        foreach (var row in await db.RulePackages.AsNoTracking().ToListAsync())
        {
            var check = Domain.Rules.Engine.RulePackageLoader.Check(row.Data);
            if (check.Package == null)
                log.LogWarning("Rule package {Id} {Version} not loaded: {Errors}", row.PackageId, row.Version, string.Join(" | ", check.Errors));
            else
                registry.Register(new Domain.Rules.Engine.DeclarativeRuleSystem(check.Package));
        }
    }

    /// <summary>
    /// Data from before campaigns existed gets one campaign "Meine Kampagne" (PF1): every account becomes a member,
    /// the game-leading GM (not the admin, if possible) its GM, and rows without a campaign move into it. Idempotent. A fresh install gets no
    /// campaign (the GM creates one once the admin has installed a rule system). On SQL Server the migration has
    /// already done this; here it covers SQLite.
    /// </summary>
    private static async Task EnsureDefaultCampaignAsync(AppDbContext db, UserManager<AppUser> users)
    {
        bool oldData = await db.Characters.IgnoreQueryFilters().AnyAsync(e => e.CampaignId == 0)
            || await db.Messages.IgnoreQueryFilters().AnyAsync(e => e.CampaignId == 0)
            || await db.Notes.IgnoreQueryFilters().AnyAsync(e => e.CampaignId == 0)
            || await db.ChatMessages.IgnoreQueryFilters().AnyAsync(e => e.CampaignId == 0);
        if (!await db.Campaigns.AnyAsync())
        {
            if (!oldData) return;   // fresh install
            var all = await users.Users.OrderBy(u => u.UserName).ToListAsync();
            var gms = (await users.GetUsersInRoleAsync("GM")).Select(u => u.Id).ToHashSet();
            // Exactly one GM: the account that leads the game — a GM who isn't admin, else the admin (as the SQL Server migration).
            var admins = (await users.GetUsersInRoleAsync("Admin")).Select(u => u.Id).ToHashSet();
            var gm = all.Where(u => gms.Contains(u.Id)).OrderBy(u => admins.Contains(u.Id)).FirstOrDefault();
            if (gm == null) return;  // no GM yet: nothing to own a campaign
            var campaign = new Campaign { Name = "Meine Kampagne", RuleSystemId = "pf1e", CreatedByUserId = gm.Id };
            campaign.Members.AddRange(all.Select(u => new CampaignMember
            {
                UserId = u.Id, Role = u.Id == gm.Id ? CampaignRoles.Gm : CampaignRoles.Player,
            }));
            db.Campaigns.Add(campaign);
            await db.SaveChangesAsync();
        }

        var id = await db.Campaigns.OrderBy(c => c.Id).Select(c => c.Id).FirstAsync();
        await db.Characters.IgnoreQueryFilters().Where(e => e.CampaignId == 0).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        await db.Monsters.IgnoreQueryFilters().Where(e => e.CampaignId == 0).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        await db.Messages.IgnoreQueryFilters().Where(e => e.CampaignId == 0).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        await db.Notes.IgnoreQueryFilters().Where(e => e.CampaignId == 0).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        await db.BattleMaps.IgnoreQueryFilters().Where(e => e.CampaignId == 0).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        await db.MapAssets.IgnoreQueryFilters().Where(e => e.CampaignId == 0).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        await db.SchedulePolls.IgnoreQueryFilters().Where(e => e.CampaignId == 0).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        await db.ChatMessages.IgnoreQueryFilters().Where(e => e.CampaignId == 0).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        // Homebrew (has a creator) belongs to the campaign; official rows stay shared (null).
        await db.ItemTemplates.IgnoreQueryFilters().Where(e => e.CampaignId == null && e.CreatedByUserId != null).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        await db.Feats.IgnoreQueryFilters().Where(e => e.CampaignId == null && e.CreatedByUserId != null).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
        await db.CompendiumSpells.IgnoreQueryFilters().Where(e => e.CampaignId == null && e.CreatedByUserId != null).ExecuteUpdateAsync(u => u.SetProperty(e => e.CampaignId, id));
    }

    private static IEnumerable<ItemTemplate> SeedItems() => new[]
    {
        new ItemTemplate { Name = "Rusty Sword", Description = "A worn but serviceable blade.", IconKey = "sword",
            Weight = 3, Value = 10, Rarity = Rarity.Common, Category = ItemCategory.Weapon, Slot = EquipSlot.MainHand, EffectsJson = "{\"Str\":1}" },
        new ItemTemplate { Name = "Leather Cap", Description = "Basic head protection.", IconKey = "helm",
            Weight = 1, Value = 5, Rarity = Rarity.Common, Category = ItemCategory.Armor, Slot = EquipSlot.Head, EffectsJson = "{\"MaxHp\":2}" },
        new ItemTemplate { Name = "Health Potion", Description = "Restores vitality.", IconKey = "potion",
            Weight = 0.5, Value = 25, Rarity = Rarity.Uncommon, Category = ItemCategory.Consumable, EffectsJson = "{}",
            IsUsable = true, UseEffectsJson = "{\"CurrentHp\":20}" },
        new ItemTemplate { Name = "Ring of the Fox", Description = "Sharpens the senses.", IconKey = "ring",
            Weight = 0, Value = 400, Rarity = Rarity.Rare, Category = ItemCategory.Magic, Slot = EquipSlot.Ring, EffectsJson = "{\"Dex\":2,\"Initiative\":1}" },
        new ItemTemplate { Name = "Dragonscale Cloak", Description = "Woven from ancient scales.", IconKey = "cloak",
            Weight = 2, Value = 2000, Rarity = Rarity.Epic, Category = ItemCategory.Armor, Slot = EquipSlot.Cloak, EffectsJson = "{\"MaxHp\":10,\"Ref\":2}" },
        new ItemTemplate { Name = "Blade of the Fallen King", Description = "A legendary weapon of untold power.", IconKey = "sword",
            Weight = 4, Value = 10000, Rarity = Rarity.Legendary, Category = ItemCategory.Weapon, Slot = EquipSlot.MainHand, EffectsJson = "{\"Str\":4,\"MaxHp\":20}" },
    };

    /// <summary>
    /// SQLite dev only: EnsureCreated never touches an existing DB, so add the tables, indexes and
    /// columns the model gained since the DB was created. Never drops or changes anything.
    /// </summary>
    // ponytail: additive only — renamed/retyped columns still need a fresh foliant.db.
    private static async Task SyncSqliteSchemaAsync(AppDbContext db)
    {
        // Order matters: tables, then missing columns, then indexes (an index may need a new column).
        var script = db.Database.GenerateCreateScript().Split(';').Select(x => x.Trim()).ToList();
        async Task Run(params string[] keywords)
        {
            foreach (var sql in script)
                foreach (var kw in keywords)
                    if (sql.StartsWith(kw))
                    {
                        await db.Database.ExecuteSqlRawAsync(kw + "IF NOT EXISTS " + sql[kw.Length..]);
                        break;
                    }
        }
        await Run("CREATE TABLE ");

        var conn = db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
        foreach (var et in db.Model.GetEntityTypes())
        {
            if (et.GetTableName() is not { } table) continue;
            var store = StoreObjectIdentifier.Table(table, et.GetSchema());
            var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = $"PRAGMA table_info(\"{table}\")";
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync()) existing.Add(r.GetString(1));
            }
            foreach (var p in et.GetProperties())
            {
                if (p.GetColumnName(store) is not { } col || !existing.Add(col)) continue;
                var type = p.GetColumnType();
                var tail = p.IsColumnNullable(store) ? "NULL"
                    : $"NOT NULL DEFAULT {(type is "INTEGER" or "REAL" ? "0" : "''")}";
                await db.Database.ExecuteSqlRawAsync($"ALTER TABLE \"{table}\" ADD COLUMN \"{col}\" {type} {tail}");
            }
        }
        await Run("CREATE UNIQUE INDEX ", "CREATE INDEX ");
    }
}
