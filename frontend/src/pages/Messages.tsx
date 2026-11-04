import { useState } from 'react';
import { useArchiveMessage, useComposeMessage, useMarkRead, useMessages, useRecipients } from '../lib/queries';
import { useToasts } from '../store/toast';
import { Button, Card, Field, Input } from '../components/ui';
import type { Message } from '../lib/types';
import { locale, t } from '../lib/i18n';

function Compose() {
  const recipients = useRecipients();
  const compose = useComposeMessage();
  const toast = useToasts((s) => s.push);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState({ subject: '', body: '', recipients: [] as string[], toAll: false, isImportant: false, scheduledFor: '' });

  function toggleRecipient(id: string) {
    setMsg((m) => ({
      ...m,
      recipients: m.recipients.includes(id) ? m.recipients.filter((r) => r !== id) : [...m.recipients, id],
    }));
  }

  async function submit() {
    const res = await compose.mutateAsync({
      subject: msg.subject, body: msg.body, recipientUserIds: msg.recipients,
      toAll: msg.toAll, isImportant: msg.isImportant,
      scheduledFor: msg.scheduledFor ? new Date(msg.scheduledFor).toISOString() : null,
    });
    toast({ title: res.scheduled ? t('Nachricht geplant') : t('Nachricht gesendet'), message: t('An {recipients} Empfänger.', { recipients: res.recipients }) });
    setMsg({ subject: '', body: '', recipients: [], toAll: false, isImportant: false, scheduledFor: '' });
    setOpen(false);
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t('✏️ Neue Nachricht')}</Button>;
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="rubric">{t('Neue Nachricht')}</h2>
        <Button variant="ghost" className="h-8 text-[13.5px]" onClick={() => setOpen(false)}>{t('Abbrechen')}</Button>
      </div>
      <Field label={t('Betreff')}><Input value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} /></Field>
      <Field label={t('Nachricht')}>
        <textarea className="w-full px-3 py-2 rounded-md text-[15px] bg-[#fffaf0] text-[#1f1209] border border-[#c9b08a] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
          rows={3} value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={msg.isImportant} onChange={(e) => setMsg({ ...msg, isImportant: e.target.checked })} />
          {t('Als wichtig markieren')}
        </label>
        <Field label={t('Zeitgesteuert (optional)')}>
          <Input type="datetime-local" value={msg.scheduledFor} onChange={(e) => setMsg({ ...msg, scheduledFor: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={msg.toAll} onChange={(e) => setMsg({ ...msg, toAll: e.target.checked })} />
        {t('An alle senden')}
      </label>
      {!msg.toAll && (
        <div>
          <div className="text-xs text-zinc-500 mb-1">{t('Empfänger — einen oder mehrere anklicken:')}</div>
          <div className="flex flex-wrap gap-2">
            {recipients.data?.map((r) => (
              <button
                key={r.userId}
                onClick={() => toggleRecipient(r.userId)}
                className={`px-2.5 py-1 rounded text-sm border ${msg.recipients.includes(r.userId) ? 'bg-gold text-[#fbeccc] border-gold' : 'border-zinc-400 text-zinc-900'}`}
              >
                {r.isGm && <span title={t('Spielleitung')}>♛ </span>}{r.displayName}{r.isGm && <span className="text-xs opacity-75"> {t('(Spielleitung)')}</span>}
              </button>
            ))}
            {(recipients.data?.length ?? 0) === 0 && (
              <span className="text-xs text-zinc-600 italic">{t('Keine anderen Nutzer vorhanden.')}</span>
            )}
          </div>
        </div>
      )}
      <Button onClick={submit} disabled={!msg.subject || compose.isPending || (!msg.toAll && msg.recipients.length === 0)}>
        {msg.scheduledFor ? t('Planen') : t('Senden')}
      </Button>
    </Card>
  );
}

export function MessagesPage() {
  const [archived, setArchived] = useState(false);
  const messages = useMessages(archived);
  const markRead = useMarkRead();
  const archive = useArchiveMessage();
  const [open, setOpen] = useState<number | null>(null);

  function toggle(m: Message) {
    setOpen(open === m.id ? null : m.id);
    if (!m.isRead && open !== m.id) markRead.mutate(m.id);
  }

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-bold text-gold">{t('Nachrichten')}</h1>
      <Compose />
      <div className="flex flex-wrap gap-2">
        <Button variant={archived ? 'ghost' : 'primary'} onClick={() => setArchived(false)}>{t('Posteingang')}</Button>
        <Button variant={archived ? 'primary' : 'ghost'} onClick={() => setArchived(true)}>{t('Archiv')}</Button>
      </div>

      {(messages.data?.length ?? 0) === 0 ? (
        <Card className="text-zinc-500 text-sm">{archived ? t('Archiv ist leer.') : t('Keine Nachrichten.')}</Card>
      ) : (
        messages.data!.map((m) => (
          <Card
            key={m.id}
            className={`cursor-pointer border-l-4 ${m.isImportant ? 'border-red-500' : m.isRead ? 'border-zinc-600' : 'border-gold'}`}
          >
            <div onClick={() => toggle(m)} className="flex justify-between items-start">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {!m.isRead && <span className="w-2 h-2 rounded-full bg-gold" />}
                  {m.isImportant && <span title={t('Wichtig')}>❗</span>}
                  {m.subject}
                </div>
                <div className="text-[13px] text-zinc-600"> {t('von {senderName} · {v}', { senderName: m.senderName, v: new Date(m.sentAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) })} </div>
              </div>
              <Button
                variant="ghost" className="h-8 text-[13.5px]"
                onClick={(e) => { e.stopPropagation(); archive.mutate(m.id); }}
              >
                {archived ? t('Wiederherstellen') : t('Archivieren')}
              </Button>
            </div>
            {open === m.id && m.body && <p className="mt-3 text-[15.5px] leading-relaxed text-zinc-900 whitespace-pre-wrap">{m.body}</p>}
          </Card>
        ))
      )}
    </div>
  );
}
