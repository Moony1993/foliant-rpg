using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Foliant.Api.Domain.Rules;

namespace Foliant.Api.Controllers;

// Rule metadata for the UI (races, abilities, …) of the current campaign's rule system.
[ApiController]
[Authorize]
[Route("rules")]
public class RulesController : ApiControllerBase
{
    private IRuleSystem System => CampaignRules;

    /// <summary>What the client shows for the campaign's rule system, plus which optional parts it has
    /// (the client hides pages for missing ones).</summary>
    [HttpGet("layout")]
    public object Layout()
    {
        var caps = new List<string>();
        if (System.Capability<IFeatRules>() != null) caps.Add("feats");
        if (System.Capability<IWeaponRules>() != null) caps.Add("weapons");
        if (System.Capability<ISkillRankRules>() != null) caps.Add("skillRanks");
        else if (System.Capability<ISkillValueRules>() != null) caps.Add("skillProficiency");
        if (System.Capability<ISpellSpecialRules>() != null) caps.Add("spellSpecials");
        if (System.Capability<ICompanionRules>() != null) caps.Add("companions");
        if (System.Capability<IAbilityIncreaseRules>() != null) caps.Add("abilityIncreases");
        if (System.Capability<IAttunementRules>() is { AttunementLimit: > 0 }) caps.Add("attunement");
        return new { layout = System.Layout, capabilities = caps };
    }

    [HttpGet("races")]
    public ActionResult<IReadOnlyList<RaceDef>> Races() => Ok(System.Races);

    [HttpGet("abilities")]
    public ActionResult<IReadOnlyList<string>> Abilities() => Ok(System.AbilityKeys);

    /// <summary>Base weapons (key, name, category, handedness) — choices for Weapon Focus &amp; co. and items.
    /// Empty when the rule system has no weapon list.</summary>
    [HttpGet("weapons")]
    public ActionResult<IReadOnlyList<WeaponDef>> Weapons() =>
        Ok(System.Capability<IWeaponRules>()?.Weapons ?? Array.Empty<WeaponDef>());

    /// <summary>Skill list — choices for item skill bonuses ("Skill:&lt;key&gt;").</summary>
    [HttpGet("skills")]
    public ActionResult<IReadOnlyList<SkillDef>> Skills() => Ok(System.Skills);

    [HttpGet("features/{className}")]
    public ActionResult<IReadOnlyList<ClassFeature>> Features(string className) =>
        Ok(System.ClassFeatures(className));
}
