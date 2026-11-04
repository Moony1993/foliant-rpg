using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261030220000_MapShowGrid")]
    public partial class MapShowGrid : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH(N'BattleMaps', N'ShowGrid') IS NULL
                ALTER TABLE [BattleMaps] ADD [ShowGrid] bit NOT NULL CONSTRAINT [DF_BattleMaps_ShowGrid] DEFAULT 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ShowGrid", table: "BattleMaps");
        }
    }
}
