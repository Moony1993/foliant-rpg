namespace Foliant.Api.Domain;

/// <summary>An installed rule package (instance-wide, admin only). The original file is kept so it can
/// be exported again byte for byte and re-checked on every start.</summary>
public class RulePackageRecord
{
    public int Id { get; set; }
    public string PackageId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string License { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public byte[] Data { get; set; } = Array.Empty<byte>();
    public string InstalledByUserId { get; set; } = "";
    public DateTime InstalledAt { get; set; } = DateTime.UtcNow;
}
