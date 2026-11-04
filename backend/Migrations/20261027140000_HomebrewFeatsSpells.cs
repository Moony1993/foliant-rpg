using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class HomebrewFeatsSpells : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            foreach (var table in new[] { "Feats", "CompendiumSpells" })
                migrationBuilder.Sql($"""
                    IF NOT EXISTS (SELECT 1 FROM sys.columns
                                   WHERE object_id = OBJECT_ID(N'{table}') AND name = 'CreatedByUserId')
                        ALTER TABLE [{table}] ADD [CreatedByUserId] nvarchar(max) NULL;
                    IF NOT EXISTS (SELECT 1 FROM sys.columns
                                   WHERE object_id = OBJECT_ID(N'{table}') AND name = 'CreatedByName')
                        ALTER TABLE [{table}] ADD [CreatedByName] nvarchar(max) NOT NULL DEFAULT N'';
                    """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var table in new[] { "Feats", "CompendiumSpells" })
            {
                migrationBuilder.DropColumn(name: "CreatedByUserId", table: table);
                migrationBuilder.DropColumn(name: "CreatedByName", table: table);
            }
        }
    }
}
