using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261030210000_MapAssets")]
    public partial class MapAssets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded create-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'MapAssets') IS NULL
                CREATE TABLE [MapAssets] (
                    [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_MapAssets] PRIMARY KEY,
                    [Name] nvarchar(max) NOT NULL DEFAULT N'',
                    [Category] nvarchar(max) NOT NULL DEFAULT N'Einrichtung',
                    [Icon] nvarchar(max) NOT NULL DEFAULT N'',
                    [ImageUrl] nvarchar(max) NULL,
                    [Size] int NOT NULL DEFAULT 1,
                    [Hidden] bit NOT NULL DEFAULT 0,
                    [CreatedByUserId] nvarchar(max) NOT NULL DEFAULT N'',
                    [CreatedByName] nvarchar(max) NOT NULL DEFAULT N''
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "MapAssets");
        }
    }
}
