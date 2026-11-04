using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261102233000_Attunement")]
    public partial class Attunement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'ItemTemplates') AND name = 'RequiresAttunement')
                    ALTER TABLE [ItemTemplates] ADD [RequiresAttunement] bit NOT NULL DEFAULT 0;
                """);
            migrationBuilder.SqlDeferred("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'InventoryItems') AND name = 'Attuned')
                    ALTER TABLE [InventoryItems] ADD [Attuned] bit NOT NULL DEFAULT 0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "RequiresAttunement", table: "ItemTemplates");
            migrationBuilder.DropColumn(name: "Attuned", table: "InventoryItems");
        }
    }
}
