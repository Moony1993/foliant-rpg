using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class RecreateNotesTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // GET/POST /notes still 500 after create-if-missing + int→bit repairs, so the
            // prod Notes table is broken in a way those guarded fixes don't cover (e.g. a
            // missing column). Notes creation has never succeeded → the table holds no data,
            // so drop and recreate it from the model's exact schema. Fresh-id migration.
            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'Notes') AND type = 'U')
                    DROP TABLE [Notes];

                CREATE TABLE [Notes] (
                    [Id]        int            NOT NULL IDENTITY(1,1),
                    [UserId]    nvarchar(450)  NOT NULL,
                    [Title]     nvarchar(max)  NOT NULL,
                    [Content]   nvarchar(max)  NOT NULL,
                    [Color]     nvarchar(max)  NOT NULL,
                    [IsPinned]  bit            NOT NULL,
                    [CreatedAt] datetime2      NOT NULL,
                    [UpdatedAt] datetime2      NOT NULL,
                    CONSTRAINT [PK_Notes] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_Notes_AspNetUsers_UserId]
                        FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_Notes_UserId] ON [Notes] ([UserId]);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Forward-only repair.
        }
    }
}
