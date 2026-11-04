# Minimal-W6 — example rule package

A deliberately tiny, made-up rule system to start your own packages from.

- `manifest.json` — id, name, version, license
- `rules.json` — abilities, formulas for every value, conditions, classes with features, choices and resources
- `layout.json` — what the character sheet, the dashboard and the GM table show
- `tests/*.json` — example characters with expected values; a package without passing tests cannot be installed

Build the package (from this folder):

```bash
zip -r ../minimal-w6.foliant-rules manifest.json rules.json layout.json tests
```

Optionally add `spells.json` and `feats.json` (spell and feat list), see the [guide](../../docs/rule-packages.md). Every field is described in the [reference](../../docs/rule-package-reference.md).

Then upload it in the admin area under "Rule systems". Checking a package shows every error and test result without installing anything.
