using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261030150000_ItemWeaponArmorType")]
    public partial class ItemWeaponArmorType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'WeaponKey')
                    ALTER TABLE [ItemTemplates] ADD [WeaponKey] nvarchar(64) NULL;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'ArmorType')
                    ALTER TABLE [ItemTemplates] ADD [ArmorType] int NOT NULL DEFAULT 0;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'AttackBonus')
                    ALTER TABLE [ItemTemplates] ADD [AttackBonus] int NOT NULL DEFAULT 0;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'SpellFailure')
                    ALTER TABLE [ItemTemplates] ADD [SpellFailure] int NOT NULL DEFAULT 0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "WeaponKey", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "ArmorType", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "SpellFailure", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "AttackBonus", table: "ItemTemplates");
        }
    }
}
