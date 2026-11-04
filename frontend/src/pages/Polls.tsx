import { useState } from 'react';
import { useChoosePoll, useCreatePoll, useDeletePoll, usePolls, useVotePoll } from '../lib/queries';
import type { PollAnswer, PollOption, SchedulePoll } from '../lib/types';
import { useAuth } from '../store/auth';
import { Button, Card, Field, Input } from '../components/ui';
import { locale, t } from '../lib/i18n';

const fmt = (iso: string) => new Date(iso).toLocaleString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
const ANSWERS: { key: PollAnswer; icon: string; label: string; on: string }[] = [
  { key: 'yes', icon: '✓', label: t('Kann'), on: 'bg-emerald-600 border-emerald-600 text-white' },
  { key: 'maybe', icon: '?', label: t('Vielleicht'), on: 'bg-amber-500 border-amber-500 text-zinc-900' },
  { key: 'no', icon: '✗', label: t('Kann nicht'), on: 'bg-red-600 border-red-600 text-white' },
];
const count = (o: PollOption, a: PollAnswer) => o.votes.filter((v) => v.answer === a).length;
const score = (o: PollOption) => count(o, 'yes') * 2 + count(o, 'maybe');

/** Creates a poll with any number of proposed dates. */
function NewPoll() {
  const create = useCreatePoll();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(t('Nächste Session'));
  const [description, setDescription] = useState('');
  const [dates, setDates] = useState<string[]>(['']);

  if (!open) return <Button onClick={() => setOpen(true)}>{t('+ Neue Terminumfrage')}</Button>;
  const valid = dates.filter(Boolean);
  return (
    <Card className="space-y-3">
      <h2 className="rubric">{t('Neue Terminumfrage')}</h2>
      <Field label={t('Titel')}><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label={t('Beschreibung (optional)')}><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('z. B. Ort, Dauer, was mitbringen')} /></Field>
      <div className="space-y-2">
        <div className="text-xs text-zinc-500">{t('Terminvorschläge')}</div>
        {dates.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input type="datetime-local" value={d} onChange={(e) => setDates(dates.map((x, j) => (j === i ? e.target.value : x)))} className="flex-1" />
            {dates.length > 1 && (
              <button type="button" onClick={() => setDates(dates.filter((_, j) => j !== i))} title={t('Entfernen')} className="text-zinc-500 hover:text-red-400 px-2">×</button>
            )}
          </div>
        ))}
        {/* New row starts one week after the last date — usual rhythm for a weekly game. */}
        <button type="button" className="text-sm text-gold" onClick={() => {
          const last = valid.at(-1);
          const next = last ? new Date(new Date(last).getTime() + 7 * 864e5) : null;
          const local = next ? new Date(next.getTime() - next.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
          setDates([...dates, local]);
        }}>{t('+ weiterer Termin')}</button>
      </div>
      <div className="flex gap-2">
        <Button disabled={!title.trim() || valid.length === 0 || create.isPending} onClick={() =>
          create.mutate({ title, description, options: valid.map((d) => new Date(d).toISOString()) }, {
            onSuccess: () => { setOpen(false); setDates(['']); setDescription(''); },
          })}>{t('Umfrage starten')}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t('Abbrechen')}</Button>
      </div>
    </Card>
  );
}

function PollCard({ poll }: { poll: SchedulePoll }) {
  const me = useAuth((s) => s.userId);
  const isGm = useAuth((s) => s.isGm());
  const vote = useVotePoll();
  const choose = useChoosePoll();
  const del = useDeletePoll();
  const chosen = poll.options.find((o) => o.id === poll.chosenOptionId);
  const best = Math.max(...poll.options.map(score));
  const voted = new Set(poll.options.flatMap((o) => o.votes.map((v) => v.userId)));
  const missing = poll.members.filter((m) => !voted.has(m.userId));

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="rubric">{poll.title}</h2>
          {poll.description && <p className="text-sm text-zinc-500">{poll.description}</p>}
        </div>
        {isGm && (
          <button type="button" title={t('Umfrage löschen')} className="text-xs text-zinc-500 hover:text-red-400"
            onClick={() => { if (window.confirm(t('Umfrage „{title}“ löschen?', { title: poll.title }))) del.mutate(poll.id); }}>{t('Löschen')}</button>
        )}
      </div>

      {chosen && (
        <div className="rounded border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 flex items-center gap-2">
          <span className="text-lg">📅</span>
          <span className="flex-1"><b>{t('Termin steht:')}</b> {fmt(chosen.startsAt)}</span>
          {isGm && <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => choose.mutate({ pollId: poll.id, optionId: null })}>{t('wieder öffnen')}</button>}
        </div>
      )}

      <ul className="space-y-2">
        {poll.options.map((o) => {
          const mine = o.votes.find((v) => v.userId === me)?.answer;
          const top = !chosen && best > 0 && score(o) === best;
          return (
            <li key={o.id} className={`rounded-lg border px-3 py-2 ${o.id === poll.chosenOptionId ? 'border-emerald-500' : top ? 'border-gold/70' : 'border-zinc-300 dark:border-zinc-700'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium flex-1 min-w-[9rem]">{fmt(o.startsAt)} {top && <span className="text-xs text-gold">{t('★ beliebteste')}</span>}</span>
                <span className="text-xs text-zinc-500 tabular-nums">✓ {count(o, 'yes')} · ? {count(o, 'maybe')} · ✗ {count(o, 'no')}</span>
              </div>
              {!chosen && (
                <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${mine ? '' : 'needs-attention p-1 -m-1'}`}>
                  {ANSWERS.map((a) => (
                    <button key={a.key} type="button" disabled={vote.isPending}
                      onClick={() => vote.mutate({ pollId: poll.id, optionId: o.id, answer: mine === a.key ? 'none' : a.key })}
                      className={`text-sm px-3 py-1 rounded-full border disabled:opacity-60 ${mine === a.key ? a.on : 'border-zinc-500 hover:border-zinc-300'}`}>
                      {a.icon} {a.label}
                    </button>
                  ))}
                  {isGm && (
                    <Button variant="ghost" className="ml-auto text-xs px-2 py-1" onClick={() => choose.mutate({ pollId: poll.id, optionId: o.id })}>{t('Festlegen')}</Button>
                  )}
                </div>
              )}
              {o.votes.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
                  {o.votes.map((v) => {
                    const a = ANSWERS.find((x) => x.key === v.answer)!;
                    return <span key={v.userId} className={`px-1.5 py-0.5 rounded ${a.on}`}>{a.icon} {v.name}</span>;
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!chosen && missing.length > 0 && (
        <p className="text-xs text-zinc-500">{t('Noch nicht abgestimmt: {v}', { v: missing.map((m) => m.name).join(', ') })}</p>
      )}
    </Card>
  );
}

export function PollsPage() {
  const polls = usePolls();
  const isGm = useAuth((s) => s.isGm());
  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-gold">{t('Termine')}</h1>
      {isGm && <NewPoll />}
      {polls.isLoading ? <p className="text-sm text-zinc-500">{t('Lädt…')}</p> : (polls.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-zinc-500">{t('Noch keine Terminumfragen')}{isGm ? t(' — leg oben die erste an.') : '.'}</p>
      ) : polls.data!.map((p) => <PollCard key={p.id} poll={p} />)}
    </div>
  );
}
