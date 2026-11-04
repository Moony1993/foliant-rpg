#!/usr/bin/env python3
"""Builds the English 5e package from the German one (../srd5e), which stays the source.

Names and feature texts come from translations.json (German → English); spell fields use the word lists
below, spell names the English original in parentheses. Run it after changing the German package:

    python3 rule-packages/srd5e-en/build.py
"""
import json, re, shutil
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE.parent / 'srd5e'
TR = json.loads((HERE / 'translations.json').read_text(encoding='utf-8'))
TEXT_FIELDS = {'name', 'text', 'label', 'short', 'effect', 'detail', 'title', 'description', 'armorDetail'}

SCHOOL = {'Hervorrufung': 'Evocation', 'Beschwörung': 'Conjuration', 'Bannmagie': 'Abjuration', 'Verwandlung': 'Transmutation',
          'Verzauberung': 'Enchantment', 'Nekromantie': 'Necromancy', 'Erkenntnismagie': 'Divination', 'Illusion': 'Illusion'}
WORDS = [('Bonusaktion', 'bonus action'), ('Aktion', 'action'), ('Reaktion', 'reaction'), ('Stunden', 'hours'), ('Stunde', 'hour'),
         ('Minuten', 'minutes'), ('Minute', 'minute'), ('Tage', 'days'), ('Runde', 'round'), ('bis zu', 'up to'),
         ('Sofort', 'Instantaneous'), ('Bis gebannt', 'Until dispelled'), ('Speziell', 'Special'), ('Selbst', 'Self'),
         ('Berührung', 'Touch'), ('Sicht', 'Sight'), ('Unbegrenzt', 'Unlimited')]
DAMAGE = {'Säure': 'acid', 'Energie': 'force', 'Wucht': 'bludgeoning', 'Hieb': 'slashing', 'Nekrotisch': 'necrotic',
          'Gleißend': 'radiant', 'Feuer': 'fire', 'Blitz': 'lightning', 'Gift': 'poison', 'Kälte': 'cold',
          'Psychisch': 'psychic', 'Stich': 'piercing', 'Schall': 'thunder'}
ABBR = {'STÄ': 'STR', 'GES': 'DEX', 'KON': 'CON', 'INT': 'INT', 'WEI': 'WIS', 'CHA': 'CHA'}


def words(s):
    for de, en in WORDS:
        s = re.sub(rf'\b{de}\b', en, s)
    return re.sub(r'(\d),(\d)', r'\1.\2', s)   # 1,5 m → 1.5 m


def text(x, key=''):
    if isinstance(x, dict):
        return {k: text(v, k) for k, v in x.items()}
    if isinstance(x, list):
        return [text(v, key) for v in x]
    if isinstance(x, str) and key in TEXT_FIELDS and re.search(r'[A-Za-zÄÖÜäöüß]{2}', x):
        if x not in TR:
            raise SystemExit(f'No translation for {key}: {x!r} — add it to translations.json')
        return TR[x]
    return x


def spell(s):
    s = dict(s)
    m = re.search(r'\(([^()]+)\)$', s['name'])
    if m: s['name'] = m.group(1)
    s['school'] = SCHOOL.get(s['school'], s['school'])
    for f in ('castingTime', 'range', 'duration'):
        if f in s: s[f] = words(s[f])
    if s.get('damage'):
        s['damage'] = re.sub(r'[A-Za-zÄÖÜäöüß]+$', lambda d: DAMAGE.get(d.group(0), d.group(0)), s['damage'])
    if s.get('savingThrow'):
        a = s['savingThrow'].split('-')[0]
        s['savingThrow'] = f'{ABBR.get(a, a)} saving throw'
    return s


def feat_key(name):
    """Same as FeatNames.Key: lower case letters only, "Cleave, Great" → "greatcleave"."""
    n = name.lower().replace('’', '').replace("'", '').strip()
    m = re.match(r'^(.+?), (improved|greater|great|lesser|minor)$', n)
    if m: n = f'{m.group(2)} {m.group(1)}'
    return re.sub(r'[^a-z]', '', n)


def tr(x, what):
    if x and x not in TR:
        raise SystemExit(f'No translation for feat {what}: {x!r} — add it to translations.json')
    return TR.get(x, x)


def feats(src):
    return [dict(f, name=tr(f['name'], 'name'), type=tr(f['type'], 'type'), prerequisites=tr(f['prerequisites'], 'prerequisites'),
                 benefit=tr(f['benefit'], 'benefit'), source=tr(f['source'], 'source') if f['source'] != 'SRD 5.1' else f['source']) for f in src]


def rekey(rules, keys):
    """Feat keys in rules.json follow the feat names, so they change with the language."""
    k = lambda x: keys.get(x, x)
    rules['featEffects'] = {k(a): v for a, v in rules.get('featEffects', {}).items()}
    rules['featChoices'] = {k(a): v for a, v in rules.get('featChoices', {}).items()}
    rules['repeatableFeats'] = [k(a) for a in rules.get('repeatableFeats', [])]
    if 'featTree' in rules:
        rules['featTree']['seeds'] = {b: [k(a) for a in v] for b, v in rules['featTree']['seeds'].items()}
    return rules


def dump(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def main():
    de_feats = json.loads((SRC / 'feats.json').read_text(encoding='utf-8'))
    en_feats = feats(de_feats)
    keys = {feat_key(a['name']): feat_key(b['name']) for a, b in zip(de_feats, en_feats)}
    dump(HERE / 'feats.json', en_feats)
    dump(HERE / 'rules.json', rekey(text(json.loads((SRC / 'rules.json').read_text(encoding='utf-8'))), keys))
    dump(HERE / 'layout.json', text(json.loads((SRC / 'layout.json').read_text(encoding='utf-8'))))
    dump(HERE / 'spells.json', [spell(s) for s in json.loads((SRC / 'spells.json').read_text(encoding='utf-8'))])
    shutil.rmtree(HERE / 'tests', ignore_errors=True)
    shutil.copytree(SRC / 'tests', HERE / 'tests')
    m = json.loads((SRC / 'manifest.json').read_text(encoding='utf-8'))
    m.update(id=m['id'] + '-en', name='5e SRD 5.1 (English)', languages=['en'])
    dump(HERE / 'manifest.json', m)
    left = [f for f in ('rules.json', 'layout.json', 'spells.json', 'feats.json')
            if re.search(r'"(name|text|label|school|castingTime|range|duration|damage|savingThrow|benefit|prerequisites|type)": "[^"]*[äöüÄÖÜß]', (HERE / f).read_text(encoding='utf-8'))]
    if left: raise SystemExit(f'German text left in {left}')
    print('built', HERE.name, m['version'])


main()
