// Talent tree: branches, prerequisite graph and the WoW-style grid layout for the feats page.
import type { ClassFeature, Feat, FeatSlot, RuleLayout, WeaponDef } from './types';
import { t } from './i18n';

/** Normalized feat name: "Cleave, Great" and "Great Cleave" give the same key (prereq texts use the latter). */
export const featKey = (name: string) => {
  let n = name.toLowerCase().replace(/[’']/g, '').trim();
  const m = n.match(/^(.+?), (improved|greater|great|lesser|minor)$/);
  if (m) n = `${m[2]} ${m[1]}`;
  return n.replace(/[^a-z]/g, '');
};

/** Keys of the feats named in a prerequisite text (only those that exist in `known`). */
export const prereqKeys = (prerequisites: string, known: Set<string>) =>
  [...new Set((prerequisites || '').replace(/\([^)]*\)/g, '').split(/[,;]/).map(featKey).filter((k) => known.has(k)))];

export const slotAccepts = (s: FeatSlot, f: Feat) =>
  s.any || s.names.includes(featKey(f.name)) || s.types.some((t) => f.type.toLowerCase().includes(t.toLowerCase()));

/**
 * Puts every item into its own slot unit (augmenting-path matching, mirrors backend
 * the backend's feat slot check). Returns the slot id per item, or null if they don't all fit.
 */
export function assignSlots<T>(items: T[], slots: FeatSlot[], ok: (item: T, s: FeatSlot) => boolean): string[] | null {
  // Restricted slots first, so bonus-list feats land there and the general slots stay free.
  const units = [...slots].sort((a, b) => Number(a.any) - Number(b.any)).flatMap((s) => Array<FeatSlot>(s.count).fill(s));
  const owner = units.map(() => -1);
  const place = (i: number, seen: boolean[]): boolean => {
    for (let u = 0; u < units.length; u++) {
      if (seen[u] || !ok(items[i], units[u])) continue;
      seen[u] = true;
      if (owner[u] < 0 || place(owner[u], seen)) { owner[u] = i; return true; }
    }
    return false;
  };
  for (let i = 0; i < items.length; i++) if (!place(i, units.map(() => false))) return null;
  const slotOf: string[] = [];
  owner.forEach((i, u) => { if (i >= 0) slotOf[i] = units[u].id; });
  return slotOf;
}

/** System data of the feats page (from the rule package's layout): choices, repeatable feats, tree seeds, core
 *  sources, class-feature prerequisites, ancestries named in prerequisites. Empty for systems without it. */
export type FeatureReq = string | [string, string];
export interface FeatConfig {
  choices: Record<string, ChoiceKind>;
  repeatable: Set<string>;
  seeds: [BranchId, string[]][];
  core: string[];
  featureReqs: Record<string, FeatureReq[]>;
  ancestries: Set<string>;
}
const configs = new WeakMap<object, FeatConfig>();
const NO_CONFIG: FeatConfig = { choices: {}, repeatable: new Set(), seeds: [], core: [], featureReqs: {}, ancestries: new Set() };
export function featConfig(layout?: RuleLayout | null): FeatConfig {
  const f = layout?.feats;
  if (!f) return NO_CONFIG;
  let c = configs.get(f);
  if (!c) configs.set(f, c = {
    choices: f.choices as Record<string, ChoiceKind>, repeatable: new Set(f.repeatable),
    seeds: Object.entries(f.tree?.seeds ?? {}) as [BranchId, string[]][], core: layout?.coreSources ?? [],
    featureReqs: f.tree?.featureRequirements ?? {}, ancestries: new Set(f.tree?.ancestries ?? []),
  });
  return c;
}

/** Feat from the system's core rules (no core sources defined = every feat counts). */
export const isCore = (f: Feat, cfg: FeatConfig) => !cfg.core.length || cfg.core.some((c) => f.source === c || f.source.includes(c));

export type BranchId = 'melee' | 'ranged' | 'maneuver' | 'defense' | 'magic' | 'general';
export const BRANCHES: { id: BranchId; label: string }[] = [
  { id: 'melee', label: t('Nahkampf') },
  { id: 'ranged', label: t('Fernkampf') },
  { id: 'maneuver', label: t('Manöver') },
  { id: 'defense', label: t('Schutz') },
  { id: 'magic', label: t('Magie') },
  { id: 'general', label: t('Allgemein') },
];

// A feat belongs to the first branch whose seed (FeatConfig.seeds, in order) is the feat itself or one of its
// prerequisites (transitively). Everything else falls back to its type.

export type TreeNode = { key: string; feat: Feat; deps: string[]; ghost: boolean; row: number; col: number };
export type Tree = { nodes: TreeNode[]; rows: number; soloRow: number | null };
export const COLS = 4;

/** Prerequisite graph over `feats`: key → { feat, deps, branch }. */
export function buildGraph(feats: Feat[], cfg: FeatConfig) {
  const byKey = new Map(feats.map((f) => [featKey(f.name), f]));
  const known = new Set(byKey.keys());
  const deps = new Map([...byKey].map(([k, f]) => [k, prereqKeys(f.prerequisites, known).filter((d) => d !== k)]));
  const ancestors = (k: string, seen = new Set<string>()): Set<string> => {
    for (const d of deps.get(k) ?? []) if (!seen.has(d)) { seen.add(d); ancestors(d, seen); }
    return seen;
  };
  const branch = new Map<string, BranchId>();
  for (const [k, f] of byKey) {
    const line = new Set([k, ...ancestors(k)]);
    const seeded = cfg.seeds.find(([, s]) => s.some((x) => line.has(x)))?.[0];
    const t = f.type.toLowerCase();
    branch.set(k, seeded ?? (/metamagic|item creation/.test(t) || /channel|spell|caster level/i.test(f.prerequisites) ? 'magic'
      : /combat/.test(t) ? 'melee' : 'general'));
  }
  return { byKey, deps, branch };
}

/**
 * Grid layout of one branch. Prerequisites from other branches are added as ghost nodes.
 * Chains are laid out one block each (≤ COLS wide, a level that is wider wraps into more rows),
 * blocks are packed top-down into the free cells; feats without any link go into a final section.
 */
export function layoutBranch(g: ReturnType<typeof buildGraph>, id: BranchId, visible: (k: string) => boolean): Tree {
  const own = [...g.byKey.keys()].filter((k) => g.branch.get(k) === id && visible(k));
  const ownSet = new Set(own);
  const ghosts = [...new Set(own.flatMap((k) => g.deps.get(k)!.filter((d) => g.branch.get(d) !== id)))];
  const keys = [...own, ...ghosts];
  const inTree = new Set(keys);
  const deps = (k: string) => (ownSet.has(k) ? g.deps.get(k)!.filter((d) => inTree.has(d)) : []);
  const kids = new Map(keys.map((k) => [k, keys.filter((c) => deps(c).includes(k))]));
  const depth = new Map<string, number>();
  const dp = (k: string): number => depth.get(k) ?? (depth.set(k, 1 + Math.max(0, ...deps(k).map(dp))), depth.get(k)!);
  keys.forEach(dp);

  // Connected components; linked ones first (biggest first), solo feats last.
  const comps: string[][] = [];
  const done = new Set<string>();
  for (const k of keys) {
    if (done.has(k)) continue;
    const comp: string[] = [];
    const stack = [k];
    while (stack.length) {
      const x = stack.pop()!;
      if (done.has(x)) continue;
      done.add(x); comp.push(x);
      stack.push(...deps(x), ...kids.get(x)!);
    }
    comps.push(comp);
  }
  const byName = (a: string, b: string) => g.byKey.get(a)!.name.localeCompare(g.byKey.get(b)!.name);
  const linked = comps.filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
  const solos = comps.filter((c) => c.length === 1).map((c) => c[0]).sort(byName);

  const used = new Set<string>(); // "row:col"
  const pos = new Map<string, { row: number; col: number }>();
  for (const comp of linked) {
    // Local layout: one level after the other, each node as close as possible to its parents' column.
    const local = new Map<string, { row: number; col: number }>();
    const levels = Math.max(...comp.map((k) => depth.get(k)!));
    let row = 0;
    for (let lv = 1; lv <= levels; lv++) {
      const level = comp.filter((k) => depth.get(k) === lv).sort(byName);
      const want = (k: string) => {
        const ps = deps(k).map((d) => local.get(d)?.col).filter((c): c is number => c !== undefined);
        return ps.length ? ps.reduce((s, c) => s + c, 0) / ps.length : 0;
      };
      level.sort((a, b) => want(a) - want(b));
      for (let i = 0; i < level.length; i += COLS) {
        const taken = new Set<number>();
        for (const k of level.slice(i, i + COLS)) {
          const w = Math.round(want(k));
          const col = [0, 1, -1, 2, -2, 3, -3].map((d) => w + d).find((c) => c >= 0 && c < COLS && !taken.has(c))!;
          taken.add(col);
          local.set(k, { row, col });
        }
        row++;
      }
    }
    // Shift the block left as far as possible, then find the first free spot top-down.
    const minCol = Math.min(...[...local.values()].map((p) => p.col));
    const cells = [...local].map(([k, p]) => ({ k, row: p.row, col: p.col - minCol }));
    const width = Math.max(...cells.map((c) => c.col)) + 1;
    const height = row;
    let top = 0, left = 0;
    for (; ; top++) {
      left = [...Array(COLS - width + 1).keys()].find((l) =>
        [...Array(height).keys()].every((r) => [...Array(width).keys()].every((c) => !used.has(`${top + r}:${l + c}`)))) ?? -1;
      if (left >= 0) break;
    }
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) used.add(`${top + r}:${left + c}`);
    for (const c of cells) pos.set(c.k, { row: top + c.row, col: left + c.col });
  }
  const chainRows = Math.max(0, ...[...pos.values()].map((p) => p.row + 1));
  solos.forEach((k, i) => pos.set(k, { row: chainRows + Math.floor(i / COLS), col: i % COLS }));

  return {
    nodes: keys.map((k) => ({ key: k, feat: g.byKey.get(k)!, deps: deps(k), ghost: !ownSet.has(k), ...pos.get(k)! })),
    rows: chainRows + Math.ceil(solos.length / COLS),
    soloRow: solos.length ? chainRows : null,
  };
}

// Class-feature prerequisites (keyword in the prerequisite text) → the class features on the dashboard that satisfy
// them (FeatConfig.featureReqs from the package); [feature, option] when a specific choice is needed. The feat counts
// only once the character's level has reached that feature. An empty list = a class the system doesn't offer.
const reqFeature = (r: FeatureReq) => (typeof r === 'string' ? r : r[0]);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Class-feature prerequisites of a feat (`prereq` = lowercased prerequisite text) against the character's
 * class features: 'never' if the class has none of them, 'locked' (with reasons) if not gained yet or the
 * wrong option is chosen. `features` undefined = still loading → locked.
 */
export function featureReqs(prereq: string, features: ClassFeature[] | undefined, level: number,
  choices: Record<string, string>, cfg: FeatConfig): { state: 'ok' | 'locked' | 'never'; why: string[] } {
  let state: 'ok' | 'locked' = 'ok';
  const why: string[] = [];
  for (const kw in cfg.featureReqs) {
    if (!new RegExp(`\\b${escapeRe(kw)}(?![a-z])`).test(prereq)) continue;
    if (!features) { state = 'locked'; continue; }
    const offered = cfg.featureReqs[kw].filter((r) => features.some((x) => x.name === reqFeature(r)));
    if (!offered.length) return { state: 'never', why };
    const met = offered.some((r) => {
      const feature = features.find((x) => x.name === reqFeature(r))!;
      return feature.level <= level && (typeof r === 'string' || (choices[feature.name] ?? '').split(',').includes(r[1]));
    });
    if (met) continue;
    state = 'locked';
    const r = offered[0], feature = features.find((x) => x.name === reqFeature(r))!;
    why.push(feature.level > level ? t('Klassenmerkmal „{name}“ erst ab Stufe {level}.', { name: feature.name, level: feature.level })
      : t('Klassenmerkmal „{name}“: dafür „{option}“ wählen (Dashboard).', { name: feature.name, option: (r as [string, string])[1] }));
  }
  return { state, why };
}

// ---- Feats with a choice: FeatConfig.choices (feat key → weapon | skill | school), from the package ----
export type ChoiceKind = 'weapon' | 'skill' | 'school';
/** Spell schools; the key is what Spell Focus stores (English, as in the spell compendium). */
export const SCHOOLS = [
  { key: 'abjuration', label: 'Bannmagie' }, { key: 'conjuration', label: 'Beschwörung' },
  { key: 'divination', label: 'Erkenntnis' }, { key: 'enchantment', label: 'Verzauberung' },
  { key: 'evocation', label: 'Hervorrufung' }, { key: 'illusion', label: 'Illusion' },
  { key: 'necromancy', label: 'Nekromantie' }, { key: 'transmutation', label: 'Verwandlung' },
];

// School texts from the compendium (English) or the app (German) → SCHOOLS key (mirrors the backend's school aliases).
const SCHOOL_ALIASES: Record<string, string> = {
  bannmagie: 'abjuration', bannung: 'abjuration', beschwörung: 'conjuration', erkenntnis: 'divination', erkennung: 'divination',
  verzauberung: 'enchantment', hervorrufung: 'evocation', nekromantie: 'necromancy', verwandlung: 'transmutation',
};
export const schoolKey = (school?: string | null) => {
  const first = (school ?? '').trim().toLowerCase().split(/[\s(\[,]/)[0];
  return SCHOOLS.some((x) => x.key === first) ? first : SCHOOL_ALIASES[first] ?? '';
};

/**
 * Which choices a feat may still be taken for. `taken(feat)` = choices already taken for that feat.
 * Follow-up feats need the base feat for the same choice: Weapon Specialization / Greater Weapon Focus
 * only for weapons with Weapon Focus, Greater Weapon Specialization for both, Greater Spell Focus for
 * schools with Spell Focus; Weapon Focus and Improved Critical only for weapons the character is proficient with.
 */
export function choiceOptions(feat: Feat, taken: (name: string) => string[], weapons: WeaponDef[], proficient: string[],
  skills: { key: string; name: string }[], cfg: FeatConfig): { value: string; label: string }[] {
  const k = featKey(feat.name);
  const kind = cfg.choices[k];
  if (!kind) return [];
  const has = (name: string) => new Set(taken(name));
  let options: { value: string; label: string }[];
  if (kind === 'skill') options = skills.map((s) => ({ value: s.key, label: s.name }));
  else if (kind === 'school') {
    const base = k === featKey('Greater Spell Focus') ? has('Spell Focus') : null;
    options = SCHOOLS.filter((s) => !base || base.has(s.key)).map((s) => ({ value: s.key, label: s.label }));
  } else {
    const wf = has('Weapon Focus'), ws = has('Weapon Specialization'), gwf = has('Greater Weapon Focus');
    const allowed = (w: WeaponDef) =>
      k === featKey('Weapon Specialization') || k === featKey('Greater Weapon Focus') ? wf.has(w.key)
        : k === featKey('Greater Weapon Specialization') ? ws.has(w.key) && gwf.has(w.key)
          : k === featKey('Martial Weapon Proficiency') ? w.proficiency === 'Martial' && !proficient.includes(w.key)
            : k === featKey('Exotic Weapon Proficiency') ? w.proficiency === 'Exotic' && !proficient.includes(w.key)
              : proficient.includes(w.key);
    options = weapons.filter(allowed).map((w) => ({ value: w.key, label: w.name }));
  }
  const already = has(feat.name);
  return options.filter((o) => !already.has(o.value));
}
