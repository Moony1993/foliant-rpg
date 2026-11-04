import { useEffect, useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import type { ItemCategory, Rarity } from '../lib/types';
import { t } from '../lib/i18n';

// Minimal hand-rolled primitives (shadcn-style API, Tailwind styling) — no extra deps.

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rpg-panel leaf px-4 py-6 sm:px-7 ${className}`}>{children}</div>;
}

/** Card heading: small label + optional action on the right. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 className="rubric">{children}</h2>
      {action}
    </div>
  );
}

/** Page title row: title, optional subtitle, optional actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'btn-brass',
    ghost: 'btn-vellum',
    danger: 'btn-red',
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 h-10 px-3 text-[15px] font-bold transition
        disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${styles} ${className}`}
      {...props}
    />
  );
}

/** Number input shown in a metric unit but stored in the rules unit (ft / lb). The typed text is
 *  only converted on blur/Enter, so rounding (e.g. to 5-ft squares) never fights the typing. */
export function UnitInput({ value, onChange, toDisplay, fromDisplay, step, className = '' }: {
  value: number; onChange: (v: number) => void; toDisplay: (v: number) => number; fromDisplay: (v: number) => number;
  step?: number; className?: string;
}) {
  const shown = String(Math.round(toDisplay(value) * 10) / 10);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v)) onChange(fromDisplay(v)); else setText(shown);
  };
  return (
    <Input type="text" inputMode="decimal" value={text} step={step} className={className}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full h-10 px-3 rounded-md text-[15px] bg-[#fffaf0] text-[#1f1209] border border-[#c9b08a] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 transition ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full h-10 px-3 rounded-md text-[15px] bg-[#fffaf0] text-[#1f1209] border border-[#c9b08a] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 transition ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-bold [font-variant:small-caps] tracking-wide text-[var(--rubric)]">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/** Small "i" badge that toggles a tooltip listing all valid keys for a JSON-effects field. */
export function InfoTooltip({ title, entries }: { title: string; entries: { key: string; desc: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1 align-middle normal-case">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        className="w-4 h-4 rounded-full bg-zinc-600 text-zinc-100 text-[10px] leading-4 text-center hover:bg-gold hover:text-zinc-900"
        title={title}
      >
        i
      </button>
      {open && (
        <div className="absolute z-50 top-5 left-0 w-72 rpg-panel p-2 text-xs shadow-lg">
          <div className="font-bold text-gold mb-1">{title}</div>
          <ul className="space-y-0.5 max-h-64 overflow-auto">
            {entries.map((e) => (
              <li key={e.key}>
                <span className="text-emerald-400 font-mono">{e.key}</span>
                <span className="text-zinc-400"> — {e.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}

export const RARITY_TEXT: Record<Rarity, string> = {
  Common: 'text-rarity-common',
  Uncommon: 'text-rarity-uncommon',
  Rare: 'text-rarity-rare',
  Epic: 'text-rarity-epic',
  Legendary: 'text-rarity-legendary',
};
export const RARITY_BORDER: Record<Rarity, string> = {
  Common: 'border-rarity-common',
  Uncommon: 'border-rarity-uncommon',
  Rare: 'border-rarity-rare',
  Epic: 'border-rarity-epic',
  Legendary: 'border-rarity-legendary',
};

export const RARITY_RING: Record<Rarity, string> = {
  Common: 'ring-rarity-common/40',
  Uncommon: 'ring-rarity-uncommon/50',
  Rare: 'ring-rarity-rare/50',
  Epic: 'ring-rarity-epic/50',
  Legendary: 'ring-rarity-legendary/60',
};

// German display labels for backend enum values (values stay English).
export const RARITY_LABEL: Record<Rarity, string> = {
  Common: t('Gewöhnlich'),
  Uncommon: t('Ungewöhnlich'),
  Rare: t('Selten'),
  Epic: t('Episch'),
  Legendary: t('Legendär'),
};
export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  Weapon: t('Waffe'),
  Armor: t('Rüstung'),
  Consumable: t('Verbrauchsgut'),
  Magic: t('Magie'),
  Quest: t('Quest'),
  Material: t('Material'),
};
export const SLOT_LABEL: Record<string, string> = {
  Head: t('Kopf'), Neck: t('Hals'), Shoulders: t('Schultern'), Chest: t('Brust'), Hands: t('Hände'),
  Belt: t('Gürtel'), Legs: t('Beine'), Feet: t('Füße'), Ring1: t('Ring 1'), Ring2: t('Ring 2'), Ring: t('Ring'),
  Earring1: t('Ohrring L'), Earring2: t('Ohrring R'), Earring: t('Ohrring'),
  Cloak: t('Umhang'), MainHand: t('Haupthand'), OffHand: t('Nebenhand'),
};

export function RarityText({ rarity, children }: { rarity: Rarity; children: ReactNode }) {
  return <span className={RARITY_TEXT[rarity]}>{children}</span>;
}
