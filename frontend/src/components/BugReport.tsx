import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useBugReport } from '../lib/queries';
import { useToasts } from '../store/toast';
import { Button } from './ui';
import { t } from '../lib/i18n';

/** "Bug melden" dialog (opened from the navigation) — sends the report as an important message to every GM/Admin. */
export function BugReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const report = useBugReport();
  const toast = useToasts((s) => s.push);
  const { pathname } = useLocation();

  async function submit() {
    await report.mutateAsync({ text: text.trim(), page: pathname });
    toast({ title: t('Danke!'), message: t('Bug Report wurde an die GMs gesendet.') });
    setText('');
    onClose();
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={() => onClose()}>
          <div role="dialog" aria-label={t('Bug melden')} className="rpg-panel p-4 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">{t('Bug melden')}</h2>
            <p className="text-xs text-zinc-500">{t('Was ist passiert, und was hast du erwartet? Die aktuelle Seite ({pathname}) wird mitgeschickt.', { pathname })}</p>
            <textarea
              autoFocus
              rows={5}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-white/10 outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onClose()}>{t('Abbrechen')}</Button>
              <Button onClick={submit} disabled={!text.trim() || report.isPending}>{t('Senden')}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
