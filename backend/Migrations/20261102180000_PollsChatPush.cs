using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Foliant.Api.Data;

#nullable disable

namespace Foliant.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20261102180000_PollsChatPush")]
    public partial class PollsChatPush : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded create-if-missing (prod is SqlServer; matches this repo's migration pattern).
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'SchedulePolls') IS NULL
                CREATE TABLE [SchedulePolls] (
                    [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_SchedulePolls] PRIMARY KEY,
                    [Title] nvarchar(max) NOT NULL DEFAULT N'',
                    [Description] nvarchar(max) NOT NULL DEFAULT N'',
                    [CreatedByUserId] nvarchar(max) NOT NULL DEFAULT N'',
                    [CreatedAt] datetime2 NOT NULL DEFAULT GETUTCDATE(),
                    [ChosenOptionId] int NULL
                );
                """);
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'PollOptions') IS NULL
                CREATE TABLE [PollOptions] (
                    [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_PollOptions] PRIMARY KEY,
                    [PollId] int NOT NULL CONSTRAINT [FK_PollOptions_SchedulePolls_PollId]
                        FOREIGN KEY REFERENCES [SchedulePolls]([Id]) ON DELETE CASCADE,
                    [StartsAt] datetime2 NOT NULL
                );
                """);
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'PollVotes') IS NULL
                BEGIN
                    CREATE TABLE [PollVotes] (
                        [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_PollVotes] PRIMARY KEY,
                        [OptionId] int NOT NULL CONSTRAINT [FK_PollVotes_PollOptions_OptionId]
                            FOREIGN KEY REFERENCES [PollOptions]([Id]) ON DELETE CASCADE,
                        [UserId] nvarchar(450) NOT NULL DEFAULT N'',
                        [Answer] nvarchar(max) NOT NULL DEFAULT N'yes'
                    );
                    CREATE UNIQUE INDEX [IX_PollVotes_OptionId_UserId] ON [PollVotes]([OptionId], [UserId]);
                END
                """);
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'ChatMessages') IS NULL
                BEGIN
                    CREATE TABLE [ChatMessages] (
                        [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_ChatMessages] PRIMARY KEY,
                        [UserId] nvarchar(max) NOT NULL DEFAULT N'',
                        [UserName] nvarchar(max) NOT NULL DEFAULT N'',
                        [Text] nvarchar(max) NOT NULL DEFAULT N'',
                        [CreatedAt] datetime2 NOT NULL DEFAULT GETUTCDATE()
                    );
                    CREATE INDEX [IX_ChatMessages_CreatedAt] ON [ChatMessages]([CreatedAt]);
                END
                """);
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'PushDevices') IS NULL
                CREATE TABLE [PushDevices] (
                    [Id] int NOT NULL IDENTITY(1,1) CONSTRAINT [PK_PushDevices] PRIMARY KEY,
                    [UserId] nvarchar(max) NOT NULL DEFAULT N'',
                    [Endpoint] nvarchar(max) NOT NULL DEFAULT N'',
                    [P256dh] nvarchar(max) NOT NULL DEFAULT N'',
                    [Auth] nvarchar(max) NOT NULL DEFAULT N''
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "PushDevices");
            migrationBuilder.DropTable(name: "ChatMessages");
            migrationBuilder.DropTable(name: "PollVotes");
            migrationBuilder.DropTable(name: "PollOptions");
            migrationBuilder.DropTable(name: "SchedulePolls");
        }
    }
}
