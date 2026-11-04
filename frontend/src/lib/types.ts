import { t } from './i18n';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type ItemCategory = 'Weapon' | 'Armor' | 'Consumable' | 'Magic' | 'Quest' | 'Material';
export type EquipSlot =
  | 'Head' | 'Neck' | 'Shoulders' | 'Chest' | 'Hands' | 'Belt' | 'Legs' | 'Feet'
  | 'Ring1' | 'Ring2' | 'Cloak' | 'MainHand' | 'OffHand'
  | 'Earring1' | 'Earring2'
  // Generic item slots — a Ring/Earring item fits either of its two physical slots.
  | 'Ring' | 'Earring';

export const ABILITIES = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'] as const;
export type Ability = (typeof ABILITIES)[number];


export interface DerivedStats {
  modifiers: Record<string, number>;
  scores: Record<string, number>;
  saves: Record<string, number>;
  maxHp: number;
  initiative: number;
  bab: number;
  meleeAttack: number;
  rangedAttack: number;
  cmb: number;
  cmd: number;
  ac: number;
  touchAc: number;
  flatFootedAc: number;
  armorCheckPenalty: number;
  speed: number;
  carryCapacity: number;
  carriedWeight: number;
  load: string;
  passivePerception: number;
  featBudget: number;
  spellFailure?: number;
  armorType?: ArmorType;
  attacks?: WeaponAttack[] | null;
  /** Activatable combat options the character has (rage, Power Attack, …) and whether they're on. */
  toggles?: { key: string; label: string; effect: string; active: boolean }[] | null;
  /** Bonuses against a foe / in a terrain (favored enemy, favored terrain). */
  situational?: string[] | null;
  /** Per-day resources (rage rounds, channel, ki, …) with what is spent today. */
  resources?: { key: string; label: string; max: number; used: number; detail: string; reset?: "short" | "long" | null }[] | null;
  /** Scaling class values (sneak attack dice, monk unarmed damage, DR, …). */
  classValues?: { label: string; value: string }[] | null;
  /** Every value of a rule-package system by key (null for the built-in system). */
  values?: Record<string, number> | null;
}

export interface FeatSlot {
  id: string;
  label: string;
  count: number;
  /** Monk bonus feats and ranger combat style feats may be taken without their prerequisites. */
  ignorePrereqs: boolean;
  types: string[];
  /** featKeys this slot accepts. */
  names: string[];
  any: boolean;
}

export interface Feat {
  id: number;
  name: string;
  type: string;
  prerequisites: string;
  benefit: string;
  source: string;
  /** Set for homebrew feats (created by a player/GM). */
  createdByUserId?: string | null;
  createdByName?: string;
}

export interface ItemTemplate {
  id: number;
  name: string;
  description: string;
  iconKey: string;
  weight: number;
  value: number;
  rarity: Rarity;
  category: ItemCategory;
  slot: EquipSlot | null;
  effectsJson: string;
  damageDice: string;
  damageBonus: number;
  critRange: number;
  critMultiplier: number;
  isUsable: boolean;
  useEffectsJson: string;
  useStatusEffectName: string | null;
  useStatusEffectDescription: string;
  useStatusEffectIcon: string;
  useStatusEffectKind: 'buff' | 'debuff';
  useStatusEffectDurationMinutes: number | null;
  bonusDamage: string;
  /** PF1e base weapon key (GET /rules/weapons) — proficiency, Weapon Focus & co., finesse. */
  weaponKey?: string | null;
  armorType?: ArmorType;
  /** Arcane spell failure in %. */
  spellFailure?: number;
  /** Bonus on attack rolls with this weapon (masterwork / enhancement). */
  attackBonus?: number;
  /** Effects only apply while attuned (rule systems with attunement). */
  requiresAttunement?: boolean;
}

// ---- Battle maps (see backend MapsController) ----
export interface MapWall { x1: number; y1: number; x2: number; y2: number; door?: boolean; open?: boolean }
/** kind: character | monster | object; x/y = grid cell; hidden = GM only. */
export interface MapToken { id: string; kind: 'character' | 'monster' | 'object'; refId?: number | null; label: string; icon: string; x: number; y: number; size: number; hidden?: boolean; imageUrl?: string | null }
/** GM library piece (chest, lever, trapdoor …) — reusable on every map. */
export interface MapAsset { id: number; name: string; category: string; icon: string; imageUrl?: string | null; size: number; hidden: boolean; createdByName: string }
export interface BattleMap {
  id: number; name: string; imageUrl: string; imageWidth: number; imageHeight: number;
  gridSize: number; gridOffsetX: number; gridOffsetY: number;
  walls: MapWall[]; tokens: MapToken[]; revealed: string[]; fog: boolean; isActive: boolean; updatedAt: string;
  /** Draw our grid; false when the image has one painted in. */
  showGrid: boolean;
}

export type ArmorType = 'None' | 'Light' | 'Medium' | 'Heavy' | 'Shield' | 'TowerShield';

export interface WeaponDef {
  key: string;
  name: string;
  proficiency: 'Simple' | 'Martial' | 'Exotic';
  use: 'Light' | 'OneHanded' | 'TwoHanded' | 'Ranged';
  damage: string;
  critRange: number;
  critMultiplier: number;
  finesse: boolean;
  thrown: boolean;
}

/** One computed attack line for an equipped weapon. */
export interface WeaponAttack {
  name: string;
  hand: string;
  bonuses: number[];
  damage: string;
  crit: string;
  proficient: boolean;
  notes: string[];
  /** PF1e base weapon key, if the item has one (bows → arrows etc.). */
  weaponKey?: string | null;
}

export interface InventoryItem {
  id: number;
  itemTemplateId: number;
  quantity: number;
  gridIndex: number;
  equippedSlot: EquipSlot | null;
  template: ItemTemplate;
  /** false = player sees a masked template until the GM identifies this instance. */
  isIdentified: boolean;
  /** Attuned to this item (rule systems with attunement). */
  attuned?: boolean;
}

export interface Character {
  id: number;
  name: string;
  race: string;
  class: string;
  level: number;
  xp: number;
  background: string;
  alignment: string;
  description: string;
  age: number;
  height: number;
  weight: number;
  portraitUrl: string | null;
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  currentHp: number;
  /** Temporary hit points — damage takes them first. */
  tempHp?: number;
  currentMana: number;
  gold: number;
  ruleSystemId: string;
  size: string;
  speed: number;
  raceKey: string | null;
  raceBonusAbility: string | null;
  derived: DerivedStats;
  items: InventoryItem[];
  pendingLevelUp: boolean;
  featureChoices?: Record<string, string> | null;
  featIds?: number[] | null;
  /** Taken feats; `choice` = weapon key, skill key or spell school for feats like Weapon Focus. */
  feats?: { id: number; name: string; choice?: string | null }[] | null;
  /** Weapon keys the character is proficient with (class, race, proficiency feats). */
  proficientWeapons?: string[] | null;
  /** Ability score increases (4th, 8th, 12th, 16th, 20th level) in level order, e.g. ["Dex","Str"]. */
  abilityIncreases?: string[] | null;
  /** Feat slots (general + class bonus feats with their lists); see the rule package's featSlots. */
  featSlots?: FeatSlot[] | null;
  /** Feats the class grants outright (proficiencies, Endurance, Scribe Scroll, …): no slot needed. */
  grantedFeats?: string[] | null;
  /** PF1e favored class bonus: levels spent on +1 HP / on +1 skill rank (together ≤ level). */
  favoredClassHp?: number;
  favoredClassSkill?: number;
  /** Scores by the rule package's ability keys (also abilities beyond the classic six). Overrides str…cha. */
  abilities?: Record<string, number> | null;
  /** Further classes after `class` (multiclass); `class` has the remaining levels. */
  multiclass?: ClassLevel[] | null;
}

export interface ClassLevel { classId: string; level: number }

export interface ClassFeatureOption {
  name: string;
  description: string;
  effects?: Record<string, number> | null;
  /** Only for a pick gained at this class level or later. */
  minLevel?: number;
}

export interface ClassFeature {
  level: number;
  name: string;
  description: string;
  options?: ClassFeatureOption[] | null;
  picks?: number;
  /** One further pick at each of these levels (favored enemy, rage powers, …), stored in level order. */
  pickLevels?: number[] | null;
  /** The same option may be picked again (raising a favored enemy twice). */
  repeat?: boolean;
  /** Options = the picks of that feature (e.g. which favored enemy to raise). */
  optionsFrom?: string | null;
  /** Picks are typed in (lists the app doesn't catalogue, e.g. hexes). */
  freeText?: boolean;
}

export interface RaceDef {
  key: string;
  name: string;
  abilityMods: Record<string, number>;
  flexiblePlus2: boolean;
  size: string;
  speed: number;
  traits: string[];
}

export const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'] as const;
export const SIZE_LABEL: Record<(typeof SIZES)[number], string> = {
  Fine: t('Mini'), Diminutive: t('Sehr klein'), Tiny: t('Winzig'), Small: t('Klein'), Medium: t('Mittelgroß'),
  Large: t('Groß'), Huge: t('Riesig'), Gargantuan: t('Gigantisch'), Colossal: t('Kolossal'),
};

export interface SkillRow {
  key: string;
  name: string;
  ability: string;
  isClassSkill: boolean;
  trainedOnly: boolean;
  armorCheck: boolean;
  ranks: number;
  total: number;
}
export interface SkillSheet {
  skills: SkillRow[];
  pointsAvailable: number;
  pointsSpent: number;
  maxRanks: number;
}

export type CharacterInput = Omit<Character, 'id' | 'derived' | 'items' | 'pendingLevelUp'>;

export interface Skill {
  id: number;
  name: string;
  description: string;
  type: string;
  rank: number;
  maxRank: number;
  cooldown: number;
  isPassive: boolean;
  unlocked: boolean;
  requiresSkillId: number | null;
  tier: number;
}
export type SkillInput = Omit<Skill, 'id'>;

export interface Spell {
  id: number;
  name: string;
  description: string;
  grade: number;
  damage: string;
  range: string;
  cost: string;
  duration: string;
  prepared: boolean;
  /** School as in the compendium ("evocation", "Hervorrufung"): Spell Focus, specialist slot. */
  school?: string;
  /** Saving throw text ("Reflex half", "none"); a DC is shown when it allows a save. */
  savingThrow?: string;
  /** Spellbook (casting class) it belongs to; "" = the first class that casts. */
  classId?: string;
}
export type SpellInput = Omit<Spell, 'id'>;

export interface SpellSlot {
  grade: number;
  total: number;
  used: number;
  /** Casting class of these slots; null = a pool several classes share. */
  classId?: string | null;
}

// ---- Ammunition (see backend AmmoDto) ----
/** Bonuses come on top of the weapon's own (the bow's damage dice). */
export interface Ammo {
  id: string; name: string; count: number; attackBonus: number; damageBonus: number;
  extraDamage: string; notes: string;
}

// ---- Spell tracker (see backend SpellbookDto) ----
export interface PreparedSlot { spellId: number | null; used: boolean }
/** prepared: grade → slots in order (the last `special` of a grade are domain/school slots);
 *  used: spontaneous casters' spent slots per grade. JSON object keys arrive as strings. */
export interface SpellState {
  prepared: Record<number, PreparedSlot[]>; used: Record<number, number>;
  /** Bard: bardic performance rounds spent today (reset by rest). */
  performanceRoundsUsed?: number;
}
/** known: spontaneous spells-known limit for the grade, null for prepared casters. */
export interface SpellGrade { grade: number; total: number; special: number; known: number | null }
export interface Spellbook {
  type: 'prepared' | 'spontaneous' | null; grades: SpellGrade[]; state: SpellState;
  castingAbility?: string | null; castingMod?: number; casterLevel?: number;
  /** Spells allowed in the domain/school slot; null = any. */
  specialSpellIds?: number[] | null;
  /** Wizard opposition-school spells: preparing one takes two slots. */
  oppositionSpellIds?: number[] | null;
  /** Sorcerer bloodline spells: known in addition to the class table. */
  bloodlineSpellIds?: number[] | null;
  /** Class performances (bardic performance), rendered for this character by the rule package. */
  performance?: Performance | null;
  /** The book's casting class; classes: every casting class (only with two or more). */
  classId?: string | null;
  classes?: string[] | null;
  /** Slots are a pool shared with the other casting classes (5e multiclassing). */
  shared?: boolean;
}

export interface CompendiumSpell {
  id: number;
  name: string;
  school: string;
  grade: number;
  description: string;
  range: string;
  duration: string;
  castingTime: string;
  components: string;
  savingThrow: string;
  damage: string;
  /** Set for homebrew spells (created by a player/GM). */
  createdByUserId?: string | null;
  createdByName?: string;
  /** Source book (e.g. "PRPG Core Rulebook pg. 283"); empty for homebrew. */
  source?: string;
}

export interface Message {
  id: number;
  senderName: string;
  subject: string;
  body: string;
  isImportant: boolean;
  isRead: boolean;
  isArchived: boolean;
  sentAt: string;
  scheduledFor: string | null;
}

export interface StatusEffect {
  id: number;
  name: string;
  description: string;
  icon: string;
  kind: 'buff' | 'debuff';
  expiresAt: string | null;
}
export type StatusEffectInput = Omit<StatusEffect, 'id'>;

export interface Companion {
  id: number;
  name: string;
  type: string;
  description: string;
  hp: number;
  ac: number;
  speed: number;
  /** Class companion numbers (animal companion, familiar, bonded mount) at the master's level. */
  bond?: { kind: string; effectiveLevel: number; hp?: number | null; lines: string[] } | null;
  /** Class companion the current class feature choice no longer grants. */
  bondLost?: boolean;
}
export type CompanionInput = Omit<Companion, 'id' | 'bond' | 'bondLost'>;

export interface CharacterSummary {
  id: number;
  name: string;
  level: number;
}

/** GM dashboard row (GET /gm/characters) — inventory is unmasked. */
export interface GmCharacter {
  ownerId: string;
  ownerName: string;
  ownerRoles: string[];
  character: Character;
  statusEffects: StatusEffect[];
}

export interface PlayerSummary {
  userId: string;
  displayName: string;
  username: string;
  roles: string[];
  online: boolean;
  characterCount: number;
  characters: CharacterSummary[];
}

export interface MonsterSkill {
  name: string;
  bonus: number;
}
export interface MonsterAttack {
  name: string;
  damageDice: string;
  bonus: number;
  critRange: number;
  critMultiplier: number;
}
export interface Monster {
  id: number;
  name: string;
  size: string;
  type: string;
  description: string;
  maxHp: number;
  currentHp: number;
  ac: number;
  speed: number;
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  fort: number; ref: number; will: number;
  skills: MonsterSkill[];
  attacks: MonsterAttack[];
  itemTemplateIds: number[];
  // effective values (base + equipped item bonuses)
  effMaxHp: number; effAc: number;
  effStr: number; effDex: number; effCon: number; effInt: number; effWis: number; effCha: number;
  effFort: number; effRef: number; effWill: number;
  effAttacks: MonsterAttack[];
  equippedItems: ItemTemplate[];
}
export type MonsterInput = Omit<Monster,
  'id' | 'effMaxHp' | 'effAc' | 'effStr' | 'effDex' | 'effCon' | 'effInt' | 'effWis' | 'effCha'
  | 'effFort' | 'effRef' | 'effWill' | 'effAttacks' | 'equippedItems'>;

export interface Note {
  id: number;
  title: string;
  content: string;
  color: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}
export type NoteInput = Omit<Note, 'id' | 'createdAt' | 'updatedAt'>;

export type PollAnswer = 'yes' | 'maybe' | 'no';
export interface PollOption { id: number; startsAt: string; votes: { userId: string; name: string; answer: PollAnswer }[] }
export interface SchedulePoll {
  id: number; title: string; description: string; createdAt: string; chosenOptionId: number | null;
  options: PollOption[]; members: { userId: string; name: string }[];
}
export interface ChatMessage { id: number; userId: string; userName: string; text: string; createdAt: string }

export interface RuleSystemInfo { id: string; name: string }
export interface CampaignSummary {
  id: number; name: string; description: string; ruleSystemId: string; ruleSystemName: string;
  imageUrl: string | null; role: 'GM' | 'Player'; memberCount: number; gmName: string;
}
export interface CampaignMember { userId: string; displayName: string; userName: string; role: 'GM' | 'Player'; online: boolean; characterCount: number }
export interface CampaignDetail {
  id: number; name: string; description: string; ruleSystemId: string; ruleSystemName: string;
  imageUrl: string | null; myRole: 'GM' | 'Player'; hasCharacters: boolean; members: CampaignMember[];
}
export interface CampaignInvite { id: number; code: string; createdAt: string; expiresAt: string | null; maxUses: number | null; uses: number; valid: boolean }

/** A class's performances (rules package): own spellbook chapter, rounds per day, DC, effects for this character. */
export interface Performance {
  name: string; book: string; item: string; tab: string; rounds: number; dc: number; start: string;
  list: { name: string; level: number; short: string; effect: string }[];
}

/** Ammunition of the armory (rules package). */
export interface AmmoPreset {
  name: string; original: string; pack: number; weapon: string; core: boolean;
  attackBonus: number; damageBonus: number; extraDamage: string; notes: string;
}

export type StatFormat = 'number' | 'signed' | 'distance' | 'weight' | 'percent';
/** One derived value of a rule system; key = derived field ("ac") or "save.<Key>". */
export interface StatDef { key: string; label: string; format: StatFormat; short: string | null }
/** What the UI shows for the campaign's rule system (from GET /rules/layout). */
export interface RuleLayout {
  id: string; name: string;
  abilities: { key: string; label: string; name: string }[];
  /** caster: casts spells at some level; tradition: "arcane" / "divine" (for feat prerequisites). */
  classes: { key: string; name: string; caster?: boolean; tradition?: string | null }[];
  /** One ability increase every N character levels (0 = none). */
  abilityIncreaseEvery?: number;
  saves: StatDef[];
  sheetStats: StatDef[];
  combatStats: StatDef[];
  partyStats: StatDef[];
  armorDetail: string;
  backgrounds?: { key: string; name: string }[] | null;
  /** Feats page data of the system (null = no feats). */
  feats?: {
    choices: Record<string, string>; repeatable: string[];
    tree?: { seeds: Record<string, string[]>; featureRequirements: Record<string, (string | [string, string])[]>; ancestries: string[] } | null;
  } | null;
  /** Dashboard tiles between hit points and gold (null = armor class and initiative). */
  quickStats?: { key: string; label: string; format: StatFormat; detail?: string | null; icon?: string | null; short?: string | null }[] | null;
  /** Sources that count as core rules (null = no "core rulebook only" filter). */
  coreSources?: string[] | null;
  ammunition?: AmmoPreset[] | null;
  ammoMaterials?: { name: string; damageBonus: number; note: string }[] | null;
}
