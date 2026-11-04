import type { ClassLevel, DerivedStats, RuleLayout, StatDef } from './types';
import { kilos, meters } from './units';

/** Value of a layout stat: a derived field ("ac") or a saving throw ("save.Fort"). */
export function statValue(d: DerivedStats, key: string): number | undefined {
  // Rule packages report every value by key; the fixed fields cover the built-in system.
  const pkg = d.values?.[key];
  if (pkg !== undefined) return Math.floor(pkg);
  if (key.startsWith('save.')) return d.saves[key.slice(5)];
  const v = (d as unknown as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : undefined;
}

export function formatStat(def: Pick<StatDef, 'key' | 'format'>, d: DerivedStats): string {
  const v = statValue(d, def.key);
  if (v === undefined) return '–';
  switch (def.format) {
    case 'signed': return `${v >= 0 ? '+' : ''}${v}`;
    case 'distance': return meters(v);
    case 'weight': return kilos(v);
    case 'percent': return `${v} %`;
    default: return String(v);
  }
}

/** Fills "{key}" placeholders of a layout template with derived values. */
export const fillTemplate = (template: string, d: DerivedStats) =>
  template.replace(/\{([\w.]+)\}/g, (_, key: string) => String(statValue(d, key) ?? '–'));

/** Display name of a class key ("fighter" → "Kämpfer"); unknown keys show as typed. */
export const className = (layout: RuleLayout | undefined, key: string) =>
  layout?.classes.find((c) => c.key.toLowerCase() === key.toLowerCase())?.name ?? key;

/** All classes with their levels, primary first: it has every level the further classes don't. */
export function classLevels(c: { class: string; level: number; multiclass?: ClassLevel[] | null }): ClassLevel[] {
  const more = (c.multiclass ?? []).filter((x) => x.classId && x.level > 0 && x.classId !== c.class);
  return [{ classId: c.class, level: Math.max(1, c.level - more.reduce((n, x) => n + x.level, 0)) }, ...more];
}

/** "Fighter" for one class, "Fighter 3 / Mage 2" for several. */
export function classLine(layout: RuleLayout | undefined, c: Parameters<typeof classLevels>[0]) {
  const all = classLevels(c);
  return all.length === 1 ? className(layout, c.class) : all.map((x) => `${className(layout, x.classId)} ${x.level}`).join(' / ');
}

/** The class whose spells the character casts: the first caster, primary class first. */
export const castingClass = (layout: RuleLayout | undefined, c: Parameters<typeof classLevels>[0]) =>
  classLevels(c).find((x) => layout?.classes.find((k) => k.key.toLowerCase() === x.classId.toLowerCase())?.caster)?.classId ?? c.class;
