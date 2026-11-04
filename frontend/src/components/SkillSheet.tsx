import { useState } from 'react';
import { useRuleLayout, useSetRank, useSkillSheet } from '../lib/queries';
import { useToasts } from '../store/toast';
import { Card } from './ui';
import { t } from '../lib/i18n';

const INPUT = 'px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700';
// Craft/Profession take ranks per free-text type ("craft:Waffenschmied"); their plain row adds a type.
const FREE_TEXT = ['craft', 'profession'];

function AddType({ onAdd }: { onAdd: (type: string) => void }) {
  const [type, setType] = useState('');
  const submit = () => { if (type.trim()) { onAdd(type.trim()); setType(''); } };
  return (
    <input value={type} maxLength={40} placeholder={t('+ Art')} title={t('Art eingeben, Enter = 1 Rang')}
      onChange={(e) => setType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} onBlur={submit}
      className={INPUT + ' w-24 text-xs'} />
  );
}

// PF1e ranked skills. Total = ranks + ability mod + (class skill & ≥1 rank → +3) + armor check.
export function SkillSheet({ charId }: { charId: number }) {
  const sheet = useSkillSheet(charId);
  const setRank = useSetRank(charId);
  const toast = useToasts((t) => t.push);
  // Systems without ranks (5e style): proficiency comes from class/ancestry/choices — shown, not edited.
  const ranked = useRuleLayout().data?.capabilities.includes('skillRanks') ?? true;
  const s = sheet.data;
  if (!s) return null;

  const changeRank = (skillKey: string, ranks: number) =>
    setRank.mutate({ skillKey, ranks: Math.max(0, ranks) }, {
      onError: (e: any) => toast({ title: t('Nicht möglich'), message: e.response?.data?.message ?? t('Fehler beim Setzen der Ränge.') }),
    });

  const overspent = s.pointsSpent > s.pointsAvailable;
  const open = s.pointsAvailable - s.pointsSpent;

  return (
    <Card>
      <div id="skills" className="flex items-center justify-between mb-2">
        <h2 className="rubric">{t('Fertigkeiten')}</h2>
        {ranked && <span className={`text-xs px-1.5 ${overspent ? 'text-red-400' : open > 0 ? 'text-amber-500 font-semibold needs-attention' : 'text-zinc-500'}`}>
          {open > 0 && t('{open} offen · ', { open })}{t('Punkte')}{' '} {s.pointsSpent}/{s.pointsAvailable} {' '}{t('· max.')}{' '} {s.maxRanks} {' '}{t('Ränge/Fertigkeit')}
        </span>}
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase text-zinc-500 sticky top-0 bg-white dark:bg-zinc-900">
            <tr>
              <th className="text-left font-normal py-1">{t('Fertigkeit')}</th>
              <th className="font-normal">{t('Attr.')}</th>
              <th className="font-normal">{ranked ? t('Ränge') : t('Übung')}</th>
              <th className="text-right font-normal">{t('Gesamt')}</th>
            </tr>
          </thead>
          <tbody>
            {s.skills.map((sk) => (
              <tr key={sk.key} className="border-t border-zinc-200/50 dark:border-zinc-800">
                <td className="py-1">
                  {ranked && sk.isClassSkill && <span className="text-gold" title={t('Klassenfertigkeit')}>★ </span>}
                  {sk.name}
                  {sk.trainedOnly && <span className="text-zinc-500" title={t('Nur ausgebildet')}> ᵀ</span>}
                  {sk.armorCheck && <span className="text-zinc-500" title={t('Rüstungsmalus')}> ⛨</span>}
                </td>
                <td className="text-center text-zinc-500 text-xs">{sk.ability}</td>
                <td className="text-center">
                  {!ranked ? (
                    <span className={sk.ranks > 0 ? 'text-gold font-semibold' : 'text-zinc-400'} title={sk.ranks === 2 ? t('Expertise') : sk.ranks === 1 ? t('Geübt') : t('Nicht geübt')}>
                      {sk.ranks === 2 ? '◆◆' : sk.ranks === 1 ? '◆' : '○'}
                    </span>
                  ) : FREE_TEXT.includes(sk.key) && sk.ranks === 0 ? <AddType onAdd={(t) => changeRank(`${sk.key}:${t}`, 1)} /> : <input
                    type="number" min={0} max={s.maxRanks}
                    value={sk.ranks}
                    onChange={(e) => changeRank(sk.key, +e.target.value)}
                    className={INPUT + ' w-14 text-center'}
                  />}
                </td>
                <td className="text-right font-semibold text-gold">{sk.total >= 0 ? '+' : ''}{sk.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        {ranked ? t('★ Klassenfertigkeit (+3 ab 1 Rang) · ᵀ nur ausgebildet · ⛨ Rüstungsmalus') : t('◆ geübt · ◆◆ Expertise · ○ nicht geübt — kommt aus Klasse, Volk und Wahlen')}
      </p>
    </Card>
  );
}
