using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Dtos;
using Foliant.Api.Hubs;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("gm")]
public class GmController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;
    private readonly IHubContext<NotificationHub> _hub;
    private readonly CharacterMapper _mapper;
    public GmController(AppDbContext db, UserManager<AppUser> users, IHubContext<NotificationHub> hub, CharacterMapper mapper)
    {
        _db = db;
        _users = users;
        _hub = hub;
        _mapper = mapper;
    }

    /// <summary>User ids of the current campaign's members, optionally only one role.</summary>
    private Task<List<string>> CampaignMemberIds(string? role = null) =>
        _db.CampaignMembers.Where(m => m.CampaignId == Campaign.CampaignId && (role == null || m.Role == role))
            .Select(m => m.UserId).ToListAsync();

    /// <summary>GM dashboard: every character (players' and GMs' own) with full stats, inventory
    /// (unidentified items revealed) and active status effects.</summary>
    [CampaignGm]
    [HttpGet("characters")]
    public async Task<ActionResult<List<GmCharacterDto>>> Characters()
    {
        var chars = await _db.Characters.AsNoTracking()
            .Include(c => c.User)
            .Include(c => c.Items).ThenInclude(i => i.Template)
            .Include(c => c.SkillRanks)
            .OrderBy(c => c.User!.DisplayName).ThenBy(c => c.Name)
            .ToListAsync();
        var now = DateTime.UtcNow;
        var status = (await _db.StatusEffects.AsNoTracking()
                .Where(s => s.ExpiresAt == null || s.ExpiresAt > now).ToListAsync())
            .ToLookup(s => s.CharacterId);
        var roles = new Dictionary<string, string[]>();
        foreach (var u in chars.Select(c => c.User!).DistinctBy(u => u.Id))
            roles[u.Id] = (await _users.GetRolesAsync(u)).ToArray();
        return chars.Select(c => new GmCharacterDto(
            c.UserId, c.User!.DisplayName, roles[c.UserId], _mapper.ToDto(c, reveal: true),
            status[c.Id].Select(s => new StatusEffectDto(s.Id, s.Name, s.Description, s.Icon, s.Kind, s.ExpiresAt)).ToList()
        )).ToList();
    }

    /// <summary>Mark one inventory instance identified / unidentified. Notifies the owner on identify.</summary>
    [CampaignGm]
    [HttpPost("inventory/{itemId:int}/identify")]
    public async Task<IActionResult> Identify(int itemId, IdentifyRequest req)
    {
        var item = await _db.InventoryItems.Include(i => i.Template).Include(i => i.Character)
            .FirstOrDefaultAsync(i => i.Id == itemId);
        if (item == null) return NotFound();
        item.IsIdentified = req.Identified;
        await _db.SaveChangesAsync();
        if (req.Identified)
            await _hub.Clients.Group(item.Character!.UserId).SendAsync("notify", new
            {
                type = "item",
                title = "Item identified",
                message = $"{item.Character.Name}: {item.Template!.Name}",
                itemName = item.Template.Name,
                rarity = item.Template.Rarity.ToString(),
            });
        return NoContent();
    }

    /// <summary>Delete an item template from the system, incl. every inventory instance of it.
    /// Monsters referencing it just drop it (MonsterMapper skips unknown ids).</summary>
    [CampaignGm]
    [HttpDelete("items/{id:int}")]
    public async Task<IActionResult> DeleteItem(int id)
    {
        var t = await _db.ItemTemplates.FindAsync(id);
        if (t == null) return NotFound();
        if (t.CampaignId == null && !IsAdmin) return Forbid();   // shipped items are shared by all campaigns
        _db.InventoryItems.RemoveRange(_db.InventoryItems.Where(i => i.ItemTemplateId == id));
        _db.ItemTemplates.Remove(t);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [CampaignGm]
    [HttpGet("players")]
    public async Task<ActionResult<List<PlayerSummaryDto>>> Players()
    {
        // Members of the current campaign only.
        var memberIds = await CampaignMemberIds();
        var users = await _users.Users.AsNoTracking().Where(u => memberIds.Contains(u.Id)).ToListAsync();
        var allChars = await _db.Characters.AsNoTracking().ToListAsync();
        var charsByUser = allChars.GroupBy(c => c.UserId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var result = new List<PlayerSummaryDto>();
        foreach (var u in users)
        {
            var roles = await _users.GetRolesAsync(u);
            var chars = charsByUser.GetValueOrDefault(u.Id, new());
            result.Add(new PlayerSummaryDto(
                u.Id, u.DisplayName, u.UserName!, roles.ToArray(),
                NotificationHub.IsOnline(u.Id), chars.Count,
                chars.Select(c => new CharacterSummaryDto(c.Id, c.Name, c.Level)).ToList()));
        }
        return result;
    }

    [HttpPost("accounts")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateAccount(CreateAccountRequest req)
    {
        if (await _users.FindByNameAsync(req.Username) != null)
            return Conflict(new { message = "Username already taken." });
        if (!DbSeeder.Roles.Contains(req.Role))
            return BadRequest(new { message = "Unknown role." });

        var user = new AppUser
        {
            UserName = req.Username,
            DisplayName = req.DisplayName ?? req.Username,
            MustChangePassword = true,
        };
        var result = await _users.CreateAsync(user, req.TempPassword);
        if (!result.Succeeded)
            return BadRequest(new { errors = result.Errors.Select(e => e.Description) });
        await _users.AddToRoleAsync(user, req.Role);
        // ponytail: until invite links exist, an admin-created account joins the admin's current campaign.
        if (Campaign.CampaignId is int cid)
        {
            _db.CampaignMembers.Add(new CampaignMember { CampaignId = cid, UserId = user.Id, Role = CampaignRoles.Player });
            await _db.SaveChangesAsync();
        }
        return Ok(new { user.Id, user.UserName, user.DisplayName });
    }

    /// <summary>Delete a user account (Admin only). Their characters/notes cascade via FK.</summary>
    [HttpDelete("accounts/{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteAccount(string id)
    {
        if (id == UserId)
            return BadRequest(new { message = "You can't delete your own account." });
        var user = await _users.FindByIdAsync(id);
        if (user == null) return NotFound();
        var result = await _users.DeleteAsync(user);
        if (!result.Succeeded)
            return BadRequest(new { errors = result.Errors.Select(e => e.Description) });
        return NoContent();
    }

    /// <summary>Reset a user's password to a new temp value (Admin only); forces a change on next login.</summary>
    [HttpPost("accounts/{id}/reset-password")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ResetPassword(string id, ResetPasswordRequest req)
    {
        var user = await _users.FindByIdAsync(id);
        if (user == null) return NotFound();
        var token = await _users.GeneratePasswordResetTokenAsync(user);
        var result = await _users.ResetPasswordAsync(user, token, req.NewPassword);
        if (!result.Succeeded)
            return BadRequest(new { errors = result.Errors.Select(e => e.Description) });
        user.MustChangePassword = true;
        await _users.UpdateAsync(user);
        return NoContent();
    }

    [CampaignGm]
    [HttpPost("items")]
    public async Task<ActionResult<ItemTemplateDto>> CreateItem(CreateItemRequest req)
    {
        var t = new ItemTemplate
        {
            Name = req.Name,
            Description = req.Description,
            IconKey = req.IconKey,
            Weight = req.Weight,
            Value = req.Value,
            Rarity = req.Rarity,
            Category = req.Category,
            Slot = req.Slot,
            EffectsJson = req.EffectsJson,
            CreatedByUserId = UserId,
            DamageDice = req.DamageDice,
            DamageBonus = req.DamageBonus,
            CritRange = req.CritRange,
            CritMultiplier = req.CritMultiplier,
            BonusDamage = req.BonusDamage,
            WeaponKey = ValidWeaponKey(req.WeaponKey),
            ArmorType = req.ArmorType,
            SpellFailure = Math.Clamp(req.SpellFailure, 0, 100),
            RequiresAttunement = req.RequiresAttunement,
            AttackBonus = req.AttackBonus,
            // Usable is driven by category: consumables are always usable.
            IsUsable = req.Category == ItemCategory.Consumable,
            UseEffectsJson = req.UseEffectsJson,
            UseStatusEffectName = req.UseStatusEffectName,
            UseStatusEffectDescription = req.UseStatusEffectDescription,
            UseStatusEffectIcon = req.UseStatusEffectIcon,
            UseStatusEffectKind = req.UseStatusEffectKind,
            UseStatusEffectDurationMinutes = req.UseStatusEffectDurationMinutes,
        };
        _db.ItemTemplates.Add(t);
        await _db.SaveChangesAsync();
        return CharacterMapper.ToTemplateDto(t);
    }

    [CampaignGm]
    [HttpPut("items/{id:int}")]
    public async Task<ActionResult<ItemTemplateDto>> UpdateItem(int id, CreateItemRequest req)
    {
        var t = await _db.ItemTemplates.FindAsync(id);
        if (t == null) return NotFound();
        if (t.CampaignId == null && !IsAdmin) return Forbid();   // shipped items are shared by all campaigns
        t.Name = req.Name;
        t.Description = req.Description;
        t.IconKey = req.IconKey;
        t.Weight = req.Weight;
        t.Value = req.Value;
        t.Rarity = req.Rarity;
        t.Category = req.Category;
        t.Slot = req.Slot;
        t.EffectsJson = req.EffectsJson;
        t.DamageDice = req.DamageDice;
        t.DamageBonus = req.DamageBonus;
        t.CritRange = req.CritRange;
        t.CritMultiplier = req.CritMultiplier;
        t.BonusDamage = req.BonusDamage;
        t.WeaponKey = ValidWeaponKey(req.WeaponKey);
        t.ArmorType = req.ArmorType;
        t.SpellFailure = Math.Clamp(req.SpellFailure, 0, 100);
        t.RequiresAttunement = req.RequiresAttunement;
        t.AttackBonus = req.AttackBonus;
        t.IsUsable = req.Category == ItemCategory.Consumable;
        t.UseEffectsJson = req.UseEffectsJson;
        t.UseStatusEffectName = req.UseStatusEffectName;
        t.UseStatusEffectDescription = req.UseStatusEffectDescription;
        t.UseStatusEffectIcon = req.UseStatusEffectIcon;
        t.UseStatusEffectKind = req.UseStatusEffectKind;
        t.UseStatusEffectDurationMinutes = req.UseStatusEffectDurationMinutes;
        await _db.SaveChangesAsync();
        return CharacterMapper.ToTemplateDto(t);
    }

    [CampaignGm]
    [HttpGet("items")]
    public async Task<ActionResult<List<ItemTemplateDto>>> Items() =>
        (await _db.ItemTemplates.AsNoTracking().OrderBy(t => t.Name).ToListAsync())
            .Select(CharacterMapper.ToTemplateDto).ToList();

    [CampaignGm]
    [HttpPost("grant")]
    public async Task<IActionResult> Grant(GrantItemRequest req)
    {
        var template = await _db.ItemTemplates.FindAsync(req.ItemTemplateId);
        if (template == null) return BadRequest(new { message = "Unknown item template." });

        List<Character> characters;
        if (req.ToAll)
        {
            var playerIds = (await CampaignMemberIds(CampaignRoles.Player)).ToHashSet();
            characters = await _db.Characters.Where(c => playerIds.Contains(c.UserId)).ToListAsync();
        }
        else
        {
            characters = await _db.Characters.Where(c => req.CharacterIds.Contains(c.Id)).ToListAsync();
        }

        int qty = Math.Max(1, req.Quantity);
        foreach (var character in characters)
        {
            int nextGrid = await _db.InventoryItems.Where(i => i.CharacterId == character.Id)
                .Select(i => (int?)i.GridIndex).MaxAsync() ?? -1;
            _db.InventoryItems.Add(new InventoryItem
            {
                CharacterId = character.Id,
                ItemTemplateId = template.Id,
                Quantity = qty,
                GridIndex = nextGrid + 1,
                IsIdentified = !req.Unidentified,
            });
            _db.Messages.Add(new Message
            {
                SenderId = UserId,
                RecipientId = character.UserId,
                Subject = "You received an item",
                Body = $"The GM sent {character.Name}: {(req.Unidentified ? "an unidentified item" : template.Name)} x{qty}.",
                IsImportant = !req.Unidentified && template.Rarity >= Rarity.Epic,
            });
        }
        await _db.SaveChangesAsync();

        // Real-time push to each affected owner (a player may own several targeted characters).
        foreach (var userId in characters.Select(c => c.UserId).Distinct())
            await _hub.Clients.Group(userId).SendAsync("notify", new
            {
                type = "item",
                title = "Item received",
                message = req.Unidentified ? "You received an unidentified item." : $"You received {template.Name}.",
                itemName = req.Unidentified ? "???" : template.Name,
                rarity = req.Unidentified ? nameof(Rarity.Common) : template.Rarity.ToString(),
            });

        return Ok(new { recipients = characters.Count, delivered = characters.Count });
    }

    [CampaignGm]
    [HttpPost("gold")]
    public async Task<IActionResult> GrantGold(GrantGoldRequest req)
    {
        var recipients = req.ToAll
            ? (await CampaignMemberIds(CampaignRoles.Player)).ToArray()
            : req.RecipientUserIds;

        int credited = 0;
        foreach (var userId in recipients.Distinct())
        {
            // ponytail: credits the player's first character (same rule as item grants).
            var character = await _db.Characters
                .Where(c => c.UserId == userId).OrderBy(c => c.Id).FirstOrDefaultAsync();
            if (character != null)
            {
                character.Gold += req.Amount;
                credited++;
            }
            _db.Messages.Add(new Message
            {
                SenderId = UserId,
                RecipientId = userId,
                Subject = req.Amount >= 0 ? "Du hast Gold erhalten" : "Dir wurde Gold abgezogen",
                Body = $"The GM changed your gold by {req.Amount}.",
            });
        }
        await _db.SaveChangesAsync();

        foreach (var userId in recipients.Distinct())
            await _hub.Clients.Group(userId).SendAsync("notify", new
            {
                type = "gold",
                title = req.Amount >= 0 ? "Gold erhalten" : "Gold abgezogen",
                message = $"{(req.Amount >= 0 ? "+" : "")}{req.Amount} 🪙",
            });

        return Ok(new { recipients = recipients.Distinct().Count(), credited });
    }

    [CampaignGm]
    [HttpPost("levelup")]
    public async Task<IActionResult> GrantLevelUp(GrantLevelUpRequest req)
    {
        var character = await _db.Characters.Include(c => c.User)
            .Include(c => c.Items).ThenInclude(i => i.Template)   // items feed max HP (Con, +HP)
            .FirstOrDefaultAsync(c => c.Id == req.CharacterId);
        if (character == null) return NotFound(new { message = "Character not found." });

        int maxBefore = _mapper.MaxHp(character);
        character.Level += 1;
        character.PendingLevelUp = true;
        _mapper.HpFollowsMax(character, maxBefore);

        _db.Messages.Add(new Message
        {
            SenderId = UserId,
            RecipientId = character.UserId,
            IsImportant = true,
            Subject = $"Level Up! Du bist jetzt Level {character.Level}",
            Body = $"The GM raised {character.Name} to level {character.Level}. " +
                   "Assign your new skill points and have a look at your new class features!",
        });
        await _db.SaveChangesAsync();

        await _hub.Clients.Group(character.UserId).SendAsync("notify", new
        {
            type = "levelup",
            title = $"Level Up! 🎉",
            message = $"{character.Name} is now level {character.Level}!",
            characterId = character.Id,
            newLevel = character.Level,
        });

        return Ok(new { characterId = character.Id, newLevel = character.Level });
    }

    // ---- Monsters (GM bestiary) ----

    /// <summary>
    /// Take back a level (e.g. a level up given to the wrong character). Level-bound choices shrink with it:
    /// favored class bonuses and skill ranks are capped at the new level; ability increases, feat slots and
    /// class-feature picks follow the level automatically (extra feats show as "doesn't fit" to the player).
    /// </summary>
    [CampaignGm]
    [HttpPost("leveldown")]
    public async Task<IActionResult> LevelDown(GrantLevelUpRequest req)
    {
        var character = await _db.Characters.Include(c => c.SkillRanks)
            .Include(c => c.Items).ThenInclude(i => i.Template)
            .FirstOrDefaultAsync(c => c.Id == req.CharacterId);
        if (character == null) return NotFound(new { message = "Character not found." });
        if (character.Level <= 1) return BadRequest(new { message = "Level 1 is the minimum." });

        int maxBefore = _mapper.MaxHp(character);
        character.Level -= 1;
        character.PendingLevelUp = false;
        int level = character.Level;
        // Favored class bonus: one per level (HP or skill rank) — drop the newest skill pick first.
        if (character.FavoredClassHp + character.FavoredClassSkill > level)
            character.FavoredClassSkill = Math.Max(0, level - character.FavoredClassHp);
        character.FavoredClassHp = Math.Min(character.FavoredClassHp, level);
        // Max ranks per skill = character level.
        foreach (var s in character.SkillRanks.Where(s => s.Ranks > level)) s.Ranks = level;
        _mapper.HpFollowsMax(character, maxBefore);

        _db.Messages.Add(new Message
        {
            SenderId = UserId,
            RecipientId = character.UserId,
            IsImportant = true,
            Subject = $"Level reset: {character.Name} is now level {level}",
            Body = $"The GM reset {character.Name} to level {level}. " +
                   "Please check skill ranks and feats — whatever no longer fits is marked.",
        });
        await _db.SaveChangesAsync();
        await _hub.Clients.Group(character.UserId).SendAsync("notify", new
        {
            type = "leveldown",
            title = "Level reset",
            message = $"{character.Name} is now level {level}.",
            characterId = character.Id,
            newLevel = level,
        });
        return Ok(new { characterId = character.Id, newLevel = level });
    }

    [CampaignGm]
    [HttpGet("monsters")]
    public async Task<ActionResult<List<MonsterDto>>> Monsters()
    {
        var monsters = await _db.Monsters.AsNoTracking().OrderBy(m => m.Name).ToListAsync();
        // Load every referenced template once, then map from the lookup.
        var ids = monsters.SelectMany(MonsterMapper.ItemIds).Distinct().ToList();
        var templates = await _db.ItemTemplates.AsNoTracking()
            .Where(t => ids.Contains(t.Id)).ToDictionaryAsync(t => t.Id);
        return monsters.Select(m => MonsterMapper.ToDto(m, EquippedFor(m, templates))).ToList();
    }

    [CampaignGm]
    [HttpPost("monsters")]
    public async Task<ActionResult<MonsterDto>> CreateMonster(MonsterInput req)
    {
        var m = new Monster();
        MonsterMapper.Apply(m, req, UserId);
        _db.Monsters.Add(m);
        await _db.SaveChangesAsync();
        return MonsterMapper.ToDto(m, await LoadEquipped(m));
    }

    [CampaignGm]
    [HttpPut("monsters/{id:int}")]
    public async Task<ActionResult<MonsterDto>> UpdateMonster(int id, MonsterInput req)
    {
        var m = await _db.Monsters.FindAsync(id);
        if (m == null) return NotFound();
        MonsterMapper.Apply(m, req, m.CreatedByUserId);
        await _db.SaveChangesAsync();
        return MonsterMapper.ToDto(m, await LoadEquipped(m));
    }

    [CampaignGm]
    [HttpDelete("monsters/{id:int}")]
    public async Task<IActionResult> DeleteMonster(int id)
    {
        var m = await _db.Monsters.FindAsync(id);
        if (m == null) return NotFound();
        _db.Monsters.Remove(m);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Adjust a monster's current HP by a delta (damage/heal), clamped to [0, effective max].</summary>
    [CampaignGm]
    [HttpPost("monsters/{id:int}/hp")]
    public async Task<ActionResult<MonsterDto>> AdjustMonsterHp(int id, HpUpdateRequest req)
    {
        var m = await _db.Monsters.FindAsync(id);
        if (m == null) return NotFound();
        var equipped = await LoadEquipped(m);
        int effMax = m.MaxHp + MonsterMapper.SumEffects(equipped.Select(t => t.EffectsJson)).GetValueOrDefault("MaxHp");
        m.CurrentHp = Math.Clamp(m.CurrentHp + req.Delta, 0, effMax);
        await _db.SaveChangesAsync();
        return MonsterMapper.ToDto(m, equipped);
    }

    private async Task<List<ItemTemplate>> LoadEquipped(Monster m)
    {
        var ids = MonsterMapper.ItemIds(m);
        return await _db.ItemTemplates.AsNoTracking().Where(t => ids.Contains(t.Id)).ToListAsync();
    }

    private static List<ItemTemplate> EquippedFor(Monster m, IReadOnlyDictionary<int, ItemTemplate> templates) =>
        MonsterMapper.ItemIds(m).Where(templates.ContainsKey).Select(id => templates[id]).ToList();

    /// <summary>Only base weapons of the campaign's rule system are stored (anything else = no base weapon).</summary>
    private string? ValidWeaponKey(string? key) =>
        key != null && CampaignRules.Capability<Domain.Rules.IWeaponRules>()?.Weapon(key) != null ? key : null;
}
