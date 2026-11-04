using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261030180000_ActiveAbilities")]
    public partial class ActiveAbilities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Characters') AND name = 'ActiveAbilitiesJson')
                    ALTER TABLE [Characters] ADD [ActiveAbilitiesJson] nvarchar(max) NOT NULL DEFAULT N'[]';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ActiveAbilitiesJson", table: "Characters");
        }
    }
}
