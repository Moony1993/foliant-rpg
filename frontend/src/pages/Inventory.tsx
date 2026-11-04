import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useActive } from '../lib/useActive';
import { useMoveItem, useUseItem, useDeleteItem } from '../lib/queries';
import { ItemTile } from '../components/item';
import { Coins, Search, Weight } from 'lucide-react';
import { Card, Input, Select, PageHeader, CATEGORY_LABEL } from '../components/ui';
import { useToasts } from '../store/toast';
import type { InventoryItem, ItemCategory, ItemTemplate } from '../lib/types';
import { kilos } from '../lib/units';
import { t } from '../lib/i18n';

const CATEGORIES: (ItemCategory | 'All')[] = ['All', 'Weapon', 'Armor', 'Consumable', 'Magic', 'Quest', 'Material'];
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

function SortableItem({
  item, compareWith, onUse, onDelete,
}: { item: InventoryItem; compareWith?: ItemTemplate | null; onUse?: () => void; onDelete?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      <ItemTile item={item} compareWith={compareWith} onClick={onUse} onDelete={onDelete} />
    </div>
  );
}

// Row-virtualized grid for large inventories (no DnD). ponytail: fixed 8 cols; DnD reorder
// stays in the small "grid" mode. Combining sortable-DnD with virtualization isn't worth it here.
const VCOLS = 8;
function VirtualGrid({
  items, compareFor, onUse, onDelete,
}: { items: InventoryItem[]; compareFor: (i: InventoryItem) => ItemTemplate | null; onUse: (item: InventoryItem) => void; onDelete: (item: InventoryItem) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = Math.ceil(items.length / VCOLS);
  const virt = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 4,
  });
  return (
    <div ref={parentRef} className="max-h-[60vh] overflow-auto">
      <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
        {virt.getVirtualItems().map((vr) => {
          const rowItems = items.slice(vr.index * VCOLS, vr.index * VCOLS + VCOLS);
          return (
            <div
              key={vr.key}
              className="grid gap-2 absolute top-0 left-0 w-full pr-1"
              style={{ gridTemplateColumns: `repeat(${VCOLS}, minmax(0, 1fr))`, transform: `translateY(${vr.start}px)`, height: vr.size }}
            >
              {rowItems.map((item) => (
                <ItemTile
                  key={item.id}
                  item={item}
                  compareWith={compareFor(item)}
                  onClick={item.template.isUsable ? () => onUse(item) : undefined}
                  onDelete={() => onDelete(item)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InventoryPage() {
  const { character, activeId } = useActive();
  const move = useMoveItem(activeId ?? 0);
  const useItem = useUseItem(activeId ?? 0);
  const deleteItem = useDeleteItem(activeId ?? 0);
  const toast = useToasts((s) => s.push);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'All'>('All');
  const [sort, setSort] = useState<'grid' | 'name' | 'rarity' | 'value'>('grid');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Map slot -> currently equipped item template, for hover comparison.
  const equippedBySlot = useMemo(() => {
    const map = new Map<string, ItemTemplate>();
    for (const i of character.data?.items ?? []) if (i.equippedSlot) map.set(i.equippedSlot, i.template);
    return map;
  }, [character.data?.items]);
  const compareFor = (i: InventoryItem): ItemTemplate | null =>
    i.template.slot && !i.equippedSlot ? equippedBySlot.get(i.template.slot) ?? null : null;

  function handleUse(item: InventoryItem) {
    if (!confirm(`${item.template.name} benutzen?`)) return;
    useItem.mutate(item.id, {
      onError: (e: any) => toast({ title: t('Fehler'), message: e.response?.data?.message ?? t('Konnte Item nicht benutzen.') }),
    });
  }

  function handleDelete(item: InventoryItem) {
    const q = item.quantity > 1 ? ` (${item.quantity}×)` : '';
    if (!confirm(t('{name}{q} wirklich entfernen?', { name: item.template.name, q }))) return;
    deleteItem.mutate(item.id, {
      onError: (e: any) => toast({ title: t('Fehler'), message: e.response?.data?.message ?? t('Konnte Item nicht entfernen.') }),
    });
  }

  const items = useMemo(() => {
    let list = [...(character.data?.items ?? [])];
    if (category !== 'All') list = list.filter((i) => i.template.category === category);
    if (search) list = list.filter((i) => i.template.name.toLowerCase().includes(search.toLowerCase()));
    if (sort === 'name') list.sort((a, b) => a.template.name.localeCompare(b.template.name));
    else if (sort === 'value') list.sort((a, b) => b.template.value - a.template.value);
    else if (sort === 'rarity') list.sort((a, b) => RARITY_ORDER.indexOf(b.template.rarity) - RARITY_ORDER.indexOf(a.template.rarity));
    else list.sort((a, b) => a.gridIndex - b.gridIndex);
    return list;
  }, [character.data?.items, category, search, sort]);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || sort !== 'grid') return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    // ponytail: persist every changed index (fine for modest inventories). Batch endpoint if it grows.
    reordered.forEach((it, idx) => {
      if (it.gridIndex !== idx) move.mutate({ inventoryItemId: it.id, gridIndex: idx });
    });
  }

  if (!character.data) return <div className="p-4 text-zinc-500">{t('Kein Charakter ausgewählt.')}</div>;

  const c = character.data;
  const count = c.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title={t('Inventar')}
        subtitle={t('{count} Gegenstände · {name}', { count, name: c.name })}
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm bg-zinc-100 dark:bg-white/[0.04] ring-1 ring-inset ring-zinc-200 dark:ring-white/[0.06] tabular" title={t('Traglast')}>
              <Weight className="w-4 h-4 text-zinc-500" aria-hidden />{kilos(Math.round(c.derived.carriedWeight))}/{kilos(c.derived.carryCapacity)}
            </span>
            <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold bg-gold/10 text-gold tabular" title={t('Gold')}>
              <Coins className="w-4 h-4" aria-hidden />{c.gold}
            </span>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" aria-hidden />
          <Input placeholder={t('Gegenstand suchen…')} value={search} onChange={(e) => setSearch(e.target.value)} className="!pl-9" />
        </div>
        <div className="flex gap-2">
          <Select value={category} onChange={(e) => setCategory(e.target.value as ItemCategory | 'All')} className="sm:!w-44" aria-label={t('Kategorie')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c === 'All' ? t('Alle Kategorien') : CATEGORY_LABEL[c]}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="sm:!w-40" aria-label={t('Sortierung')}>
            <option value="grid">{t('Eigene Reihenfolge')}</option>
            <option value="name">{t('Name')}</option>
            <option value="rarity">{t('Seltenheit')}</option>
            <option value="value">{t('Wert')}</option>
          </Select>
        </div>
      </div>

      <Card>
        {items.length === 0 ? (
          <p className="text-zinc-500 text-sm py-8 text-center">{search || category !== 'All' ? t('Keine passenden Gegenstände.') : t('Dein Inventar ist leer.')}</p>
        ) : sort !== 'grid' || items.length > 120 ? (
          <VirtualGrid items={items} compareFor={compareFor} onUse={handleUse} onDelete={handleDelete} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
                {items.map((item) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    compareWith={compareFor(item)}
                    onUse={item.template.isUsable ? () => handleUse(item) : undefined}
                    onDelete={() => handleDelete(item)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </Card>
      <p className="text-xs text-zinc-500">
        {t('Mit der Maus über einen Gegenstand fahren für Details. In „Eigene Reihenfolge“ lassen sich Gegenstände per Drag & Drop umsortieren.')}
      </p>
    </div>
  );
}
