using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Dtos;
using Foliant.Api.Hubs;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

/// <summary>
/// Battle maps. The GM creates and edits maps (walls, tokens, reveals) and picks the active one; players see
/// only the active map (without GM-hidden tokens) and may move their own character tokens. Every change is
/// pushed to all clients as a "map" notification so the table stays in sync.
/// </summary>
[ApiController]
[Authorize]
[Route("maps")]
public class MapsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<NotificationHub> _hub;
    public MapsController(AppDbContext db, IHubContext<NotificationHub> hub) { _db = db; _hub = hub; }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static List<T> Read<T>(string json)
    {
        try { return JsonSerializer.Deserialize<List<T>>(json, Json) ?? new(); }
        catch { return new(); }
    }

    private BattleMapDto ToDto(BattleMap m, bool gm)
    {
        var tokens = Read<MapTokenDto>(m.TokensJson);
        return new BattleMapDto(m.Id, m.Name, m.ImageUrl, m.ImageWidth, m.ImageHeight, m.GridSize, m.GridOffsetX, m.GridOffsetY,
            Read<MapWallDto>(m.WallsJson), gm ? tokens : tokens.Where(t => !t.Hidden).ToList(),
            Read<string>(m.RevealedJson), m.Fog, m.IsActive, m.UpdatedAt, m.ShowGrid);
    }

    private Task Broadcast(int id) =>
        _hub.Clients.Group(CampaignContext.Group(Campaign.CampaignId!.Value)).SendAsync("notify", new { type = "map", mapId = id });

    /// <summary>GM: all maps. Players: the active map, if any.</summary>
    [HttpGet]
    public async Task<ActionResult<List<BattleMapDto>>> List()
    {
        var q = _db.BattleMaps.AsNoTracking();
        if (!IsGm) q = q.Where(m => m.IsActive);
        return (await q.OrderByDescending(m => m.UpdatedAt).ToListAsync()).Select(m => ToDto(m, IsGm)).ToList();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<BattleMapDto>> Get(int id)
    {
        var m = await _db.BattleMaps.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (m == null || (!IsGm && !m.IsActive)) return NotFound();
        return ToDto(m, IsGm);
    }

    [HttpPost]
    [CampaignGm]
    public async Task<ActionResult<BattleMapDto>> Create(CreateMapRequest req)
    {
        var m = new BattleMap { Name = req.Name.Trim(), ImageUrl = req.ImageUrl, ImageWidth = req.ImageWidth, ImageHeight = req.ImageHeight,
            GridSize = req.GridSize, GridOffsetX = req.GridOffsetX, GridOffsetY = req.GridOffsetY, ShowGrid = req.ShowGrid, CreatedByUserId = UserId };
        _db.BattleMaps.Add(m);
        await _db.SaveChangesAsync();
        return ToDto(m, true);
    }

    /// <summary>GM: save the whole map (editor autosave). Activating one map deactivates the others.</summary>
    [HttpPut("{id:int}")]
    [CampaignGm]
    public async Task<ActionResult<BattleMapDto>> Save(int id, SaveMapRequest req)
    {
        var m = await _db.BattleMaps.FindAsync(id);
        if (m == null) return NotFound();
        m.Name = req.Name.Trim(); m.ImageWidth = req.ImageWidth; m.ImageHeight = req.ImageHeight;
        m.GridSize = req.GridSize; m.GridOffsetX = req.GridOffsetX; m.GridOffsetY = req.GridOffsetY; m.ShowGrid = req.ShowGrid;
        m.WallsJson = JsonSerializer.Serialize(req.Walls ?? new(), Json);
        m.TokensJson = JsonSerializer.Serialize(req.Tokens ?? new(), Json);
        m.RevealedJson = JsonSerializer.Serialize((req.Revealed ?? new()).Distinct(), Json);
        m.Fog = req.Fog;
        if (req.IsActive && !m.IsActive)
            await _db.BattleMaps.Where(x => x.IsActive && x.Id != id).ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false));
        m.IsActive = req.IsActive;
        m.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await Broadcast(id);
        return ToDto(m, true);
    }

    /// <summary>Move a token to a cell. Players: only their own character's token on the active map.</summary>
    [HttpPost("{id:int}/tokens/{tokenId}/move")]
    public async Task<ActionResult<BattleMapDto>> Move(int id, string tokenId, MoveTokenRequest req)
    {
        var m = await _db.BattleMaps.FindAsync(id);
        if (m == null || (!IsGm && !m.IsActive)) return NotFound();
        var tokens = Read<MapTokenDto>(m.TokensJson);
        var t = tokens.FirstOrDefault(x => x.Id == tokenId);
        if (t == null) return NotFound();
        if (!IsGm)
        {
            bool own = t.Kind == "character" && t.RefId is int cid
                && await _db.Characters.AnyAsync(c => c.Id == cid && c.UserId == UserId);
            if (!own) return Forbid();
        }
        int cols = m.GridSize > 0 && m.ImageWidth > 0 ? (int)Math.Ceiling((m.ImageWidth - m.GridOffsetX) / m.GridSize) : int.MaxValue;
        int rows = m.GridSize > 0 && m.ImageHeight > 0 ? (int)Math.Ceiling((m.ImageHeight - m.GridOffsetY) / m.GridSize) : int.MaxValue;
        var moved = t with { X = Math.Clamp(req.X, 0, Math.Max(0, cols - 1)), Y = Math.Clamp(req.Y, 0, Math.Max(0, rows - 1)) };
        tokens[tokens.IndexOf(t)] = moved;
        m.TokensJson = JsonSerializer.Serialize(tokens, Json);
        m.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await Broadcast(id);
        return ToDto(m, IsGm);
    }

    /// <summary>GM: copy a map from the library (walls, furnishings, reveals) for a new session — without characters.</summary>
    [HttpPost("{id:int}/duplicate")]
    [CampaignGm]
    public async Task<ActionResult<BattleMapDto>> Duplicate(int id)
    {
        var m = await _db.BattleMaps.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        if (m == null) return NotFound();
        var copy = new BattleMap
        {
            Name = $"{m.Name} (copy)", ImageUrl = m.ImageUrl, ImageWidth = m.ImageWidth, ImageHeight = m.ImageHeight,
            GridSize = m.GridSize, GridOffsetX = m.GridOffsetX, GridOffsetY = m.GridOffsetY, ShowGrid = m.ShowGrid, WallsJson = m.WallsJson,
            TokensJson = JsonSerializer.Serialize(Read<MapTokenDto>(m.TokensJson).Where(t => t.Kind != "character"), Json),
            RevealedJson = "[]", Fog = m.Fog, CreatedByUserId = UserId,
        };
        _db.BattleMaps.Add(copy);
        await _db.SaveChangesAsync();
        return ToDto(copy, true);
    }

    // ---- Asset library (furnishings, traps, levers …) ----
    private static MapAssetDto ToDto(MapAsset a) => new(a.Id, a.Name, a.Category, a.Icon, a.ImageUrl, a.Size, a.Hidden, a.CreatedByName);

    [HttpGet("/map-assets")]
    [CampaignGm]
    public async Task<List<MapAssetDto>> Assets() =>
        (await _db.MapAssets.AsNoTracking().OrderBy(a => a.Category).ThenBy(a => a.Name).ToListAsync()).Select(ToDto).ToList();

    [HttpPost("/map-assets")]
    [CampaignGm]
    public async Task<ActionResult<MapAssetDto>> CreateAsset(SaveMapAssetRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Icon) && string.IsNullOrWhiteSpace(req.ImageUrl))
            return BadRequest(new { message = "Give an emoji or an image." });
        var a = new MapAsset
        {
            Name = req.Name.Trim(), Category = string.IsNullOrWhiteSpace(req.Category) ? "Einrichtung" : req.Category.Trim(),
            Icon = req.Icon?.Trim() ?? "", ImageUrl = string.IsNullOrWhiteSpace(req.ImageUrl) ? null : req.ImageUrl,
            Size = Math.Clamp(req.Size, 1, 4), Hidden = req.Hidden, CreatedByUserId = UserId,
            CreatedByName = (await _db.Users.FindAsync(UserId))?.DisplayName ?? "",
        };
        _db.MapAssets.Add(a);
        await _db.SaveChangesAsync();
        return ToDto(a);
    }

    [HttpDelete("/map-assets/{id:int}")]
    [CampaignGm]
    public async Task<IActionResult> DeleteAsset(int id)
    {
        var a = await _db.MapAssets.FindAsync(id);
        if (a == null) return NotFound();
        _db.MapAssets.Remove(a);   // tokens already on maps keep their copy of icon/image
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [CampaignGm]
    public async Task<IActionResult> Delete(int id)
    {
        var m = await _db.BattleMaps.FindAsync(id);
        if (m == null) return NotFound();
        _db.BattleMaps.Remove(m);
        await _db.SaveChangesAsync();
        await Broadcast(id);
        return NoContent();
    }
}
