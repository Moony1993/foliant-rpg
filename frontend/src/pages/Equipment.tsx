import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import humanFigure from '../assets/figures/human.png';
import dwarfFigure from '../assets/figures/dwarf.png';
import elfFigure from '../assets/figures/elf.png';
import gnomeFigure from '../assets/figures/gnome.png';
import halfelfFigure from '../assets/figures/halfelf.png';
import halforcFigure from '../assets/figures/halforc.png';
import halflingFigure from '../assets/figures/halfling.png';
import { X } from 'lucide-react';
import { useActive } from '../lib/useActive';
import { useAttune, useEquip, useRuleLayout, useUnequip } from '../lib/queries';
import { useToasts } from '../store/toast';
import { FloatingTip, ItemIcon, ItemTooltip, parseEffects } from '../components/item';
import { Button, Card, RARITY_BORDER, RARITY_TEXT } from '../components/ui';
import { Companions } from '../components/Companions';
import type { EquipSlot, InventoryItem, ItemTemplate } from '../lib/types';
import { useLayoutEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

const SLOT_LABELS: Record<EquipSlot, string> = {
  Head: t('Kopf'), Neck: t('Hals'), Shoulders: t('Schultern'), Chest: t('Brust'), Hands: t('Hände'),
  Belt: t('Gürtel'), Legs: t('Beine'), Feet: t('Füße'), Ring1: t('Ring 1'), Ring2: t('Ring 2'), Ring: t('Ring'),
  Earring1: t('Ohrring L'), Earring2: t('Ohrring R'), Earring: t('Ohrring'),
  Cloak: t('Umhang'), MainHand: t('Hauptwaffe'), OffHand: t('Nebenhand'),
};

// Figure per race: an engraving of the race in plain traveller's clothes (what the character
// wears comes from the slots), plus where each slot points on it as fractions of the image (x, y).
// Figures face the viewer, so the right (weapon) hand is on the viewer's left. Custom races use
// the human. Images generated with Nano Banana 2 in 19th-century engraving style.
type Figure = { src: string; w: number; h: number; anchors: Record<string, [number, number]> };
const FIGURES: Record<string, Figure> = {
  human: { src: humanFigure, w: 421, h: 920, anchors: {
    Head: [.50, .05], Earring1: [.40, .10], Shoulders: [.25, .20], Chest: [.43, .27], Hands: [.12, .49], MainHand: [.08, .535], Ring1: [.06, .56], Legs: [.39, .71],
    Earring2: [.59, .10], Neck: [.50, .16], Cloak: [.74, .20], Belt: [.49, .41], OffHand: [.92, .535], Ring2: [.94, .56], Feet: [.72, .93],
  } },
  dwarf: { src: dwarfFigure, w: 446, h: 836, anchors: {
    Head: [.48, .07], Earring1: [.34, .15], Shoulders: [.15, .30], Chest: [.31, .375], Hands: [.11, .56], MainHand: [.08, .60], Ring1: [.06, .625], Legs: [.31, .77],
    Earring2: [.62, .15], Neck: [.48, .25], Cloak: [.82, .30], Belt: [.52, .48], OffHand: [.90, .60], Ring2: [.91, .625], Feet: [.72, .93],
  } },
  elf: { src: elfFigure, w: 382, h: 890, anchors: {
    Head: [.47, .05], Earring1: [.38, .07], Shoulders: [.19, .20], Chest: [.35, .27], Hands: [.15, .49], MainHand: [.10, .52], Ring1: [.08, .545], Legs: [.35, .71],
    Earring2: [.64, .07], Neck: [.47, .16], Cloak: [.75, .20], Belt: [.52, .38], OffHand: [.92, .52], Ring2: [.94, .545], Feet: [.75, .93],
  } },
  gnome: { src: gnomeFigure, w: 437, h: 937, anchors: {
    Head: [.52, .07], Earring1: [.32, .20], Shoulders: [.21, .36], Chest: [.36, .43], Hands: [.15, .59], MainHand: [.13, .65], Ring1: [.11, .68], Legs: [.33, .79],
    Earring2: [.77, .20], Neck: [.54, .33], Cloak: [.82, .36], Belt: [.52, .52], OffHand: [.92, .65], Ring2: [.94, .68], Feet: [.69, .93],
  } },
  halfelf: { src: halfelfFigure, w: 387, h: 871, anchors: {
    Head: [.50, .045], Earring1: [.38, .08], Shoulders: [.22, .20], Chest: [.38, .27], Hands: [.12, .49], MainHand: [.08, .535], Ring1: [.07, .56], Legs: [.38, .71],
    Earring2: [.63, .08], Neck: [.50, .17], Cloak: [.78, .20], Belt: [.50, .40], OffHand: [.92, .535], Ring2: [.93, .56], Feet: [.72, .93],
  } },
  halforc: { src: halforcFigure, w: 454, h: 936, anchors: {
    Head: [.59, .05], Earring1: [.48, .11], Shoulders: [.30, .21], Chest: [.46, .29], Hands: [.28, .47], MainHand: [.27, .52], Ring1: [.26, .535], Legs: [.48, .71],
    Earring2: [.71, .11], Neck: [.59, .17], Cloak: [.89, .21], Belt: [.59, .40], OffHand: [.92, .52], Ring2: [.93, .535], Feet: [.81, .89],
  } },
  halfling: { src: halflingFigure, w: 398, h: 893, anchors: {
    Head: [.48, .07], Earring1: [.31, .125], Shoulders: [.18, .26], Chest: [.32, .34], Hands: [.07, .50], MainHand: [.07, .56], Ring1: [.08, .60], Legs: [.30, .77],
    Earring2: [.64, .125], Neck: [.48, .205], Cloak: [.78, .26], Belt: [.46, .45], OffHand: [.85, .56], Ring2: [.86, .60], Feet: [.72, .95],
  } },
};
/** The figure for a character: its standard race, else a race recognised in the free-text race
 *  name of a custom race ("Elfe", "Halb-Ork", "Dwarf" ...), else the human. */
function figureFor(raceKey: string | null, race: string) {
  if (raceKey && FIGURES[raceKey]) return FIGURES[raceKey];
  const r = race.toLowerCase().replace(/[^a-zäöü]/g, '');
  const key = /halbelf|halfelf/.test(r) ? 'halfelf' : /halbork|halforc|halfork/.test(r) ? 'halforc'
    : /halbling|halfling/.test(r) ? 'halfling' : /gnom/.test(r) ? 'gnome' : /zwerg|dwarf/.test(r) ? 'dwarf'
    : /^elf|^elb/.test(r) ? 'elf' : 'human';
  return FIGURES[key];
}

// Which side each slot's label sits on: the weapon hand's slots left, the off hand's right.
// Within a column the order follows the figure's anchors.
const LEFT: EquipSlot[] = ['Head', 'Earring1', 'Shoulders', 'Chest', 'Hands', 'MainHand', 'Ring1', 'Legs'];
const RIGHT: EquipSlot[] = ['Earring2', 'Neck', 'Cloak', 'Belt', 'OffHand', 'Ring2', 'Feet'];
const ROW_GAP = 4;

/** Vertical centres for one column: as close to each anchor's height as possible, but at least
 *  one row apart and inside [0, height]. */
function spread(wanted: number[], row: number, height: number) {
  const c = wanted.map((y) => Math.max(y, row / 2));
  for (let i = 1; i < c.length; i++) c[i] = Math.max(c[i], c[i - 1] + row);
  c[c.length - 1] = Math.min(c[c.length - 1], height - row / 2);
  for (let i = c.length - 2; i >= 0; i--) c[i] = Math.min(c[i], c[i + 1] - row);
  return c;
}

type Leader = { slot: string; d: string; ax: number; ay: number };

/** The class figure (see FIGURES) between two slot columns. Each slot sits level with its spot on
 *  the figure and an ink leader runs out horizontally, then bends onto that spot. */
function Paperdoll({ figure: fig, equipped, onOpen }: { figure: Figure; equipped: (s: EquipSlot) => InventoryItem | undefined; onOpen: (s: EquipSlot) => void }) {
  const byHeight = (slots: EquipSlot[]) => [...slots].sort((a, b) => fig.anchors[a][1] - fig.anchors[b][1]);
  const left = byHeight(LEFT), right = byHeight(RIGHT);
  const box = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLDivElement>(null);
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const [layout, setLayout] = useState<{ tops: Record<string, number>; leaders: Leader[]; minHeight: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !figure.current) return;
      const b = box.current.getBoundingClientRect();
      const f = figure.current.getBoundingClientRect();
      const tops: Record<string, number> = {};
      const leaders: Leader[] = [];
      let minHeight = 0;
      ([[left, 0], [right, 1]] as const).forEach(([slots, i]) => {
        const col = cols.current[i];
        if (!col) return;
        const c = col.getBoundingClientRect();
        const row = Math.max(...[...col.children].map((el) => (el as HTMLElement).offsetHeight)) + ROW_GAP;
        // On a phone the figure is shorter than a full column of slots: grow the box to fit them.
        minHeight = Math.max(minHeight, slots.length * row);
        const ys = spread(slots.map((s) => f.top - c.top + fig.anchors[s][1] * f.height), row, c.height);
        slots.forEach((slot, k) => {
          tops[slot] = ys[k];
          const [fx, fy] = fig.anchors[slot];
          const ax = f.left - b.left + fx * f.width, ay = f.top - b.top + fy * f.height;
          const y = c.top - b.top + ys[k];
          const x1 = i === 0 ? c.right - b.left + 4 : c.left - b.left - 4;
          // Horizontal run to just outside the figure's edge, then a straight bend onto the spot.
          const edge = i === 0 ? Math.min(ax - 10, f.left - b.left + f.width * .12) : Math.max(ax + 10, f.right - b.left - f.width * .12);
          leaders.push({ slot, ax, ay, d: `M${x1},${y} H${edge} L${ax},${ay}` });
        });
      });
      setLayout({ tops, leaders, minHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, [fig]);
  const column = (slots: EquipSlot[], side: 'left' | 'right', i: number) => (
    <div ref={(el) => { cols.current[i] = el; }} className="relative">
      {slots.map((slot, k) => (
        <div key={slot} className={`absolute inset-x-0 -translate-y-1/2 flex ${side === 'left' ? 'justify-end' : 'justify-start'}`}
          style={{ top: layout ? layout.tops[slot] : `${((k + .5) / slots.length) * 100}%` }}>
          <SlotChip slot={slot} side={side} item={equipped(slot)} onOpen={() => onOpen(slot)} />
        </div>
      ))}
    </div>
  );
  return (
    <div ref={box} className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2 sm:gap-x-6 py-2" style={{ minHeight: layout?.minHeight }}>
      {column(left, 'left', 0)}
      <div ref={figure} className="relative self-center w-[118px] sm:w-[200px] lg:w-[240px]" style={{ aspectRatio: `${fig.w} / ${fig.h}` }}>
        <img src={fig.src} alt="" aria-hidden className="absolute inset-0 w-full h-full opacity-80 pointer-events-none select-none" />
      </div>
      {column(right, 'right', 1)}
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" aria-hidden>
        {layout?.leaders.map((l) => (
          <g key={l.slot} fill="none" strokeLinejoin="round" strokeLinecap="round">
            {/* parchment halo keeps the ink line legible where it crosses the engraving */}
            <path d={l.d} stroke="#f7edd5" strokeWidth={3.5} strokeOpacity={0.8} />
            <path d={l.d} stroke="#7d1414" strokeWidth={1} strokeOpacity={0.75} />
            <circle cx={l.ax} cy={l.ay} r={4} fill="#f7edd5" stroke="#7d1414" strokeWidth={1.2} />
            <circle cx={l.ax} cy={l.ay} r={1.6} fill="#7d1414" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function SlotChip({ slot, side, item, onOpen }: { slot: EquipSlot; side: 'left' | 'right'; item?: InventoryItem; onOpen: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: slot });
  const ref = useRef<HTMLButtonElement | null>(null);
  const [hover, setHover] = useState(false);
  return (
    <button
      ref={(el) => { setNodeRef(el); ref.current = el; }}
      onClick={onOpen}
      // Mouse only: on touch the tap opens the slot sheet instead.
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={() => setHover(false)}
      aria-label={item ? `${SLOT_LABELS[slot]}: ${item.template.name}` : `${SLOT_LABELS[slot]} (leer)`}
      className={`flex items-center gap-2 min-w-0 rounded-md transition active:scale-[.98] ${side === 'left' ? 'flex-row-reverse text-right' : 'text-left'} ${isOver ? 'ring-2 ring-gold' : ''}`}
    >
      <span data-slot={slot}
        className={`w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 rounded-full grid place-items-center text-lg
          ${item
            ? `border-2 bg-[#fffaf0] shadow-md ${RARITY_BORDER[item.template.rarity]} ${RARITY_TEXT[item.template.rarity]}`
            : 'border border-dashed border-zinc-400 bg-zinc-50/80 text-zinc-400'}`}>
        {item ? <ItemIcon iconKey={item.template.iconKey} /> : <span className="text-base leading-none">+</span>}
      </span>
      <span className="min-w-0">
        <span className="block text-[11.5px] sm:text-[13px] font-bold [font-variant:small-caps] tracking-wide leading-tight text-[var(--rubric)]">{SLOT_LABELS[slot]}</span>
        <span className={`block text-[12px] sm:text-[14px] leading-tight line-clamp-2 ${item ? 'text-zinc-900' : 'text-zinc-400 italic'}`}>{item ? item.template.name : t('frei')}</span>
      </span>
      {hover && item && <FloatingTip anchor={ref}><ItemTooltip t={item.template} /></FloatingTip>}
    </button>
  );
}

function BackpackItem({ item, onOpen }: { item: InventoryItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const ref = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState(false);
  return (
    <div onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)} onPointerLeave={() => setHover(false)}>
      <div
        ref={(el) => { setNodeRef(el); ref.current = el; }}
        {...attributes}
        {...listeners}
        // dnd-kit only starts a drag after 5px of movement, so a tap still lands here.
        onClick={onOpen}
        style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, opacity: isDragging ? 0.4 : 1, touchAction: 'none' }}
        className={`w-12 h-12 rounded-lg border-2 grid place-items-center text-xl cursor-grab
          bg-zinc-200/60 dark:bg-zinc-800/60 ${RARITY_BORDER[item.template.rarity]} ${RARITY_TEXT[item.template.rarity]}`}
      >
        <ItemIcon iconKey={item.template.iconKey} />
      </div>
      {hover && !isDragging && <FloatingTip anchor={ref}><ItemTooltip t={item.template} /></FloatingTip>}
    </div>
  );
}

/** "+3 Str · −1 Dex" of what changes when `next` replaces `cur` (or is added to an empty slot). */
function EffectDelta({ next, cur }: { next: ItemTemplate; cur?: ItemTemplate }) {
  const a = cur ? parseEffects(cur.effectsJson) : {};
  const b = parseEffects(next.effectsJson);
  const deltas = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map((k) => [k, (b[k] ?? 0) - (a[k] ?? 0)] as const).filter(([, d]) => d !== 0);
  if (deltas.length === 0) return <span className="text-zinc-500">{t('keine Wertänderung')}</span>;
  return (
    <span className="flex flex-wrap gap-x-2">
      {deltas.map(([k, d]) => <span key={k} className={d > 0 ? 'text-emerald-500' : 'text-red-500'}>{d > 0 ? '+' : '−'}{Math.abs(d)} {k}</span>)}
    </span>
  );
}

/** Bottom sheet (centred dialog on desktop) for one slot: what's in it, and what fits. */
function SlotSheet({ slot, current, options, onEquip, onUnequip, onClose, charId }: {
  slot: EquipSlot; current?: InventoryItem; options: InventoryItem[];
  onEquip: (i: InventoryItem) => void; onUnequip: () => void; onClose: () => void; charId: number;
}) {
  const attunement = useRuleLayout().data?.capabilities.includes('attunement') ?? false;
  const attune = useAttune(charId);
  const toast = useToasts((s) => s.push);
  const needsAttunement = attunement && !!current?.template.requiresAttunement;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label={SLOT_LABELS[slot]} onClick={(e) => e.stopPropagation()}
        className="w-full lg:max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl lg:rounded-2xl parchment border-t lg:border border-zinc-200 dark:border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold">{SLOT_LABELS[slot]}</span>
          <button onClick={onClose} aria-label={t('Schließen')} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>

        {current ? (
          <div className="flex flex-col items-center gap-2 mb-4">
            <ItemTooltip t={current.template} />
            {needsAttunement && (
              <p className={`text-xs ${current.attuned ? 'text-emerald-600' : 'text-amber-600'}`}>
                {current.attuned ? t('⚝ Eingestimmt — die Effekte wirken.') : t('⚝ Nicht eingestimmt — die Effekte wirken erst nach der Einstimmung (kurze Rast).')}
              </p>
            )}
            <div className="flex gap-2">
              {needsAttunement && (
                <Button disabled={attune.isPending} onClick={() => attune.mutate({ itemId: current.id, attuned: !current.attuned }, {
                  onError: (e: any) => toast({ title: t('Nicht möglich'), message: e?.response?.data?.message ?? t('Einstimmung fehlgeschlagen.') }),
                })}>{current.attuned ? t('Einstimmung lösen') : t('Einstimmen')}</Button>
              )}
              <Button variant="ghost" onClick={onUnequip}>{t('Ablegen')}</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 mb-4">{t('Nichts angelegt.')}</p>
        )}

        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
          {current ? t('Stattdessen anlegen') : t('Passende Gegenstände')}
        </div>
        {options.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('Keine passenden Gegenstände im Inventar.')}</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
            {options.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <span className={`w-10 h-10 flex-shrink-0 rounded-lg border-2 grid place-items-center text-lg bg-zinc-100 dark:bg-zinc-800/60 ${RARITY_BORDER[i.template.rarity]} ${RARITY_TEXT[i.template.rarity]}`}>
                  <ItemIcon iconKey={i.template.iconKey} />
                </span>
                <div className="flex-1 min-w-0 text-sm">
                  <div className={`font-medium truncate ${RARITY_TEXT[i.template.rarity]}`}>{i.template.name}</div>
                  <div className="text-xs"><EffectDelta next={i.template} cur={current?.template} /></div>
                </div>
                <Button className="!h-9 !px-3 text-sm flex-shrink-0" onClick={() => onEquip(i)}>{current ? t('Tauschen') : t('Anlegen')}</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Generic item slots that fit either of two physical slots.
const PAIRS: Partial<Record<EquipSlot, [EquipSlot, EquipSlot]>> = { Ring: ['Ring1', 'Ring2'], Earring: ['Earring1', 'Earring2'] };
const fitsSlot = (t: ItemTemplate, slot: EquipSlot) =>
  t.slot === slot || !!PAIRS[t.slot as EquipSlot]?.includes(slot);

export function EquipmentPage() {
  const { character, activeId } = useActive();
  const equip = useEquip(activeId ?? 0);
  const unequip = useUnequip(activeId ?? 0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [openSlot, setOpenSlot] = useState<EquipSlot | null>(null);
  const c = character.data;
  if (!c) return <div className="p-4 text-zinc-500">{t('Kein Charakter ausgewählt.')}</div>;

  const equipped = (slot: EquipSlot) => c.items.find((i) => i.equippedSlot === slot);
  const backpack = c.items.filter((i) => i.equippedSlot == null && i.template.slot != null);
  // Rings/earrings go into the first free of their two slots (the first when both are taken).
  const targetSlot = (t: ItemTemplate): EquipSlot => {
    const pair = PAIRS[t.slot as EquipSlot];
    return pair ? (equipped(pair[0]) && !equipped(pair[1]) ? pair[1] : pair[0]) : t.slot as EquipSlot;
  };

  function onDragEnd(e: DragEndEvent) {
    const slot = e.over?.id as EquipSlot | undefined;
    const item = c!.items.find((i) => i.id === e.active.id);
    if (slot && item && fitsSlot(item.template, slot)) equip.mutate({ inventoryItemId: item.id, slot });
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gold">{t('Ausrüstung')}</h1>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <Card>
          <Paperdoll figure={figureFor(c.raceKey, c.race)} equipped={equipped} onOpen={setOpenSlot} />
          <p className="text-center text-[11px] text-zinc-500 mt-2">
            {t('Slot antippen zum Anlegen, Tauschen oder Ablegen')}
          </p>
        </Card>

        <Card>
          <h2 className="rubric mb-2">{t('Ausrüstbare Gegenstände')}</h2>
          {backpack.length === 0 ? (
            <p className="text-zinc-500 text-sm">{t('Keine ausrüstbaren Gegenstände im Inventar.')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {backpack.map((i) => <BackpackItem key={i.id} item={i} onOpen={() => setOpenSlot(targetSlot(i.template))} />)}
            </div>
          )}
        </Card>
      </DndContext>

      {openSlot && (
        <SlotSheet charId={c.id}
          slot={openSlot}
          current={equipped(openSlot)}
          options={backpack.filter((i) => fitsSlot(i.template, openSlot))}
          onEquip={(i) => { equip.mutate({ inventoryItemId: i.id, slot: openSlot }); setOpenSlot(null); }}
          onUnequip={() => { unequip.mutate({ inventoryItemId: equipped(openSlot)!.id }); setOpenSlot(null); }}
          onClose={() => setOpenSlot(null)}
        />
      )}

      <Card>
        <h2 className="rubric mb-2">{t('Werte (mit Ausrüstungs-Boni)')}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-sm">
          <Mini label={t('RK')} value={c.derived.ac} />
          <Mini label={t('Berührung')} value={c.derived.touchAc} />
          <Mini label={t('Falscher Fuß')} value={c.derived.flatFootedAc} />
          <Mini label={t('TP')} value={c.derived.maxHp} />
          <Mini label={t('Init')} value={c.derived.initiative} sign />
          <Mini label={t('Nahkampf')} value={c.derived.meleeAttack} sign />
          <Mini label={t('Fernkampf')} value={c.derived.rangedAttack} sign />
          <Mini label={t('KMV')} value={c.derived.cmd} />
          <Mini label={t('Fort')} value={c.derived.saves.Fort} sign />
          <Mini label={t('Ref')} value={c.derived.saves.Ref} sign />
          <Mini label={t('Wille')} value={c.derived.saves.Will} sign />
          <Mini label={t('Rüst.malus')} value={c.derived.armorCheckPenalty} sign />
        </div>
      </Card>

      <Companions charId={c.id} />
    </div>
  );
}

function Mini({ label, value, sign }: { label: string; value: number; sign?: boolean }) {
  return (
    <div className="rounded bg-zinc-200/60 dark:bg-zinc-800/60 p-2 text-center">
      <div className="font-bold text-gold">{sign && value >= 0 ? '+' : ''}{value}</div>
      <div className="text-[10px] uppercase text-zinc-500">{label}</div>
    </div>
  );
}
