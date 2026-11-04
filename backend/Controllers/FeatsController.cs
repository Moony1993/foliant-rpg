using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;
using Foliant.Api.Dtos;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("feats")]
public class FeatsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    public FeatsController(AppDbContext db) => _db = db;

    /// <summary>Browse the feat compendium, optionally filtered by name and type.</summary>
    [HttpGet]
    public async Task<ActionResult<List<FeatDto>>> List([FromQuery] string? search, [FromQuery] string? type)
    {
        var q = _db.Feats.AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
            q = q.Where(f => f.Name.Contains(search));
        if (!string.IsNullOrWhiteSpace(type))
            q = q.Where(f => f.Type.Contains(type));
        return await q.OrderBy(f => f.Name)
            .Select(f => new FeatDto(f.Id, f.Name, f.Type, f.Prerequisites, f.Benefit, f.Source, f.CreatedByUserId, f.CreatedByName))
            .ToListAsync();
    }

    /// <summary>Create a homebrew feat (any user). It joins the shared compendium for everyone.</summary>
    [HttpPost]
    public async Task<ActionResult<FeatDto>> Create(CreateFeatRequest req)
    {
        var name = req.Name.Trim();
        if (await _db.Feats.AnyAsync(f => f.Name == name))
            return Conflict(new { message = "A feat with this name already exists." });
        var author = (await _db.Users.FindAsync(UserId))?.DisplayName ?? "";
        var f = new FeatTemplate
        {
            Name = name, Type = string.IsNullOrWhiteSpace(req.Type) ? "Allgemein" : req.Type.Trim(),
            Prerequisites = req.Prerequisites?.Trim() ?? "", Benefit = req.Benefit.Trim(),
            Source = "Eigenes", CreatedByUserId = UserId, CreatedByName = author,
        };
        _db.Feats.Add(f);
        await _db.SaveChangesAsync();
        return new FeatDto(f.Id, f.Name, f.Type, f.Prerequisites, f.Benefit, f.Source, f.CreatedByUserId, f.CreatedByName);
    }

    /// <summary>Delete a feat: its creator, or a GM/Admin. Removed from every character that took it.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var f = await _db.Feats.FindAsync(id);
        if (f == null) return NotFound();
        // Official feats are shared by every campaign: only the instance admin removes them.
        if (f.CampaignId == null ? !IsAdmin : f.CreatedByUserId != UserId && !IsGm) return Forbid();
        var token = id.ToString();
        foreach (var c in await _db.Characters.IgnoreQueryFilters().Where(c => c.FeatsJson.Contains(token)).ToListAsync())
        {
            var feats = CharacterState.ReadFeats(c);
            if (feats.RemoveAll(f => f.Id == id) > 0) CharacterState.WriteFeats(c, feats);
        }
        _db.Feats.Remove(f);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Signature abilities of PF1e classes we do NOT offer. A feat that requires one of these
    // can't be taken by any of our characters, so it's noise in the compendium.
    private static readonly string[] NonCoreKeywords =
    {
        "mystery", "revelation", "oracle", "hex", "witch", "arcane pool", "spellstrike",
        "spell combat", "magus arcana", "magus", "eidolon", "life link", "summoner",
        "grit", "gunslinger", "gunsmith", "panache", "swashbuckler", "judgment", "inquisitor",
        "mutagen", "alchemist", "bombs", "arcane reservoir", "arcanist", "bloodrage", "bloodrager",
        "martial flexibility", "brawler", "animal focus", "raging song", "skald", "phrenic",
        "kinetic blast", "wild talent", "kineticist", "hypnotic stare", "mesmerist", "mental focus",
        "occultist", "phantom", "spiritualist", "touch of corruption", "antipaladin",
        "studied combat", "investigator", "studied target", "slayer", "warpriest", "fervor",
        "vigilante", "cavalier", "samurai", "ninja",
    };

    /// <summary>Delete feats that require a class feature from a class we don't offer (Admin).</summary>
    [HttpPost("prune-noncore")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> PruneNonCore()
    {
        var all = await _db.Feats.IgnoreQueryFilters().Where(f => f.RuleSystemId == "pf1e").ToListAsync();   // PF1 data only
        var remove = all.Where(f =>
        {
            var p = (f.Prerequisites ?? "").ToLowerInvariant();
            return NonCoreKeywords.Any(k => p.Contains(k));
        }).ToList();
        _db.Feats.RemoveRange(remove);
        await _db.SaveChangesAsync();
        return Ok(new { removed = remove.Count, total = await _db.Feats.IgnoreQueryFilters().CountAsync(f => f.RuleSystemId == "pf1e") });
    }

    /// <summary>Bulk-import feats into the compendium (Admin/GM). Idempotent by name.</summary>
    [HttpPost("import")]
    [Authorize(Roles = "Admin")]   // official library, shared by all campaigns
    public async Task<IActionResult> Import(List<ImportFeatDto> feats)
    {
        var existing = await _db.Feats.IgnoreQueryFilters().Where(f => f.RuleSystemId == "pf1e").Select(f => f.Name).ToListAsync();   // PF1 import
        var have = new HashSet<string>(existing);
        int added = 0;
        foreach (var f in feats)
        {
            if (string.IsNullOrWhiteSpace(f.Name) || !have.Add(f.Name)) continue;
            _db.Feats.Add(new FeatTemplate
            {
                Name = f.Name, Type = f.Type, Prerequisites = f.Prerequisites,
                Benefit = f.Benefit, Source = f.Source,
            });
            added++;
        }
        await _db.SaveChangesAsync();
        return Ok(new { added, total = await _db.Feats.IgnoreQueryFilters().CountAsync(f => f.RuleSystemId == "pf1e") });
    }
}
