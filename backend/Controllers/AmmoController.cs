using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Dtos;

namespace Foliant.Api.Controllers;

/// <summary>The character's ammunition list (arrows, bolts …). Saved as a whole, like the spell tracker.</summary>
[ApiController]
[Authorize]
[Route("characters/{charId:int}/ammo")]
public class AmmoController : ApiControllerBase
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;
    public AmmoController(AppDbContext db) => _db = db;

    private static List<AmmoDto> Read(string json)
    {
        try { return JsonSerializer.Deserialize<List<AmmoDto>>(json, Json) ?? new(); }
        catch (JsonException) { return new(); }
    }

    [HttpGet]
    public async Task<ActionResult<List<AmmoDto>>> Get(int charId)
    {
        var json = await _db.Characters.AsNoTracking().Where(c => c.Id == charId && c.UserId == UserId)
            .Select(c => c.AmmoJson).FirstOrDefaultAsync();
        return json == null ? NotFound() : Read(json);
    }

    [HttpPut]
    public async Task<ActionResult<List<AmmoDto>>> Save(int charId, List<AmmoDto> ammo)
    {
        var c = await _db.Characters.FirstOrDefaultAsync(c => c.Id == charId && c.UserId == UserId);
        if (c == null) return NotFound();
        if (ammo.Count > 50) return BadRequest(new { message = "At most 50 kinds of ammunition." });
        c.AmmoJson = JsonSerializer.Serialize(ammo, Json);
        await _db.SaveChangesAsync();
        return ammo;
    }
}
