import { Dice5 } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSkillSheet } from '../lib/queries';
import { initDiceBox, rollDice, showOverlay, hideOverlay } from '../lib/diceBox';
import type { Character } from '../lib/types';
import { t } from '../lib/i18n';

// ── types ─────────────────────────────────────────────────────────────────────
interface Action {
  id: string;
  label: string;
  bonus: number;
  category: string;
  icon: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function sign(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}

function buildActions(c: Character, skillTotals: { name: string; total: number }[]): Action[] {
  return [
    { id: 'melee',  label: t('Nahkampf'),     bonus: c.derived.meleeAttack,  category: 'Angriff',        icon: '⚔️'  },
    { id: 'ranged', label: t('Fernkampf'),     bonus: c.derived.rangedAttack, category: 'Angriff',        icon: '🏹'  },
    { id: 'init',   label: t('Initiative'),    bonus: c.derived.initiative,   category: 'Sonstiges',      icon: '⚡'  },
    { id: 'fort',   label: t('Zähigkeit'),     bonus: c.derived.saves.Fort,   category: 'Rettungswurf',   icon: '🛡️' },
    { id: 'ref',    label: t('Reflex'),        bonus: c.derived.saves.Ref,    category: 'Rettungswurf',   icon: '💨'  },
    { id: 'will',   label: t('Wille'),         bonus: c.derived.saves.Will,   category: 'Rettungswurf',   icon: '🧠'  },
    ...skillTotals.map((s) => ({
      id: `skill-${s.name}`, label: s.name, bonus: s.total,
      category: 'Fertigkeit', icon: '✨',
    })),
    { id: 'free',   label: t('Freier Wurf'),   bonus: 0,                      category: 'Sonstiges',      icon: '🎲'  },
  ];
}

const CATEGORIES = ['Angriff', 'Rettungswurf', 'Fertigkeit', 'Sonstiges'] as const;
const CAT_LABELS: Record<string, string> = {
  Angriff: t('Angriff'), Rettungswurf: t('Rettung'), Fertigkeit: t('Fertigkeit'), Sonstiges: t('Sonst.'),
};

// ── D20 grid ──────────────────────────────────────────────────────────────────
const FACES = Array.from({ length: 20 }, (_, i) => i + 1);

function D20Grid({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {FACES.map((n) => {
        const isCrit   = n === 20;
        const isFumble = n === 1;
        const selected = value === n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`
              h-12 rounded-xl text-lg font-bold border-2 transition active:scale-95 select-none
              ${selected
                ? isCrit   ? 'bg-gold border-gold text-zinc-900'
                : isFumble ? 'bg-red-600 border-red-400 text-white'
                :             'bg-zinc-200 border-gold text-zinc-900 dark:bg-zinc-600'
                : isCrit   ? 'border-gold/50 text-gold bg-zinc-800/60 hover:bg-gold/20'
                : isFumble ? 'border-red-700/50 text-red-400 bg-zinc-800/60 hover:bg-red-900/40'
                :             'border-zinc-600 text-zinc-200 bg-zinc-800/60 hover:bg-zinc-700/60'
              }
            `}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

// ── result panel ──────────────────────────────────────────────────────────────
function Result({ roll, action }: { roll: number | null; action: Action | null }) {
  if (roll === null) {
    return (
      <div className="text-center text-zinc-500 py-4 text-sm">
        {t('Würfelergebnis oben auswählen…')}
      </div>
    );
  }

  const total    = roll + (action?.bonus ?? 0);
  const isCrit   = roll === 20;
  const isFumble = roll === 1;

  return (
    <div className={`rounded-xl p-4 text-center border-2 transition
      ${isCrit ? 'border-gold bg-gold/10' : isFumble ? 'border-red-700 bg-red-950/40' : 'border-zinc-600 bg-zinc-800/40'}`}>
      {isCrit   && <div className="text-gold font-bold text-sm mb-1 animate-pulse">{t('🎯 KRITISCHER TREFFER!')}</div>}
      {isFumble && <div className="text-red-400 font-bold text-sm mb-1">{t('💀 Patzer!')}</div>}

      <div className="flex items-center justify-center gap-3 text-sm text-zinc-400 mb-2">
        <span className="text-2xl font-bold text-white">{roll}</span>
        {action && action.bonus !== 0 && (
          <>
            <span>+</span>
            <span className="text-lg font-semibold text-emerald-400">{sign(action.bonus)}</span>
            <span>=</span>
          </>
        )}
        {action && action.bonus === 0 && <span>=</span>}
        <span className={`text-3xl font-extrabold ${isCrit ? 'text-gold' : isFumble ? 'text-red-400' : 'text-white'}`}>
          {total}
        </span>
      </div>

      {action && (
        <div className="text-xs text-zinc-500">
          {action.label} {sign(action.bonus)}
          {isCrit && !isFumble && t(' · Schaden ggf. doppelt würfeln')}
        </div>
      )}
    </div>
  );
}

// ── 3-D animated roll button ──────────────────────────────────────────────────
type AnimState = 'idle' | 'loading' | 'rolling' | 'done';

function Dice3DButton({ onResult }: { onResult: (n: number) => void }) {
  const [state, setState] = useState<AnimState>('idle');

  // Pre-warm the engine when the modal opens
  useEffect(() => {
    initDiceBox().catch(() => {/* ignore pre-warm errors */});
  }, []);

  const handleRoll = useCallback(async () => {
    if (state === 'rolling' || state === 'loading') return;
    setState('loading');
    try {
      await initDiceBox();
    } catch {
      setState('idle');
      return;
    }

    setState('rolling');

    // Tap-to-dismiss: hide overlay and use whatever roll completes
    showOverlay(() => {
      hideOverlay();
      setState('idle');
    });

    try {
      const value = await rollDice('1d20');
      hideOverlay();
      setState('done');
      onResult(value);
      // reset visual after a moment
      setTimeout(() => setState('idle'), 1500);
    } catch {
      hideOverlay();
      setState('idle');
    }
  }, [state, onResult]);

  const label =
    state === 'loading'  ? t('⏳ Lädt…')
    : state === 'rolling'  ? t('🎲 Würfelt…')
    : state === 'done'     ? t('✅ Fertig')
    : t('🎲 3D würfeln');

  return (
    <button
      onClick={handleRoll}
      disabled={state === 'loading' || state === 'rolling'}
      className={`w-full py-3 rounded-xl border-2 font-bold text-sm transition active:scale-95
        ${state === 'rolling'
          ? 'border-gold bg-gold/20 text-gold animate-pulse cursor-wait'
          : state === 'done'
          ? 'border-emerald-500 bg-emerald-900/40 text-emerald-300'
          : 'border-gold bg-gold/10 text-gold hover:bg-gold/20'}`}
    >
      {label}
      {state === 'rolling' && (
        <span className="ml-2 text-xs font-normal text-zinc-400">{t('(Bildschirm antippen zum Abbrechen)')}</span>
      )}
    </button>
  );
}

// ── main modal ────────────────────────────────────────────────────────────────
function DiceRollerModal({ character, onClose }: { character: Character; onClose: () => void }) {
  const skillSheet = useSkillSheet(character.id);
  const [activeCat, setActiveCat] = useState<string>('Angriff');
  const [selectedId, setSelectedId] = useState<string>('melee');
  const [roll, setRoll] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const skillTotals = useMemo(
    () => (skillSheet.data?.skills ?? []).map((s) => ({ name: s.name, total: s.total })),
    [skillSheet.data],
  );

  const actions = useMemo(() => buildActions(character, skillTotals), [character, skillTotals]);
  const categoryActions = actions.filter((a) => a.category === activeCat);
  const isSkillCat = activeCat === 'Fertigkeit';
  const q = query.trim().toLowerCase();
  const matched = q ? categoryActions.filter((a) => a.label.toLowerCase().includes(q)) : categoryActions;
  // Skills are numerous — show only the first few until the user searches.
  const filteredActions = isSkillCat && !q ? matched.slice(0, 4) : matched;
  const hiddenSkillCount = isSkillCat && !q ? categoryActions.length - filteredActions.length : 0;
  const showSearch = isSkillCat ? categoryActions.length > 4 : categoryActions.length > 8;
  const selectedAction = actions.find((a) => a.id === selectedId) ?? null;

  function pickAction(a: Action) {
    setSelectedId(a.id);
    setRoll(null);
  }

  function handleCatChange(cat: string) {
    setActiveCat(cat);
    setQuery('');
    const first = actions.find((a) => a.category === cat);
    if (first) { setSelectedId(first.id); setRoll(null); }
  }

  return (
    // backdrop
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      {/* panel — swipe-up sheet on mobile */}
      <div
        className="w-full sm:max-w-sm bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl
                   shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <h2 className="font-bold text-gold text-lg">{t('🎲 Würfelwurf')}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">

          {/* category pills */}
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCatChange(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition
                  ${activeCat === cat
                    ? 'bg-gold border-gold text-zinc-900'
                    : 'border-zinc-600 text-zinc-400 hover:border-zinc-400'}`}
              >
                {CAT_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* search — for skills (and any long category), the list is capped until you search */}
          {showSearch && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Fähigkeit suchen…')}
              className="w-full px-3 py-2 rounded-xl text-sm bg-zinc-800 border border-zinc-700
                         text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-gold"
            />
          )}

          {/* action list */}
          <div className="flex flex-wrap gap-1.5">
            {filteredActions.length === 0 && (
              <span className="text-sm text-zinc-500 py-2">{t('Keine Treffer.')}</span>
            )}
            {filteredActions.map((a) => (
              <button
                key={a.id}
                onClick={() => pickAction(a)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition active:scale-95
                  ${selectedAction?.id === a.id
                    ? 'bg-zinc-200 border-zinc-200 text-zinc-900 font-semibold dark:bg-zinc-600 dark:border-zinc-400 dark:text-white'
                    : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 bg-zinc-800/60'}`}
              >
                <span>{a.icon}</span>
                <span>{a.label}</span>
                <span className={`text-xs ml-0.5 ${a.bonus >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {sign(a.bonus)}
                </span>
              </button>
            ))}
            {hiddenSkillCount > 0 && (
              <span className="text-xs text-zinc-500 self-center px-1"> {t('+{hiddenSkillCount} weitere · zum Finden suchen', { hiddenSkillCount })} </span>
            )}
          </div>

          {/* 3-D animated roll */}
          <Dice3DButton onResult={(n) => { setRoll(n); }} />

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-zinc-700" />
            <span className="text-xs text-zinc-500">{t('oder manuell')}</span>
            <div className="flex-1 h-px bg-zinc-700" />
          </div>

          {/* d20 */}
          <div>
            <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">{t('W20 — Ergebnis tippen')}</p>
            <D20Grid value={roll} onChange={setRoll} />
          </div>

          {/* result */}
          <Result roll={roll} action={selectedAction} />

          {/* re-roll hint */}
          {roll !== null && (
            <button
              className="w-full py-2 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:border-zinc-500 transition"
              onClick={() => setRoll(null)}
            >
              {t('Neu würfeln')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── exported trigger button + modal ──────────────────────────────────────────
export function DiceRoller({ character }: { character: Character }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        // Mobile: sits inline (in the dashboard header) so it never covers list values while scrolling.
        className="flex-shrink-0 lg:fixed lg:bottom-6 lg:right-6 lg:z-40 w-12 h-12 rounded-full
                   btn-seal
                   flex items-center justify-center
                   active:scale-95 transition hover:brightness-110"
        title={t('Würfelwurf')}
        aria-label={t('Würfelwurf')}
      >
        <Dice5 className="w-6 h-6" strokeWidth={1.75} aria-hidden />
      </button>
      {open && <DiceRollerModal character={character} onClose={() => setOpen(false)} />}
    </>
  );
}
