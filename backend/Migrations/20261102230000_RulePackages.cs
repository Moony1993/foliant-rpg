using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261102230000_RulePackages")]
    public partial class RulePackages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded create-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.SqlDeferred("""
                IF OBJECT_ID(N'RulePackages') IS NULL
                BEGIN
                    CREATE TABLE [RulePackages] (
                        [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_RulePackages] PRIMARY KEY,
                        [PackageId] nvarchar(450) NOT NULL,
                        [Name] nvarchar(max) NOT NULL DEFAULT N'',
                        [Version] nvarchar(max) NOT NULL DEFAULT N'',
                        [License] nvarchar(max) NOT NULL DEFAULT N'',
                        [Sha256] nvarchar(max) NOT NULL DEFAULT N'',
                        [Data] varbinary(max) NOT NULL,
                        [InstalledByUserId] nvarchar(max) NOT NULL DEFAULT N'',
                        [InstalledAt] datetime2 NOT NULL DEFAULT GETUTCDATE()
                    );
                    CREATE UNIQUE INDEX [IX_RulePackages_PackageId] ON [RulePackages]([PackageId]);
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "RulePackages");
        }
    }
}
