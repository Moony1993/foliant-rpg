# Spells, feats and your own rule systems

Foliant has no rule system built in. Rules, spells, feats and ammunition come from **rule packages**
(`.foliant-rules`) that an admin installs. On top of that, players and game masters can add their own
content in two ways.

| What | Who | Where it ends up |
|---|---|---|
| Own spell or feat in the app | any player, GM | only in their own campaign |
| Spell and feat list in a rule package | admin (uploads the package) | in every campaign using that system |

Everything is stored in the database (with Docker: in the volume `data`), so restarts and new images
lose nothing.

## In the app (homebrew)

- **Spells:** "Spells" → "Library" → "+ Custom spell". With "Share in the library for everyone" other
  characters of the same class in the campaign can copy it.
- **Feats:** "Feats" → "List & search" → "+ Custom feat".

Own entries are marked as such, belong to the campaign and are included when the campaign is
exported. A package update never touches them.

## In a rule package

A package is a ZIP with these files:

| File | Required | Content |
|---|---|---|
| `manifest.json` | yes | id, name, version, license |
| `rules.json` | yes | abilities, formulas, classes, ancestries, skills, ammunition … |
| `layout.json` | yes | what the sheet, the dashboard and the GM table show |
| `tests/*.json` | yes, at least one | example characters with expected values |
| `spells.json` | no | the system's spell list |
| `feats.json` | no | the system's feat list |

Every file and field, the formula language and a complete example package are in the
**[rule package reference](rule-package-reference.md)**.

Templates to learn from: [`rule-packages/minimal-w6`](../rule-packages/minimal-w6) (tiny) and
[`rule-packages/srd5e-en`](../rule-packages/srd5e-en) (complete, with a spell list).

A package has one language. To offer a system in several languages, ship one package per language
with its own `id` (like `srd.5e-2014` in German and `srd.5e-2014-en` in English); each campaign
picks the one it plays with.

### spells.json

```json
[
  {
    "name": "Fire Bolt",
    "level": 1,
    "classes": ["wizard", "warlock"],
    "school": "Evocation",
    "castingTime": "1 action",
    "range": "120 ft",
    "components": "V, S",
    "duration": "instantaneous",
    "savingThrow": "none",
    "damage": "2d6 fire",
    "description": "A bolt of flame strikes one target.",
    "source": "My house rules p. 12"
  },
  {
    "name": "Bless",
    "classLevels": { "cleric": 1, "paladin": 1 },
    "school": "Enchantment",
    "description": "Allies gain +1 on attacks."
  }
]
```

- `classes` are class ids from `rules.json`. If a spell has a different level per class, give
  `classLevels` instead of `level` and `classes`.
- Levels 0 to 9; `concentration` and `ritual` (true/false) are optional.
- At most 3,000 spells, names must be unique.
- On every update the list replaces the package's spells completely. Characters keep their spells,
  because a spell is copied onto the character when it is learned.

### feats.json

```json
[
  {
    "name": "Power Attack",
    "type": "Combat",
    "prerequisites": "Str 13, base attack bonus +1",
    "benefit": "−1 on attack rolls, +2 on damage.",
    "source": "My house rules p. 30"
  }
]
```

- On an update, feats are matched **by name**: a renamed feat counts as a new one. A feat missing
  from a new version stays anyway, so no character loses it.
- What a feat does on the sheet (bonuses, choosing a weapon …) is defined in `rules.json` under
  `featEffects` and `featChoices`; the feat slots under `featSlots`.
- At most 5,000 feats, names must be unique.

### Dashboard tiles (layout.json)

The top row of the dashboard shows hit points and gold; in between, the package picks up to three values:

```json
"quickStats": [
  { "key": "ac", "label": "Armor Class", "short": "AC", "icon": "shield" },
  { "key": "initiative", "label": "Initiative", "short": "Init", "format": "signed", "icon": "zap" },
  { "key": "prof", "label": "Proficiency bonus", "short": "Prof", "format": "signed", "icon": "star" }
]
```

`key` is a value from `rules.json`, `short` the label on phones, `format` as in `sheetStats`, `detail` an
optional second line (e.g. `"Touch {touchAc} · Flat-footed {flatFootedAc}"`). Icons: shield, zap, star,
sparkles, target, swords, footprints, eye, heart, brain. Without `quickStats` the dashboard shows armor class
and initiative.

### "Core rulebook only" (rules.json)

If your system has core rules and supplements, name the sources that count as core; spells and feats whose
`source` contains one of them pass the filter. Without `coreSources` the filter isn't shown at all.

```json
"coreSources": ["Core Rulebook"]
```

### Ammunition for the quiver (rules.json)

```json
"ammunition": [
  { "name": "Arrows", "original": "Arrows", "pack": 20, "weapon": "Bow", "core": true,
    "attackBonus": 0, "damageBonus": 0, "extraDamage": "", "notes": "Standard arrows." }
],
"ammoMaterials": [
  { "name": "Silver", "damageBonus": -1, "note": "Bypasses DR/silver." }
]
```

Without `ammunition` the quiver shows no armory. Players can still add their own ammunition.

### Class performances (rules.json, on the class)

For example a bard with songs. They appear as their own chapter in the spellbook. Formulas work as in
`stats`; in `effect`, `{…}` is a formula and `{dc}` the saving throw DC.

```json
"performance": {
  "name": "Performance", "book": "Songbook", "item": "Song", "tab": "Songs",
  "rounds": "4 + mod(Cha) + 2 * (level - 1)",
  "dc": "10 + floor(level / 2) + mod(Cha)",
  "start": [ { "from": 1, "text": "standard action" }, { "from": 7, "text": "move action" } ],
  "list": [
    { "name": "Courage", "level": 1, "short": "Bonus for allies",
      "effect": "Allies gain +{1 + floor(level / 6)} on attack rolls. DC {dc}." }
  ]
}
```

## Building and installing a package

```bash
cd rule-packages/my-system
zip -r ../my-system.foliant-rules manifest.json rules.json layout.json tests spells.json feats.json
```

Then, as admin, upload it under "Admin" → "Rule systems" → "Upload package…". Before installing,
the app checks the package completely and lists every error with file and position. Nothing is
installed unless all tests pass. For an update, raise the `version` in the manifest and upload again.

## License of the content

Whoever passes a package on is responsible for the rights to its content. The license goes into
`manifest.json` (`license`, `attribution`), for example `CC-BY-4.0` with the required attribution.
