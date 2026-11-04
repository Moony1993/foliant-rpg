using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWeaponBonusDamage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'BonusDamage')
                    ALTER TABLE [ItemTemplates] ADD [BonusDamage] nvarchar(max) NOT NULL DEFAULT N'';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "BonusDamage", table: "ItemTemplates");
        }
    }
}
