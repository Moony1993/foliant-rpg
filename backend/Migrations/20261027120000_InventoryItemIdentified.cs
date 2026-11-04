using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class InventoryItemIdentified : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            // Existing instances default to identified.
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'InventoryItems') AND name = 'IsIdentified')
                    ALTER TABLE [InventoryItems] ADD [IsIdentified] bit NOT NULL DEFAULT CAST(1 AS bit);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "IsIdentified", table: "InventoryItems");
        }
    }
}
