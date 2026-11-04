using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Domain.Rules.Engine;

namespace Foliant.Api.Controllers;

public record RuleSystemAdminDto(string Id, string Name, string? Version, string? License, string? Attribution,
    bool BuiltIn, int CampaignCount, DateTime? InstalledAt);
public record PackageCheckDto(bool Ok, string? Id, string? Name, string? Version, List<string> Errors, List<string> Tests, bool Replaces);

/// <summary>Instance admin: install, check, export and remove rule packages. GMs then pick installed
/// systems when creating a campaign.</summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("admin/rule-packages")]
public class RulePackagesController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly RuleSystemRegistry _registry;
    public RulePackagesController(AppDbContext db, RuleSystemRegistry registry) { _db = db; _registry = registry; }

    [HttpGet]
    public async Task<List<RuleSystemAdminDto>> List()
    {
        var rows = await _db.RulePackages.AsNoTracking().ToDictionaryAsync(r => r.PackageId);
        var usage = await _db.Campaigns.GroupBy(c => c.RuleSystemId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);
        return _registry.All.Select(s =>
        {
            var row = rows.GetValueOrDefault(s.Id);
            var manifest = (s as DeclarativeRuleSystem)?.Package.Manifest;
            return new RuleSystemAdminDto(s.Id, s.DisplayName, row?.Version ?? manifest?.Version, row?.License ?? manifest?.License,
                manifest?.Attribution, _registry.IsBuiltIn(s.Id), usage.GetValueOrDefault(s.Id), row?.InstalledAt);
        }).ToList();
    }

    private static async Task<byte[]?> ReadUpload(IFormFile? file)
    {
        if (file == null || file.Length == 0 || file.Length > RulePackageLoader.MaxUpload) return null;
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        return ms.ToArray();
    }

    private PackageCheckDto ToDto(PackageCheck check) => new(check.Package != null, check.Package?.Manifest.Id, check.Package?.Manifest.Name,
        check.Package?.Manifest.Version, check.Errors, check.TestResults, check.Package != null && _registry.Has(check.Package.Manifest.Id));

    /// <summary>Check a package without installing it (developer view: all errors and test results).</summary>
    [HttpPost("check")]
    [RequestSizeLimit(RulePackageLoader.MaxUpload)]
    public async Task<ActionResult<PackageCheckDto>> Check(IFormFile file)
    {
        var bytes = await ReadUpload(file);
        if (bytes == null) return BadRequest(new { message = "No file, or the file is too large." });
        return ToDto(RulePackageLoader.Check(bytes));
    }

    /// <summary>Install or update a package. It must pass every check and all of its tests.</summary>
    [HttpPost]
    [RequestSizeLimit(RulePackageLoader.MaxUpload)]
    public async Task<ActionResult<PackageCheckDto>> Install(IFormFile file)
    {
        var bytes = await ReadUpload(file);
        if (bytes == null) return BadRequest(new { message = "No file, or the file is too large." });
        var check = RulePackageLoader.Check(bytes);
        if (check.Package is not { } pkg) return BadRequest(ToDto(check));
        var m = pkg.Manifest;
        if (_registry.IsBuiltIn(m.Id)) return BadRequest(new { message = $"\"{m.Id}\" is a built-in system." });

        var row = await _db.RulePackages.FirstOrDefaultAsync(r => r.PackageId == m.Id);
        if (row != null && row.Sha256 != pkg.Sha256 && row.Version == m.Version)
            return Conflict(new { message = $"Version {m.Version} of \"{m.Id}\" is already installed with different content — please raise the version number." });
        if (row == null) _db.RulePackages.Add(row = new RulePackageRecord { PackageId = m.Id });
        row.Name = m.Name; row.Version = m.Version; row.License = m.License; row.Sha256 = pkg.Sha256; row.Data = bytes;
        row.InstalledByUserId = UserId; row.InstalledAt = DateTime.UtcNow;
        await RulePackageLibrary.SyncAsync(_db, m.Id, pkg.Spells, pkg.Feats);
        await _db.SaveChangesAsync();
        _registry.Register(new DeclarativeRuleSystem(pkg));
        return ToDto(check);
    }

    [HttpGet("{id}/export")]
    public async Task<IActionResult> Export(string id)
    {
        var row = await _db.RulePackages.AsNoTracking().FirstOrDefaultAsync(r => r.PackageId == id);
        if (row == null) return NotFound(new { message = _registry.IsBuiltIn(id) ? "Built-in systems cannot be exported." : "Nicht installiert." });
        return File(row.Data, "application/zip", $"{row.PackageId}-{row.Version}.foliant-rules");
    }

    /// <summary>Remove a package — only while no campaign uses it.</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Remove(string id)
    {
        if (_registry.IsBuiltIn(id)) return BadRequest(new { message = "Built-in systems cannot be removed." });
        var used = await _db.Campaigns.CountAsync(c => c.RuleSystemId == id);
        if (used > 0) return Conflict(new { message = $"{used} campaign(s) use this rule system." });
        var row = await _db.RulePackages.FirstOrDefaultAsync(r => r.PackageId == id);
        if (row == null) return NotFound();
        _db.RulePackages.Remove(row);
        await RulePackageLibrary.RemoveAsync(_db, RulePackageLoader.Check(row.Data).Package, id);
        await _db.SaveChangesAsync();
        _registry.Remove(id);
        return NoContent();
    }
}
