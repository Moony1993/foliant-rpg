using Microsoft.EntityFrameworkCore.Migrations;

namespace Foliant.Api.Migrations;

public static class MigrationSql
{
    /// <summary>Hand-written SQL that runs as its own batch via EXEC. The idempotent migration script puts a whole
    /// migration into one batch, and SQL Server compiles a batch before running it — a statement that reads a column
    /// added earlier in the same migration would fail with "Invalid column name".</summary>
    public static void SqlDeferred(this MigrationBuilder migrationBuilder, string sql) =>
        migrationBuilder.Sql($"EXEC(N'{sql.Replace("'", "''")}');");
}
