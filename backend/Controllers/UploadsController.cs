using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("uploads")]
public class UploadsController : ApiControllerBase
{
    private readonly MediaStorage _media;
    public UploadsController(MediaStorage media) => _media = media;

    private static readonly string[] Allowed = { "image/png", "image/jpeg", "image/webp", "image/gif" };

    // Returns { url }. Used for character portraits and item icons.
    [HttpPost("image")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> Image(IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest(new { message = "No file." });
        if (!Allowed.Contains(file.ContentType)) return BadRequest(new { message = "Only image files are allowed." });

        await using var stream = file.OpenReadStream();
        var url = await _media.SaveAsync(stream, file.FileName, file.ContentType, Request);
        return Ok(new { url });
    }

    /// <summary>Battle map images (GM): larger than portraits, up to 20 MB.</summary>
    [HttpPost("map")]
    [CampaignGm]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public Task<IActionResult> Map(IFormFile file) => Image(file);
}
