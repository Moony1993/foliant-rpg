using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMonsters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded raw SQL (prod is SqlServer; matches this repo's migration pattern —
            // only the new Monsters table, Feats/FeatIdsJson are handled by earlier migrations).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'Monsters') AND type = 'U')
                BEGIN
                    CREATE TABLE [Monsters] (
                        [Id]                  int           NOT NULL IDENTITY(1,1),
                        [CreatedByUserId]     nvarchar(max) NOT NULL,
                        [Name]                nvarchar(max) NOT NULL,
                        [Size]                nvarchar(max) NOT NULL,
                        [Type]                nvarchar(max) NOT NULL,
                        [Description]         nvarchar(max) NOT NULL,
                        [MaxHp]               int           NOT NULL,
                        [CurrentHp]           int           NOT NULL,
                        [Ac]                  int           NOT NULL,
                        [Speed]               int           NOT NULL,
                        [Str]                 int           NOT NULL,
                        [Dex]                 int           NOT NULL,
                        [Con]                 int           NOT NULL,
                        [Int]                 int           NOT NULL,
                        [Wis]                 int           NOT NULL,
                        [Cha]                 int           NOT NULL,
                        [Fort]                int           NOT NULL,
                        [Ref]                 int           NOT NULL,
                        [Will]                int           NOT NULL,
                        [SkillsJson]          nvarchar(max) NOT NULL,
                        [AttacksJson]         nvarchar(max) NOT NULL,
                        [ItemTemplateIdsJson] nvarchar(max) NOT NULL,
                        CONSTRAINT [PK_Monsters] PRIMARY KEY ([Id])
                    );
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "Monsters");
        }
    }
}
