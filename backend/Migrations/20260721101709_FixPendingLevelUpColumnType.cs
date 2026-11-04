using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class FixPendingLevelUpColumnType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // On prod, Characters.PendingLevelUp exists as INT while the model maps it
            // to bool → SqlDataReader.GetBoolean throws InvalidCastException on every
            // GET /characters (500). The 20260720184800 migration meant to fix this is
            // already recorded in __EFMigrationsHistory, so its body is skipped and can't
            // correct the type. This fresh-id migration is guaranteed to run once. The
            // column's auto-named DEFAULT constraint must be dropped before the type can
            // change, then re-created. Guarded so it's a no-op once the column is bit.
            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM sys.columns
                           WHERE object_id = OBJECT_ID(N'Characters') AND name = 'PendingLevelUp'
                           AND system_type_id = TYPE_ID(N'int'))
                BEGIN
                    DECLARE @df sysname = (
                        SELECT dc.name FROM sys.default_constraints dc
                        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
                        WHERE dc.parent_object_id = OBJECT_ID(N'Characters') AND c.name = 'PendingLevelUp');
                    IF @df IS NOT NULL
                        EXEC('ALTER TABLE [Characters] DROP CONSTRAINT [' + @df + ']');
                    ALTER TABLE [Characters] ALTER COLUMN [PendingLevelUp] bit NOT NULL;
                    ALTER TABLE [Characters] ADD CONSTRAINT [DF_Characters_PendingLevelUp] DEFAULT 0 FOR [PendingLevelUp];
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Forward-only repair; the bit type is the intended model state.
        }
    }
}
