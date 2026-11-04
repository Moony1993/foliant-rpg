using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddLevelUpNotesAndItemCombat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Each statement guards itself with an existence check so the migration
            // is safe to run even if a previous attempt partially committed before
            // rolling back (SQL Server DDL is transactional but the idempotent
            // wrapper does not add an explicit outer transaction by default).

            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'CritMultiplier')
                    ALTER TABLE [ItemTemplates] ADD [CritMultiplier] int NOT NULL DEFAULT 2;

                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'CritRange')
                    ALTER TABLE [ItemTemplates] ADD [CritRange] int NOT NULL DEFAULT 20;

                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'DamageBonus')
                    ALTER TABLE [ItemTemplates] ADD [DamageBonus] int NOT NULL DEFAULT 0;

                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'DamageDice')
                    ALTER TABLE [ItemTemplates] ADD [DamageDice] nvarchar(max) NOT NULL DEFAULT N'';

                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'Characters') AND name = 'PendingLevelUp')
                    ALTER TABLE [Characters] ADD [PendingLevelUp] bit NOT NULL DEFAULT 0;
                ELSE IF EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'Characters') AND name = 'PendingLevelUp'
                               AND system_type_id = TYPE_ID(N'int'))
                BEGIN
                    -- Column was created as INTEGER by a previous failed migration run.
                    -- Its auto-named DEFAULT constraint must be dropped before the type
                    -- can change (ALTER COLUMN fails while a constraint references it),
                    -- then re-created so new rows keep defaulting to 0/false.
                    DECLARE @df sysname = (
                        SELECT dc.name FROM sys.default_constraints dc
                        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
                        WHERE dc.parent_object_id = OBJECT_ID(N'Characters') AND c.name = 'PendingLevelUp');
                    IF @df IS NOT NULL
                        EXEC('ALTER TABLE [Characters] DROP CONSTRAINT [' + @df + ']');
                    ALTER TABLE [Characters] ALTER COLUMN [PendingLevelUp] bit NOT NULL;
                    ALTER TABLE [Characters] ADD CONSTRAINT [DF_Characters_PendingLevelUp] DEFAULT 0 FOR [PendingLevelUp];
                END
                """);

            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.objects
                               WHERE object_id = OBJECT_ID(N'Notes') AND type = 'U')
                BEGIN
                    CREATE TABLE [Notes] (
                        [Id]        int            NOT NULL IDENTITY(1,1),
                        [UserId]    nvarchar(450)  NOT NULL,
                        [Title]     nvarchar(max)  NOT NULL,
                        [Content]   nvarchar(max)  NOT NULL,
                        [Color]     nvarchar(max)  NOT NULL,
                        [IsPinned]  bit            NOT NULL,
                        [CreatedAt] datetime2      NOT NULL,
                        [UpdatedAt] datetime2      NOT NULL,
                        CONSTRAINT [PK_Notes] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_Notes_AspNetUsers_UserId]
                            FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id])
                            ON DELETE CASCADE
                    );
                    CREATE INDEX [IX_Notes_UserId] ON [Notes] ([UserId]);
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "Notes");
            migrationBuilder.DropColumn(name: "CritMultiplier", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "CritRange", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "DamageBonus", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "DamageDice", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "PendingLevelUp", table: "Characters");
        }
    }
}
