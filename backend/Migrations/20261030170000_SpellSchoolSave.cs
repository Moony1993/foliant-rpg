using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261030170000_SpellSchoolSave")]
    public partial class SpellSchoolSave : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Spells') AND name = 'School')
                    ALTER TABLE [Spells] ADD [School] nvarchar(max) NOT NULL DEFAULT N'';
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Spells') AND name = 'SavingThrow')
                    ALTER TABLE [Spells] ADD [SavingThrow] nvarchar(max) NOT NULL DEFAULT N'';
                """);
            // Spells copied from the compendium earlier: take school and save from the compendium by name.
            migrationBuilder.Sql("""
                EXEC(N'
                UPDATE s SET [School] = cs.[School], [SavingThrow] = cs.[SavingThrow]
                FROM [Spells] s JOIN [CompendiumSpells] cs ON cs.[Name] = s.[Name]
                WHERE s.[School] = N'''';
                ');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "School", table: "Spells");
            migrationBuilder.DropColumn(name: "SavingThrow", table: "Spells");
        }
    }
}
