using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261102210000_Campaigns")]
    public partial class Campaigns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded, idempotent SQL (prod is SqlServer; matches this repo's migration pattern).
            // Each Sql() call runs as its own batch, so later steps can see columns added by earlier ones.
            migrationBuilder.SqlDeferred("""
                IF OBJECT_ID(N'Campaigns') IS NULL
                CREATE TABLE [Campaigns] (
                    [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_Campaigns] PRIMARY KEY,
                    [Name] nvarchar(max) NOT NULL DEFAULT N'',
                    [Description] nvarchar(max) NOT NULL DEFAULT N'',
                    [RuleSystemId] nvarchar(max) NOT NULL DEFAULT N'pf1e',
                    [ImageUrl] nvarchar(max) NULL,
                    [CreatedByUserId] nvarchar(max) NOT NULL DEFAULT N'',
                    [CreatedAt] datetime2 NOT NULL DEFAULT GETUTCDATE(),
                    [SettingsJson] nvarchar(max) NOT NULL DEFAULT N'{}'
                );
                """);
            migrationBuilder.SqlDeferred("""
                IF OBJECT_ID(N'CampaignMembers') IS NULL
                CREATE TABLE [CampaignMembers] (
                    [CampaignId] int NOT NULL CONSTRAINT [FK_CampaignMembers_Campaigns_CampaignId]
                        FOREIGN KEY REFERENCES [Campaigns]([Id]) ON DELETE CASCADE,
                    [UserId] nvarchar(450) NOT NULL CONSTRAINT [FK_CampaignMembers_AspNetUsers_UserId]
                        FOREIGN KEY REFERENCES [AspNetUsers]([Id]) ON DELETE CASCADE,
                    [Role] nvarchar(max) NOT NULL DEFAULT N'Player',
                    [JoinedAt] datetime2 NOT NULL DEFAULT GETUTCDATE(),
                    CONSTRAINT [PK_CampaignMembers] PRIMARY KEY ([CampaignId], [UserId])
                );
                """);
            migrationBuilder.SqlDeferred("""
                IF OBJECT_ID(N'CampaignInvites') IS NULL
                BEGIN
                    CREATE TABLE [CampaignInvites] (
                        [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_CampaignInvites] PRIMARY KEY,
                        [CampaignId] int NOT NULL CONSTRAINT [FK_CampaignInvites_Campaigns_CampaignId]
                            FOREIGN KEY REFERENCES [Campaigns]([Id]) ON DELETE CASCADE,
                        [Code] nvarchar(450) NOT NULL,
                        [CreatedByUserId] nvarchar(max) NOT NULL DEFAULT N'',
                        [CreatedAt] datetime2 NOT NULL DEFAULT GETUTCDATE(),
                        [ExpiresAt] datetime2 NULL,
                        [MaxUses] int NULL,
                        [Uses] int NOT NULL DEFAULT 0,
                        [Revoked] bit NOT NULL DEFAULT 0
                    );
                    CREATE UNIQUE INDEX [IX_CampaignInvites_Code] ON [CampaignInvites]([Code]);
                    CREATE INDEX [IX_CampaignInvites_CampaignId] ON [CampaignInvites]([CampaignId]);
                END
                """);

            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Characters') AND name = 'CampaignId')
                    ALTER TABLE [Characters] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Monsters') AND name = 'CampaignId')
                    ALTER TABLE [Monsters] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Messages') AND name = 'CampaignId')
                    ALTER TABLE [Messages] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Notes') AND name = 'CampaignId')
                    ALTER TABLE [Notes] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'BattleMaps') AND name = 'CampaignId')
                    ALTER TABLE [BattleMaps] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'MapAssets') AND name = 'CampaignId')
                    ALTER TABLE [MapAssets] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'SchedulePolls') AND name = 'CampaignId')
                    ALTER TABLE [SchedulePolls] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'ChatMessages') AND name = 'CampaignId')
                    ALTER TABLE [ChatMessages] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'CampaignId')
                    ALTER TABLE [ItemTemplates] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Feats') AND name = 'CampaignId')
                    ALTER TABLE [Feats] ADD [CampaignId] int NULL;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'CompendiumSpells') AND name = 'CampaignId')
                    ALTER TABLE [CompendiumSpells] ADD [CampaignId] int NULL;
                """);

            // Existing data moves into one campaign "Meine Kampagne" (PF1): all accounts become members. Its GM is
            // the account that leads the game: a GM who isn't admin (the admin only runs the instance), else the admin.
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM [Campaigns])
                BEGIN
                    DECLARE @gm nvarchar(450) = (
                        SELECT TOP 1 u.[Id] FROM [AspNetUsers] u
                        JOIN [AspNetUserRoles] ur ON ur.[UserId] = u.[Id]
                        JOIN [AspNetRoles] r ON r.[Id] = ur.[RoleId]
                        WHERE r.[Name] = N'GM'
                        ORDER BY CASE WHEN EXISTS (SELECT 1 FROM [AspNetUserRoles] ar JOIN [AspNetRoles] a ON a.[Id] = ar.[RoleId]
                                           WHERE ar.[UserId] = u.[Id] AND a.[Name] = N'Admin') THEN 1 ELSE 0 END, u.[UserName]);
                    IF @gm IS NOT NULL
                    BEGIN
                        INSERT INTO [Campaigns] ([Name], [Description], [RuleSystemId], [CreatedByUserId], [CreatedAt], [SettingsJson])
                        VALUES (N'Meine Kampagne', N'', N'pf1e', @gm, GETUTCDATE(), N'{}');
                        DECLARE @cid int = SCOPE_IDENTITY();
                        INSERT INTO [CampaignMembers] ([CampaignId], [UserId], [Role], [JoinedAt])
                        SELECT @cid, [Id], CASE WHEN [Id] = @gm THEN N'GM' ELSE N'Player' END, GETUTCDATE() FROM [AspNetUsers];
                    END
                END
                """);
            migrationBuilder.SqlDeferred("UPDATE [Characters] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL;");
            migrationBuilder.SqlDeferred("UPDATE [Monsters] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL;");
            migrationBuilder.SqlDeferred("UPDATE [Messages] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL;");
            migrationBuilder.SqlDeferred("UPDATE [Notes] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL;");
            migrationBuilder.SqlDeferred("UPDATE [BattleMaps] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL;");
            migrationBuilder.SqlDeferred("UPDATE [MapAssets] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL;");
            migrationBuilder.SqlDeferred("UPDATE [SchedulePolls] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL;");
            migrationBuilder.SqlDeferred("UPDATE [ChatMessages] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL;");
            // Library: homebrew moves into the campaign, official rows (no creator) stay shared.
            migrationBuilder.SqlDeferred("UPDATE [ItemTemplates] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL AND [CreatedByUserId] IS NOT NULL;");
            migrationBuilder.SqlDeferred("UPDATE [Feats] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL AND [CreatedByUserId] IS NOT NULL;");
            migrationBuilder.SqlDeferred("UPDATE [CompendiumSpells] SET [CampaignId] = (SELECT MIN([Id]) FROM [Campaigns]) WHERE [CampaignId] IS NULL AND [CreatedByUserId] IS NOT NULL;");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM [Characters] WHERE [CampaignId] IS NULL) ALTER TABLE [Characters] ALTER COLUMN [CampaignId] int NOT NULL;");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM [Monsters] WHERE [CampaignId] IS NULL) ALTER TABLE [Monsters] ALTER COLUMN [CampaignId] int NOT NULL;");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM [Messages] WHERE [CampaignId] IS NULL) ALTER TABLE [Messages] ALTER COLUMN [CampaignId] int NOT NULL;");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM [Notes] WHERE [CampaignId] IS NULL) ALTER TABLE [Notes] ALTER COLUMN [CampaignId] int NOT NULL;");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM [BattleMaps] WHERE [CampaignId] IS NULL) ALTER TABLE [BattleMaps] ALTER COLUMN [CampaignId] int NOT NULL;");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM [MapAssets] WHERE [CampaignId] IS NULL) ALTER TABLE [MapAssets] ALTER COLUMN [CampaignId] int NOT NULL;");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM [SchedulePolls] WHERE [CampaignId] IS NULL) ALTER TABLE [SchedulePolls] ALTER COLUMN [CampaignId] int NOT NULL;");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM [ChatMessages] WHERE [CampaignId] IS NULL) ALTER TABLE [ChatMessages] ALTER COLUMN [CampaignId] int NOT NULL;");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Characters_CampaignId') CREATE INDEX [IX_Characters_CampaignId] ON [Characters]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Monsters_CampaignId') CREATE INDEX [IX_Monsters_CampaignId] ON [Monsters]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Messages_CampaignId') CREATE INDEX [IX_Messages_CampaignId] ON [Messages]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notes_CampaignId') CREATE INDEX [IX_Notes_CampaignId] ON [Notes]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BattleMaps_CampaignId') CREATE INDEX [IX_BattleMaps_CampaignId] ON [BattleMaps]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MapAssets_CampaignId') CREATE INDEX [IX_MapAssets_CampaignId] ON [MapAssets]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SchedulePolls_CampaignId') CREATE INDEX [IX_SchedulePolls_CampaignId] ON [SchedulePolls]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChatMessages_CampaignId') CREATE INDEX [IX_ChatMessages_CampaignId] ON [ChatMessages]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ItemTemplates_CampaignId') CREATE INDEX [IX_ItemTemplates_CampaignId] ON [ItemTemplates]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Feats_CampaignId') CREATE INDEX [IX_Feats_CampaignId] ON [Feats]([CampaignId]);");
            migrationBuilder.SqlDeferred("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CompendiumSpells_CampaignId') CREATE INDEX [IX_CompendiumSpells_CampaignId] ON [CompendiumSpells]([CampaignId]);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Characters_CampaignId') DROP INDEX [IX_Characters_CampaignId] ON [Characters];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "Characters");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Monsters_CampaignId') DROP INDEX [IX_Monsters_CampaignId] ON [Monsters];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "Monsters");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Messages_CampaignId') DROP INDEX [IX_Messages_CampaignId] ON [Messages];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "Messages");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notes_CampaignId') DROP INDEX [IX_Notes_CampaignId] ON [Notes];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "Notes");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BattleMaps_CampaignId') DROP INDEX [IX_BattleMaps_CampaignId] ON [BattleMaps];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "BattleMaps");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MapAssets_CampaignId') DROP INDEX [IX_MapAssets_CampaignId] ON [MapAssets];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "MapAssets");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SchedulePolls_CampaignId') DROP INDEX [IX_SchedulePolls_CampaignId] ON [SchedulePolls];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "SchedulePolls");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChatMessages_CampaignId') DROP INDEX [IX_ChatMessages_CampaignId] ON [ChatMessages];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "ChatMessages");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ItemTemplates_CampaignId') DROP INDEX [IX_ItemTemplates_CampaignId] ON [ItemTemplates];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "ItemTemplates");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Feats_CampaignId') DROP INDEX [IX_Feats_CampaignId] ON [Feats];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "Feats");
            migrationBuilder.SqlDeferred("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CompendiumSpells_CampaignId') DROP INDEX [IX_CompendiumSpells_CampaignId] ON [CompendiumSpells];");
            migrationBuilder.DropColumn(name: "CampaignId", table: "CompendiumSpells");
            migrationBuilder.DropTable(name: "CampaignInvites");
            migrationBuilder.DropTable(name: "CampaignMembers");
            migrationBuilder.DropTable(name: "Campaigns");
        }
    }
}
