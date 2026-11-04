# 5e SRD 5.1 (Deutsch) — rule package

5th edition rules based on the **System Reference Document 5.1**, version 0.5.0. Names and summaries
are in German. The English edition is [`srd5e-en`](../srd5e-en), built from this one.

## Included
- Abilities, proficiency bonus, 18 skills with proficiency/expertise, saving throws, initiative, passive perception
- Armor class by armor type (none/light/medium/heavy + shield), Unarmored Defense (barbarian, monk), Draconic Bloodline
- Hit points from hit dice (maximum at 1st level, average afterwards)
- 12 classes with saving throws, skill choices, features and their resources (Rage, Second Wind, Ki, …)
- Spellcasting: full casters, half casters, pact magic; cantrips, spells known, spell save DC and spell attack
- The 9 SRD ancestries, the Acolyte background (the only one in SRD 5.1), 14 conditions (as descriptions)
- Class features up to level 20, Ability Score Improvement or feat as a choice, short/long rest, attunement (max. 3)
- **319 SRD spells** (`spells.json`): German name with the English original, school, classes, casting time,
  range in meters, components, duration, saving throw, damage — the **descriptions are in English** (original SRD text)

## Not included yet
Multiclassing (optional rule). Advantage/disadvantage is not computed — conditions only explain it.
Subclass features from the SRD are shown as text; numbers only take effect where they are unambiguous.

## Build the package
```bash
zip -r ../srd5e.foliant-rules manifest.json rules.json layout.json spells.json feats.json tests
```

## Attribution (required, CC-BY-4.0)
This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

The German names and summaries are the Foliant project's own translations.
The spell data was taken from [5e-database](https://github.com/5e-bits/5e-database) (MIT license, see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)).

Feats: Grappler is summarized from the SRD 5.1; all other feats (about 50) (source "Foliant examples" / "Foliant-Beispiele")
are original examples written by the Foliant project. They are taken instead of an ability score improvement.
