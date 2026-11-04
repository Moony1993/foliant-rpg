using System.ComponentModel.DataAnnotations;
using Foliant.Api.Domain;
using Foliant.Api.Domain.Rules;

namespace Foliant.Api.Dtos;

// ---- Auth ----
public record LoginRequest([Required] string Username, [Required] string Password);
public record LoginResponse(string Token, string UserId, string DisplayName, string[] Roles, bool MustChangePassword);
public record ChangePasswordRequest([Required] string CurrentPassword, [Required, MinLength(6)] string NewPassword);

// ---- Characters ----
public record CharacterInput
{
    [Required, MaxLength(100)] public string Name { get; init; } = "";
    public string Race { get; init; } = "";
    public string Class { get; init; } = "";
    [Range(1, 30)] public int Level { get; init; } = 1;
    public int Xp { get; init; }
    public string Background { get; init; } = "";
    public string Alignment { get; init; } = "";
    public string Description { get; init; } = "";
    public int Age { get; init; }
    public int Height { get; init; }
    public int Weight { get; init; }
    public string? PortraitUrl { get; init; }
    [Range(1, 40)] public int Str { get; init; } = 10;
    [Range(1, 40)] public int Dex { get; init; } = 10;
    [Range(1, 40)] public int Con { get; init; } = 10;
    [Range(1, 40)] public int Int { get; init; } = 10;
    [Range(1, 40)] public int Wis { get; init; } = 10;
    [Range(1, 40)] public int Cha { get; init; } = 10;
    public int CurrentHp { get; init; }
    public int CurrentMana { get; init; }
    public int Gold { get; init; }
    public string RuleSystemId { get; init; } = "pf1e";
    public string Size { get; init; } = "Medium";
    [Range(5, 120)] public int Speed { get; init; } = 30;
    public string? RaceKey { get; init; }
    public string? RaceBonusAbility { get; init; }
    [Range(0, 30)] public int FavoredClassHp { get; init; }
    [Range(0, 30)] public int FavoredClassSkill { get; init; }
    /// <summary>Scores by the rule package's ability keys; overrides Str…Cha and holds abilities beyond those six.</summary>
    public Dictionary<string, int>? Abilities { get; init; }
    /// <summary>Further classes after <see cref="Class"/>; the primary class has the remaining levels. null = unchanged.</summary>
    public List<Foliant.Api.Domain.Rules.Engine.ClassLevel>? Multiclass { get; init; }
}

public record CharacterDto(
    int Id, string Name, string Race, string Class, int Level, int Xp,
    string Background, string Alignment, string Description, int Age, int Height, int Weight,
    string? PortraitUrl, int Str, int Dex, int Con, int Int, int Wis, int Cha,
    int CurrentHp, int CurrentMana, int Gold, string RuleSystemId,
    DerivedStats Derived, List<InventoryItemDto> Items,
    string Size, int Speed, string? RaceKey, string? RaceBonusAbility,
    bool PendingLevelUp = false,
    Dictionary<string, string>? FeatureChoices = null,
    List<int>? FeatIds = null,
    int FavoredClassHp = 0, int FavoredClassSkill = 0,
    List<Foliant.Api.Domain.Rules.FeatSlot>? FeatSlots = null,
    List<string>? GrantedFeats = null,
    List<Foliant.Api.Domain.Rules.CharacterFeat>? Feats = null,
    List<string>? ProficientWeapons = null,
    List<string>? AbilityIncreases = null,
    int TempHp = 0,
    Dictionary<string, int>? Abilities = null,
    List<Foliant.Api.Domain.Rules.Engine.ClassLevel>? Multiclass = null);

public record InventoryItemDto(
    int Id, int ItemTemplateId, int Quantity, int GridIndex, string? EquippedSlot,
    ItemTemplateDto Template, bool IsIdentified = true, bool Attuned = false);

public record ItemTemplateDto(
    int Id, string Name, string Description, string IconKey, double Weight, int Value,
    string Rarity, string Category, string? Slot, string EffectsJson,
    string DamageDice, int DamageBonus, int CritRange, int CritMultiplier,
    bool IsUsable, string UseEffectsJson, string? UseStatusEffectName, string UseStatusEffectDescription,
    string UseStatusEffectIcon, string UseStatusEffectKind, int? UseStatusEffectDurationMinutes,
    string BonusDamage = "", string? WeaponKey = null, string ArmorType = "None", int SpellFailure = 0, int AttackBonus = 0,
    bool RequiresAttunement = false);

// ---- Inventory / Equipment ----
public record AddItemRequest(int ItemTemplateId, int Quantity, int GridIndex);
public record MoveItemRequest(int InventoryItemId, int GridIndex);
public record EquipRequest(int InventoryItemId, EquipSlot Slot);
public record UnequipRequest(int InventoryItemId);
public record HpUpdateRequest(int Delta);
public record HpResult(int CurrentHp, int TempHp);
public record TempHpRequest([Range(0, 999)] int Value);
public record GoldSpendRequest(int Amount);

// ---- GM ----
public record CreateAccountRequest(
    [Required] string Username, [Required, MinLength(6)] string TempPassword,
    string? DisplayName, string Role = "Player");
public record CreateItemRequest(
    [Required] string Name, string Description, string IconKey, double Weight, int Value,
    Rarity Rarity, ItemCategory Category, EquipSlot? Slot, string EffectsJson = "{}",
    string DamageDice = "", int DamageBonus = 0, int CritRange = 20, int CritMultiplier = 2,
    bool IsUsable = false, string UseEffectsJson = "{}", string? UseStatusEffectName = null,
    string UseStatusEffectDescription = "", string UseStatusEffectIcon = "✨",
    string UseStatusEffectKind = "buff", int? UseStatusEffectDurationMinutes = null,
    string BonusDamage = "", string? WeaponKey = null, ArmorType ArmorType = ArmorType.None, int SpellFailure = 0,
    int AttackBonus = 0, bool RequiresAttunement = false);
public record AttuneRequest(bool Attuned);
public record ResetPasswordRequest([Required, MinLength(6)] string NewPassword);
public record GrantLevelUpRequest(int CharacterId);
public record FeatureChoiceRequest(string Feature, string? Option);
public record AbilityIncreasesRequest(List<string> Abilities);
public record ToggleRequest(string Key, bool Active);
public record ResourceRequest(string Key, int Used);

// ---- Battle maps ----
public record MapWallDto(double X1, double Y1, double X2, double Y2, bool Door = false, bool Open = false);
/// <param name="Kind">character | monster | object</param>
/// <param name="RefId">Character or monster id for character/monster tokens.</param>
/// <param name="Hidden">GM only (traps, ambushes) — never sent to players.</param>
public record MapTokenDto(string Id, string Kind, int? RefId, string Label, string Icon, int X, int Y, int Size = 1, bool Hidden = false, string? ImageUrl = null);
public record BattleMapDto(int Id, string Name, string ImageUrl, int ImageWidth, int ImageHeight,
    double GridSize, double GridOffsetX, double GridOffsetY, List<MapWallDto> Walls, List<MapTokenDto> Tokens,
    List<string> Revealed, bool Fog, bool IsActive, DateTime UpdatedAt, bool ShowGrid);
public record CreateMapRequest([Required, MaxLength(100)] string Name, [Required, MaxLength(500)] string ImageUrl, int ImageWidth = 0, int ImageHeight = 0,
    [Range(8, 1000)] double GridSize = 70, double GridOffsetX = 0, double GridOffsetY = 0, bool ShowGrid = true);
public record SaveMapRequest([Required, MaxLength(100)] string Name, int ImageWidth, int ImageHeight,
    [Range(8, 1000)] double GridSize, double GridOffsetX, double GridOffsetY,
    List<MapWallDto> Walls, List<MapTokenDto> Tokens, List<string> Revealed, bool Fog, bool IsActive, bool ShowGrid = true);
public record MoveTokenRequest(int X, int Y);
public record MapAssetDto(int Id, string Name, string Category, string Icon, string? ImageUrl, int Size, bool Hidden, string CreatedByName);
public record SaveMapAssetRequest([Required, MaxLength(60)] string Name, [MaxLength(40)] string Category, [MaxLength(16)] string Icon,
    [MaxLength(500)] string? ImageUrl, [Range(1, 4)] int Size, bool Hidden);
public record CharacterSummaryDto(int Id, string Name, int Level);
public record GrantItemRequest(int ItemTemplateId, int Quantity, int[] CharacterIds, bool ToAll = false, bool Unidentified = false);
public record IdentifyRequest(bool Identified);
/// <summary>GM dashboard row: a character with its owner, full stats/inventory and status effects.</summary>
public record GmCharacterDto(string OwnerId, string OwnerName, string[] OwnerRoles, CharacterDto Character, List<StatusEffectDto> StatusEffects);
public record BugReportRequest([Required, MaxLength(4000)] string Text, [MaxLength(300)] string Page = "");
public record GrantGoldRequest(int Amount, string[] RecipientUserIds, bool ToAll = false);
public record PlayerSummaryDto(string UserId, string DisplayName, string Username, string[] Roles, bool Online, int CharacterCount, List<CharacterSummaryDto> Characters);

// ---- Monsters (GM bestiary) ----
public record MonsterSkillDto(string Name, int Bonus);
public record MonsterAttackDto(string Name, string DamageDice, int Bonus, int CritRange = 20, int CritMultiplier = 2);
public record MonsterInput
{
    [Required, MaxLength(100)] public string Name { get; init; } = "";
    public string Size { get; init; } = "Medium";
    public string Type { get; init; } = "";
    public string Description { get; init; } = "";
    public int MaxHp { get; init; }
    public int CurrentHp { get; init; }
    public int Ac { get; init; } = 10;
    [Range(0, 240)] public int Speed { get; init; } = 30;
    [Range(1, 60)] public int Str { get; init; } = 10;
    [Range(1, 60)] public int Dex { get; init; } = 10;
    [Range(1, 60)] public int Con { get; init; } = 10;
    [Range(1, 60)] public int Int { get; init; } = 10;
    [Range(1, 60)] public int Wis { get; init; } = 10;
    [Range(1, 60)] public int Cha { get; init; } = 10;
    public int Fort { get; init; }
    public int Ref { get; init; }
    public int Will { get; init; }
    public List<MonsterSkillDto> Skills { get; init; } = new();
    public List<MonsterAttackDto> Attacks { get; init; } = new();
    public List<int> ItemTemplateIds { get; init; } = new();
}
public record MonsterDto(
    int Id, string Name, string Size, string Type, string Description,
    int MaxHp, int CurrentHp, int Ac, int Speed,
    int Str, int Dex, int Con, int Int, int Wis, int Cha,
    int Fort, int Ref, int Will,
    List<MonsterSkillDto> Skills, List<MonsterAttackDto> Attacks, List<int> ItemTemplateIds,
    // effective values (base + equipped item bonuses)
    int EffMaxHp, int EffAc, int EffStr, int EffDex, int EffCon, int EffInt, int EffWis, int EffCha,
    int EffFort, int EffRef, int EffWill,
    List<MonsterAttackDto> EffAttacks, List<ItemTemplateDto> EquippedItems);

// ---- Skills ----
public record SkillInput
{
    [Required, MaxLength(100)] public string Name { get; init; } = "";
    public string Description { get; init; } = "";
    public string Type { get; init; } = "";
    [Range(1, 20)] public int Rank { get; init; } = 1;
    [Range(1, 20)] public int MaxRank { get; init; } = 1;
    public int Cooldown { get; init; }
    public bool IsPassive { get; init; }
    public bool Unlocked { get; init; }
    public int? RequiresSkillId { get; init; }
    public int Tier { get; init; }
}
public record SkillDto(int Id, string Name, string Description, string Type, int Rank, int MaxRank,
    int Cooldown, bool IsPassive, bool Unlocked, int? RequiresSkillId, int Tier);

// ---- Spells ----
public record SpellInput
{
    [Required, MaxLength(100)] public string Name { get; init; } = "";
    public string Description { get; init; } = "";
    [Range(0, 9)] public int Grade { get; init; }
    public string Damage { get; init; } = "";
    public string Range { get; init; } = "";
    public string Cost { get; init; } = "";
    public string Duration { get; init; } = "";
    public bool Prepared { get; init; }
    [MaxLength(60)] public string School { get; init; } = "";
    [MaxLength(100)] public string SavingThrow { get; init; } = "";
    /// <summary>Spellbook (casting class) the spell belongs to; "" = the first class that casts.</summary>
    [MaxLength(64)] public string ClassId { get; init; } = "";
}
public record SpellDto(int Id, string Name, string Description, int Grade, string Damage,
    string Range, string Cost, string Duration, bool Prepared, string School = "", string SavingThrow = "", string ClassId = "");

public record SpellSlotDto(int Grade, int Total, int Used, string? ClassId = null);

// ---- Ammunition ----
/// <summary>One kind of ammunition. Bonuses are on top of the weapon's own (PF1e: ammunition uses
/// the bow's damage dice; magic/material arrows add bonuses or extra damage).</summary>
public record AmmoDto(
    [Required, MaxLength(40)] string Id,
    [Required, MaxLength(60)] string Name,
    [Range(0, 9999)] int Count,
    [Range(-10, 10)] int AttackBonus,
    [Range(-10, 10)] int DamageBonus,
    [MaxLength(60)] string ExtraDamage,
    [MaxLength(200)] string Notes);

// ---- Spell tracker ----
/// <summary>One prepared slot: the spell in it (null = empty) and whether it was cast.</summary>
public record PreparedSlotDto(int? SpellId, bool Used);
/// <summary>Prepared casters use <c>Prepared</c> (grade → slots in order; the last
/// <c>Special</c> slots of a grade are the domain/school slots). Spontaneous casters use
/// <c>Used</c> (grade → slots spent). Rest = all Used flags/counts back to 0.
/// <c>Classes</c>: the same per further casting class (classId → its state); the top level belongs to the first.</summary>
public record SpellStateDto(Dictionary<int, List<PreparedSlotDto>> Prepared, Dictionary<int, int> Used,
    int PerformanceRoundsUsed = 0,   // bard: bardic performance rounds spent today (reset by rest)
    Dictionary<string, SpellStateDto>? Classes = null,
    Dictionary<int, int>? SharedUsed = null);   // slots spent from a pool several classes share (5e multiclassing)
/// <summary>Known: spontaneous casters' spells-known limit for that grade (null otherwise).</summary>
public record SpellGradeDto(int Grade, int Total, int Special, int? Known);
/// <summary>Type: "prepared", "spontaneous" or null (non-caster).</summary>
/// <param name="CastingMod">Modifier of the spellcasting ability (DC = 10 + grade + mod, + Spell Focus).</param>
/// <param name="SpecialSpellIds">Spells allowed in the domain/school slot; null = any.</param>
/// <param name="OppositionSpellIds">Spells of a wizard's opposition schools (take two slots to prepare).</param>
/// <param name="BloodlineSpellIds">Sorcerer bloodline spells (known in addition to the table).</param>
public record SpellbookDto(string? Type, List<SpellGradeDto> Grades, SpellStateDto State,
    string? CastingAbility = null, int CastingMod = 0, int CasterLevel = 0,
    List<int>? SpecialSpellIds = null, List<int>? OppositionSpellIds = null, List<int>? BloodlineSpellIds = null,
    Foliant.Api.Domain.Rules.Engine.EnginePerformance? Performance = null,
    string? ClassId = null, List<string>? Classes = null,
    bool Shared = false);   // the slots are a pool shared with other casting classes

// ---- Spell compendium ----
public record CompendiumSpellDto(int Id, string Name, string School, int Grade, string Description,
    string Range, string Duration, string CastingTime, string Components, string SavingThrow, string Damage,
    string? CreatedByUserId = null, string CreatedByName = "", Dictionary<string, int>? ClassLevels = null, string Source = "");
/// <summary>Homebrew spell created by a player/GM; visible to everyone in the compendium.</summary>
public record CreateSpellRequest(
    [Required, MaxLength(100)] string Name, [MaxLength(60)] string School, [MaxLength(4000)] string Description,
    [MaxLength(100)] string Range, [MaxLength(100)] string Duration, [MaxLength(100)] string CastingTime,
    [MaxLength(100)] string Components, [MaxLength(100)] string SavingThrow, [MaxLength(100)] string Damage,
    [Required, MinLength(1)] Dictionary<string, int> ClassLevels);
public record ImportSpellDto(string Name, string School, string Description, string Range, string Duration,
    string CastingTime, string Components, string SavingThrow, string Damage, Dictionary<string, int> ClassLevels,
    string? Source = null);

// ---- Feats ----
public record FeatDto(int Id, string Name, string Type, string Prerequisites, string Benefit, string Source,
    string? CreatedByUserId = null, string CreatedByName = "");
/// <summary>Homebrew feat created by a player/GM; visible to everyone in the compendium.</summary>
public record CreateFeatRequest(
    [Required, MaxLength(100)] string Name, [MaxLength(60)] string Type,
    [MaxLength(1000)] string Prerequisites, [Required, MaxLength(4000)] string Benefit);
public record ImportFeatDto(string Name, string Type, string Prerequisites, string Benefit, string Source);
/// <param name="Choice">Weapon, skill key or spell school for feats like Weapon Focus; on remove, which instance.</param>
public record FeatSelectRequest(int FeatId, bool Add, string? Choice = null);

// ---- Messages ----
public record MessageDto(int Id, string SenderName, string Subject, string Body,
    bool IsImportant, bool IsRead, bool IsArchived, DateTime SentAt, DateTime? ScheduledFor);
public record ComposeMessageRequest(
    [Required] string Subject, string Body, string[] RecipientUserIds, bool ToAll = false,
    bool IsImportant = false, DateTime? ScheduledFor = null);
public record RecipientDto(string UserId, string DisplayName, bool IsGm = false);

// ---- Status effects ----
public record StatusEffectInput
{
    [Required, MaxLength(60)] public string Name { get; init; } = "";
    public string Description { get; init; } = "";
    public string Icon { get; init; } = "✨";
    public string Kind { get; init; } = "buff";
    public DateTime? ExpiresAt { get; init; }
}
public record StatusEffectDto(int Id, string Name, string Description, string Icon, string Kind, DateTime? ExpiresAt);

// ---- Companions ----
public record CompanionInput
{
    [Required, MaxLength(80)] public string Name { get; init; } = "";
    public string Type { get; init; } = "Begleiter";
    public string Description { get; init; } = "";
    public int Hp { get; init; }
    public int Ac { get; init; }
    public int Speed { get; init; }
}
/// <param name="Bond">Class companion numbers (animal companion, familiar, bonded mount) at the master's level.</param>
/// <param name="BondLost">A class companion whose class feature choice no longer grants it.</param>
public record CompanionDto(int Id, string Name, string Type, string Description, int Hp, int Ac, int Speed,
    Foliant.Api.Domain.Rules.CompanionBond? Bond = null, bool BondLost = false);

// ---- Notes ----
public record NoteInput
{
    [Required, MaxLength(120)] public string Title { get; init; } = "";
    public string Content { get; init; } = "";
    public string Color { get; init; } = "zinc";
    public bool IsPinned { get; init; }
}
public record NoteDto(int Id, string Title, string Content, string Color, bool IsPinned, DateTime CreatedAt, DateTime UpdatedAt);

// ---- Skill sheet ----
public record SkillRowDto(string Key, string Name, string Ability, bool IsClassSkill,
    bool TrainedOnly, bool ArmorCheck, int Ranks, int Total);
public record SkillSheetDto(List<SkillRowDto> Skills, int PointsAvailable, int PointsSpent, int MaxRanks);
public record SetRankRequest(string SkillKey, int Ranks);
