using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261102120000_InventoryEquippedAt")]
    public partial class InventoryEquippedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing; items already worn count as worn for over 24h.
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'InventoryItems') AND name = 'EquippedAt')
                BEGIN
                    ALTER TABLE [InventoryItems] ADD [EquippedAt] datetime2 NULL;
                    EXEC('UPDATE [InventoryItems] SET [EquippedAt] = DATEADD(day, -1, GETUTCDATE()) WHERE [EquippedSlot] IS NOT NULL');
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "EquippedAt", table: "InventoryItems");
        }
    }
}
