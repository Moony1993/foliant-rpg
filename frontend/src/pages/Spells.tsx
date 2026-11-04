import { useEffect, useMemo, useRef, useState } from 'react';
import { useActive } from '../lib/useActive';
import {
  useAddFromCompendium, useCompendiumSpells, useCreateCompendiumSpell, useDeleteCompendiumSpell, useDeleteSpell,
  useSaveSpell, useSaveSpellbook, useSpellbook, useSpellSlots, useSpells,
} from '../lib/queries';
import { useToasts } from '../store/toast';
import { useAuth } from '../store/auth';
import type { Performance, Spell, Spellbook, SpellInput, SpellState } from '../lib/types';
import { castingClass, className } from '../lib/stats';
import { SpellBookTabs, inBook } from '../components/SpellBookTabs';
import { useRuleLayout } from '../lib/queries';
import { metric } from '../lib/units';
import { SCHOOLS, featKey, schoolKey } from '../lib/featTree';
import './spellbook.css';
import { t } from '../lib/i18n';

const EMPTY: SpellInput = {
  name: '', description: '', grade: 1, damage: '', range: '', cost: '', duration: '', prepared: false, school: '', savingThrow: '',
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const ORD = ['', t('ersten'), t('zweiten'), t('dritten'), t('vierten'), t('fünften'), t('sechsten'), t('siebten'), t('achten'), t('neunten')];
const OVERVIEW = -1; // chapter id of the "everything prepared today" overview
type Song = Performance['list'][number];
const SONGS = -2;    // class performances from the rule package (PF1 bard: "Lieder")
type Chapter = number;

// ---- Tracker state edits (pure). Prepared: state.prepared[grade] = slots; spontaneous: state.used[grade]. ----
const slotsOf = (st: SpellState) => Object.entries(st.prepared).map(([g, s]) => [Number(g), s] as const);
// A wizard's opposition-school spell takes two slots per prepared copy (PF1e), so its slots count half.
const perCopy = (book: Spellbook, id: number) => (book.oppositionSpellIds?.includes(id) ? 2 : 1);
const prepCount = (book: Spellbook, id: number) =>
  Math.floor(slotsOf(book.state).reduce((n, [, s]) => n + s.filter((x) => x.spellId === id).length, 0) / perCopy(book, id));
const usedCount = (book: Spellbook, id: number) =>
  Math.floor(slotsOf(book.state).reduce((n, [, s]) => n + s.filter((x) => x.spellId === id && x.used).length, 0) / perCopy(book, id));
const copy = (st: SpellState): SpellState => ({
  prepared: Object.fromEntries(slotsOf(st).map(([g, s]) => [g, s.map((x) => ({ ...x }))])), used: { ...st.used },
  performanceRoundsUsed: st.performanceRoundsUsed ?? 0,
});

/** Prepare into the spell's own grade, regular slots before the domain/school slot; PF1e also
 *  allows a higher-grade slot, used only when the own grade is full. The domain/school slot only takes
 *  domain/school spells; an opposition-school spell needs two free slots. Null when nothing fits. */
function prepare(book: Spellbook, spell: Spell): SpellState | null {
  const st = copy(book.state);
  const need = perCopy(book, spell.id);
  const special = book.specialSpellIds;
  for (const g of book.grades.filter((x) => (spell.grade === 0 ? x.grade === 0 : x.grade >= spell.grade))) {
    const slots = st.prepared[g.grade] ?? [];
    const regular = g.total - g.special;
    const free = [...slots.keys()].sort((a, b) => Number(a >= regular) - Number(b >= regular))
      .filter((k) => slots[k].spellId == null && (k < regular || !special || special.includes(spell.id)));
    if (free.length >= need) { free.slice(0, need).forEach((k) => { slots[k] = { spellId: spell.id, used: false }; }); return st; }
  }
  return null;
}
/** Remove one prepared copy, an unused one first (both slots of an opposition-school spell). */
function unprepare(book: Spellbook, id: number): SpellState {
  const st = copy(book.state);
  const all = slotsOf(st).flatMap(([, s]) => s.filter((x) => x.spellId === id));
  const victims = [...all.filter((x) => !x.used), ...all.filter((x) => x.used)].slice(0, perCopy(book, id));
  victims.forEach((v) => { v.spellId = null; v.used = false; });
  return st;
}
/** Mark one copy cast (used = true) or take a cast back (used = false). */
function castPrepared(book: Spellbook, id: number, used: boolean): SpellState {
  const st = copy(book.state);
  slotsOf(st).flatMap(([, s]) => s).filter((x) => x.spellId === id && x.used !== used).slice(0, perCopy(book, id))
    .forEach((x) => { x.used = used; });
  return st;
}
/** Rest (8 h): every slot back. Prepared spells stay in their slots, as most casters re-prepare the same set. */
const rested = (book: Spellbook): SpellState => {
  const st = copy(book.state);
  slotsOf(st).forEach(([, s]) => s.forEach((x) => { x.used = false; }));
  return { ...st, used: {}, performanceRoundsUsed: 0 };
};

function useWide() {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

// ---- Decoration ----
export const Flourish = () => (
  <svg className="sb-flourish" viewBox="0 0 180 16" aria-hidden>
    <path d="M2 8 H70 M110 8 H178" stroke="currentColor" strokeWidth="1" />
    <path d="M90 2 C80 8 80 8 90 14 C100 8 100 8 90 2 Z M70 8 C76 3 82 4 84 8 C82 12 76 13 70 8 M110 8 C104 3 98 4 96 8 C98 12 104 13 110 8" fill="currentColor" />
  </svg>
);
const Candle = ({ out, puff }: { out: boolean; puff: boolean }) => (
  <svg className={`sb-candle ${out ? 'sb-candle--out' : ''} ${puff ? 'sb-candle--puff' : ''}`} viewBox="0 0 14 30" aria-hidden>
    <path className="sb-smoke" d="M7 8 C5 5 9 3 7 0" stroke="#7a6a5a" strokeWidth="1.2" fill="none" />
    <path className="sb-flame" d="M7 2 C10 6 10 9 7 11 C4 9 4 6 7 2Z" fill="#ffb53a" />
    <path className="sb-flame" d="M7 5 C8.5 7 8.5 9 7 10 C5.5 9 5.5 7 7 5Z" fill="#fff3b0" />
    <rect x="6.5" y="10" width="1" height="3" fill="#2a1a08" />
    <rect x="3.5" y="13" width="7" height="16" rx="1.5" fill="#efe3c6" stroke="#b9a37a" strokeWidth=".6" />
  </svg>
);
const Gem = ({ spent }: { spent: boolean }) => (
  <svg className={`sb-gem ${spent ? 'sb-gem--spent' : ''}`} viewBox="0 0 20 24" aria-hidden>
    <path d="M10 1 L19 8 L10 23 L1 8 Z" fill="#3d7bff" /><path d="M10 1 L14 8 L10 23 L6 8 Z" fill="#7fb0ff" /><path d="M1 8 H19" stroke="#cfe0ff" strokeWidth=".7" />
  </svg>
);
/** One short line for the left page: the summary (or the description's first sentence), then range/duration. */
const shortLine = (s: Spell) => {
  const summary = s.damage || s.description.split(/(?<=[.!?])\s/)[0];
  return metric([summary, s.range, s.duration].filter(Boolean).join(' · '));
};

export function SpellsPage() {
  const { character, activeId } = useActive();
  const charId = activeId ?? 0;
  const ruleLayout = useRuleLayout().data?.layout;
  const book = useSpellbook(activeId).data;
  // One spellbook per casting class; the open one (default: the first class that casts).
  const charClass = book?.classId ?? (character.data ? castingClass(ruleLayout, character.data) : '');
  const classLabel = className(ruleLayout, charClass);
  // "Core rulebook only" exists only when the rule package names core sources.
  const hasCore = (ruleLayout?.coreSources?.length ?? 0) > 0;
  const spells = useSpells(activeId);
  const saveBook = useSaveSpellbook(charId);
  const slots = useSpellSlots(activeId);
  const save = useSaveSpell(charId);
  const del = useDeleteSpell(charId);
  const addFromCompendium = useAddFromCompendium(charId);
  const shareSpell = useCreateCompendiumSpell();
  const deleteShared = useDeleteCompendiumSpell();
  const toast = useToasts((s) => s.push);
  const myId = useAuth((s) => s.userId);
  const isGm = useAuth((s) => s.isGm());
  const wide = useWide();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  // away: the current page turns over and away; in: the target page turns in and covers the current one.
  const [flip, setFlip] = useState<{ chapter: Chapter; away: boolean } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'spell' | 'song' | 'library' | 'form' | null>(null);
  const [selectedSong, setSelectedSong] = useState<string | null>(null);
  const [resting, setResting] = useState(false);
  const [puff, setPuff] = useState<{ id: number; idx: number } | null>(null);
  const [inked, setInked] = useState<string | null>(null);
  const [armedDelete, setArmedDelete] = useState(false);
  const [form, setForm] = useState<SpellInput>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [share, setShare] = useState(false);
  const [libSearch, setLibSearch] = useState('');
  const [libGrade, setLibGrade] = useState('');
  // "Nur Grundregelwerk": on by default; the choice is remembered per device.
  const [coreOnly, setCoreOnly] = useState(() => {
    try { return localStorage.getItem('pf-spells-core-only') !== '0'; } catch { return true; }
  });
  const toggleCoreOnly = (v: boolean) => {
    setCoreOnly(v);
    try { localStorage.setItem('pf-spells-core-only', v ? '1' : '0'); } catch { /* private mode */ }
  };
  const compendium = useCompendiumSpells(sheet === 'library' ? charClass : '', libSearch, coreOnly && hasCore);
  const swipeX = useRef<number | null>(null);

  // The open book's spells.
  const list = useMemo(() => (spells.data ?? []).filter((s) => inBook(book, s)), [spells.data, book]);
  const isPrep = book?.type === 'prepared';
  const isSpont = book?.type === 'spontaneous';
  const isCaster = isPrep || isSpont;
  const perf = book?.performance ?? null;
  const hasSongs = perf != null;
  const chapters = useMemo<Chapter[]>(() => {
    const grades = new Set([...(book?.grades.map((g) => g.grade) ?? []), ...list.map((s) => s.grade)]);
    return [...(isCaster ? [OVERVIEW] : []), ...(hasSongs ? [SONGS] : []), ...[...grades].sort((a, b) => a - b)];
  }, [book, list, isCaster, hasSongs]);

  if (!activeId) return <div className="p-4 text-zinc-500">{t('Kein Charakter ausgewählt.')}</div>;

  const current = chapter != null && chapters.includes(chapter) ? chapter : chapters[0] ?? OVERVIEW;
  const bookSlots = (slots.data ?? []).filter((s) => !book?.classes || (book.shared ? s.classId == null : s.classId === book.classId));
  const maxGrade = bookSlots.length ? Math.max(...bookSlots.map((s) => s.grade)) : -1;
  const sel = list.find((s) => s.id === selected) ?? null;
  const gradeInfo = (g: number) => book?.grades.find((x) => x.grade === g);

  // ---- Per-spell numbers ----
  const prepared = (s: Spell) => (book ? prepCount(book, s.id) : 0);
  // Save DC = 10 + grade + casting modifier, +1 each for Spell Focus / Greater Spell Focus in the spell's school.
  const focus = (feat: string, school: string) =>
    (character.data?.feats ?? []).some((f) => featKey(f.name) === featKey(feat) && f.choice === school) ? 1 : 0;
  const saveDc = (s: Spell) => {
    const school = schoolKey(s.school);
    return 10 + s.grade + (book?.castingMod ?? 0) + focus('Spell Focus', school) + focus('Greater Spell Focus', school);
  };
  const allowsSave = (s: Spell) => !!s.savingThrow && !/^(none|keiner?|nein|-|—)\b/i.test(s.savingThrow.trim());
  const usesLeft = (s: Spell): number => {
    if (s.grade === 0 || !book) return Infinity;
    if (isPrep) return prepared(s) - usedCount(book, s.id);
    const g = gradeInfo(s.grade);
    return g ? g.total - (book.state.used[s.grade] ?? 0) : 0;
  };
  const spentInGrade = (g: number) => (isPrep
    ? (book?.state.prepared[g] ?? []).filter((x) => x.used).length
    : book?.state.used[g] ?? 0);

  // ---- Actions ----
  const store = (st: SpellState) => saveBook.mutate(st);
  function cast(s: Spell) {
    if (!book || s.grade === 0 || usesLeft(s) <= 0) return;
    if (isPrep) {
      const lit = usesLeft(s);
      store(castPrepared(book, s.id, true));
      setPuff({ id: s.id, idx: lit - 1 }); setTimeout(() => setPuff(null), 1300);
    } else store({ ...book.state, used: { ...book.state.used, [s.grade]: (book.state.used[s.grade] ?? 0) + 1 } });
  }
  function uncast(s: Spell) {
    if (!book) return;
    if (isPrep) store(castPrepared(book, s.id, false));
    else store({ ...book.state, used: { ...book.state.used, [s.grade]: Math.max(0, (book.state.used[s.grade] ?? 0) - 1) } });
  }
  function doPrepare(s: Spell) {
    if (!book) return;
    const st = prepare(book, s);
    if (!st) { toast({ title: t('Kein Platz frei'), message: t('Alle Plätze für Grad {grade} sind belegt.', { grade: s.grade }) }); return; }
    store(st);
  }
  function rest() {
    if (!book || resting) return;
    setResting(true);
    setTimeout(() => store(rested(book)), 900);   // refill while the cover is shut
    setTimeout(() => setResting(false), 1850);
  }
  /** Page turn around the spine. Phone (spine left): forward turns the old page away to the left,
   *  back turns the previous page in over it. Desktop spread (spine right of the chapter page):
   *  forward turns the next page in from the right-hand page, back turns the old one over to the right. */
  function turnTo(to: Chapter) {
    if (flip || to === current) return;
    setSelected(null); setSelectedSong(null); setArmedDelete(false);
    const forward = chapters.indexOf(to) > chapters.indexOf(current);
    const away = wide ? !forward : forward;
    if (away) { setFlip({ chapter: current, away }); setChapter(to); }
    else setFlip({ chapter: to, away });
    setTimeout(() => { setFlip(null); setChapter(to); }, 820);
  }
  function turn(dir: 1 | -1) {
    const next = chapters[chapters.indexOf(current) + dir];
    if (next !== undefined) turnTo(next);
  }
  function open(s: Spell) {
    setSelected(s.id); setSelectedSong(null); setArmedDelete(false);
    if (!wide) setSheet('spell');
  }
  function openSong(p: Song) {
    setSelectedSong(p.name); setSelected(null);
    if (!wide) setSheet('song');
  }
  function editSpell(s: Spell) {
    const { id, ...rest } = s;
    setForm(rest); setEditId(id); setShare(false); setSheet('form');
  }
  function inkIn(name: string, grade: number) {
    setSheet(null);
    turnTo(grade);
    setTimeout(() => setInked(name), 760);
    setTimeout(() => setInked(null), 2000);
  }
  async function submitForm() {
    await save.mutateAsync({ id: editId ?? undefined, input: editId == null ? { ...form, classId: book?.classId ?? '' } : form });
    // New spell + "share": also publish it to the shared library for the character's class.
    if (editId == null && share && charClass) {
      try {
        await shareSpell.mutateAsync({
          name: form.name, school: form.school ?? '', description: form.description, range: form.range, duration: form.duration,
          castingTime: '', components: form.cost, savingThrow: form.savingThrow ?? '', damage: form.damage, classLevels: { [charClass]: form.grade },
        });
        toast({ title: t('Zauber geteilt'), message: t('{name} steht jetzt in der Bibliothek für alle.', { name: form.name }) });
      } catch (e: any) {
        toast({ title: t('Nicht geteilt'), message: e.response?.data?.message ?? t('Teilen fehlgeschlagen. Der Zauber ist nur in deinem Buch.') });
      }
    }
    if (editId == null) inkIn(form.name, form.grade); else setSheet(null);
    setEditId(null); setForm(EMPTY);
  }

  // ---- Rendering pieces ----
  const ribbons = (
    <div className="sb-ribbons">
      {chapters.map((c) => (
        <button key={c} aria-current={c === current} onClick={() => turnTo(c)}
          className={`sb-ribbon ${c === OVERVIEW ? 'sb-ribbon--blue' : c === SONGS ? 'sb-ribbon--violet' : c === 0 ? 'sb-ribbon--gold' : ''}`}
          aria-label={c === OVERVIEW ? t('Übersicht') : c === SONGS ? perf?.tab ?? '' : c === 0 ? t('Zaubertricks') : t('Grad {n}', { n: c })}>
          {c === OVERVIEW ? '☰' : c === SONGS ? '♪' : c === 0 ? '✶' : ROMAN[c]}
        </button>
      ))}
    </div>
  );

  const usesBadge = (s: Spell) => {
    if (s.grade === 0) return isPrep && !prepared(s) ? <span className="sb-times sb-times--dim">–</span> : <span className="sb-times">∞</span>;
    if (isPrep) {
      const n = prepared(s), left = usesLeft(s);
      return n ? (
        <span className="sb-candles">
          {Array.from({ length: n }, (_, i) => <Candle key={i} out={i >= left} puff={puff?.id === s.id && puff.idx === i} />)}
        </span>
      ) : <span className="sb-times sb-times--dim">–</span>;
    }
    if (isSpont) return <span className={`sb-times ${usesLeft(s) ? '' : 'sb-times--dim'}`}>{t('noch {v}×', { v: usesLeft(s) })}</span>;
    return null;
  };

  /** One spell line. `quick` (overview): full stats + description and a cast button on the line. */
  const entry = (s: Spell, quick = false) => {
    // Greyed = prepared/known but used up today; an unprepared spell isn't "empty", just not prepared.
    const exhausted = isCaster && s.grade > 0 && usesLeft(s) <= 0 && (!isPrep || prepared(s) > 0);
    return (
      <div key={s.id} className={inked === s.name ? 'sb-ink-in' : ''}
        style={exhausted ? { opacity: 0.45, filter: 'grayscale(1)' } : undefined}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, padding: '9px 0', borderBottom: '1px solid rgba(110,70,30,.22)' }}>
          <button className="sb-entry" style={{ flex: 1, width: 'auto', padding: 0, borderBottom: 0 }} aria-pressed={wide && selected === s.id} onClick={() => open(s)}>
            <span className="sb-seal">{s.name[0]}</span>
            <span className="sb-name" style={{ whiteSpace: 'normal', hyphens: 'auto' }}>{s.name}</span>
            {usesBadge(s)}
          </button>
          {quick && s.grade > 0 && (
            <button className="sb-btn sb-btn--gold" style={{ padding: '6px 9px' }} disabled={exhausted}
              aria-label={`${s.name} wirken`} onClick={() => cast(s)}>✦</button>
          )}
          {!quick && isPrep && book && prepare(book, s) && (
            <button className="sb-btn sb-btn--ink" style={{ padding: '6px 10px' }}
              aria-label={`${s.name} vorbereiten`} onClick={() => doPrepare(s)}>+</button>
          )}
          {/* Full row width below the controls, so the text stays readable on phones. */}
          <span className="sb-meta" style={{ flexBasis: '100%', whiteSpace: 'normal', padding: '4px 0 0 44px', cursor: 'pointer' }} onClick={() => open(s)}>
            {quick ? shortLine(s) || t('Keine Werte eingetragen')
              : metric([s.grade === 0 ? t('Zaubertrick') : t('Grad {n}', { n: s.grade }), s.range].filter(Boolean).join(' · '))}
          </span>
        </div>
      </div>
    );
  };

  // ---- Class performances ("Lieder") ----
  const lvl = Math.max(1, character.data?.level ?? 1);
  const roundsTotal = perf?.rounds ?? 0;
  const roundsUsed = Math.min(book?.state.performanceRoundsUsed ?? 0, roundsTotal);
  const setRounds = (n: number) => book && store({ ...book.state, performanceRoundsUsed: Math.max(0, Math.min(roundsTotal, n)) });
  const selSong = perf?.list.find((p) => p.name === selectedSong) ?? null;

  function songsBody() {
    if (!perf) return null;
    const left = roundsTotal - roundsUsed;
    return (
      <>
        <div className="sb-kapitel">{perf.book}</div>
        <div className="sb-title">{perf.name}</div>
        <Flourish />
        <p className="sb-intro">
          {t('Noch {left} von {roundsTotal} Runden vermagst du heute aufzutreten. Beginnen: {start}, Rettungswurf-SG {dc}.', { left, roundsTotal, start: perf.start, dc: perf.dc })}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '0 0 12px' }}>
          <button className="sb-btn sb-btn--gold" disabled={left <= 0} onClick={() => setRounds(roundsUsed + 1)}>{t('♪ −1 Runde')}</button>
          <button className="sb-btn sb-btn--line" disabled={roundsUsed <= 0} onClick={() => setRounds(roundsUsed - 1)}>{t('Rückgängig')}</button>
        </div>
        {perf.list.map((p) => {
          const locked = lvl < p.level;
          return (
            <button key={p.name} className="sb-entry" aria-pressed={wide && selectedSong === p.name} onClick={() => openSong(p)}
              style={locked ? { opacity: 0.45, filter: 'grayscale(1)' } : undefined}>
              <span className="sb-seal" style={{ background: 'radial-gradient(circle at 35% 30%, #9a5bd0, #5a2a88 60%, #3a1560)' }}>♪</span>
              <span style={{ minWidth: 0 }}>
                <span className="sb-name" style={{ display: 'block', whiteSpace: 'normal', hyphens: 'auto' }}>{p.name}</span>
                <span className="sb-meta" style={{ display: 'block', whiteSpace: 'normal' }}>{p.short}</span>
              </span>
              <span className={`sb-times ${locked ? 'sb-times--dim' : ''}`}>{locked ? `ab St. ${p.level}` : `St. ${p.level}`}</span>
            </button>
          );
        })}
      </>
    );
  }

  function songDetail(p: Song) {
    if (!perf) return null;
    const locked = lvl < p.level;
    return (
      <>
        <div className="sb-kapitel">{t('{item} · Stufe {level}', { item: perf.item, level: p.level })}</div>
        <div className="sb-title">{p.name}</div>
        <Flourish />
        <p className="sb-desc">{p.effect}</p>
        <div className="sb-stat"><b>{t('Beginnen')}</b><span>{t('{start}, danach jede Runde Freie Aktion', { start: perf.start })}</span></div>
        <div className="sb-stat"><b>{t('Kosten')}</b><span>{t('1 Runde {name} pro Runde', { name: perf.name })}</span></div>
        <div className="sb-stat"><b>{t('Heute')}</b><span>{t('noch {v} von {roundsTotal} Runden', { v: roundsTotal - roundsUsed, roundsTotal })}</span></div>
        {locked && <p className="sb-hint" style={{ color: 'var(--rubric)' }}>{t('Erst ab Stufe {level} verfügbar.', { level: p.level })}</p>}
        {!locked && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="sb-btn sb-btn--gold" disabled={roundsUsed >= roundsTotal} onClick={() => setRounds(roundsUsed + 1)}>{t('♪ −1 Runde')}</button>
            <button className="sb-btn sb-btn--line" disabled={roundsUsed <= 0} onClick={() => setRounds(roundsUsed - 1)}>{t('Rückgängig')}</button>
          </div>
        )}
      </>
    );
  }

  function chapterBody(c: Chapter) {
    if (c === SONGS) return songsBody();
    if (c === OVERVIEW) {
      const inUse = list.filter((s) => (isPrep ? prepared(s) > 0 : true));
      // Prepared casters: empty slots per grade (index ≥ total − special = domain/school slot).
      const emptySlots = (g: number) => (book?.state.prepared[g] ?? [])
        .map((x, i) => ({ free: x.spellId == null, special: i >= (gradeInfo(g)?.total ?? 0) - (gradeInfo(g)?.special ?? 0) }))
        .filter((x) => x.free);
      const grades = [...new Set([...inUse.map((s) => s.grade), ...(isPrep ? book!.grades.map((g) => g.grade).filter((g) => emptySlots(g).length) : [])])]
        .sort((a, b) => a - b);
      // Prepared: only what is prepared and not yet cast counts; spontaneous: unspent slots.
      const leftIn = (g: number) => (isPrep
        ? inUse.filter((s) => s.grade === g).reduce((n, s) => n + usesLeft(s), 0)
        : (gradeInfo(g)?.total ?? 0) - spentInGrade(g));
      const ofIn = (g: number) => (isPrep ? inUse.filter((s) => s.grade === g).reduce((n, s) => n + prepared(s), 0) : gradeInfo(g)?.total ?? 0);
      const totalLeft = grades.filter((g) => g > 0).reduce((n, g) => n + leftIn(g), 0);
      return (
        <>
          <div className="sb-kapitel">{t('Übersicht')}</div>
          <div className="sb-title">{isPrep ? t('Heute vorbereitet') : t('Heute wirkbar')}</div>
          <Flourish />
          <p className="sb-intro">
            {inUse.length === 0
              ? (isPrep ? t('Noch ist nichts vorbereitet. Blättere zu einem Kapitel und bereite deine Zauber für den Tag vor.')
                : t('Dein Buch ist noch leer. Schreibe Zauber aus der Bibliothek ab.'))
              : t('Noch {totalLeft} Zauber vermagst du heute zu wirken. Tippe ✦, um einen zu wirken.', { totalLeft })}
          </p>
          {grades.map((g) => {
            const info = gradeInfo(g);
            return (
              <div key={g}>
                <div className="sb-sub">
                  <span>{g === 0 ? t('Zaubertricks') : t('Grad {n}', { n: ROMAN[g] })}</span>
                  {g === 0 ? <span style={{ textTransform: 'none', fontVariant: 'normal' }}>{t('unbegrenzt')}</span>
                    : info && isSpont ? <span className="sb-gems sb-gems--small">{Array.from({ length: info.total }, (_, i) => <Gem key={i} spent={i < spentInGrade(g)} />)}</span>
                    : info ? <span style={{ textTransform: 'none', fontVariant: 'normal' }}>{t('{v}/{v2} übrig', { v: leftIn(g), v2: ofIn(g) })}</span> : null}
                </div>
                {inUse.filter((s) => s.grade === g).map((s) => entry(s, true))}
                {isPrep && emptySlots(g).map((x, i) => (
                  <button key={`free-${i}`} className="sb-empty" style={{ display: 'block', width: '100%', margin: '8px 0 0', background: 'none', font: 'inherit', fontStyle: 'italic', cursor: 'pointer' }}
                    onClick={() => turnTo(g)}>
                    + {x.special ? (charClass === 'wizard' ? t('Freier Schulplatz') : t('Freier Domänenplatz')) : t('Freier Platz')} · {g === 0 ? t('zu den Zaubertricks blättern') : t('zu Kapitel {n} blättern', { n: ROMAN[g] })}
                  </button>
                ))}
              </div>
            );
          })}
        </>
      );
    }
    const info = gradeInfo(c);
    const inChapter = list.filter((s) => s.grade === c);
    // Bloodline spells are known in addition to the table (sorcerer).
    const countedKnown = inChapter.filter((s) => !book?.bloodlineSpellIds?.includes(s.id)).length;
    const filled = (book?.state.prepared[c] ?? []).filter((x) => x.spellId != null).length;
    const free = isPrep && info ? info.total - filled : 0;
    const intro = c === 0
      ? t('Unscheinbare Zauber, die der Kundige nach Belieben wirken mag, so oft es ihm beliebt.')
      : isPrep && info ? t('Heute sind {filled} von {total} Plätzen dieses Kapitels vorbereitet{v}.', { filled, total: info.total, v: info.special ? (charClass === 'wizard' ? t(', einer davon ist dein Schulplatz') : t(', einer davon ist dein Domänenplatz')) : '' })
      : isSpont && info ? t('Noch {v} von {total} Zaubern dieses Grades vermagst du heute zu wirken.', { v: info.total - spentInGrade(c), total: info.total })
      : !info && isCaster ? t('Zauber dieses Grades kannst du noch nicht wirken. Sie warten auf eine höhere Stufe.')
      : t('Hier stehen die Zauber dieses Grades.');
    return (
      <>
        <div className="sb-kapitel">{c === 0 ? t('Vorwort') : `Kapitel ${ROMAN[c]}`}</div>
        <div className="sb-title">{c === 0 ? t('Zaubertricks') : t('Zauber des {v} Grades', { v: ORD[c] })}</div>
        <Flourish />
        {isSpont && info && c > 0 && <div className="sb-gems">{Array.from({ length: info.total }, (_, i) => <Gem key={i} spent={i < spentInGrade(c)} />)}</div>}
        <p className="sb-intro">{intro}</p>
        {book?.casterLevel ? (
          <p className="sb-hint" style={{ marginTop: 0 }}>
            {t('Zauberstufe')}{' '} {book.casterLevel} {' '}{t('· Konzentration +')}{book.casterLevel + (book.castingMod ?? 0)}
            {c > 0 ? ` · Grund-SG ${10 + c + (book.castingMod ?? 0)}` : ''}
          </p>
        ) : null}
        {inChapter.map((s) => entry(s))}
        {inChapter.length === 0 && <p className="sb-hint">{t('Noch keine Zauber in diesem Kapitel. Schreibe welche aus der Bibliothek ab.')}</p>}
        {free > 0 && <div className="sb-empty">{free} {free > 1 ? t('Plätze') : t('Platz')} {' '}{t('noch frei · tippe + zum Vorbereiten')}</div>}
        {info?.known != null && countedKnown > info.known && (
          <p className="sb-hint" style={{ color: 'var(--rubric)' }}>{t('⚠ {countedKnown} Zauber im Buch, laut Klassentabelle bekannt: {known}', { countedKnown, known: info.known })}</p>
        )}
      </>
    );
  }

  const pageFoot = (
    <div className="sb-foot">
      {isCaster ? <button className="sb-btn sb-btn--ink" onClick={rest}>{t('☾ Rast')}</button> : <span />}
      <span className="sb-pageno">– {chapters.indexOf(current) + 1} –</span>
      <button className="sb-btn sb-btn--gold" onClick={() => setSheet('library')}>{t('Bibliothek')}</button>
    </div>
  );

  function detail(s: Spell) {
    const n = prepared(s), left = usesLeft(s);
    const usedSome = isPrep ? usedCount(book!, s.id) > 0 : spentInGrade(s.grade) > 0;
    return (
      <>
        <div className="sb-kapitel">{s.grade === 0 ? t('Zaubertrick') : t('Grad {n}', { n: s.grade })}</div>
        <div className="sb-title">{s.name}</div>
        <Flourish />
        {s.description && <p className="sb-desc">{metric(s.description)}</p>}
        {s.damage && <div className="sb-stat"><b>{t('Wirkung')}</b><span>{metric(s.damage)}</span></div>}
        {s.range && <div className="sb-stat"><b>{t('Reichweite')}</b><span>{metric(s.range)}</span></div>}
        {s.duration && <div className="sb-stat"><b>{t('Dauer')}</b><span>{metric(s.duration)}</span></div>}
        {s.cost && <div className="sb-stat"><b>{t('Komponenten')}</b><span>{metric(s.cost)}</span></div>}
        {s.school && <div className="sb-stat"><b>{t('Schule')}</b><span>{s.school}</span></div>}
        {allowsSave(s) && <div className="sb-stat"><b>{t('Rettungswurf')}</b><span>{t('{savingThrow} · SG {v}', { savingThrow: s.savingThrow, v: saveDc(s) })}</span></div>}
        {book?.oppositionSpellIds?.includes(s.id) && <div className="sb-stat"><b>{t('Verbotene Schule')}</b><span>{t('Vorbereiten kostet zwei Plätze.')}</span></div>}
        {book?.bloodlineSpellIds?.includes(s.id) && <div className="sb-stat"><b>{t('Blutlinie')}</b><span>{t('Zusätzlich bekannt, zählt nicht gegen die bekannten Zauber.')}</span></div>}
        {isPrep && s.grade > 0 && <div className="sb-stat"><b>{t('Vorbereitet')}</b><span>{t('{n}× · heute noch {left}×', { n, left })}</span></div>}
        {isSpont && s.grade > 0 && <div className="sb-stat"><b>{t('Heute')}</b><span>{t('noch {left}× (Plätze des {v} Grades)', { left, v: ORD[s.grade] })}</span></div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {isCaster && s.grade > 0 && <button className="sb-btn sb-btn--gold" disabled={left <= 0} onClick={() => cast(s)}>{t('✦ Wirken')}</button>}
          {isCaster && s.grade > 0 && usedSome && <button className="sb-btn sb-btn--line" onClick={() => uncast(s)}>{t('Rückgängig')}</button>}
          {isPrep && <button className="sb-btn sb-btn--ink" onClick={() => doPrepare(s)}>{t('+ Vorbereiten')}</button>}
          {isPrep && n > 0 && <button className="sb-btn sb-btn--line" onClick={() => store(unprepare(book!, s.id))}>{t('− Vorbereitung')}</button>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button className="sb-btn sb-btn--line" onClick={() => editSpell(s)}>{t('✎ Bearbeiten')}</button>
          <button className="sb-btn sb-btn--line" style={armedDelete ? { background: 'var(--rubric)', color: '#fbeccc' } : undefined}
            onBlur={() => setArmedDelete(false)}
            onClick={() => { if (!armedDelete) { setArmedDelete(true); return; } del.mutate(s.id); setSelected(null); setSheet(null); setArmedDelete(false); }}>
            {armedDelete ? t('Wirklich entfernen?') : t('Aus dem Buch entfernen')}
          </button>
        </div>
      </>
    );
  }

  const known = new Set(list.map((s) => s.name.toLowerCase()));
  const library = (compendium.data ?? []).filter((cs) => cs.grade <= maxGrade && (libGrade === '' || cs.grade === Number(libGrade)));

  return (
    <div className="sb p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gold">
          {charClass === 'alchemist' ? t('Rezeptbuch') : t('Zauberbuch')}
        </h1>
        <span className="text-xs text-zinc-500">{classLabel}{book?.type ? ` · ${isPrep ? t('vorbereitend') : t('spontan')}` : ''}{book?.shared ? t(' · gemeinsame Plätze') : ''}</span>
      </div>
      {/* Several casting classes: one book each. */}
      <SpellBookTabs charId={charId} book={book} onSwitch={() => { setChapter(null); setSelected(null); }} />

      <div className="sb-book">
        <div className="sb-spread">
          <div className="sb-turn"
            onPointerDown={(e) => { swipeX.current = e.clientX; }}
            onPointerUp={(e) => {
              if (swipeX.current == null) return;
              const dx = e.clientX - swipeX.current; swipeX.current = null;
              if (Math.abs(dx) > 50) turn(dx < 0 ? 1 : -1);
            }}>
            <div className="sb-page">{ribbons}{chapterBody(current)}<p className="sb-hint">{t('← wischen zum Umblättern →')}</p>{pageFoot}</div>
            {flip && (
              <div aria-hidden className={`sb-flipper ${wide ? 'sb-flipper--spine-right' : ''} ${flip.away ? 'sb-turn-away' : 'sb-turn-in'}`}
                style={{ '--sb-angle': wide ? '180deg' : '-180deg' } as React.CSSProperties}>
                <div className="sb-page sb-face">{ribbons}{chapterBody(flip.chapter)}{pageFoot}</div>
                <div className="sb-page sb-face sb-face--back" />
              </div>
            )}
          </div>
          {wide && (
            <div className="sb-page sb-page--right">
              {selSong ? songDetail(selSong) : sel ? detail(sel) : (
                <>
                  <div className="sb-kapitel">{t('Zauberbuch')}</div>
                  <div className="sb-title">{character.data?.name}</div>
                  <Flourish />
                  <p className="sb-desc">{t('Wähle links einen Zauber, um ihn hier aufzuschlagen.')}</p>
                </>
              )}
            </div>
          )}
        </div>
        <div className={`sb-cover ${resting ? 'sb-cover--closing' : ''}`}><span>{t('Grimoire')}</span></div>
      </div>

      {sheet && (
        <div className="sb-sheet-bg" onClick={() => setSheet(null)}>
          <div role="dialog" onClick={(e) => e.stopPropagation()}
            className={`sb-sheet ${sheet === 'library' ? 'sb-library' : 'sb-page'}`}>
            {sheet === 'spell' && sel && detail(sel)}
            {sheet === 'song' && selSong && songDetail(selSong)}

            {sheet === 'library' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <h2>{t('Bibliothek')}</h2>
                  <button className="sb-btn sb-btn--gold" onClick={() => { setForm(EMPTY); setEditId(null); setShare(false); setSheet('form'); }}>{t('+ Eigener Zauber')}</button>
                </div>
                <div style={{ fontStyle: 'italic', opacity: .8 }}>
                  {t('Zauber für')}{' '} {classLabel || t('deine Klasse')}{t(', die du in dein Buch abschreiben kannst')}{maxGrade >= 0 ? t(' (bis Grad {maxGrade})', { maxGrade }) : ''}.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input className="sb-input" placeholder={t('Suchen…')} value={libSearch} onChange={(e) => setLibSearch(e.target.value)} />
                  <select className="sb-input" style={{ width: 130 }} value={libGrade} onChange={(e) => setLibGrade(e.target.value)}>
                    <option value="">{t('Alle Grade')}</option>
                    {Array.from({ length: Math.max(0, maxGrade + 1) }, (_, g) => <option key={g} value={g}>{g === 0 ? t('Zaubertricks') : t('Grad {n}', { n: g })}</option>)}
                  </select>
                </div>
                {hasCore && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 15, cursor: 'pointer' }}>
                    <input type="checkbox" checked={coreOnly} onChange={(e) => toggleCoreOnly(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#b8892b' }} />
                    {t('Nur Grundregelwerk')}
                  </label>
                )}
                {!charClass && <p className="sb-hint" style={{ color: '#f3e3c2' }}>{t('Dein Charakter hat keine Klasse.')}</p>}
                {charClass && maxGrade < 0 && <p className="sb-hint" style={{ color: '#f3e3c2' }}>{t('Deine Klasse oder Stufe kann noch keine Zauber wirken.')}</p>}
                {charClass && maxGrade >= 0 && library.length === 0 && !compendium.isLoading && (
                  <p className="sb-hint" style={{ color: '#f3e3c2' }}>{t('Keine passenden Zauber. Lege einen eigenen an.')}</p>
                )}
                {library.length > 100 && (
                  <p className="sb-hint" style={{ color: '#f3e3c2' }}>{t('{length} Zauber gefunden. Es werden die ersten 100 gezeigt, grenze mit Suche oder Grad ein.', { length: library.length })}</p>
                )}
                {library.slice(0, 100).map((cs) => (
                  <div key={cs.id} className="sb-card">
                    <div style={{ minWidth: 0 }}>
                      <div className="sb-name">{cs.name}</div>
                      <div className="sb-meta">
                        {cs.grade === 0 ? t('Zaubertrick') : t('Grad {n}', { n: cs.grade })}{cs.school ? ` · ${cs.school}` : ''}{cs.createdByUserId ? ` · ${t('Eigener')}${cs.createdByName ? ` (${cs.createdByName})` : ''}` : ''}
                      </div>
                      {(cs.damage || cs.description) && <div className="sb-meta" style={{ whiteSpace: 'normal' }}>{metric(cs.damage || cs.description)}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button className="sb-btn sb-btn--line" disabled={known.has(cs.name.toLowerCase()) || addFromCompendium.isPending}
                        onClick={async () => { await addFromCompendium.mutateAsync(cs.id); inkIn(cs.name, cs.grade); }}>
                        {known.has(cs.name.toLowerCase()) ? t('Im Buch') : t('✒ Abschreiben')}
                      </button>
                      {cs.createdByUserId && (cs.createdByUserId === myId || isGm) && (
                        <button className="sb-btn sb-btn--line" style={{ fontSize: 12 }} disabled={deleteShared.isPending}
                          onClick={async () => {
                            if (!confirm(t('„{name}" aus der Bibliothek löschen? Bereits abgeschriebene Kopien bleiben erhalten.', { name: cs.name }))) return;
                            await deleteShared.mutateAsync(cs.id);
                          }}>{t('Löschen')}</button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {sheet === 'form' && (
              <>
                <div className="sb-kapitel">{editId ? t('Zauber bearbeiten') : t('Neuer Zauber')}</div>
                <div className="sb-title">{form.name || t('Unbenannt')}</div>
                <Flourish />
                <label className="sb-label">{t('Name')}<input className="sb-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
                  <label className="sb-label">{t('Grad (0–9)')}<input className="sb-input" type="number" min={0} max={9} value={form.grade} onChange={(e) => setForm({ ...form, grade: +e.target.value })} /></label>
                  <label className="sb-label">{t('Wirkung')}<input className="sb-input" value={form.damage} onChange={(e) => setForm({ ...form, damage: e.target.value })} /></label>
                  <label className="sb-label">{t('Reichweite')}<input className="sb-input" value={form.range} onChange={(e) => setForm({ ...form, range: e.target.value })} /></label>
                  <label className="sb-label">{t('Dauer')}<input className="sb-input" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></label>
                  <label className="sb-label">{t('Schule')}
                    <select className="sb-input" value={schoolKey(form.school) || ''} onChange={(e) => setForm({ ...form, school: e.target.value })}>
                      <option value="">—</option>
                      {SCHOOLS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                  </label>
                  <label className="sb-label">{t('Rettungswurf')}<input className="sb-input" placeholder={t('z. B. Reflex halbiert / keiner')} value={form.savingThrow ?? ''} onChange={(e) => setForm({ ...form, savingThrow: e.target.value })} /></label>
                </div>
                <label className="sb-label">{t('Komponenten')}<input className="sb-input" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
                <label className="sb-label">{t('Beschreibung')}<textarea className="sb-input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
                {editId == null && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 15 }}>
                    <input type="checkbox" style={{ marginTop: 4 }} checked={share} disabled={!charClass} onChange={(e) => setShare(e.target.checked)} />
                    <span>{t('In der Bibliothek für alle teilen')}
                      <span className="sb-meta" style={{ display: 'block', whiteSpace: 'normal' }}>{t('Andere {classLabel}-Charaktere können ihn dann ab Grad {grade} abschreiben.', { classLabel, grade: form.grade })}</span>
                    </span>
                  </label>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="sb-btn sb-btn--gold" disabled={!form.name || save.isPending || shareSpell.isPending} onClick={submitForm}>
                    {editId ? t('Speichern') : t('✒ Ins Buch schreiben')}
                  </button>
                  <button className="sb-btn sb-btn--line" onClick={() => setSheet(null)}>{t('Abbrechen')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
