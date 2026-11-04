import { useEffect, useRef, useState } from 'react';
import { useActive } from '../lib/useActive';
import { useActiveChar } from '../store/char';
import { useDeleteCharacter, useRaces, useSaveCharacter, useUploadImage, useAckLevelUp, useSetAbilityIncreases, useSkillSheet, useRuleLayout, useCharacterPreview } from '../lib/queries';
import { className, classLevels, formatStat } from '../lib/stats';
import { SIZES, SIZE_LABEL } from '../lib/types';
import type { CharacterInput } from '../lib/types';
import { Button, Card, Field, Input, Select, UnitInput } from '../components/ui';
import { SkillSheet } from '../components/SkillSheet';
import { ClassFeatures } from '../components/ClassFeatures';
import { ftToM, meters, mToFt } from '../lib/units';
import { t } from '../lib/i18n';

const EMPTY: CharacterInput = {
  name: '', race: '', class: 'fighter', level: 1, xp: 0, background: '', alignment: '',
  description: '', age: 0, height: 0, weight: 0, portraitUrl: null,
  str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  currentHp: 0, currentMana: 0, gold: 0, ruleSystemId: 'pf1e',
  size: 'Medium', speed: 30, raceKey: null, raceBonusAbility: null,
  favoredClassHp: 0, favoredClassSkill: 0, abilities: {}, multiclass: [],
};

/** value, but only after it stopped changing for `ms` (live preview without a request per keystroke). */
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function CharacterPage() {
  const { list, character } = useActive();
  const setActive = useActiveChar((s) => s.setActive);
  const save = useSaveCharacter();
  const del = useDeleteCharacter();
  const upload = useUploadImage();
  const races = useRaces();

  const [form, setForm] = useState<CharacterInput>(EMPTY);
  const [id, setId] = useState<number | null>(null);
  const ackLevelUp = useAckLevelUp(id ?? 0);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load the active character into the form.
  useEffect(() => {
    if (creating) return;
    if (character.data) {
      const { id: _id, derived, items, ...rest } = character.data;
      setForm(rest);
      setId(character.data.id);
    }
  }, [character.data, creating]);

  const increases = character.data?.abilityIncreases ?? [];
  const setIncreases = useSetAbilityIncreases(character.data?.id ?? 0);
  // Rules live on the server: the sheet shows its preview of the (debounced) form.
  const layout = useRuleLayout().data?.layout;
  const abilities = layout?.abilities ?? [];
  const every = layout?.abilityIncreaseEvery ?? 0;
  const increasesDue = every > 0 ? Math.floor(form.level / every) : 0;
  const score = (key: string) => form.abilities?.[key] ?? (form[key.toLowerCase().slice(0, 3) as keyof CharacterInput] as number | undefined) ?? 10;
  // Further classes: the primary class keeps the remaining levels (at least one).
  const more = form.multiclass ?? [];
  const primaryLevel = classLevels(form)[0].level;
  const setMore = (next: typeof more) => update({ multiclass: next });
  const preview = useCharacterPreview(useDebounced(form, 300), creating ? null : id);
  const derived = preview.data;
  // Open items behind the amber "!" nav badge — listed on top, marked where they are.
  const sheet = useSkillSheet(creating ? null : id);
  const skillPointsOpen = Math.max(0, (sheet.data?.pointsAvailable ?? 0) - (sheet.data?.pointsSpent ?? 0));
  const increasesOpen = creating ? 0 : Math.max(0, increasesDue - increases.length);
  const jump = (anchor: string) => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  function update(patch: Partial<CharacterInput>) {
    const next = { ...form, ...patch };
    setForm(next);
    if (creating) return; // manual save for new characters
    setStatus(t('Speichert…'));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (id == null) return;
      await save.mutateAsync({ id, input: next });
      setStatus(t('Gespeichert ✓'));
    }, 800);
  }

  function chooseRace(key: string) {
    const r = races.data?.find((x) => x.key === key);
    if (r) update({ raceKey: r.key, race: r.name, size: r.size, speed: r.speed, raceBonusAbility: r.flexiblePlus2 ? (form.raceBonusAbility ?? abilities[0]?.key ?? null) : null });
    else update({ raceKey: null });
  }
  const selectedRace = races.data?.find((r) => r.key === form.raceKey);

  async function createNew() {
    const c = await save.mutateAsync({ input: form });
    setActive(c.id);
    setId(c.id);
    setCreating(false);
    setStatus(t('Gespeichert ✓'));
  }

  async function deleteChar() {
    if (id == null || !window.confirm(t('Charakter „{v}" wirklich löschen?', { v: form.name || 'Unbenannt' }))) return;
    await del.mutateAsync(id);
    const remaining = (list.data ?? []).filter((ch) => ch.id !== id);
    setActive(remaining[0]?.id ?? null);
    setId(null);
    setForm(EMPTY);
    if (remaining.length === 0) setCreating(true);
  }

  const noChars = (list.data?.length ?? 0) === 0;
  // Favored class bonus (PF1e): one pick per level; open at creation or during a pending level up.
  const favHp = form.favoredClassHp ?? 0, favSk = form.favoredClassSkill ?? 0;
  const savedFavHp = creating ? 0 : character.data?.favoredClassHp ?? 0;
  const savedFavSk = creating ? 0 : character.data?.favoredClassSkill ?? 0;
  const favoredOpen = Math.max(1, form.level) - favHp - favSk;
  const favoredOpenNow = creating || !!character.data?.pendingLevelUp;

  return (
    <div className="p-4 space-y-4">
      {(skillPointsOpen > 0 || increasesOpen > 0) && (
        <div role="status" className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-amber-500">{t('! Noch offen:')}</span>
          {increasesOpen > 0 && (
            <button type="button" onClick={() => jump('ability-increases')} className="underline decoration-dotted hover:text-amber-400">
              {increasesOpen} {' '}{t('Attributserhöhung')}{increasesOpen > 1 ? 'en' : ''} ↓
            </button>
          )}
          {skillPointsOpen > 0 && (
            <button type="button" onClick={() => jump('skills')} className="underline decoration-dotted hover:text-amber-400">
              {skillPointsOpen} {' '}{t('Fertigkeitspunkt')}{skillPointsOpen > 1 ? 'e' : ''} ↓
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gold">{t('Charakter')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">{status}</span>
          {!creating && !noChars && (
            <Button variant="ghost" onClick={() => { setForm(EMPTY); setId(null); setCreating(true); }}>{t('+ Neu')}</Button>
          )}
          {id != null && !creating && (
            <Button variant="danger" onClick={deleteChar}>{t('🗑 Löschen')}</Button>
          )}
        </div>
      </div>

      {(creating || noChars) && (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">{t('Neuer Charakter')}</span>
          <Button onClick={createNew} disabled={!form.name}>{t('Erstellen')}</Button>
        </Card>
      )}

      <Card className="grid grid-cols-2 gap-3">
        <Field label={t('Name')}><Input value={form.name} onChange={(e) => update({ name: e.target.value })} /></Field>
        <Field label={t('Rasse')}>
          <Select value={form.raceKey ?? ''} onChange={(e) => chooseRace(e.target.value)}>
            <option value="">{t('Eigene / ohne Boni')}</option>
            {races.data?.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </Select>
        </Field>
        {selectedRace?.flexiblePlus2 ? (
          <Field label={t('+2 auf')}>
            <Select value={form.raceBonusAbility ?? abilities[0]?.key ?? ''} onChange={(e) => update({ raceBonusAbility: e.target.value })}>
              {abilities.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </Select>
          </Field>
        ) : (
          !form.raceKey && <Field label={t('Rassenname (frei)')}><Input value={form.race} onChange={(e) => update({ race: e.target.value })} /></Field>
        )}
        <Field label={t('Klasse')}>
          <Select value={form.class} onChange={(e) => update({ class: e.target.value })}>
            {layout?.classes.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t('Stufe')}>
          <div className="flex items-center gap-2">
            <span className="text-gold font-bold text-lg">{form.level}</span>
            {more.length > 0 && <span className="text-xs text-zinc-500">{t('({v} in {c})', { v: primaryLevel, c: className(layout, form.class) })}</span>}
            {character.data?.pendingLevelUp && (
              <button
                onClick={() => ackLevelUp.mutate()}
                disabled={favoredOpen > 0}
                title={favoredOpen > 0 ? t('Erst den Bonus der bevorzugten Klasse vergeben') : undefined}
                className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse disabled:animate-none disabled:opacity-60"
              >{t('🎉 Stufenaufstieg!')}{' '} {favoredOpen > 0 ? t('Bonus wählen ↓') : t('Bestätigen')}</button>
            )}
          </div>
        </Field>
        {/* Multiclass: further classes take levels from the primary class, which keeps at least one. */}
        {(layout?.classes.length ?? 0) > 1 && (
          <div className="col-span-2">
            <div className="text-xs font-semibold text-zinc-500 mb-1">{t('Weitere Klassen')}</div>
            {more.map((m, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <Select value={m.classId} className="flex-1 min-w-0" onChange={(e) => setMore(more.map((x, j) => j === i ? { ...x, classId: e.target.value } : x))}>
                  {layout?.classes.filter((c) => c.key === m.classId || (c.key !== form.class && !more.some((x) => x.classId === c.key)))
                    .map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </Select>
                <Input type="number" min={1} aria-label={t('Stufe')} className="!w-20 shrink-0" value={m.level}
                  onChange={(e) => setMore(more.map((x, j) => j === i ? { ...x, level: Math.max(1, Math.min(+e.target.value || 1, x.level + primaryLevel - 1)) } : x))} />
                <Button variant="ghost" aria-label={t('Klasse entfernen')} onClick={() => setMore(more.filter((_, j) => j !== i))}>✕</Button>
              </div>
            ))}
            {primaryLevel > 1 ? (() => {
              const free = layout?.classes.find((c) => c.key !== form.class && !more.some((x) => x.classId === c.key));
              return free && <Button variant="ghost" onClick={() => setMore([...more, { classId: free.key, level: 1 }])}>{t('+ Klasse')}</Button>;
            })() : more.length === 0 && <p className="text-xs text-zinc-500">{t('Ab Stufe 2 kannst du eine weitere Klasse nehmen.')}</p>}
          </div>
        )}
        <Field label={t('Größe')}>
          <Select value={form.size} onChange={(e) => update({ size: e.target.value })}>
            {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label={t('Grundgeschwindigkeit (m)')}><UnitInput value={form.speed} toDisplay={ftToM} fromDisplay={mToFt} onChange={(v) => update({ speed: v })} /></Field>
        <Field label={t('Gesinnung')}><Input value={form.alignment} onChange={(e) => update({ alignment: e.target.value })} /></Field>
        <Field label={t('Hintergrund')}>
          {/* Rule packages with backgrounds: pick one (it unlocks skills etc.); otherwise free text. */}
          {layout?.backgrounds?.length ? (
            <Select value={form.background} onChange={(e) => update({ background: e.target.value })}>
              <option value="">—</option>
              {layout.backgrounds.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
            </Select>
          ) : <Input value={form.background} onChange={(e) => update({ background: e.target.value })} />}
        </Field>
        <Field label={t('Alter')}><Input type="number" value={form.age} onChange={(e) => update({ age: +e.target.value })} /></Field>
        <Field label={t('Größe (cm)')}><Input type="number" value={form.height} onChange={(e) => update({ height: +e.target.value })} /></Field>
        <Field label={t('Gewicht (kg)')}><Input type="number" value={form.weight} onChange={(e) => update({ weight: +e.target.value })} /></Field>
        <Field label={t('Portrait')}>
          <div className="flex items-center gap-2">
            {form.portraitUrl && <img src={form.portraitUrl} alt="" className="w-10 h-10 rounded object-cover" />}
            <input
              type="file" accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) update({ portraitUrl: await upload.mutateAsync(f) });
              }}
              className="text-xs min-w-0 max-w-full"
            />
          </div>
        </Field>
        <div className="col-span-2">
          <Field label={t('Beschreibung')}>
            <textarea className="w-full px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 outline-none focus:border-gold"
              rows={2} value={form.description} onChange={(e) => update({ description: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="rubric mb-2">
          {t('Attribute')} <span className="normal-case text-[10px] text-zinc-500">{t('(Basis eingeben — Endwert inkl. Rasse rechts)')}</span>
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {abilities.map(({ key: a, label }) => {
            const mod = derived?.modifiers[a] ?? 0;
            const raced = derived != null && derived.scores[a] !== score(a);
            return (
              <Field
                key={a}
                label={
                  // Fixed 2-line height so the Input below lines up across a row regardless of
                  // whether this label wraps (the "★" / raced labels run longer on mobile columns).
                  <span className="block min-h-8">
                    {label} → {derived?.scores[a] ?? '…'} ({mod >= 0 ? '+' : ''}{mod}){raced ? ' ★' : ''}
                  </span>
                }
              >
                <Input type="number" value={score(a)} onChange={(e) => update({ abilities: { ...form.abilities, [a]: +e.target.value } })} />
              </Field>
            );
          })}
        </div>
        {/* +1 on an ability every N levels (rule package) — stored apart from the starting scores. */}
        {!creating && increasesDue > 0 && (
          <div className="mt-3" id="ability-increases">
            <div className="text-xs font-semibold text-zinc-500 mb-1">{t('Attributserhöhungen')}</div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: increasesDue }, (_, i) => (
                <label key={i} className="text-xs text-zinc-500">
                  {t('Stufe')}{' '} {every * (i + 1)}
                  <Select value={increases[i] ?? ''} className={`mt-0.5 w-24 ${increases[i] ? '' : 'needs-attention'}`} disabled={setIncreases.isPending}
                    onChange={(e) => {
                      const next = [...increases];
                      next[i] = e.target.value;
                      // Keep them in level order without gaps: an empty pick drops the later ones.
                      const until = next.findIndex((x) => !x);
                      setIncreases.mutate(until < 0 ? next : next.slice(0, until));
                    }}>
                    <option value="">—</option>
                    {abilities.map((a) => <option key={a.key} value={a.key}>{a.label} +1</option>)}
                  </Select>
                </label>
              ))}
            </div>
            {increases.length < increasesDue && (
              <p className="text-xs text-amber-500 mt-1">{t('{v} Attributserhöhung(en) noch nicht vergeben.', { v: increasesDue - increases.length })}</p>
            )}
          </div>
        )}
        {selectedRace && (
          <div className="mt-3 text-xs text-zinc-500">
            <span className="text-gold">{selectedRace.name}</span> {' '}{t('· Größe')}{' '} {SIZE_LABEL[selectedRace.size as keyof typeof SIZE_LABEL] ?? selectedRace.size} {' '}{t('· Tempo')}{' '} {meters(selectedRace.speed)}
            <ul className="list-disc list-inside mt-1">{selectedRace.traits.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
      </Card>

      {/* Favored class bonus: chosen only at creation (1st level) or while a level up is pending. */}
      {favoredOpenNow && (
        <Card className="ring-1 ring-emerald-500/40">
          <h2 className="text-sm uppercase tracking-wide text-emerald-500 mb-1">{t('Bonus der bevorzugten Klasse')}</h2>
          <p className="text-xs text-zinc-500 mb-3">
            {t('Pro Stufe in deiner bevorzugten Klasse (')}{className(layout, form.class)}{t(') wählst du einmalig: +1 Trefferpunkt oder +1 Fertigkeitsrang.')}
            {favoredOpen > 0 ? t(' Noch {favoredOpen} zu vergeben.', { favoredOpen }) : ' Alles vergeben.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={favoredOpen <= 0} onClick={() => update({ favoredClassHp: favHp + 1 })}>{t('+1 Trefferpunkt')}</Button>
            <Button disabled={favoredOpen <= 0} onClick={() => update({ favoredClassSkill: favSk + 1 })}>{t('+1 Fertigkeitsrang')}</Button>
            {(favHp > savedFavHp || favSk > savedFavSk) && (
              <Button variant="ghost" onClick={() => update({ favoredClassHp: savedFavHp, favoredClassSkill: savedFavSk })}>{t('Zurücksetzen')}</Button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-2">{t('Bisher: {favHp}× Trefferpunkt, {favSk}× Fertigkeitsrang', { favHp, favSk })}</p>
        </Card>
      )}

      <Card>
        <h2 className="rubric mb-2">{t('Abgeleitete Werte (Vorschau)')}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 text-sm">
          {derived && layout?.sheetStats.map((st) => <Stat key={st.key} label={st.label} value={formatStat(st, derived)} />)}
        </div>
      </Card>

      {id != null && !creating && (
        classLevels(form).map((x, _i, all) => <ClassFeatures key={x.classId} charId={id} className={x.classId} level={x.level} choices={character.data?.featureChoices}
          heading={all.length > 1 ? className(layout, x.classId) : undefined} />)
      )}

      {id != null && !creating && <SkillSheet charId={id} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const display = value;
  return (
    <div className="rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60 p-2 text-center">
      <div className="text-lg font-bold text-gold">{display}</div>
      <div className="text-[10px] uppercase text-zinc-500 break-words hyphens-auto">{label}</div>
    </div>
  );
}
