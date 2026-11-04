using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddItemUseEffects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod-safe, matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'IsUsable')
                    ALTER TABLE [ItemTemplates] ADD [IsUsable] bit NOT NULL DEFAULT CAST(0 AS bit);
                """);
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'UseEffectsJson')
                    ALTER TABLE [ItemTemplates] ADD [UseEffectsJson] nvarchar(max) NOT NULL DEFAULT N'{}';
                """);
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'UseStatusEffectName')
                    ALTER TABLE [ItemTemplates] ADD [UseStatusEffectName] nvarchar(max) NULL;
                """);
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'UseStatusEffectDescription')
                    ALTER TABLE [ItemTemplates] ADD [UseStatusEffectDescription] nvarchar(max) NOT NULL DEFAULT N'';
                """);
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'UseStatusEffectIcon')
                    ALTER TABLE [ItemTemplates] ADD [UseStatusEffectIcon] nvarchar(max) NOT NULL DEFAULT N'✨';
                """);
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'UseStatusEffectKind')
                    ALTER TABLE [ItemTemplates] ADD [UseStatusEffectKind] nvarchar(max) NOT NULL DEFAULT N'buff';
                """);
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'UseStatusEffectDurationMinutes')
                    ALTER TABLE [ItemTemplates] ADD [UseStatusEffectDurationMinutes] int NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "IsUsable", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "UseEffectsJson", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "UseStatusEffectName", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "UseStatusEffectDescription", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "UseStatusEffectIcon", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "UseStatusEffectKind", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "UseStatusEffectDurationMinutes", table: "ItemTemplates");
        }
    }
}
