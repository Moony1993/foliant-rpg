import { useActive } from '../lib/useActive';
import { AmmoBook } from '../components/AmmoBook';
import { t } from '../lib/i18n';

export function QuiverPage() {
  const c = useActive().character.data;
  if (!c) return <div className="p-4 text-zinc-500">{t('Kein Charakter ausgewählt.')}</div>;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gold">{t('Köcher')}</h1>
      <AmmoBook charId={c.id} />
    </div>
  );
}
