import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import en from '../i18n/en.json';

// UI language. The German text is the key; en.json maps it to English, a missing entry shows the German text.
// t() is a plain function (usable in components, toasts, helpers and module-level label tables); switching the
// language reloads the page, so every text, including those tables, is evaluated again.
export type Lang = 'de' | 'en';
export const LANGS: { key: Lang; label: string }[] = [{ key: 'de', label: 'Deutsch' }, { key: 'en', label: 'English' }];

const browserLang = (): Lang => (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en');

export const useLang = create<{ lang: Lang; setLang: (lang: Lang) => void }>()(
  persist((set) => ({ lang: browserLang(), setLang: (lang) => { set({ lang }); window.location.reload(); } }), { name: 'pf-lang' }),
);

const dict: Record<Lang, Record<string, string>> = { de: {}, en };

/** Translate a German UI text; {name} placeholders are filled from vars. */
export function t(text: string, vars?: Record<string, string | number | null | undefined>): string {
  const s = dict[useLang.getState().lang][text] ?? text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m)) : s;
}

/** BCP 47 locale for dates and numbers. */
export const locale = () => (useLang.getState().lang === 'de' ? 'de-DE' : 'en-US');
