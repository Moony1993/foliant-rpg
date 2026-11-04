using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261030120000_FeatCleanup")]
    public partial class FeatCleanup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Data-only cleanup of the d20pfsrd feat import (prod is SqlServer). No character on prod
            // had any of these feats when this was written.
            // 1) Drop non-feats ("Critical Feats" is a category blurb), D&D 3.5 entries, and duplicates
            //    the crawler's prerequisite closure added under the un-inverted name without a source
            //    ("Great Cleave" next to "Cleave, Great"). Case-sensitive: "Shake it Off" vs "Shake It Off".
            migrationBuilder.Sql("""
                DELETE f FROM [Feats] f
                JOIN (VALUES
                    (N'Banishing Critical', N''),
                    (N'Bleeding Critical', N''),
                    (N'Brew Fleshcrafting Poison (Item Creation)', N''),
                    (N'Conceal Scent', N''),
                    (N'Critical Feats', N''),
                    (N'Great Cleave', N''),
                    (N'Greater Blind-Fight', N''),
                    (N'Greater Dirty Trick', N''),
                    (N'Greater Disarm', N''),
                    (N'Greater Feint', N''),
                    (N'Greater Grapple', N''),
                    (N'Greater Trip', N''),
                    (N'Greater Vital Strike', N''),
                    (N'Greater Weapon Focus', N''),
                    (N'Gunslinger', N''),
                    (N'Improved Blind-Fight', N''),
                    (N'Improved Bull Rush', N''),
                    (N'Improved Channel', N''),
                    (N'Improved Counterspell', N''),
                    (N'Improved Critical', N''),
                    (N'Improved Dirty Trick', N''),
                    (N'Improved Disarm', N''),
                    (N'Improved Drag', N''),
                    (N'Improved Eldritch Heritage', N''),
                    (N'Improved Feint', N''),
                    (N'Improved Grapple', N''),
                    (N'Improved Iron Will', N''),
                    (N'Improved Overrun', N''),
                    (N'Improved Precise Shot', N''),
                    (N'Improved Reposition', N''),
                    (N'Improved Shield Bash', N''),
                    (N'Improved Steal', N''),
                    (N'Improved Stonecunning', N''),
                    (N'Improved Sunder', N''),
                    (N'Improved Two-Weapon Fighting', N''),
                    (N'Improved Unarmed Strike', N''),
                    (N'Improved Vital Strike', N''),
                    (N'Inscribe Rune (Item Creation)', N''),
                    (N'Minor Spell Expertise', N''),
                    (N'Point Blank Master', N'PZO1110'),
                    (N'Ride-by Attack', N''),
                    (N'Shake it Off', N'PZO1118'),
                    (N'Staggering Critical', N''),
                    (N'Tiring Critical', N'')
                ) AS d(Name, Source) ON f.[Name] COLLATE Latin1_General_CS_AS = d.Name COLLATE Latin1_General_CS_AS AND f.[Source] = d.Source
                WHERE f.[CreatedByUserId] IS NULL;
                """);
            // 2) Fix sources so "Nur Grundregelwerk" (Source PZO1110) matches the Core Rulebook.
            migrationBuilder.Sql("""
                UPDATE [Feats] SET [Source] = N'PZO1110'
                WHERE [CreatedByUserId] IS NULL AND [Source] = N'' AND [Name] IN (N'Eschew Materials', N'Snatch Arrows');
                UPDATE [Feats] SET [Source] = N'PRPG Bestiary'
                WHERE [CreatedByUserId] IS NULL AND [Source] = N'PZO1110' AND [Name] IN (N'Multiattack', N'Awesome Blow', N'Craft Construct');
                UPDATE [Feats] SET [Source] = N'Inner Sea Gods'
                WHERE [CreatedByUserId] IS NULL AND [Source] = N'PZO1110' AND [Name] = N'Celestial Obedience';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data cleanup only; deleted rows come back with POST /feats/import if ever needed.
        }
    }
}
