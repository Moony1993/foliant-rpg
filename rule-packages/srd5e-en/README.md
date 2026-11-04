# 5e SRD 5.1 (English) — rule package

The English edition of [`srd5e`](../srd5e): same rules, values and tests, with English names
and feature texts. Distances stay metric, like everywhere in the app.

It is **generated** — change the German package, then rebuild this one:

```bash
python3 rule-packages/srd5e-en/build.py
```

`translations.json` maps every German name and text to English; the build stops if one is missing.
Spell names are the English SRD originals, spell descriptions the original SRD text.

## Build the package
```bash
cd rule-packages/srd5e-en
zip -r ../srd5e-en.foliant-rules manifest.json rules.json layout.json spells.json feats.json tests
```

## Attribution (required, CC-BY-4.0)
This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

Changes to the SRD material: class features, conditions and ancestry traits are short summaries written by the
Foliant project, not the original SRD text; distances are converted to metric. Spell descriptions are the original
SRD text. The spell data was taken from [5e-database](https://github.com/5e-bits/5e-database) (MIT license, see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)).

Feats: Grappler is summarized from the SRD 5.1; all other feats (about 50) (source "Foliant examples" / "Foliant-Beispiele")
are original examples written by the Foliant project. They are taken instead of an ability score improvement.
