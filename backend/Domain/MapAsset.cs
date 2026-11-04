namespace Foliant.Api.Domain;

/// <summary>
/// A reusable map piece in the GM library (chest, wardrobe, trapdoor, lever, …): emoji or uploaded image,
/// category, default size and whether it is GM-only (traps, secret doors). Shared by all GMs.
/// </summary>
public class MapAsset : ICampaignOwned
{
    public int Id { get; set; }
    public int CampaignId { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "Einrichtung";
    /// <summary>Emoji shown on the token (used when there is no image).</summary>
    public string Icon { get; set; } = "";
    /// <summary>Uploaded token image (transparent PNG works best).</summary>
    public string? ImageUrl { get; set; }
    public int Size { get; set; } = 1;
    public bool Hidden { get; set; }
    public string CreatedByUserId { get; set; } = "";
    public string CreatedByName { get; set; } = "";
}
