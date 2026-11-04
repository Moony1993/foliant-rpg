using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261030140000_CharacterFeatsJson")]
    public partial class CharacterFeatsJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded add-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'Characters') AND name = 'FeatsJson')
                    ALTER TABLE [Characters] ADD [FeatsJson] nvarchar(max) NOT NULL DEFAULT N'[]';
                """);
            // Carry the existing feat ids over with their names ([{"id":3,"name":"Dodge"}]).
            // Dynamic SQL: same batch as the ALTER above, column names resolve at compile time.
            migrationBuilder.Sql("""
                EXEC(N'
                UPDATE c SET [FeatsJson] = COALESCE((
                    SELECT f.[Id] AS id, f.[Name] AS name
                    FROM OPENJSON(c.[FeatIdsJson]) j
                    JOIN [Feats] f ON f.[Id] = TRY_CAST(j.[value] AS int)
                    FOR JSON PATH), N''[]'')
                FROM [Characters] c
                WHERE c.[FeatsJson] = N''[]'' AND c.[FeatIdsJson] <> N''[]'';
                ');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "FeatsJson", table: "Characters");
        }
    }
}
