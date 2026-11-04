using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNotesTableIfMissing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The Notes table was created inside the 20260720184800 migration, whose body
            // is skipped in prod (its history row is recorded) → the table is missing and
            // GET /notes 500s. This fresh-id migration creates it if absent; no-op once present.
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM sys.objects
                               WHERE object_id = OBJECT_ID(N'Notes') AND type = 'U')
                BEGIN
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
                            FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id])
                            ON DELETE CASCADE
                    );
                    CREATE INDEX [IX_Notes_UserId] ON [Notes] ([UserId]);
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Forward-only repair; the Notes table is part of the intended model state.
        }
    }
}
