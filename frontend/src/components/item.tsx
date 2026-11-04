import { useState, useRef, useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, BowArrow, Coins, FlaskConical, Gem, HardHat, Package, Shield, Shirt, Sword, Wand, X, type LucideIcon } from 'lucide-react';
import type { InventoryItem, ItemTemplate } from '../lib/types';
import { RARITY_BORDER, RARITY_TEXT, RARITY_LABEL, CATEGORY_LABEL, SLOT_LABEL } from './ui';
import { kilos } from '../lib/units';
import { t as tr } from '../lib/i18n'; // "t" is a common local name here (template, token, tile)

// Line icons per iconKey (uploaded images still win, see ItemIcon).
const LUCIDE: Record<string, LucideIcon> = {
  sword: Sword, helm: HardHat, potion: FlaskConical, ring: Gem, cloak: Shirt,
  shield: Shield, bow: BowArrow, staff: Wand, book: BookOpen, gold: Coins, default: Package,
};
// Emoji fallback for plain-text contexts (itemIcon()).
const ICONS: Record<string, string> = {
  sword: '⚔️', helm: '🪖', potion: '🧪', ring: '💍', cloak: '🧣',
  shield: '🛡️', bow: '🏹', staff: '🪄', book: '📖', gold: '🪙', default: '📦',
};

const isUrl = (key: string) => /^(https?:\/\/|\/)/.test(key);

/** Emoji by key, or the emoji string. For uploaded icons use <ItemIcon>. */
export const itemIcon = (key: string) => (isUrl(key) ? '' : ICONS[key] ?? ICONS.default);

/** Renders an uploaded image icon when iconKey is a URL, else the emoji. */
export function ItemIcon({ iconKey, className = '' }: { iconKey: string; className?: string }) {
  if (isUrl(iconKey)) return <img src={iconKey} alt="" className={`w-full h-full object-contain ${className}`} />;
  const Icon = LUCIDE[iconKey] ?? LUCIDE.default;
  return <Icon className={`w-[1.1em] h-[1.1em] ${className}`} strokeWidth={1.75} aria-hidden />;
}

export function parseEffects(json: string): Record<string, number> {
  try { return JSON.parse(json) as Record<string, number>; } catch { return {}; }
}
function effectsList(json: string): string[] {
  return Object.entries(parseEffects(json)).map(([k, v]) => `${v >= 0 ? '+' : ''}${v} ${k}`);
}

const USE_EFFECT_LABELS: Record<string, string> = { CurrentHp: tr('Leben'), CurrentMana: tr('Mana') };
function useEffectsList(json: string): string[] {
  return Object.entries(parseEffects(json)).map(([k, v]) => `${v >= 0 ? '+' : ''}${v} ${USE_EFFECT_LABELS[k] ?? k}`);
}

export function ItemTooltip({ t }: { t: ItemTemplate }) {
  const effects = effectsList(t.effectsJson);
  const useEffects = t.isUsable ? useEffectsList(t.useEffectsJson) : [];
  const hasDamage = t.damageDice && t.damageDice.length > 0;
  const damageStr = hasDamage
    ? `${t.damageDice}${t.damageBonus > 0 ? `+${t.damageBonus}` : t.damageBonus < 0 ? `${t.damageBonus}` : ''}`
    : null;
  const critStr = hasDamage
    ? t.critRange < 20 ? tr('{critRange}–20 / ×{critMultiplier}', { critRange: t.critRange, critMultiplier: t.critMultiplier }) : `20 / ×${t.critMultiplier}`
    : null;
  return (
    <div className={`rpg-panel p-3 w-56 text-sm border-2 ${RARITY_BORDER[t.rarity]}`}>
      <div className={`font-bold ${RARITY_TEXT[t.rarity]}`}>{t.name}</div>
      <div className="text-xs text-zinc-500">{RARITY_LABEL[t.rarity]} · {CATEGORY_LABEL[t.category]}{t.slot ? ` · ${SLOT_LABEL[t.slot] ?? t.slot}` : ''}</div>
      {damageStr && (
        <div className="mt-1 flex gap-3 text-xs">
          <span className="text-amber-400">⚔ {damageStr}</span>
          <span className="text-zinc-400">{tr('Krit {critStr}', { critStr })}</span>
        </div>
      )}
      {t.bonusDamage && (
        <div className="mt-1 text-xs text-orange-400">🔥 {t.bonusDamage}</div>
      )}
      {t.description && <p className="mt-1 text-zinc-400">{t.description}</p>}
      {effects.length > 0 && (
        <ul className="mt-2 text-emerald-400">{effects.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
      {t.isUsable && (
        <div className="mt-2 border-t border-zinc-700 pt-1.5">
          <div className="text-sky-400 text-xs font-semibold">{tr('Benutzen:')}</div>
          {useEffects.length > 0 && (
            <ul className="text-sky-400">{useEffects.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          {t.useStatusEffectName && (
            <div className="text-amber-400">
              {t.useStatusEffectIcon} {t.useStatusEffectName}
              {t.useStatusEffectDurationMinutes ? ` (${t.useStatusEffectDurationMinutes} Min)` : ''}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 text-xs text-zinc-500 flex justify-between">
        <span>{kilos(t.weight)}</span><span className="text-gold">{t.value} g</span>
      </div>
    </div>
  );
}

/** Shows the equipped item next to the hovered one, with stat deltas. */
export function ComparisonTooltip({ incoming, current }: { incoming: ItemTemplate; current: ItemTemplate }) {
  const a = parseEffects(current.effectsJson);
  const b = parseEffects(incoming.effectsJson);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return (
    <div className="flex flex-wrap justify-center gap-2 items-start">
      <div className="opacity-80"><div className="text-[10px] text-zinc-500 mb-0.5 text-center">{tr('Ausgerüstet')}</div><ItemTooltip t={current} /></div>
      <div><div className="text-[10px] text-gold mb-0.5 text-center">{tr('Neu')}</div><ItemTooltip t={incoming} /></div>
      {keys.length > 0 && (
        <div className="rpg-panel p-2 text-xs self-center">
          <div className="text-zinc-500 mb-1">Δ</div>
          {keys.map((k) => {
            const d = (b[k] ?? 0) - (a[k] ?? 0);
            return <div key={k} className={d > 0 ? 'text-emerald-400' : d < 0 ? 'text-red-400' : 'text-zinc-500'}>{d >= 0 ? '+' : ''}{d} {k}</div>;
          })}
        </div>
      )}
    </div>
  );
}

/** Tooltip portaled to <body> with fixed coords clamped to the viewport. The portal
 *  matters: .rpg-panel uses backdrop-filter, which traps fixed/z-indexed children in
 *  its own stacking context, so an inline tooltip renders behind later panels.
 *  Prefers above the anchor, flips below when there isn't room. */
export function FloatingTip({ anchor, children }: { anchor: RefObject<HTMLElement | null>; children: ReactNode }) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Runs before paint → no flicker.
  useLayoutEffect(() => {
    if (!anchor.current || !tipRef.current) return;
    const a = anchor.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const m = 8;
    const left = Math.max(m, Math.min(a.left + a.width / 2 - tip.width / 2, window.innerWidth - tip.width - m));
    const above = a.top - tip.height - m;
    setPos({ left, top: above >= m ? above : a.bottom + m });
  }, [anchor]);
  return createPortal(
    <div ref={tipRef} className="fixed z-50 pointer-events-none"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, maxWidth: 'calc(100vw - 16px)' }}>
      {children}
    </div>,
    document.body,
  );
}

/** A square item tile with rarity border, icon, quantity badge, and hover tooltip.
 *  Pass `compareWith` (the item equipped in this item's slot) to show a side-by-side comparison. */
export function ItemTile({
  item, onClick, onDelete, selected, compareWith,
}: { item: InventoryItem; onClick?: () => void; onDelete?: () => void; selected?: boolean; compareWith?: ItemTemplate | null }) {
  const [hover, setHover] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);
  return (
    <div className="relative group/tile" ref={tileRef}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`group aspect-square w-full rounded-xl border flex items-center justify-center text-[28px] p-2
          bg-zinc-100 dark:bg-zinc-800/50 ${RARITY_BORDER[item.template.rarity]} ${RARITY_TEXT[item.template.rarity]}
          ${selected ? 'ring-2 ring-gold' : ''} hover:bg-zinc-200 dark:hover:bg-zinc-800 transition`}
        title={item.template.name}
      >
        <ItemIcon iconKey={item.template.iconKey} />
        {item.quantity > 1 && (
          <span className="absolute bottom-1 right-1.5 text-[11px] font-semibold tabular text-zinc-700 dark:text-zinc-200">×{item.quantity}</span>
        )}
        {item.equippedSlot && (
          <span className="absolute top-1 left-1 px-1 rounded text-[9px] font-semibold bg-gold/90 text-zinc-950">E</span>
        )}
      </button>
      {/* Sibling controls (not nested) that stop pointer propagation, so dnd-kit's drag
          listeners on the ancestor never swallow the click. */}
      {onDelete && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={tr('Entfernen')}
          className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-md bg-zinc-900/70 text-zinc-300 hover:bg-red-600 hover:text-white transition sm:opacity-0 sm:group-hover/tile:opacity-100 focus-visible:opacity-100"
        >
          <X className="w-3 h-3" aria-hidden />
        </button>
      )}
      {item.template.isUsable && onClick && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          title={tr('Benutzen')}
          className="absolute bottom-1 left-1 bg-sky-600 hover:bg-sky-500 active:bg-sky-400 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
        >
          {tr('Benutzen')}
        </button>
      )}
      {hover && (
        <FloatingTip anchor={tileRef}>
          {compareWith ? <ComparisonTooltip incoming={item.template} current={compareWith} /> : <ItemTooltip t={item.template} />}
        </FloatingTip>
      )}
    </div>
  );
}
