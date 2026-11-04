using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261029090000_FavoredClassBonus")]
    public partial class FavoredClassBonus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            // Existing characters start with no favored class bonus assigned.
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'Characters') AND name = 'FavoredClassHp')
                    ALTER TABLE [Characters] ADD [FavoredClassHp] int NOT NULL DEFAULT 0;
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'Characters') AND name = 'FavoredClassSkill')
                    ALTER TABLE [Characters] ADD [FavoredClassSkill] int NOT NULL DEFAULT 0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "FavoredClassHp", table: "Characters");
            migrationBuilder.DropColumn(name: "FavoredClassSkill", table: "Characters");
        }
    }
}
