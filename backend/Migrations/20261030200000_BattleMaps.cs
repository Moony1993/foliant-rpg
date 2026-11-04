using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261030200000_BattleMaps")]
    public partial class BattleMaps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded create-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'BattleMaps') IS NULL
                CREATE TABLE [BattleMaps] (
                    [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_BattleMaps] PRIMARY KEY,
                    [Name] nvarchar(max) NOT NULL DEFAULT N'',
                    [ImageUrl] nvarchar(max) NOT NULL DEFAULT N'',
                    [ImageWidth] int NOT NULL DEFAULT 0,
                    [ImageHeight] int NOT NULL DEFAULT 0,
                    [GridSize] float NOT NULL DEFAULT 70,
                    [GridOffsetX] float NOT NULL DEFAULT 0,
                    [GridOffsetY] float NOT NULL DEFAULT 0,
                    [WallsJson] nvarchar(max) NOT NULL DEFAULT N'[]',
                    [TokensJson] nvarchar(max) NOT NULL DEFAULT N'[]',
                    [RevealedJson] nvarchar(max) NOT NULL DEFAULT N'[]',
                    [Fog] bit NOT NULL DEFAULT 1,
                    [IsActive] bit NOT NULL DEFAULT 0,
                    [CreatedByUserId] nvarchar(max) NOT NULL DEFAULT N'',
                    [UpdatedAt] datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "BattleMaps");
        }
    }
}
