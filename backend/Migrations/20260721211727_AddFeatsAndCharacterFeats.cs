using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFeatsAndCharacterFeats : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded (prod-safe, matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'Feats') AND type = 'U')
                BEGIN
                    CREATE TABLE [Feats] (
                        [Id]            int           NOT NULL IDENTITY(1,1),
                        [Name]          nvarchar(max) NOT NULL,
                        [Type]          nvarchar(max) NOT NULL,
                        [Prerequisites] nvarchar(max) NOT NULL,
                        [Benefit]       nvarchar(max) NOT NULL,
                        [Source]        nvarchar(max) NOT NULL,
                        CONSTRAINT [PK_Feats] PRIMARY KEY ([Id])
                    );
                END

                IF NOT EXISTS (SELECT 1 FROM sys.columns
                               WHERE object_id = OBJECT_ID(N'Characters') AND name = 'FeatIdsJson')
                    ALTER TABLE [Characters] ADD [FeatIdsJson] nvarchar(max) NOT NULL DEFAULT N'[]';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "FeatIdsJson", table: "Characters");
            migrationBuilder.DropTable(name: "Feats");
        }
    }
}
