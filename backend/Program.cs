using Foliant.Api.Domain.Rules.Engine;
using System.IO.Compression;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.IdentityModel.Tokens;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Hubs;
using Foliant.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

// --- Database: SQLite locally, SQL Server on Azure (chosen by Database:Provider) ---
var provider = cfg["Database:Provider"] ?? "Sqlite";
var conn = cfg.GetConnectionString("Default") ?? "Data Source=foliant.db";
builder.Services.AddDbContext<AppDbContext>(o =>
{
    // Suppress PendingModelChangesWarning: migrations are generated with the SQLite
    // provider locally but run against SQL Server on Azure. The column-type names in
    // the snapshot (TEXT vs nvarchar) will always differ between the two providers.
    // The actual schema applied by the migrations is correct on both sides.
    // Microsoft documents this suppression in the warning message itself.
    Action<WarningsConfigurationBuilder> suppressModelWarning =
        w => w.Ignore(RelationalEventId.PendingModelChangesWarning);

    if (provider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
        // Serverless Azure SQL auto-pauses; resuming takes ~1 min. Retry briefly, then fail
        // fast with 503 (see middleware below) so the client shows "DB startet" and retries.
        o.UseSqlServer(conn, sql => sql.EnableRetryOnFailure(maxRetryCount: 2, maxRetryDelay: TimeSpan.FromSeconds(5), errorNumbersToAdd: null)).ConfigureWarnings(suppressModelWarning);
    else
        o.UseSqlite(conn).ConfigureWarnings(suppressModelWarning);
});

// --- Identity ---
builder.Services.AddIdentity<AppUser, IdentityRole>(o =>
    {
        o.Password.RequiredLength = 6;
        o.Password.RequireNonAlphanumeric = false;
        o.User.RequireUniqueEmail = false;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

// --- JWT auth (also read token from query string for SignalR) ---
builder.Services.AddAuthentication(o =>
    {
        o.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        o.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = cfg["Jwt:Issuer"],
            ValidAudience = cfg["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg["Jwt:Key"]!)),
        };
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// --- App services ---
builder.Services.AddSingleton<RuleSystemRegistry>();
builder.Services.AddScoped<CharacterMapper>();
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddSingleton<MediaStorage>();
builder.Services.AddSingleton<PushService>();
builder.Services.AddScoped<CampaignContext>();
builder.Services.AddScoped<CampaignTransfer>();

// Response compression: Kestrel serves both the JSON API and the SPA's JS/CSS from
// wwwroot, so brotli/gzip shrinks every payload. Bytes are identical once decompressed.
// ponytail: EnableForHttps on — BREACH needs attacker-reflected input mixed with a
// secret in one response; our JWT is only returned at login with no reflected input.
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.Providers.Add<BrotliCompressionProvider>();
    o.Providers.Add<GzipCompressionProvider>();
    o.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
    {
        "text/javascript", "application/javascript", "application/json",
        "text/css", "image/svg+xml", "application/manifest+json", "application/wasm",
    });
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);

builder.Services.AddSignalR();
builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters
        .Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

const string CorsPolicy = "spa";
builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
    .WithOrigins(cfg["Cors:Origins"]?.Split(',') ?? new[] { "http://localhost:5173" })
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()
    .WithExposedHeaders("Content-Disposition")));   // export downloads keep their file name

var app = builder.Build();
// After Build(): EF design-time tools (migration script in CI) stop the host there and need no key.
// No default key: a published default would let anyone forge tokens for every instance.
if (Encoding.UTF8.GetByteCount(cfg["Jwt:Key"] ?? "") < 32)
    throw new InvalidOperationException("Jwt:Key is missing or shorter than 32 bytes. Set it, e.g. via the environment variable Jwt__Key.");

app.UseResponseCompression();   // first, so it wraps every downstream response

// DB still resuming from auto-pause (or otherwise unreachable) → 503 + Retry-After instead
// of a generic 500, so the SPA can show a "Datenbank startet…" banner and retry.
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (Exception ex) when (!ctx.Response.HasStarted && IsDbUnavailable(ex))
    {
        ctx.Response.Clear();
        ctx.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        ctx.Response.Headers.RetryAfter = "10";
        await ctx.Response.WriteAsJsonAsync(new { code = "db-waking", message = "Database is starting, please wait a moment…" });
    }
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Never cache the service worker or the SPA shell, so clients always detect and
// pick up the newest deploy. Hashed /assets/* keep their long cache (name changes
// per build). Set before serving so it also covers the SPA fallback below.
app.Use(async (ctx, next) =>
{
    var p = ctx.Request.Path.Value ?? "";
    if (p == "/" || p.EndsWith(".html") || p.EndsWith("/sw.js") || p.EndsWith("/registerSW.js"))
        ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
    await next();
});

app.UseCors(CorsPolicy); // before static files so the editor can read upload pixels (grid detection) cross-origin in dev
app.UseStaticFiles();   // serves locally-stored uploads and the SPA from wwwroot
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<CampaignContextMiddleware>();
// A campaign whose rule system isn't installed (any more): a clear message instead of a server error.
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (RuleSystemMissingException e) when (!ctx.Response.HasStarted)
    {
        ctx.Response.StatusCode = StatusCodes.Status409Conflict;
        await ctx.Response.WriteAsJsonAsync(new { message = e.Message });
    }
});
app.MapControllers();
app.MapHub<NotificationHub>("/hubs/notifications");
// SPA fallback: any request that doesn't match an API route or static file
// gets index.html so client-side routing works.
app.MapFallbackToFile("index.html");

await DbSeeder.SeedAsync(app.Services);

app.Run();

static bool IsDbUnavailable(Exception ex)
{
    for (var e = ex; e != null; e = e.InnerException)
        if (e is Microsoft.EntityFrameworkCore.Storage.RetryLimitExceededException
            or Microsoft.Data.SqlClient.SqlException or TimeoutException)
            return true;
    return false;
}

public partial class Program { }   // for potential test host
