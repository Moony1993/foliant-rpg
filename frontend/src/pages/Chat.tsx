import { useEffect, useRef, useState } from 'react';
import { useChat, useSendChat } from '../lib/queries';
import { useAuth } from '../store/auth';
import { useChatSeen } from '../store/chatSeen';
import { Button } from '../components/ui';
import { t } from '../lib/i18n';

const time = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export function ChatPage() {
  const chat = useChat();
  const send = useSendChat();
  const me = useAuth((s) => s.userId);
  const markSeen = useChatSeen((s) => s.markSeen);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const messages = chat.data ?? [];
  const lastId = messages.at(-1)?.id ?? 0;

  // Keep the newest message in view and count it as read.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
    markSeen(lastId);
  }, [lastId, markSeen]);

  function submit() {
    const t = text.trim();
    if (!t || send.isPending) return;
    send.mutate(t, { onSuccess: () => setText('') });
  }

  return (
    <div className="p-4 flex flex-col h-[calc(100dvh-6rem)] lg:h-[calc(100dvh-2rem)]">
      <h1 className="text-xl font-bold text-gold mb-3">{t('Gruppenchat')}</h1>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {chat.isLoading && <p className="text-sm text-zinc-500">{t('Lädt…')}</p>}
        {!chat.isLoading && messages.length === 0 && <p className="text-sm text-zinc-500">{t('Noch keine Nachrichten — schreib die erste!')}</p>}
        {messages.map((m, i) => {
          const mine = m.userId === me;
          const showName = !mine && messages[i - 1]?.userId !== m.userId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              {/* Parchment slips; my own ones a shade warmer with a gold edge. */}
              <div className={`parchment max-w-[80%] rounded-2xl px-3 py-1.5 shadow-[inset_0_0_10px_rgba(110,70,20,.2),0_2px_6px_rgba(0,0,0,.4)] ${mine ? 'rounded-br-sm !bg-[#ecd9ad] border border-[#b8913f]' : 'rounded-bl-sm'}`}>
                {showName && <div className="text-xs font-semibold text-[var(--rubric)]">{m.userName}</div>}
                <div className="whitespace-pre-wrap break-words text-sm">{m.text}</div>
                <div className="text-[10px] text-right text-zinc-500">{time(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000}
          placeholder={t('Nachricht… (Enter senden, Shift+Enter neue Zeile)')} aria-label={t('Nachricht')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          className="flex-1 resize-none rounded-xl border border-zinc-600 bg-transparent px-3 py-2 text-sm max-h-32" />
        <Button type="submit" disabled={!text.trim() || send.isPending}>{t('Senden')}</Button>
      </form>
    </div>
  );
}
