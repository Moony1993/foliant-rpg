using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261104120000_MulticlassAbilities")]
    public partial class MulticlassAbilities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Characters') AND name = 'AbilitiesJson')
                    ALTER TABLE [Characters] ADD [AbilitiesJson] nvarchar(max) NOT NULL DEFAULT N'{}';
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Characters') AND name = 'ClassesJson')
                    ALTER TABLE [Characters] ADD [ClassesJson] nvarchar(max) NOT NULL DEFAULT N'[]';
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'Spells') AND name = 'ClassId')
                    ALTER TABLE [Spells] ADD [ClassId] nvarchar(max) NOT NULL DEFAULT N'';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "AbilitiesJson", table: "Characters");
            migrationBuilder.DropColumn(name: "ClassesJson", table: "Characters");
            migrationBuilder.DropColumn(name: "ClassId", table: "Spells");
        }
    }
}
