using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class ConvertBoolColumnsIntToBit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Systematic repair: several bool-mapped columns exist in prod as INT (e.g.
            // PendingLevelUp, Notes.IsPinned, Messages flags) → SqlDataReader.GetBoolean
            // throws InvalidCastException, 500ing any endpoint that reads them. Convert
            // every model bool column that is still int → bit in one pass. Each column's
            // auto-named DEFAULT constraint is dropped first (ALTER COLUMN fails otherwise),
            // then re-added. No-op for columns that are already bit.
            migrationBuilder.Sql("""
                DECLARE @cols TABLE (tbl sysname, col sysname);
                INSERT INTO @cols (tbl, col) VALUES
                    (N'AspNetUsers', N'MustChangePassword'),
                    (N'Characters',  N'PendingLevelUp'),
                    (N'Messages',    N'IsImportant'),
                    (N'Messages',    N'IsRead'),
                    (N'Messages',    N'IsArchived'),
                    (N'Notes',       N'IsPinned');

                DECLARE @tbl sysname, @col sysname, @df sysname;
                DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT tbl, col FROM @cols;
                OPEN cur;
                FETCH NEXT FROM cur INTO @tbl, @col;
                WHILE @@FETCH_STATUS = 0
                BEGIN
                    IF EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(@tbl) AND name = @col
                               AND system_type_id = TYPE_ID(N'int'))
                    BEGIN
                        SET @df = (SELECT dc.name FROM sys.default_constraints dc
                                   JOIN sys.columns c ON c.object_id = dc.parent_object_id
                                                     AND c.column_id = dc.parent_column_id
                                   WHERE dc.parent_object_id = OBJECT_ID(@tbl) AND c.name = @col);
                        IF @df IS NOT NULL
                            EXEC(N'ALTER TABLE [' + @tbl + N'] DROP CONSTRAINT [' + @df + N']');
                        EXEC(N'ALTER TABLE [' + @tbl + N'] ALTER COLUMN [' + @col + N'] bit NOT NULL');
                        EXEC(N'ALTER TABLE [' + @tbl + N'] ADD CONSTRAINT [DF_' + @tbl + N'_' + @col
                             + N'] DEFAULT 0 FOR [' + @col + N']');
                        SET @df = NULL;
                    END
                    FETCH NEXT FROM cur INTO @tbl, @col;
                END
                CLOSE cur;
                DEALLOCATE cur;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Forward-only repair; bit is the intended model state for these columns.
        }
    }
}
