import { locale } from './i18n';
// Metric display. Rules data stays in PF1e units (feet, pounds) so all math keeps working;
// only what the user sees (and types) is metric. Conversion follows the usual table convention:
// 5 ft = 1,5 m (one square), 1 lb = 0,5 kg, 1 mile = 1,5 km, 1 inch = 2,5 cm.

const num = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });
const fmt = (n: number) => num.format(n);

export const ftToM = (ft: number) => ft * 0.3;
/** Metres back to feet, snapped to 5-ft squares (the rules only use whole squares). */
export const mToFt = (m: number) => Math.round(m / 1.5) * 5;
export const lbToKg = (lb: number) => lb * 0.5;
export const kgToLb = (kg: number) => kg * 2;

export const meters = (ft: number) => `${fmt(ftToM(ft))} m`;
export const kilos = (lb: number) => `${fmt(lbToKg(lb))} kg`;

/** Converts imperial units inside free text (spell ranges, durations, rule descriptions). */
export function metric(text: string): string {
  if (!text) return text;
  const n = (s: string) => Number(s.replace(/,/g, ''));
  return text
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*(?:cu\.|cubic)\s*(?:ft\.?|feet|foot)/gi, (_, v) => `${num.format(n(v) * 0.03)} m³`)
    .replace(/(\d[\d,]*(?:\.\d+)?)(\s*-?\s*)(?:ft\.|feet|foot|ft)(?![a-z])/gi,
      (_, v, sep: string) => `${fmt(ftToM(n(v)))}${sep.includes('-') ? '-' : ' '}m`)
    .replace(/(\d[\d,]*(?:\.\d+)?)(\s*-?\s*)miles?(?![a-z])/gi, (_, v, sep: string) => `${fmt(n(v) * 1.5)}${sep.includes('-') ? '-' : ' '}km`)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*(?:lbs?\.?|pounds?)(?![a-z])/gi, (_, v) => kilos(n(v)))
    .replace(/(\d[\d,]*(?:\.\d+)?)(\s*-?\s*)inch(?:es)?(?![a-z])/gi, (_, v, sep: string) => `${fmt(n(v) * 2.5)}${sep.includes('-') ? '-' : ' '}cm`);
}
