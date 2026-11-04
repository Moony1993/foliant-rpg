using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFeatureChoicesJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod-safe, matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'Characters') AND name = 'FeatureChoicesJson')
                    ALTER TABLE [Characters] ADD [FeatureChoicesJson] nvarchar(max) NOT NULL DEFAULT N'{}';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "FeatureChoicesJson", table: "Characters");
        }
    }
}
