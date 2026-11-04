using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;

namespace Foliant.Api.Services;

/// <summary>
/// The campaign a request runs in and the caller's role there. Resolved once per request by
/// <see cref="CampaignContextMiddleware"/>; the DbContext's global query filters read it, so every
/// query is scoped to this campaign without each controller having to remember it.
/// </summary>
public class CampaignContext
{
    public const string Header = "X-Campaign-Id";

    public int? CampaignId { get; private set; }
    public string? Role { get; private set; }
    /// <summary>Rule system of the campaign ("pf1e" when there is none).</summary>
    public string RuleSystemId { get; private set; } = "pf1e";
    public bool IsGm => Role == CampaignRoles.Gm;

    public void Set(int campaignId, string role, string ruleSystemId = "pf1e")
    {
        CampaignId = campaignId; Role = role; RuleSystemId = ruleSystemId;
    }

    /// <summary>SignalR group of all members of a campaign.</summary>
    public static string Group(int campaignId) => $"campaign:{campaignId}";
}

/// <summary>
/// Picks the campaign from the <c>X-Campaign-Id</c> header (must be a member, else 404) or, without
/// the header, the caller's oldest membership.
/// </summary>
public class CampaignContextMiddleware
{
    private readonly RequestDelegate _next;
    public CampaignContextMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext http, CampaignContext campaign, AppDbContext db)
    {
        var userId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId != null)
        {
            int? requested = int.TryParse(http.Request.Headers[CampaignContext.Header], out var id) ? id : null;
            var mine = db.CampaignMembers.AsNoTracking().Where(m => m.UserId == userId)
                .Join(db.Campaigns, m => m.CampaignId, c => c.Id, (m, c) => new { m.CampaignId, m.Role, m.JoinedAt, c.RuleSystemId });
            var member = requested != null
                ? await mine.FirstOrDefaultAsync(m => m.CampaignId == requested)
                : await mine.OrderBy(m => m.JoinedAt).ThenBy(m => m.CampaignId).FirstOrDefaultAsync();
            if (requested != null && member == null)
            {
                // 404, not 403: don't reveal whether a campaign id exists.
                http.Response.StatusCode = StatusCodes.Status404NotFound;
                await http.Response.WriteAsJsonAsync(new { message = "Campaign not found." });
                return;
            }
            if (member != null) campaign.Set(member.CampaignId, member.Role, member.RuleSystemId);
        }
        await _next(http);
    }
}

/// <summary>Only the GM of the current campaign may call this action.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class CampaignGmAttribute : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        if (!context.HttpContext.RequestServices.GetRequiredService<CampaignContext>().IsGm)
            context.Result = new ForbidResult();
    }
}
