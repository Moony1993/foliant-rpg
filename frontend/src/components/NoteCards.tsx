import { useState } from 'react';
import { useNotes, useSaveNote, useDeleteNote } from '../lib/queries';
import { Card, Button, Input } from './ui';
import type { NoteInput } from '../lib/types';
import { t } from '../lib/i18n';

const NOTE_COLORS: { key: string; label: string; bg: string; border: string }[] = [
  { key: 'zinc',    label: t('Grau'),   bg: 'bg-zinc-800',    border: 'border-zinc-600' },
  { key: 'amber',   label: t('Amber'),  bg: 'bg-amber-950',   border: 'border-amber-700' },
  { key: 'sky',     label: t('Blau'),   bg: 'bg-sky-950',     border: 'border-sky-700' },
  { key: 'rose',    label: t('Rot'),    bg: 'bg-rose-950',    border: 'border-rose-700' },
  { key: 'emerald', label: t('Grün'),   bg: 'bg-emerald-950', border: 'border-emerald-700' },
  { key: 'violet',  label: t('Lila'),   bg: 'bg-violet-950',  border: 'border-violet-700' },
];

const EMPTY_DRAFT: NoteInput = { title: '', content: '', color: 'zinc', isPinned: false };

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {NOTE_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          className={`w-5 h-5 rounded-full border-2 ${c.bg} ${value === c.key ? 'border-gold' : c.border}`}
          title={c.label}
        />
      ))}
    </div>
  );
}

function NoteForm({
  draft, setDraft, onSave, onCancel, saveLabel = t('Speichern'),
}: {
  draft: NoteInput;
  setDraft: (d: NoteInput) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="space-y-2 p-3 rounded-lg border border-zinc-600 bg-zinc-800/60">
      <Input
        placeholder={t('Titel')}
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />
      <textarea
        className="w-full px-3 py-2 rounded-lg bg-zinc-700/60 border border-zinc-600 outline-none focus:border-gold text-sm resize-none"
        rows={3}
        placeholder={t('Inhalt…')}
        value={draft.content}
        onChange={(e) => setDraft({ ...draft, content: e.target.value })}
      />
      <div className="flex items-center gap-3 flex-wrap">
        <ColorPicker value={draft.color} onChange={(c) => setDraft({ ...draft, color: c })} />
        <label className="flex items-center gap-1 text-xs ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={draft.isPinned}
            onChange={(e) => setDraft({ ...draft, isPinned: e.target.checked })}
          />
          {t('Angeheftet')}
        </label>
      </div>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={!draft.title.trim()}>{saveLabel}</Button>
        <Button variant="ghost" onClick={onCancel}>{t('Abbrechen')}</Button>
      </div>
    </div>
  );
}

export function NoteCards() {
  const notes = useNotes();
  const save = useSaveNote();
  const del = useDeleteNote();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<NoteInput>(EMPTY_DRAFT);

  const colorFor = (key: string) => NOTE_COLORS.find((c) => c.key === key) ?? NOTE_COLORS[0];

  async function handleCreate() {
    await save.mutateAsync({ input: draft });
    setCreating(false);
    setDraft(EMPTY_DRAFT);
  }

  async function handleEdit(id: number) {
    await save.mutateAsync({ id, input: draft });
    setEditing(null);
  }

  function startEdit(n: { id: number; title: string; content: string; color: string; isPinned: boolean }) {
    setDraft({ title: n.title, content: n.content, color: n.color, isPinned: n.isPinned });
    setEditing(n.id);
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="rubric">{t('Notizen')}</h2>
        {!creating && (
          <Button variant="ghost" className="!h-8 !px-3 text-xs" onClick={() => { setDraft(EMPTY_DRAFT); setCreating(true); }}>{t('+ Neu')}</Button>
        )}
      </div>

      {creating && (
        <div className="mb-3">
          <NoteForm draft={draft} setDraft={setDraft} onSave={handleCreate} onCancel={() => setCreating(false)} saveLabel="Erstellen" />
        </div>
      )}

      {(notes.data?.length ?? 0) === 0 && !creating && (
        <p className="text-zinc-500 text-sm">{t('Keine Notizen. Klicke auf "+ Neu" um eine zu erstellen.')}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {notes.data?.map((n) => {
          const col = colorFor(n.color);

          if (editing === n.id) {
            return (
              <div key={n.id} className={`rounded-lg border ${col.bg} ${col.border}`}>
                <NoteForm
                  draft={draft}
                  setDraft={setDraft}
                  onSave={() => handleEdit(n.id)}
                  onCancel={() => setEditing(null)}
                />
              </div>
            );
          }

          return (
            <div key={n.id} className={`p-3 rounded-lg border ${col.bg} ${col.border} relative group`}>
              {n.isPinned && <span className="absolute top-2 right-2 text-xs select-none">📌</span>}
              {/* Light text on the dark note colours (fixed colours: the parchment theme remaps the zinc scale). */}
              <div className="font-semibold text-sm pr-5 text-[#f6ead0]">{n.title}</div>
              {n.content && (
                <p className="text-xs text-[#e3d4b4] mt-1 whitespace-pre-wrap">{n.content}</p>
              )}
              <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition">
                <button
                  className="text-xs text-[#cdbb95] hover:text-white"
                  onClick={() => startEdit(n)}
                >
                  {t('✏ Bearbeiten')}
                </button>
                <button
                  className="text-xs text-red-300 hover:text-red-200"
                  onClick={() => del.mutate(n.id)}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
