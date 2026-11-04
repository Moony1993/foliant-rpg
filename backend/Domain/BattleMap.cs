namespace Foliant.Api.Domain;

/// <summary>
/// A battle map: background image, grid, walls/doors, tokens (characters, monsters, furnishings) and the
/// cells the GM revealed by hand. Positions are in grid cells, so changing the grid size moves nothing.
/// Walls, tokens and revealed cells are JSON (see BattleMapDto) — one map is edited and synced as a whole.
/// </summary>
public class BattleMap : ICampaignOwned
{
    public int Id { get; set; }
    public int CampaignId { get; set; }
    public string Name { get; set; } = "";
    public string ImageUrl { get; set; } = "";
    /// <summary>Image size in pixels (set by the editor once the image has loaded).</summary>
    public int ImageWidth { get; set; }
    public int ImageHeight { get; set; }
    /// <summary>Pixels per grid cell and where the grid starts on the image.</summary>
    public double GridSize { get; set; } = 70;
    public double GridOffsetX { get; set; }
    public double GridOffsetY { get; set; }
    /// <summary>Draw our grid on top; off when the image already has one painted in.</summary>
    public bool ShowGrid { get; set; } = true;
    /// <summary>[{x1,y1,x2,y2,door,open}] in grid units (endpoints on grid intersections).</summary>
    public string WallsJson { get; set; } = "[]";
    /// <summary>[{id,kind,refId,label,icon,x,y,size,hidden}] — kind: character | monster | object; x/y = cell.</summary>
    public string TokensJson { get; set; } = "[]";
    /// <summary>Cells the GM revealed by hand, ["x,y", …] — visible to players regardless of line of sight.</summary>
    public string RevealedJson { get; set; } = "[]";
    /// <summary>Line of sight / fog of war for players on or off.</summary>
    public bool Fog { get; set; } = true;
    /// <summary>The map players see (one at a time).</summary>
    public bool IsActive { get; set; }
    public string CreatedByUserId { get; set; } = "";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
