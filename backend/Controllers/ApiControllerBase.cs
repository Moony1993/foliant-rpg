using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

public abstract class ApiControllerBase : ControllerBase
{
    protected string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    protected CampaignContext Campaign => HttpContext.RequestServices.GetRequiredService<CampaignContext>();
    /// <summary>GM of the current campaign (not a global role any more).</summary>
    protected bool IsGm => Campaign.IsGm;
    protected bool IsAdmin => User.IsInRole("Admin");
    /// <summary>Rule system of the current campaign.</summary>
    protected Domain.Rules.IRuleSystem CampaignRules =>
        HttpContext.RequestServices.GetRequiredService<Domain.Rules.RuleSystemRegistry>().For(Campaign.RuleSystemId);
}
