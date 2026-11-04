using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261103000000_LibraryRuleSystem")]
    public partial class LibraryRuleSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern). Everything so far is PF1.
            foreach (var table in new[] { "ItemTemplates", "Feats", "CompendiumSpells" })
                migrationBuilder.SqlDeferred($"""
                    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'{table}') AND name = 'RuleSystemId')
                        ALTER TABLE [{table}] ADD [RuleSystemId] nvarchar(max) NOT NULL DEFAULT N'pf1e';
                    """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var table in new[] { "ItemTemplates", "Feats", "CompendiumSpells" })
                migrationBuilder.DropColumn(name: "RuleSystemId", table: table);
        }
    }
}
