# Rule package reference

Everything a `.foliant-rules` package can contain, field by field. For a gentler introduction (homebrew in
the app, building and installing a package) read [rule-packages.md](rule-packages.md) first.

- [1. Quick start](#1-quick-start)
- [2. Package files and limits](#2-package-files-and-limits)
- [3. manifest.json](#3-manifestjson)
- [4. The formula language](#4-the-formula-language)
- [5. Tags](#5-tags)
- [6. rules.json](#6-rulesjson)
- [7. layout.json](#7-layoutjson)
- [8. tests/*.json](#8-testsjson)
- [9. spells.json and feats.json](#9-spellsjson-and-featsjson)
- [10. What the app reads and provides](#10-what-the-app-reads-and-provides)
- [11. Complete example package](#11-complete-example-package)
- [12. Common errors](#12-common-errors)

All JSON files may contain `//` comments and trailing commas. Field names are case-insensitive, but
**unknown fields are errors**, so a typo like `"stat"` instead of `"stats"` is reported instead of
silently ignored.

## 1. Quick start

The smallest useful package is [`rule-packages/minimal-w6`](../rule-packages/minimal-w6): six abilities,
a handful of values, one condition and two classes. Copy the folder, then:

1. In `manifest.json`, give it your own `id` (e.g. `me.my-system`), `name`, `version` and `license`.
2. In `rules.json`, define your abilities and the values your system computes (`stats`).
3. In `layout.json`, choose which of those values the sheet, the dashboard and the GM table show.
4. In `tests/`, write at least one example character with the values you expect.
5. Zip it and upload it as admin under **Admin → Rule systems → Upload package…**:

```bash
cd rule-packages/my-system
zip -r ../my-system.foliant-rules manifest.json rules.json layout.json tests
```

The upload checks everything (JSON, formulas, layout, tests) and lists each error with its location.
Nothing is installed unless every test passes. To update, raise `version` and upload again.

## 2. Package files and limits

| File | Required | Content |
|---|---|---|
| `manifest.json` | yes | identity and license |
| `rules.json` | yes | abilities, formulas, classes, ancestries … |
| `layout.json` | yes | which values the app shows where |
| `tests/*.json` | at least one | example characters with expected values |
| `spells.json` | no | spell list |
| `feats.json` | no | feat list |

Other files in the ZIP are ignored. The files must sit at the root of the ZIP, not in a subfolder.

| Limit | Value |
|---|---|
| Package size | 20 MB |
| Size of one file | 10 MB |
| Files in the ZIP | 500 |
| Test files | 200 |
| Spells | 3,000 |
| Feats | 5,000 |
| Formula length | 2,000 characters |
| Formula nesting | 48 levels |

## 3. manifest.json

```json
{
  "format": "foliant-rules",
  "apiVersion": 1,
  "type": "system",
  "id": "me.my-system",
  "name": "My System",
  "version": "1.0.0",
  "license": "CC0-1.0",
  "attribution": "Required credit line, if the license asks for one.",
  "authors": ["Me"],
  "languages": ["en"]
}
```

| Field | Required | Rule |
|---|---|---|
| `format` | yes | always `"foliant-rules"` |
| `apiVersion` | yes | `1` |
| `type` | yes | `"system"` (a complete rule system; extensions are not supported yet) |
| `id` | yes | lower case `a–z 0–9 . _ -`, 2–64 characters, starts with a letter or digit. Stays the same across versions: it is how the app recognises an update |
| `name` | yes | shown in the admin area and when choosing a campaign's system |
| `version` | yes | `major.minor.patch`, e.g. `1.2.0` |
| `license` | yes | e.g. `CC0-1.0`, `CC-BY-4.0`, `OGL-1.0a` |
| `attribution` | no | credit text the license requires |
| `authors` | no | list of names |
| `languages` | no | language codes of the package's texts, e.g. `["en"]` |

One package has one language. Ship a second package with its own `id` for a second language.

## 4. The formula language

Formulas are strings in the JSON: `"expr": "10 + mod(DEX)"`. They are checked when the package is
uploaded, so syntax errors, unknown functions and circular references are reported with their location.

### Values and operators

| | |
|---|---|
| Numbers | `3`, `0.5` |
| Text | `'light'` or `"light"` (the other quote may appear inside) |
| Truth values | `true`, `false` |
| Arithmetic | `+ - * / %` (`+` joins text when one side is text) |
| Comparison | `== != < <= > >=` |
| Logic | `&& || !` |
| Condition | `a ? b : c` |
| Grouping | `( … )` |
| Names | `level`, `DEX`, `armor.type`, `save.CON` (dots are part of the name) |

Division and `%` by zero are errors. Numbers are not rounded on their own: use `floor`, `ceil` or `round`.
Where the app needs a whole number (most values), it rounds down.

Truth: `0`, `''`, `false` and unknown names are false; everything else is true. An unknown name reads as `0`
in a calculation and as `''` in text, so a formula never fails because a fact is missing.

### Functions

| Function | Result |
|---|---|
| `floor(x)`, `ceil(x)`, `round(x)` | rounded down, up, to the nearest (.5 away from zero) |
| `abs(x)` | absolute value |
| `min(a, b, …)`, `max(a, b, …)` | smallest / largest |
| `clamp(x, lo, hi)` | `x` limited to `lo…hi` |
| `pow(x, n)` | `x` to the power `n` (`n` limited to −16…16) |
| `mod(DEX)` | the ability's modifier (final score, including all bonuses) |
| `mod(14)` | the modifier of a raw score, using `abilityModifier` |
| `table('name', i)` | the `i`-th entry of a table (1 = first, clamped to the table's length) |
| `has('tag')` | whether the character has the [tag](#5-tags) |
| `count('prefix')` | how many tags start with the prefix, e.g. `count('feat:')` |
| `skill('key')` | the value of a skill |
| `ranks('key')` | skill ranks spent on a skill (ranks systems) |
| `stat('key')` | a value by name; `0` if it doesn't exist (for optional values) |
| `pick('Feature', n)` | the `n`-th pick (1 = first) of a class feature **by its name**, `''` if none |
| `pickcount('Feature', 'Option', l1, l2, …)` | how often `Option` was picked; with levels, only the picks those levels allow |
| `perclass('formula')` | the formula once per class of the character, summed; inside, `level`, `hitDie` and `class.skillRanks` are that class's (see [Several classes](#several-classes)) |
| `classhas('tag')` | the class being evaluated has the tag in its own `grants` (outside `perclass`: the primary class) |

### Names you can read

| Name | Meaning |
|---|---|
| `level` | character level; in a class's own formulas and inside `perclass` the level in that class |
| `characterLevel` | always the character level |
| `class` | id of the class being evaluated (`perclass`, a class's own formulas, a spellbook), else of the primary class |
| `level.<classId>` | level in that class (0 without it) |
| `STR`, `DEX` … | the final ability score (your ability keys) |
| any value key | another value from `stats`, e.g. `prof`, `save.CON`, `skill.stealth` |
| `hitDie` | hit die of the class (inside `perclass` and class formulas) or of the primary class |
| `castingMod` | modifier of the class's spellcasting ability (`0` for non-casters) |
| `ancestry.speed`, `ancestry.size` | from the character's ancestry |
| `class.skillRanks` | skill ranks per level of the class (like `hitDie`) |
| host facts | what the app provides, see [section 10](#10-what-the-app-reads-and-provides) |

`mod.DEX` is a result for tests and the app, not a name in formulas: write `mod(DEX)`. `score` is only
defined inside `abilityModifier`. Inside `skillFormula` and a few other places there are
more names; they are listed there.

### Text templates

Fields described as **template** are text in which every `{…}` is a formula:
`"Second Wind: 1d10 + {level}"` becomes `Second Wind: 1d10 + 5`. Whole numbers are shown without decimals.

The templates in `layout.json` (`armorDetail`, `quickStats.detail`) are simpler: `{key}` there is only a
value key, not a formula.

### Circular references

A value may not depend on itself, directly or through modifiers:
`"Circular reference: ac → initiative → ac"`. The upload finds this before any test runs.

## 5. Tags

Tags are names a character "has". Formulas test them with `has('…')` and count them with `count('…')`.
The engine sets these:

| Tag | When |
|---|---|
| `class:<classId>` | the character has the class |
| `feature:<featureId>`, `feature:<classId>/<featureId>` | the class feature is gained |
| `choice:<classId>/<featureId>:<optionId>` | that option of a class feature was picked |
| `ancestry:<id>` | the ancestry |
| `background:<id>` | the background |
| `feat:<featKey>` | the feat was taken or granted |
| `feat:<featKey>:<choice>` | taken with that choice (weapon, skill, school) |
| `condition:<id>` | the condition is active |
| `toggle:<id>` | the player switched the toggle on |
| `active:<id>` | the toggle is on **and** its `when` holds — use this one in formulas |
| `item:<effectKey>` | an equipped item has this effect (e.g. `item:Deflection`) |
| `weapon.group:<group>` | only inside attack formulas: the weapon belongs to the group |

Your own tags come from `grants` lists (on the package, classes, features, options, ancestries,
backgrounds and feat effects). A few have a meaning in the engine:

| Tag | Meaning |
|---|---|
| `prof:skill.<key>` | proficient in the skill (`proficient` in `skillFormula`) |
| `expertise:skill.<key>` | expertise in the skill (`expertise` in `skillFormula`) |
| `prof:weapon.<key>` or `prof:weapon.<category>` | proficient with the weapon or the category (`simple`, `martial`, `exotic`) |
| `category:weapon.<key>=<category>` | the weapon counts as that category for this character |

Everything else is free: `prof:save.CON`, `trait:darkvision`, `caster` … are only conventions.

**Feat keys** are feat names in lower case with only the letters a–z kept, and a trailing `, Improved`,
`, Greater`, `, Great`, `, Lesser` or `, Minor` moved to the front: `Power Attack` → `powerattack`,
`Cleave, Great` → `greatcleave`.

## 6. rules.json

All sections are optional except `abilities` and `stats` in practice. Order doesn't matter.

### Abilities and modifiers

```json
"abilities": ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
"abilityModifier": "floor((score - 10) / 2)",
"abilityIncreaseEvery": 4
```

| Field | Meaning |
|---|---|
| `abilities` | ability keys. They become names (final score) and work in `mod(…)` and as modifier targets |
| `abilityModifier` | formula from `score` to the modifier. Default `floor((score - 10) / 2)` |
| `abilityIncreaseEvery` | the player raises one ability by 1 every N character levels (0 = never) |

Any number of abilities with any keys works (`MU`, `KL`, `IN` … for a system with eight). Keys that start
with `str`, `dex`, `con`, `int`, `wis` or `cha` share the app's classic score storage, so two keys with the
same first three letters (`Strength` and `Stride`) would share one score: give them different starts.
The labels the player sees come from `layout.json`.

### Values: `stats`

Every value the system computes is a stat. Its key is how formulas, modifiers, tests and the layout
refer to it.

```json
"stats": [
  { "key": "prof", "expr": "table('prof', level)" },
  { "key": "initiative", "expr": "mod(DEX)", "plus": "item.Initiative" },
  { "key": "ac", "pick": "first", "plus": "shield.bonus",
    "options": [
      { "when": "armor.type == 'heavy'", "expr": "armor.base" },
      { "when": "armor.type == 'medium'", "expr": "armor.base + min(mod(DEX), 2)" },
      { "expr": "armor.base + mod(DEX)" }
    ] }
]
```

| Field | Meaning |
|---|---|
| `key` | name; not the same as an ability, unique |
| `expr` | the formula |
| `options` | instead of `expr`: several `{ "when", "expr" }`; options without `when` always apply |
| `pick` | how to combine the applicable options: `max` (default), `min`, `first` |
| `plus` | formula added after `expr`/`options` |

Value = (`expr` or the picked option, `0` if none applies) + `plus` + all modifiers targeting the key.
Key names the app reads directly are listed in [section 10](#10-what-the-app-reads-and-provides).

### Tables

```json
"tables": { "prof": [2, 2, 2, 2, 3, 3, 3, 3, 4, 4] }
```

Read with `table('prof', level)`. Index 1 is the first entry; indexes outside are clamped to the first or
last entry.

### Modifiers and stacking

Classes, features, options, ancestries, backgrounds, conditions, toggles and feats change values with
modifiers:

```json
{ "target": "ac", "value": "2", "type": "deflection", "when": "armor.type != 'heavy'" }
```

| Field | Meaning |
|---|---|
| `target` | a value key or ability key; `save.*` or `skill.*` (prefix and `*`) hits every matching value |
| `value` | formula |
| `type` | bonus type for stacking (optional; none = untyped) |
| `when` | formula; the modifier only counts while it holds |

```json
"stacking": { "rule": "highest-per-type", "alwaysStack": ["dodge"] }
```

| `rule` | Effect |
|---|---|
| `sum` (default) | everything adds up |
| `highest-per-type` | per bonus type only the highest bonus counts; untyped bonuses, types in `alwaysStack` and all penalties add up |

The same source never stacks with itself: two modifiers from one source with the same type count once.

### Skills

```json
"skills": [
  { "key": "stealth", "name": "Stealth", "ability": "DEX", "armorCheck": true },
  { "key": "arcana", "name": "Arcana", "ability": "INT", "trainedOnly": true },
  { "key": "perform", "name": "Perform", "ability": "CHA", "types": { "sing": "Sing", "dance": "Dance" } },
  { "key": "craft", "name": "Craft", "ability": "INT", "freeTypes": true }
],
"skillFormula": "mod(ability) + (proficient ? prof : 0) + (expertise ? prof : 0)",
"skillMode": "proficiency"
```

| Field | Meaning |
|---|---|
| `key`, `name` | each skill becomes the value `skill.<key>` (unless `stats` defines that key itself) |
| `ability` | an ability key |
| `trainedOnly`, `armorCheck` | flags, readable in the skill formula |
| `types` | fixed kinds taken separately (rows `perform:sing`) |
| `freeTypes` | kinds the player names (rows `craft:<text>`) |

`skillFormula` is evaluated per skill with these extra names: `skill` (key), `ability` (ability key — so
`mod(ability)` works), `proficient`, `expertise`, `ranks`, `classSkill`, `armorCheck`, `trainedOnly`.
`skillMode` is `proficiency` (proficient/expertise come from tags) or `ranks` (players spend ranks per
level: `class.skillRanks` + Int modifier, class skills from the class's `classSkills`).

### Conditions

```json
"conditions": [
  { "id": "poisoned", "name": "Poisoned", "icon": "🤢", "kind": "debuff",
    "text": "−2 on skill checks.", "modifiers": [ { "target": "skill.*", "value": "-2" } ] }
]
```

`kind` is `debuff` (default) or `buff`. While active the character has the tag `condition:<id>`.

> Conditions are applied in the package's **tests**. In the app, status effects are still plain
> name/text entries and do not yet apply these modifiers.

### Ancestries and backgrounds

```json
"ancestries": [
  { "id": "dwarf", "name": "Dwarf", "size": "Medium", "speed": 25,
    "text": "Darkvision, tough.", "traits": ["Darkvision 18 m", "+1 HP per level"],
    "modifiers": [ { "target": "CON", "value": "2" }, { "target": "maxHp", "value": "level" } ],
    "grants": ["trait:darkvision"],
    "resources": [ { "id": "stoneskin", "name": "Stoneskin", "max": "1" } ] },
  { "id": "human", "name": "Human", "abilityChoice": true,
    "modifiers": [ { "target": "STR", "value": "1", "when": "ancestry.choice == 'STR'" } ] }
],
"backgrounds": [
  { "id": "scout", "name": "Scout", "text": "Stealth and Perception.",
    "grants": ["prof:skill.stealth", "prof:skill.perception"] }
]
```

| Field | Meaning |
|---|---|
| `id`, `name`, `text` | identity and description |
| `size`, `speed` | default `Medium`, `30`; read as `ancestry.size`, `ancestry.speed` |
| `traits` | short lines for the ancestry picker (default: `text`) |
| `modifiers`, `grants` | as everywhere |
| `resources` | see [Resources](#resources) |
| `abilityChoice` | the player picks an ability; read it as `ancestry.choice` (one modifier per ability, as above) |

Backgrounds have `id`, `name`, `text`, `modifiers` and `grants`. With backgrounds, the sheet offers them as a
list; without, background is free text.

### Classes

```json
"classes": [
  {
    "id": "fighter", "name": "Fighter", "hitDie": 10,
    "grants": ["prof:weapon.martial", "prof:save.CON"],
    "levels": { "1": { "features": ["style", "second-wind"] }, "5": { "features": ["extra-attack"] } },
    "features": {
      "second-wind": { "name": "Second Wind", "text": "Regain 1d10 + level HP.",
        "resource": { "id": "second-wind", "name": "Second Wind", "max": "1", "reset": "short" } }
    },
    "featGrants": [ { "level": 1, "feats": ["Shield Proficiency"] } ],
    "values": [ { "label": "Second Wind", "value": "1d10 + {level}" } ]
  }
]
```

| Field | Meaning |
|---|---|
| `id`, `name` | identity; `class:<id>` tag |
| `hitDie` | readable as `hitDie` |
| `grants` | tags of the class |
| `levels` | class level → `{ "features": [feature ids] }`; every id must exist in `features` |
| `features` | feature id → feature (below) |
| `featGrants` | `{ "level", "feats": [names], "when" }`: feats the class gives for free, from that level |
| `values` | `{ "label", "value" (template), "when" }`: lines on the dashboard that scale with level |
| `classSkills`, `skillRanks` | ranks systems: class skill keys and ranks per level |
| `spellcasting` | see [Spellcasting](#spellcasting) |
| `performance` | see [Performances](#performances) |

#### Several classes

A character can have several classes (in the app: **Character → Further classes**). The primary class has
every level the others don't. Formulas that belong to a class use that class's level as `level`:

- its features' and options' `modifiers`, `resource`s and `featGrants`
- its `values`, `spellcasting` and `performance`

Everything else (`stats`, `featSlots`, `toggles`, `attacks`, `situational`, `companions`) is about the
whole character: there `level` is the character level. Use `level.<classId>` where a class's level counts,
e.g. a fighter bonus feat slot `"count": "floor(level.fighter / 2)"`, and `perclass` for values that add up
over classes:

```json
{ "key": "maxHp", "expr": "hitDie + mod(CON) + perclass('level * (floor(hitDie / 2) + 1 + mod(CON))') - (floor(hitDie / 2) + 1 + mod(CON))" },
{ "key": "bab", "expr": "perclass(\"classhas('bab:full') ? level : floor(level * 3 / 4)\")" }
```

Every class with `spellcasting` gets its own spellbook (the player switches between them): its own slots by
its class level, casting ability, DC, prepared or known spells. `spellSpecials` rules are checked per book, so
write their `when` with `class == 'wizard'` rather than `has('class:wizard')`. Class-feature picks are stored by
the feature's `name`, so two classes with a feature of the same name share its pick.

#### Shared spell slots

In some systems (5e) several casting classes share one pool of slots, computed from a combined caster level.
`multiclassSpellSlots` lists those classes and the pool; once a character has two of them, their books cast
their spells from the pool (prepared casters choose their spells, without binding them to slots), while other
casting classes (5e warlocks) keep their own slots:

```json
"multiclassSpellSlots": {
  "classes": ["bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "wizard"],
  "slots": {
    "1": "table('full1', perclass(\"class == 'paladin' || class == 'ranger' ? floor(level / 2) : class == 'warlock' ? 0 : level\"))",
    "2": "table('full2', perclass(\"class == 'paladin' || class == 'ranger' ? floor(level / 2) : class == 'warlock' ? 0 : level\"))"
  }
}
```

#### Features and choices

```json
"style": {
  "name": "Fighting Style", "text": "Choose one.",
  "choice": { "pick": 1, "options": [
    { "id": "defense", "name": "Defense", "text": "+1 AC in armor.",
      "modifiers": [ { "target": "ac", "value": "1", "when": "armor.type != 'none'" } ] },
    { "id": "archery", "name": "Archery", "text": "+2 with ranged weapons.", "grants": ["style:archery"] }
  ] }
}
```

Feature: `name`, `text`, `modifiers`, `grants`, `resource`, `choice`.

| Choice field | Meaning |
|---|---|
| `pick` | how many options (default 1) |
| `pickLevels` | one more pick at each of these class levels, instead of `pick` |
| `repeat` | the same option may be picked again |
| `optionsFrom` | feature id of the same class: its picks are the options (raise one of them) |
| `freeText` | the player writes the pick (no options) |
| `options` | `{ "id", "name", "text", "minLevel", "modifiers", "grants", "resource" }` |

Missing picks show up in the level-up assistant. An option with `minLevel` is only offered for picks gained at
that class level or later. Picks are stored by the option's `name` and read back as ids, so renaming an
option's `name` in an update loses existing picks; ids may change freely.

#### Resources

```json
"resource": { "id": "rage", "name": "Rage", "max": "2 + floor(level / 4)", "reset": "long",
  "detail": "+{1 + floor(level / 8)} damage", "when": "level >= 2" }
```

| Field | Meaning |
|---|---|
| `id`, `name` | the pool |
| `max` | formula |
| `reset` | `long` (default), `short`, or `null` (refills on every rest) |
| `detail` | template shown next to it (default: the rest that refills it) |
| `when` | formula; the resource only exists while it holds |

With at least one resource that has `reset`, the dashboard offers both a short and a long rest. Resources with the same `id` (e.g. hit dice
of several classes) form one pool: their maxima add up, name, `reset` and `detail` come from the first.

#### Spellcasting

```json
"spellcasting": {
  "ability": "INT", "prepared": true, "tradition": "arcane",
  "cantrips": "3 + floor(level / 4)",
  "slots": { "1": "table('slots1', level)", "2": "table('slots2', level)" },
  "slotsReset": "long"
}
```

| Field | Meaning |
|---|---|
| `ability` | casting ability (`castingMod`) |
| `prepared` | `true`: prepares from a list; `false`: knows a fixed set |
| `cantrips` | formula: cantrips known |
| `slots` | spell level → formula for slots per day |
| `known` | spontaneous casters: spells known in total |
| `knownByGrade` | spontaneous casters: spell level (0–9) → formula; levels left out = no access |
| `slotsReset` | `long` (default) or `short` |
| `special` | formula: extra slots per level that only take special spells (already in `slots`) |
| `casterLevel` | formula (default: `level`) |
| `tradition` | `arcane`, `divine` or none, for prerequisites like "arcane spellcaster" |

#### Performances

A class can have performances (e.g. bardic songs), shown as their own chapter in the spellbook:

```json
"performance": {
  "name": "Performance", "book": "Songbook", "item": "Song", "tab": "Songs",
  "rounds": "4 + mod(CHA) + 2 * (level - 1)",
  "dc": "10 + floor(level / 2) + mod(CHA)",
  "start": [ { "from": 1, "text": "standard action" }, { "from": 7, "text": "move action" } ],
  "list": [ { "name": "Courage", "level": 1, "short": "Bonus for allies",
              "effect": "Allies gain +{1 + floor(level / 6)} on attack rolls. DC {dc}." } ]
}
```

`rounds` and `dc` are formulas; `start` picks the last entry with `from` ≤ level; `effect` is a template in
which `{dc}` is the save DC.

### Feats

```json
"featSlots": [
  { "id": "general", "label": "Feats", "count": "1 + floor(level / 4)", "any": true },
  { "id": "bonus", "label": "Fighter bonus feat", "when": "has('class:fighter')",
    "count": "floor(level / 2)", "types": ["Combat"] }
],
"featEffects": {
  "toughness": { "modifiers": [ { "target": "maxHp", "value": "level" } ] },
  "skillfocus": { "modifiers": [ { "target": "skill.{choice}", "value": "3" } ] }
},
"featChoices": { "skillfocus": "skill", "weaponfocus": "weapon" },
"repeatableFeats": ["skillfocus", "weaponfocus"]
```

Without `featSlots` the system has no feats. The feat list itself comes from `feats.json` and from homebrew.

| Slot field | Meaning |
|---|---|
| `id`, `label` | identity and heading |
| `count`, `when` | formulas (count default 1) |
| `any` | every feat fits |
| `types` | feats of these types (the `type` in feats.json) fit |
| `names` | these feats fit |
| `namesByChoice` | `{ "feature": name, "options": { option: [feat names] } }`: allowed feats by a class-feature pick |
| `ignorePrereqs` | prerequisites are not checked for this slot |
| `gainedAt`, `tiers`, `tiersByChoice` | tiered slots: one slot per level in `gainedAt`; each allows the feats of all `tiers` (`{ "level", "feats" }`) up to the level it was gained at |

`featEffects` maps a feat key to `modifiers` and `grants`; `{choice}` in a target, value or grant is
the feat's chosen weapon, skill or school. `featChoices` says which feats need a choice (`weapon`,
`skill`, `school`); a feat in `repeatableFeats` may be taken again with another choice.

#### Feat tree

For systems whose feats come with prerequisite texts, the feats page can group feats into branches and check
the texts:

```json
"featTree": {
  "seeds": { "melee": ["powerattack"], "ranged": ["pointblankshot"] },
  "featureRequirements": { "bonded familiar": [["Arcane Bond", "Familiar"]], "rage": [] },
  "ancestries": ["dwarf", "human"]
}
```

| Field | Meaning |
|---|---|
| `seeds` | branch (`melee`, `ranged`, `maneuver`, `defense`, `magic`) → feat keys starting it; a feat joins the first branch it is a seed of or requires; the rest is "general" |
| `featureRequirements` | class feature as written in prerequisites (lower case) → feature names that satisfy it: a name, or `[feature, option]`; `[]` = the system has no such feature |
| `ancestries` | ancestry names that can appear in prerequisites; a feat naming another one is not available |

#### Prerequisite texts

The feats page reads a feat's `prerequisites` (from `feats.json`) to lock feats and draw the tree. Separate the
parts with commas; it understands:

| Part | Example | Meaning |
|---|---|---|
| a feat's name | `Heavy Blow` | that feat must be taken (draws a line in the tree) |
| ability and score | `STR 13`, `STÄ 13`, `Strength 13` | key, label or name from `layout.json` abilities |
| character level | `character level 8`, `Charakterstufe 8` | |
| base attack bonus | `base attack bonus +6`, `BAB +6` | reads the value `bab` |
| caster level | `caster level 5`, `CL 5` | caster level of the open spellbook |
| skill ranks | `Acrobatics 5 ranks` | ranks systems |
| class level | `fighter 4` | levels in that class |
| class feature | as in `featTree.featureRequirements` | |
| ancestry | as in `featTree.ancestries` | |

Anything else stays plain text for the player to check. The server doesn't check prerequisites, only that a
fitting feat slot is free.

#### Feats instead of ability increases

5e lets a character take a feat instead of an ability score improvement. The 5e package builds this with a
choice option that grants a tag, and a feat slot that counts those tags:

```json
"asi4": { "name": "Ability Score Improvement (Level 4)", "choice": { "pick": 1, "options": [
  { "id": "STR2", "name": "+2 STR", "modifiers": [ { "target": "STR", "value": "2" } ] },
  { "id": "feat", "name": "Feat", "grants": ["featpick:fighter/asi4"] }
] } }
```

```json
"featSlots": [ { "id": "asi", "label": "Feats instead of ability increases", "count": "count('featpick:')", "any": true } ]
```

Every tag needs its own name (class and feature), so two picks count twice.

### Weapons and attacks

```json
"grants": ["prof:weapon.simple"],
"weapons": [
  { "key": "dagger", "name": "Dagger", "category": "simple", "use": "light", "damage": "1d4", "finesse": true, "thrown": true },
  { "key": "longbow", "name": "Longbow", "category": "martial", "use": "ranged", "damage": "1d8", "critMultiplier": 3 }
]
```

| Weapon field | Meaning |
|---|---|
| `key`, `name` | identity; an item is linked to a base weapon by this key |
| `category` | `simple` (default), `martial`, `exotic` |
| `use` | `light`, `oneHanded` (default), `twoHanded`, `ranged` |
| `damage` | text, e.g. `1d8` |
| `critRange`, `critMultiplier` | 2–20 (default 20) and 2–6 (default 2) |
| `finesse`, `thrown` | flags |
| `groups` | weapon groups, tested with `has('weapon.group:<group>')` in attacks |

`attacks` turns equipped weapons into attack lines:

```json
"attacks": {
  "weapon": {
    "values": [ { "key": "ability", "expr": "weapon.use == 'ranged' || (weapon.finesse && mod(DEX) > mod(STR)) ? mod(DEX) : mod(STR)" } ],
    "bonus": "ability + (weapon.proficient ? prof : 0) + weapon.attackBonus",
    "damage": "{weapon.dice != '' ? weapon.dice : weapon.damage} + {ability + weapon.damageBonus}",
    "crit": "{weapon.critRange}/×{weapon.critMultiplier}"
  },
  "extra": [ { "when": "weapons.count == 0", "name": "Unarmed strike", "bonus": "mod(STR) + prof", "damage": "1 + {mod(STR)}" } ]
}
```

`weapon` is evaluated once per equipped weapon (main hand first), each entry of `extra` once.

| Attack field | Meaning |
|---|---|
| `when` | formula; skip the line unless it holds |
| `name` | template (default: the weapon's name) |
| `hand` | template, e.g. "off hand" |
| `values` | `{ "key", "expr" }` computed in order, readable by key in the following formulas |
| `count` | formula: number of attacks (iterative attacks); inside, `i` is the attack's index (0 = first) |
| `bonus` | formula for attack `i` |
| `repeat` | formula: how often each attack appears (extra attacks at the same bonus) |
| `damage`, `crit` | templates (crit default `20/×2`) |
| `proficient` | formula (default `true`) |
| `notes` | `{ "text" (template), "when" }` |

Names inside attacks: `weapon.name`, `.slot` (`main`/`off`), `.key` (`''` without base weapon), `.known`,
`.use`, `.finesse`, `.thrown`, `.damage`, `.critRange`, `.critMultiplier` (from the base weapon),
`.proficient`, `.attackBonus`, `.damageBonus`, `.dice`, `.itemCritRange`, `.itemCritMultiplier` (from the
item); `weapons.count`, `weapons.melee` (equipped non-ranged weapons), `weapons.offLight`.

### Toggles and situational lines

```json
"toggles": [
  { "id": "rage", "name": "Rage", "when": "has('class:barbarian')",
    "effect": "+2 STR, −2 AC for {2 + floor(level / 4)} rounds",
    "modifiers": [ { "target": "STR", "value": "2" }, { "target": "ac", "value": "-2" } ] }
],
"situational": [
  { "text": "Darkvision 18 m", "when": "has('trait:darkvision')" },
  { "text": "+2 against {pick}", "forEachPick": "Favored Enemy", "pickLevels": [1, 5, 10] }
]
```

A toggle is offered while `when` holds (`when` may only use tags and `level`: it is checked before values
are computed). While switched on, its modifiers apply and the tag `active:<id>` is set. `name` and `effect`
are templates. Daily resource maxima ignore toggles.

Situational lines are templates shown on the dashboard while `when` holds. With `forEachPick` there is one
line per pick of that class feature (by name), `{pick}` is the pick; `pickLevels` limits it to the picks the
level allows.

### Spell lists and special slots

For systems where class-feature picks change the spellbook (domains, schools, bloodlines):

```json
"spellLists": { "domain:fire": ["Burning Hands", "Fireball"] },
"schoolAliases": { "hervorrufung": "evocation" },
"spellSpecials": {
  "specialSlot": [ { "feature": "Domain", "match": "list", "prefix": "domain:" } ],
  "opposition": [ { "feature": "Opposition Schools", "match": "school" } ],
  "bonusKnown": [ { "feature": "Bloodline", "match": "list", "prefix": "bloodline:", "take": "floor(level / 2)" } ]
}
```

| Field | Meaning |
|---|---|
| `spellLists` | name → spell names |
| `schoolAliases` | first word of a school name in any language (lower case) → school key |
| `specialSlot` | the first rule that applies decides which spells fit the special slot |
| `opposition` | schools that cost two slots |
| `bonusKnown` | spells known on top |

Rule fields: `feature` (class feature by name), `match` (`list`: the picks name spell lists, with `prefix`;
`school`: the picks name schools), `firstOnly` (only the first pick), `take` (formula: only the first N spells
of each list), `when`.

### Companions

```json
"companions": {
  "kinds": [ { "name": "Familiar", "hp": "floor(masterHp / 2)",
               "lines": ["Natural armor +{1 + floor(level / 2)}"] } ],
  "grants": [ { "kind": "Familiar", "when": "has('class:mage')", "level": "level" } ]
}
```

A grant gives a kind at an effective level (formula). `hp` and `lines` (templates) read `level` (the
effective level) and `masterHp`.

### Other sections

| Field | Meaning |
|---|---|
| `grants` | tags every character has |
| `attunementLimit` | how many items a character can attune to (0 = no attunement) |
| `coreSources` | sources that count as core rules for the "core rulebook only" filter (spells, feats, armory). Empty = no filter |
| `ammunition` | armory of the quiver: `{ "name", "original", "pack", "weapon", "core", "attackBonus", "damageBonus", "extraDamage", "notes" }` |
| `ammoMaterials` | `{ "name", "damageBonus", "note" }` |
| `multiclassSpellSlots` | slots several casting classes share, see [Shared spell slots](#shared-spell-slots) |

## 7. layout.json

`layout.json` decides what the app shows. It may only name values that `rules.json` defines.

```json
{
  "abilities": [ { "key": "STR", "label": "STR", "name": "Strength" } ],
  "saves": [ { "key": "save.CON", "label": "Constitution", "short": "CON", "format": "signed" } ],
  "sheetStats": [ { "key": "maxHp", "label": "Hit points" } ],
  "combatStats": [ { "key": "initiative", "label": "Initiative", "format": "signed" } ],
  "partyStats": [ { "key": "ac", "label": "Armor Class", "short": "AC" } ],
  "armorDetail": "Proficiency +{prof}",
  "quickStats": [ { "key": "ac", "label": "Armor Class", "short": "AC", "icon": "shield", "detail": "Touch {touchAc}" } ]
}
```

| Field | Where | Entry |
|---|---|---|
| `abilities` | ability block everywhere | `key` (from rules.json), `label` (short), `name` (full) |
| `saves` | dice roller, equipment | value key starting with `save.` |
| `sheetStats` | character sheet | value |
| `combatStats` | dashboard and GM combat row | value |
| `partyStats` | columns of the GM party table | value |
| `armorDetail` | under armor class (dashboard, GM) | template with `{key}` |
| `quickStats` | dashboard tiles between HP and gold, at most 3 | value plus `icon` and `detail` |

Value entries: `key`, `label`, `short` (label on narrow screens), `format`:

| `format` | Shows |
|---|---|
| `number` (default) | `14` |
| `signed` | `+3`, `−1` |
| `distance` | in the user's unit (feet / meters) |
| `weight` | in the user's unit (lb / kg) |
| `percent` | `15 %` |

`quickStats` icons: `shield`, `zap`, `star`, `sparkles`, `target`, `swords`, `footprints`, `eye`, `heart`,
`brain`. Without `quickStats` the dashboard shows armor class (with `armorDetail`) and initiative.

## 8. tests/*.json

Every package needs at least one test. A test is an example character and the values it must have. The
upload computes each one; a single wrong value blocks the installation and is listed.

```json
{
  "name": "Fighter 5, dwarf, defense style in medium armor",
  "character": {
    "level": 5,
    "classes": [ { "classId": "fighter", "level": 5 } ],
    "ancestry": "dwarf",
    "background": "scout",
    "abilities": { "STR": 16, "DEX": 14, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10 },
    "choices": { "fighter/style": "defense" },
    "conditions": ["poisoned"],
    "tags": ["toggle:rage", "feat:toughness"],
    "facts": { "armor.type": "medium", "armor.base": 15 }
  },
  "expect": { "ac": 18, "maxHp": 54, "skill.stealth": 3 }
}
```

| Field | Meaning |
|---|---|
| `name` | shown in the result list |
| `character.level` | character level (default 1) |
| `character.classes` | `[{ "classId", "level" }]`, several for a multiclass character |
| `character.ancestry`, `.background` | ids |
| `character.abilities` | base scores before modifiers |
| `character.choices` | `"<classId>/<featureId>": "optionId"`, several picks comma separated |
| `character.conditions` | condition ids |
| `character.tags` | extra tags, e.g. `toggle:<id>` to switch a toggle on |
| `character.facts` | host facts (section 10); anything not given reads as 0 / `''` |
| `expect` | value key → number: any stat, ability key (final score), `mod.<ability>`, `skill.<key>` |

Expected values must match exactly (no rounding: `floor` in your formulas where you need whole numbers).
Tests cannot take feats from a list: a tag like `feat:toughness` satisfies `has('feat:toughness')`, but
does not apply the feat's `featEffects`. `pick(…)` and `pickcount(…)` read picks by feature name, which tests
don't fill; they return `''` and `0`.

## 9. spells.json and feats.json

See [rule-packages.md](rule-packages.md#spellsjson) for examples.

Spell fields: `name` (required, unique, ≤ 200 characters), `level` (0–9), `classes` (class ids) or
`classLevels` (`{ classId: level }`), `school`, `castingTime`, `range`, `components`, `duration`,
`concentration`, `ritual`, `savingThrow`, `damage`, `description` (≤ 20,000 characters), `source`.

Feat fields: `name` (required, unique), `type` (matched by `featSlots.types`), `prerequisites`, `benefit`,
`source`. The effect of a feat on the sheet is defined in `rules.json` (`featEffects`).

An update replaces the spell list; feats are matched by name. Characters keep what they have.

## 10. What the app reads and provides

### Values the app reads

Define these keys in `stats` (or skip them) and the app uses them in fixed places. Everything else is only
shown where `layout.json` names it.

| Key | Used for |
|---|---|
| `maxHp` | hit points (at least 1) |
| `ac`, `touchAc`, `flatFootedAc` | armor class |
| `initiative` | initiative, dice roller |
| `save.<X>` | saving throws listed in `layout.saves` |
| `speed` | movement (in feet) |
| `carryCapacity`, `loadLevel` | capacity; load 0–3 = light, medium, heavy, overloaded |
| `passivePerception` | GM overview |
| `bab`, `meleeAttack`, `rangedAttack`, `cmb`, `cmd` | attack values (where the system has them) |
| `armorCheckPenalty`, `spellFailure` | equipment page (spell failure 0–100) |
| `skill.<key>` | skills |
| `carriedWeight` | provided by the app, may be shown in the layout |

### Facts the app provides

| Name | Meaning |
|---|---|
| `item.<effectKey>` | sum of an effect over equipped items |
| `armor.type` | `none`, `light`, `medium`, `heavy` (heaviest worn body armor) |
| `armor.base` | 10 + `ArmorBonus` of equipped items |
| `armor.acp`, `armor.spellFailure` | armor check penalty (≤ 0) and spell failure of the body armor |
| `shield.type` | `none`, `shield`, `towershield` |
| `shield.bonus`, `shield.equipped`, `shield.acp`, `shield.spellFailure` | the shield |
| `carried` | carried weight |
| `size`, `baseSpeed` | from the ancestry (or the character) |
| `ancestry.choice` | ability picked for an `abilityChoice` ancestry |
| `favoredClassHp`, `favoredClassSkill` | favored-class points (PF1 style) |

Item effect keys GMs can use: `Str`, `Dex`, `Con`, `Int`, `Wis`, `Cha`, `MaxHp`, `Fort`, `Ref`, `Will`,
`Resistance`, `ArmorBonus`, `ShieldBonus`, `NaturalArmor`, `Deflection`, `Dodge`, `ArmorCheckPenalty`,
`MaxDex`, `BAB`, `Initiative`, `PassivePerception`, `Skill:<key>`. Ability effects (matched by your ability
keys) and `Skill:<key>` apply automatically; everything else only counts where your formulas read
`item.<key>`.

## 11. Complete example package

A small fantasy system using most features. The upload accepts it as it is; the repository's test suite
loads exactly these blocks, so they stay correct. Copy each block into the file named in its first line.

```json
// file: manifest.json
{
  "format": "foliant-rules", "apiVersion": 1, "type": "system",
  "id": "example.skirmish", "name": "Skirmish (example)", "version": "1.0.0",
  "license": "CC0-1.0", "authors": ["Foliant"], "languages": ["en"]
}
```

```json
// file: rules.json
{
  "abilities": ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
  "abilityModifier": "floor((score - 10) / 2)",
  "abilityIncreaseEvery": 4,
  "stacking": { "rule": "highest-per-type", "alwaysStack": ["dodge"] },
  "tables": {
    "prof": [2, 2, 2, 2, 3, 3, 3, 3, 4, 4],
    "slots1": [2, 3, 4, 4, 4, 4, 4, 4, 4, 4],
    "slots2": [0, 0, 2, 3, 3, 3, 3, 3, 3, 3]
  },
  "grants": ["prof:weapon.simple"],
  "attunementLimit": 3,
  "coreSources": ["Skirmish Basic Rules"],

  "skills": [
    { "key": "athletics", "name": "Athletics", "ability": "STR" },
    { "key": "stealth", "name": "Stealth", "ability": "DEX", "armorCheck": true },
    { "key": "arcana", "name": "Arcana", "ability": "INT", "trainedOnly": true },
    { "key": "perception", "name": "Perception", "ability": "WIS" }
  ],
  "skillFormula": "mod(ability) + (proficient ? prof : 0) + (expertise ? prof : 0) + (armorCheck ? armor.acp : 0)",

  "stats": [
    { "key": "prof", "expr": "table('prof', level)" },
    { "key": "maxHp", "expr": "hitDie + mod(CON) + perclass('level * (floor(hitDie / 2) + 1 + mod(CON))') - (floor(hitDie / 2) + 1 + mod(CON))" },
    { "key": "initiative", "expr": "mod(DEX)", "plus": "item.Initiative" },
    { "key": "ac", "pick": "first", "plus": "shield.bonus",
      "options": [
        { "when": "armor.type == 'heavy'", "expr": "armor.base" },
        { "when": "armor.type == 'medium'", "expr": "armor.base + min(mod(DEX), 2)" },
        { "expr": "armor.base + mod(DEX)" }
      ] },
    { "key": "save.DEX", "expr": "mod(DEX) + (has('prof:save.DEX') ? prof : 0)" },
    { "key": "save.CON", "expr": "mod(CON) + (has('prof:save.CON') ? prof : 0)" },
    { "key": "save.WIS", "expr": "mod(WIS) + (has('prof:save.WIS') ? prof : 0)" },
    { "key": "speed", "expr": "ancestry.speed" },
    { "key": "carryCapacity", "expr": "STR * 15" },
    { "key": "loadLevel", "expr": "carried > carryCapacity ? 3 : carried > carryCapacity * 2 / 3 ? 2 : carried > carryCapacity / 3 ? 1 : 0" },
    { "key": "passivePerception", "expr": "10 + skill('perception')" },
    { "key": "spellDc", "expr": "has('caster') ? 8 + prof + castingMod : 0" },
    { "key": "armorCheckPenalty", "expr": "armor.acp + shield.acp" }
  ],

  "conditions": [
    { "id": "poisoned", "name": "Poisoned", "icon": "🤢", "text": "−2 on skill checks.",
      "modifiers": [ { "target": "skill.*", "value": "-2" } ] },
    { "id": "shielded", "name": "Shielded", "icon": "🛡️", "kind": "buff", "text": "+2 AC (deflection).",
      "modifiers": [ { "target": "ac", "value": "2", "type": "deflection" } ] }
  ],

  "ancestries": [
    { "id": "dwarf", "name": "Dwarf", "speed": 25, "text": "Darkvision, tough.",
      "traits": ["+2 Constitution", "Darkvision 18 m", "+1 HP per level"],
      "modifiers": [ { "target": "CON", "value": "2" }, { "target": "maxHp", "value": "level" } ],
      "grants": ["trait:darkvision"],
      "resources": [ { "id": "stoneskin", "name": "Stoneskin", "max": "1", "detail": "+{prof} AC for one round" } ] },
    { "id": "human", "name": "Human", "abilityChoice": true, "traits": ["+2 to one ability of your choice"],
      "modifiers": [
        { "target": "STR", "value": "2", "when": "ancestry.choice == 'STR'" },
        { "target": "DEX", "value": "2", "when": "ancestry.choice == 'DEX'" },
        { "target": "CON", "value": "2", "when": "ancestry.choice == 'CON'" },
        { "target": "INT", "value": "2", "when": "ancestry.choice == 'INT'" },
        { "target": "WIS", "value": "2", "when": "ancestry.choice == 'WIS'" },
        { "target": "CHA", "value": "2", "when": "ancestry.choice == 'CHA'" }
      ] }
  ],
  "backgrounds": [
    { "id": "scout", "name": "Scout", "text": "Proficient in Stealth and Perception.",
      "grants": ["prof:skill.stealth", "prof:skill.perception"] },
    { "id": "scholar", "name": "Scholar", "text": "Expert in Arcana.",
      "grants": ["prof:skill.arcana", "expertise:skill.arcana"] }
  ],

  "classes": [
    {
      "id": "fighter", "name": "Fighter", "hitDie": 10,
      "grants": ["prof:weapon.martial", "prof:save.CON"],
      "levels": { "1": { "features": ["style", "second-wind"] }, "5": { "features": ["extra-attack"] } },
      "features": {
        "style": { "name": "Fighting Style", "text": "Choose one.",
          "choice": { "pick": 1, "options": [
            { "id": "defense", "name": "Defense", "text": "+1 AC while wearing armor.",
              "modifiers": [ { "target": "ac", "value": "1", "when": "armor.type != 'none'" } ] },
            { "id": "archery", "name": "Archery", "text": "+2 on ranged attacks.", "grants": ["style:archery"] }
          ] } },
        "second-wind": { "name": "Second Wind", "text": "Regain 1d10 + level hit points.",
          "resource": { "id": "second-wind", "name": "Second Wind", "max": "floor((level + 1) / 2)", "reset": "short" } },
        "extra-attack": { "name": "Extra Attack", "text": "Attack twice." }
      },
      "featGrants": [ { "level": 1, "feats": ["Shield Proficiency"] } ],
      "values": [ { "label": "Second Wind", "value": "1d10 + {level}" } ]
    },
    {
      "id": "mage", "name": "Mage", "hitDie": 6,
      "grants": ["prof:save.WIS", "caster"],
      "levels": { "1": { "features": ["school", "bond"] } },
      "features": {
        "school": { "name": "Arcane School", "text": "Choose a school; one slot per level is for its spells.",
          "choice": { "pick": 1, "options": [
            { "id": "evocation", "name": "Evocation" }, { "id": "illusion", "name": "Illusion" }
          ] } },
        "bond": { "name": "Arcane Bond", "text": "A familiar or a bonded object.",
          "choice": { "pick": 1, "options": [
            { "id": "familiar", "name": "Familiar", "grants": ["familiar"] },
            { "id": "object", "name": "Bonded Object",
              "resource": { "id": "bonded-object", "name": "Bonded object", "max": "1", "reset": "long" } }
          ] } }
      },
      "spellcasting": {
        "ability": "INT", "prepared": true, "tradition": "arcane",
        "cantrips": "3 + floor(level / 4)",
        "slots": { "1": "table('slots1', level)", "2": "table('slots2', level)" },
        "special": "1"
      }
    },
    {
      "id": "bard", "name": "Bard", "hitDie": 8,
      "grants": ["prof:save.DEX", "caster", "expertise:skill.perception"],
      "levels": { "1": { "features": [] } },
      "features": {},
      "spellcasting": { "ability": "CHA", "prepared": false, "cantrips": "2", "known": "level + 3",
        "slots": { "1": "table('slots1', level)" } },
      "performance": {
        "name": "Performance", "book": "Songbook", "item": "Song", "tab": "Songs",
        "rounds": "4 + mod(CHA) + 2 * (level - 1)",
        "dc": "10 + floor(level / 2) + mod(CHA)",
        "start": [ { "from": 1, "text": "action" }, { "from": 7, "text": "bonus action" } ],
        "list": [ { "name": "Courage", "level": 1, "short": "Bonus for allies",
                    "effect": "Allies gain +{1 + floor(level / 6)} on attack rolls. DC {dc}." } ]
      }
    }
  ],

  "featSlots": [
    { "id": "general", "label": "Feats", "count": "1 + floor(level / 4)", "any": true },
    { "id": "bonus", "label": "Fighter bonus feat", "when": "has('class:fighter')", "count": "floor(level / 2)", "types": ["Combat"] }
  ],
  "featEffects": {
    "toughness": { "modifiers": [ { "target": "maxHp", "value": "level" } ] },
    "skillfocus": { "modifiers": [ { "target": "skill.{choice}", "value": "3" } ] },
    "weaponfocus": { "grants": ["focus:{choice}"] }
  },
  "featChoices": { "skillfocus": "skill", "weaponfocus": "weapon" },
  "repeatableFeats": ["skillfocus", "weaponfocus"],
  "featTree": {
    "seeds": { "melee": ["powerattack"], "ranged": ["pointblankshot"] },
    "featureRequirements": { "bonded familiar": [["Arcane Bond", "Familiar"]], "rage": [] },
    "ancestries": ["dwarf", "human"]
  },

  "weapons": [
    { "key": "dagger", "name": "Dagger", "category": "simple", "use": "light", "damage": "1d4", "finesse": true, "thrown": true },
    { "key": "longsword", "name": "Longsword", "category": "martial", "damage": "1d8", "groups": ["blades"] },
    { "key": "longbow", "name": "Longbow", "category": "martial", "use": "ranged", "damage": "1d8", "critMultiplier": 3, "groups": ["bows"] }
  ],
  "attacks": {
    "weapon": {
      "values": [
        { "key": "ranged", "expr": "weapon.use == 'ranged'" },
        { "key": "ability", "expr": "ranged || (weapon.finesse && mod(DEX) > mod(STR)) ? mod(DEX) : mod(STR)" }
      ],
      "count": "has('feature:extra-attack') ? 2 : 1",
      "bonus": "ability + (weapon.proficient ? prof : 0) + weapon.attackBonus + (ranged && has('style:archery') ? 2 : 0) + (has('focus:' + weapon.key) ? 1 : 0)",
      "damage": "{weapon.dice != '' ? weapon.dice : weapon.damage} + {ability + weapon.damageBonus}",
      "crit": "{weapon.critRange}/×{weapon.critMultiplier}",
      "proficient": "weapon.proficient",
      "notes": [ { "text": "Blade drill: reroll 1s on damage", "when": "has('weapon.group:blades') && has('class:fighter')" } ]
    },
    "extra": [
      { "when": "weapons.count == 0", "name": "Unarmed strike", "bonus": "mod(STR) + prof", "damage": "{1 + mod(STR)}" }
    ]
  },

  "toggles": [
    { "id": "fury", "name": "Battle Fury", "when": "has('class:fighter')",
      "effect": "+2 STR, −2 AC for {2 + floor(level / 4)} rounds",
      "modifiers": [ { "target": "STR", "value": "2" }, { "target": "ac", "value": "-2" } ] }
  ],
  "situational": [
    { "text": "Darkvision 18 m", "when": "has('trait:darkvision')" },
    { "text": "+2 on saves against poison", "when": "has('ancestry:dwarf')" }
  ],

  "spellLists": { "school:evocation": ["Magic Missile", "Burning Hands"], "school:illusion": ["Silent Image", "Disguise Self"] },
  "spellSpecials": {
    "specialSlot": [ { "feature": "Arcane School", "match": "list", "prefix": "school:", "firstOnly": true } ]
  },
  "companions": {
    "kinds": [ { "name": "Familiar", "hp": "floor(masterHp / 2)", "lines": ["Natural armor +{1 + floor(level / 2)}"] } ],
    "grants": [ { "kind": "Familiar", "when": "has('familiar')" } ]
  },

  "ammunition": [
    { "name": "Arrows", "original": "Arrows", "pack": 20, "weapon": "Longbow", "core": true, "notes": "Standard arrows." },
    { "name": "Fire arrows", "original": "Fire arrows", "pack": 5, "weapon": "Longbow", "extraDamage": "1d4 fire", "notes": "Burns." }
  ],
  "ammoMaterials": [ { "name": "Silver", "damageBonus": -1, "note": "Hurts werewolves." } ]
}
```

```json
// file: layout.json
{
  "abilities": [
    { "key": "STR", "label": "STR", "name": "Strength" },
    { "key": "DEX", "label": "DEX", "name": "Dexterity" },
    { "key": "CON", "label": "CON", "name": "Constitution" },
    { "key": "INT", "label": "INT", "name": "Intelligence" },
    { "key": "WIS", "label": "WIS", "name": "Wisdom" },
    { "key": "CHA", "label": "CHA", "name": "Charisma" }
  ],
  "saves": [
    { "key": "save.DEX", "label": "Dexterity", "short": "DEX", "format": "signed" },
    { "key": "save.CON", "label": "Constitution", "short": "CON", "format": "signed" },
    { "key": "save.WIS", "label": "Wisdom", "short": "WIS", "format": "signed" }
  ],
  "sheetStats": [
    { "key": "maxHp", "label": "Hit points" },
    { "key": "ac", "label": "Armor Class" },
    { "key": "initiative", "label": "Initiative", "format": "signed" },
    { "key": "prof", "label": "Proficiency bonus", "format": "signed" },
    { "key": "speed", "label": "Speed", "format": "distance" },
    { "key": "carryCapacity", "label": "Carrying capacity", "format": "weight" },
    { "key": "carriedWeight", "label": "Carried", "format": "weight" }
  ],
  "combatStats": [
    { "key": "initiative", "label": "Initiative", "format": "signed" },
    { "key": "speed", "label": "Speed", "format": "distance" },
    { "key": "passivePerception", "label": "Passive Perception" },
    { "key": "spellDc", "label": "Spell DC" }
  ],
  "partyStats": [
    { "key": "ac", "label": "Armor Class", "short": "AC" },
    { "key": "passivePerception", "label": "Passive Perception", "short": "PP" }
  ],
  "armorDetail": "Proficiency +{prof} · spell DC {spellDc}",
  "quickStats": [
    { "key": "ac", "label": "Armor Class", "short": "AC", "icon": "shield", "detail": "Proficiency +{prof}" },
    { "key": "initiative", "label": "Initiative", "short": "Init", "format": "signed", "icon": "zap" },
    { "key": "passivePerception", "label": "Passive Perception", "short": "Perc.", "icon": "eye" }
  ]
}
```

```json
// file: tests/fighter-5.json
{
  "name": "Fighter 5, dwarf scout, defense style in medium armor, poisoned",
  "character": {
    "level": 5,
    "classes": [ { "classId": "fighter", "level": 5 } ],
    "ancestry": "dwarf",
    "background": "scout",
    "abilities": { "STR": 16, "DEX": 14, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10 },
    "choices": { "fighter/style": "defense" },
    "conditions": ["poisoned"],
    "facts": { "armor.type": "medium", "armor.base": 14, "armor.acp": -1 }
  },
  "expect": {
    "CON": 16, "mod.CON": 3, "prof": 3, "maxHp": 54, "ac": 17, "save.CON": 6, "save.DEX": 2,
    "speed": 25, "skill.stealth": 2, "skill.perception": 2, "passivePerception": 12, "spellDc": 0
  }
}
```

```json
// file: tests/fighter-fury.json
{
  "name": "Fighter 2 in Battle Fury, shielded",
  "character": {
    "level": 2,
    "classes": [ { "classId": "fighter", "level": 2 } ],
    "abilities": { "STR": 15, "DEX": 12, "CON": 12, "INT": 10, "WIS": 10, "CHA": 10 },
    "choices": { "fighter/style": "archery" },
    "conditions": ["shielded"],
    "tags": ["toggle:fury"],
    "facts": { "armor.type": "none", "armor.base": 10, "shield.bonus": 2 }
  },
  "expect": { "STR": 17, "mod.STR": 3, "ac": 13, "skill.athletics": 3 }
}
```

```json
// file: tests/mage-3.json
{
  "name": "Mage 3, human (+2 INT), scholar",
  "character": {
    "level": 3,
    "classes": [ { "classId": "mage", "level": 3 } ],
    "ancestry": "human",
    "background": "scholar",
    "abilities": { "STR": 8, "DEX": 14, "CON": 12, "INT": 15, "WIS": 12, "CHA": 10 },
    "choices": { "mage/school": "evocation", "mage/bond": "object" },
    "facts": { "ancestry.choice": "INT", "armor.type": "none", "armor.base": 10 }
  },
  "expect": { "INT": 17, "maxHp": 17, "ac": 12, "spellDc": 13, "save.WIS": 3, "skill.arcana": 7, "speed": 30 }
}
```

```json
// file: tests/fighter-mage.json
{
  "name": "Fighter 3 / Mage 2 (multiclass)",
  "character": {
    "level": 5,
    "classes": [ { "classId": "fighter", "level": 3 }, { "classId": "mage", "level": 2 } ],
    "abilities": { "STR": 14, "DEX": 12, "CON": 14, "INT": 14, "WIS": 10, "CHA": 8 },
    "choices": { "fighter/style": "defense", "mage/school": "evocation", "mage/bond": "familiar" },
    "facts": { "armor.type": "light", "armor.base": 11 }
  },
  "expect": { "prof": 3, "maxHp": 40, "ac": 13, "save.CON": 5, "save.WIS": 3, "spellDc": 13 }
}
```

## 12. Common errors

| Message | Cause |
|---|---|
| `rules.json: unknown field "exp" at $.stats[0].exp (line 2)` | typo in a field name, or the field belongs elsewhere |
| `manifest.json: id must be lower case …` | upper case, spaces or umlauts in `id` |
| `manifest.json: give the version in the format 1.0.0.` | `"1.0"` or `"v1"` |
| `layout.json: value "x" is not defined in rules.json.` | the layout names a value without a stat |
| `layout.json: saving throw "x" must start with "save.".` | saves are `save.<something>` |
| `stats[x]: defined twice.` / `has the same name as an ability.` | duplicate key |
| `stats[x]: needs expr or options.` | empty stat |
| `classes[c].levels[2]: feature "f" is not defined.` | id in `levels` missing from `features` |
| `… choice: too few options.` | `pick` larger than the number of options |
| `skills[k]: ability "X" does not exist.` | the ability key isn't in `abilities` |
| `Circular reference: a → b → a` | a value depends on itself |
| `tests/x.json "name": ac expected 15, computed 14` | the formula or the expectation is wrong; the message shows both |
| `tests/x.json "name": foo does not exist` | `expect` names a key no stat defines |
| `The package needs at least one test under tests/*.json.` | no tests, or zipped inside a subfolder |
| `The file is not a valid ZIP archive.` | not a ZIP (or a damaged one) |

Values seem wrong but no error? Check that the formula reads the right name: unknown names read as `0`
on purpose. A test with the value in `expect` finds such mistakes immediately.
