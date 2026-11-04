using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Foliant.Api.Services;

/// <summary>
/// Stores uploaded images. Uses Azure Blob Storage when a connection string is configured,
/// otherwise falls back to local wwwroot/uploads (dev). Returns an absolute URL either way.
/// </summary>
public class MediaStorage
{
    private readonly IConfiguration _cfg;
    private readonly IWebHostEnvironment _env;
    public MediaStorage(IConfiguration cfg, IWebHostEnvironment env)
    {
        _cfg = cfg;
        _env = env;
    }

    private string? Conn => _cfg["Storage:Connection"];
    private const string Container = "media";

    public async Task<string> SaveAsync(Stream content, string originalName, string contentType, HttpRequest req)
    {
        var ext = Path.GetExtension(originalName);
        var name = $"{Guid.NewGuid():N}{ext}";

        if (!string.IsNullOrWhiteSpace(Conn))
        {
            var container = new BlobContainerClient(Conn, Container);
            await container.CreateIfNotExistsAsync(PublicAccessType.Blob);
            var blob = container.GetBlobClient(name);
            await blob.UploadAsync(content, new BlobHttpHeaders { ContentType = contentType });
            return blob.Uri.ToString();
        }

        // Local dev fallback.
        var dir = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"), "uploads");
        Directory.CreateDirectory(dir);
        await using (var fs = File.Create(Path.Combine(dir, name)))
            await content.CopyToAsync(fs);
        return $"{req.Scheme}://{req.Host}/uploads/{name}";
    }

    /// <summary>
    /// Reads back an image this storage handed out (for campaign export). Returns null for foreign
    /// URLs or missing files. Only the file name is used, and it must look like one we generate,
    /// so a crafted URL can't read other files.
    /// </summary>
    public async Task<(byte[] Data, string Extension)?> TryReadAsync(string url, HttpRequest req)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;
        var name = Path.GetFileName(uri.AbsolutePath);
        if (!System.Text.RegularExpressions.Regex.IsMatch(name, @"^[0-9a-f]{32}\.[A-Za-z0-9]{1,5}$")) return null;

        if (!string.IsNullOrWhiteSpace(Conn))
        {
            var blob = new BlobContainerClient(Conn, Container).GetBlobClient(name);
            if (!string.Equals(uri.Host, blob.Uri.Host, StringComparison.OrdinalIgnoreCase) || !await blob.ExistsAsync()) return null;
            return ((await blob.DownloadContentAsync()).Value.Content.ToArray(), Path.GetExtension(name));
        }

        if (!string.Equals(uri.Authority, req.Host.Value, StringComparison.OrdinalIgnoreCase) || !uri.AbsolutePath.StartsWith("/uploads/")) return null;
        var path = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"), "uploads", name);
        return File.Exists(path) ? (await File.ReadAllBytesAsync(path), Path.GetExtension(name)) : null;
    }
}
