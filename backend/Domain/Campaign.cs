namespace Foliant.Api.Domain;

/// <summary>A campaign: one rule system, one GM, invited players. Almost all game data belongs to one.</summary>
public class Campaign
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    /// <summary>Rule system id, e.g. "pf1e". Fixed once the campaign has characters.</summary>
    public string RuleSystemId { get; set; } = "pf1e";
    public string? ImageUrl { get; set; }
    public string CreatedByUserId { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>Rule-system specific campaign options (XP track, optional rules, …).</summary>
    public string SettingsJson { get; set; } = "{}";
    public List<CampaignMember> Members { get; set; } = new();
}

public static class CampaignRoles
{
    public const string Gm = "GM";
    public const string Player = "Player";
}

public class CampaignMember
{
    public int CampaignId { get; set; }
    public string UserId { get; set; } = "";
    public AppUser? User { get; set; }
    /// <summary><see cref="CampaignRoles.Gm"/> (exactly one per campaign) or <see cref="CampaignRoles.Player"/>.</summary>
    public string Role { get; set; } = CampaignRoles.Player;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Invite link <c>/join/{Code}</c>. Also the only way to register a new account.</summary>
public class CampaignInvite
{
    public int Id { get; set; }
    public int CampaignId { get; set; }
    public string Code { get; set; } = "";
    public string CreatedByUserId { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public int? MaxUses { get; set; }
    public int Uses { get; set; }
    public bool Revoked { get; set; }
}

/// <summary>Data that always belongs to exactly one campaign.</summary>
public interface ICampaignOwned
{
    int CampaignId { get; set; }
}

/// <summary>Library data: <c>null</c> = shipped with the rule system (visible to every campaign of it),
/// otherwise homebrew of one campaign.</summary>
public interface ICampaignLibrary
{
    int? CampaignId { get; set; }
    /// <summary>Rule system of the row (shipped rows are filtered by the campaign's system).</summary>
    string RuleSystemId { get; set; }
    /// <summary>null = official/shipped row (admin import, seed); set = homebrew of a campaign member.</summary>
    string? CreatedByUserId { get; }
}
