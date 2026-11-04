import { useEffect, useMemo, useRef, useState } from 'react';
import { BattleMapCanvas, type MapTool } from '../components/BattleMapCanvas';
import { Button, Card, Input, Select } from '../components/ui';
import { detectGrid } from '../lib/gridDetect';
import { useCreateMap, useCreateMapAsset, useDeleteMap, useDeleteMapAsset, useDuplicateMap, useGmCharacters, useMapAssets, useMaps, useMonsters, useMoveToken, useSaveMap, useUploadImage } from '../lib/queries';
import { useActive } from '../lib/useActive';
import { useAuth } from '../store/auth';
import { useToasts } from '../store/toast';
import type { BattleMap, MapAsset, MapToken } from '../lib/types';
import { t as tr } from '../lib/i18n'; // "t" is a common local name here (template, token, tile)

// Built-in pieces the GM can drop with one click (hidden = GM-only: traps, trapdoors, secret doors).
// The GM's own pieces (emoji or uploaded image) come from the shared library (/map-assets).
const BUILTIN: { icon: string; label: string; category: string; hidden?: boolean; size?: number }[] = [
  { icon: '📦', label: tr('Kiste'), category: 'Einrichtung' }, { icon: '🧰', label: tr('Truhe'), category: 'Einrichtung' },
  { icon: '🛢️', label: tr('Fass'), category: 'Einrichtung' }, { icon: '🗄️', label: tr('Schrank'), category: 'Einrichtung' },
  { icon: '📚', label: tr('Regal'), category: 'Einrichtung' }, { icon: '🍽️', label: tr('Tisch'), category: 'Einrichtung' },
  { icon: '🪑', label: tr('Stuhl'), category: 'Einrichtung' }, { icon: '🛏️', label: tr('Bett'), category: 'Einrichtung' },
  { icon: '🛐', label: tr('Altar'), category: 'Einrichtung' }, { icon: '🗿', label: tr('Statue'), category: 'Einrichtung' },
  { icon: '🏛️', label: tr('Säule'), category: 'Einrichtung' }, { icon: '⛲', label: tr('Brunnen'), category: 'Einrichtung' },
  { icon: '🔥', label: tr('Feuer'), category: 'Einrichtung' }, { icon: '🕯️', label: tr('Kerze'), category: 'Einrichtung' },
  { icon: '🪜', label: tr('Leiter'), category: 'Einrichtung' }, { icon: '💰', label: tr('Schatz'), category: 'Einrichtung' },
  { icon: '🔘', label: tr('Schalter'), category: 'Mechanik' }, { icon: '🎚️', label: tr('Hebel'), category: 'Mechanik' },
  { icon: '⛓️', label: tr('Gitter'), category: 'Mechanik' }, { icon: '🗝️', label: tr('Schlüsselloch'), category: 'Mechanik' },
  { icon: '⚠️', label: tr('Falle'), category: 'Verdeckt', hidden: true }, { icon: '🕳️', label: tr('Falltür'), category: 'Verdeckt', hidden: true },
  { icon: '🚪', label: tr('Geheimtür'), category: 'Verdeckt', hidden: true }, { icon: '☠️', label: tr('Hinterhalt'), category: 'Verdeckt', hidden: true },
  { icon: '🌳', label: tr('Baum'), category: 'Natur' }, { icon: '🪨', label: tr('Fels'), category: 'Natur' },
  { icon: '🌿', label: tr('Gebüsch'), category: 'Natur' }, { icon: '🦴', label: tr('Knochen'), category: 'Natur' },
];
const CATEGORIES = ['Einrichtung', 'Mechanik', 'Verdeckt', 'Natur'];
// Group keys stay German (stored on assets); these are the labels shown.
const GROUP_LABEL: Record<string, string> = {
  Alle: tr('Alle'), Charaktere: tr('Charaktere'), Monster: tr('Monster'), Einrichtung: tr('Einrichtung'),
  Mechanik: tr('Mechanik'), Verdeckt: tr('Verdeckt'), Natur: tr('Natur'), Eigene: tr('Eigene'),
};

const TOOLS: { id: MapTool; label: string; hint: string }[] = [
  { id: 'select', label: tr('✋ Bewegen'), hint: tr('Karte verschieben, Token ziehen oder antippen und Zielfeld antippen; Türen antippen = auf/zu') },
  { id: 'wall', label: tr('🧱 Wand'), hint: tr('Punkt für Punkt antippen (rastet am Raster ein); Rechtsklick, Esc oder denselben Punkt erneut = fertig, nächster Klick startet neue Wand') },
  { id: 'door', label: tr('🚪 Tür'), hint: tr('Anfang und Ende der Tür antippen') },
  { id: 'place', label: tr('➕ Setzen'), hint: tr('Unten wählen, was gesetzt wird, dann ins Feld tippen') },
  { id: 'reveal', label: tr('👁 Aufdecken'), hint: tr('Felder antippen oder überstreichen: für Spieler immer sichtbar (erneut = verdecken)') },
  { id: 'erase', label: tr('🧽 Löschen'), hint: tr('Wand, Tür oder Token antippen') },
];

/**
 * Battle map page. GM: upload maps, draw walls/doors on the grid, drop monsters, characters and furnishings,
 * reveal cells, choose which map the players see (changes save automatically and sync live).
 * Players: the active map with fog of war; they move their own characters by dragging or tap-and-tap.
 */
export function MapPage() {
  const isGm = useAuth((s) => s.isGm());
  const maps = useMaps();
  const { list } = useActive();
  const myCharIds = useMemo(() => new Set((list.data ?? []).map((c) => c.id)), [list.data]);
  const move = useMoveToken();
  const toast = useToasts((s) => s.push);

  if (maps.isLoading) return <div className="p-4 text-zinc-500">{tr('Lädt…')}</div>;
  if (isGm) return <GmMaps maps={maps.data ?? []} />;

  const map = maps.data?.[0];
  if (!map) return <div className="p-4"><Card><p className="text-zinc-500">{tr('Der GM zeigt gerade keine Karte.')}</p></Card></div>;
  return (
    <div className="p-2 sm:p-4 space-y-2">
      <h1 className="text-lg font-semibold px-1">{map.name}</h1>
      <div className="rounded-lg overflow-hidden" style={{ height: 'calc(100dvh - 190px)', minHeight: 320 }}>
        <BattleMapCanvas map={map} gm={false} fog={map.fog}
          canMove={(t) => t.kind === 'character' && t.refId != null && myCharIds.has(t.refId)}
          sees={(t) => t.kind === 'character' && t.refId != null && myCharIds.has(t.refId)}
          onMove={(t, x, y) => move.mutate({ mapId: map.id, tokenId: t.id, x, y },
            { onError: () => toast({ title: tr('Nicht möglich'), message: tr('Diesen Token darfst du nicht bewegen.') }) })} />
      </div>
      <p className="text-xs text-zinc-500 px-1">{tr('Deinen Charakter ziehen oder antippen und dann das Zielfeld antippen. Zwei Finger oder Mausrad = Zoom.')}</p>
    </div>
  );
}

type Placing = Omit<MapToken, 'id' | 'x' | 'y'>;

function GmMaps({ maps }: { maps: BattleMap[] }) {
  const save = useSaveMap();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const server = maps.find((m) => m.id === selectedId) ?? maps.find((m) => m.isActive) ?? maps[0] ?? null;
  const [draft, setDraft] = useState<BattleMap | null>(server);
  const [tool, setTool] = useState<MapTool>('select');
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [preview, setPreview] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [panel, setPanel] = useState<'objects' | 'maps'>('objects');
  const [drawer, setDrawer] = useState(false);          // phone: library overlay
  const [picked, setPicked] = useState<string | null>(null);   // selected token on the map
  const lastServer = useRef<BattleMap | null>(null);
  const dirty = useRef(false);
  const version = useRef(0);   // bumps on every local edit; a save only clears `dirty` if nothing changed meanwhile

  // Take server changes (player moves) without losing local edits: a token the GM hasn't moved since the
  // last server version follows the server; everything else stays as edited.
  useEffect(() => {
    if (!server) { setDraft(null); return; }
    setDraft((d) => {
      const prev = lastServer.current;
      if (!d || d.id !== server.id || !dirty.current) return server;
      return {
        ...d,
        tokens: d.tokens.map((t) => {
          const before = prev?.tokens.find((x) => x.id === t.id), now = server.tokens.find((x) => x.id === t.id);
          return before && now && before.x === t.x && before.y === t.y ? { ...t, x: now.x, y: now.y } : t;
        }),
      };
    });
    lastServer.current = server;
  }, [server]);

  // Autosave GM edits (debounced) → pushed live to the players.
  useEffect(() => {
    if (!draft || !dirty.current) return;
    const id = setTimeout(() => {
      const v = version.current;
      save.mutate(draft, { onSuccess: () => { if (version.current === v) dirty.current = false; } });
    }, 500);
    return () => clearTimeout(id);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (m: BattleMap) => { dirty.current = true; version.current++; setDraft(m); };
  const token = draft?.tokens.find((t) => t.id === picked) ?? null;
  const editToken = (patch: Partial<MapToken> | null) => {
    if (!draft || !token) return;
    change({ ...draft, tokens: patch ? draft.tokens.map((t) => (t.id === token.id ? { ...t, ...patch } : t)) : draft.tokens.filter((t) => t.id !== token.id) });
    if (!patch) setPicked(null);
  };
  // Delete / Backspace removes the selected token (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && picked && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) editToken(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choose = (p: Placing) => { setPlacing(p); setTool('place'); setDrawer(false); };
  const hint = TOOLS.find((t) => t.id === tool)?.hint;
  const library = (
    <Library panel={panel} setPanel={setPanel} maps={maps} currentId={draft?.id ?? null} placing={placing}
      onPick={choose} onOpenMap={(id) => { setSelectedId(id); setPicked(null); setDrawer(false); }}
      onMapGone={(id) => { if (id === draft?.id) { setSelectedId(null); setPicked(null); } }} />
  );
  const actions = token && (
    <TokenActions t={token} onRemove={() => editToken(null)} onToggleHidden={() => editToken({ hidden: !token.hidden })}
      onSize={(size) => editToken({ size })} onClose={() => setPicked(null)} />
  );

  return (
    <div className="p-2 sm:p-4 space-y-2">
      {/* Top bar: tools and map settings. */}
      <Card className="!py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {TOOLS.map((t) => (
            <Button key={t.id} variant={tool === t.id ? undefined : 'ghost'} className="!h-9 !px-3 text-sm" onClick={() => setTool(t.id)}>{t.label}</Button>
          ))}
          <Button variant="ghost" className="!h-9 !px-3 text-sm lg:hidden" onClick={() => setDrawer(true)}>{tr('📚 Bibliothek')}</Button>
        </div>
        {draft && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{draft.name}</span>
            <Button variant={draft.isActive ? undefined : 'ghost'} className="!h-8 text-xs" onClick={() => change({ ...draft, isActive: !draft.isActive })}>
              {draft.isActive ? tr('● Für Spieler sichtbar') : tr('Spielern zeigen')}
            </Button>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={draft.fog} onChange={(e) => change({ ...draft, fog: e.target.checked })} /> {tr('Sichtlinien')}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> {tr('Spielersicht')}</label>
            <button className="text-xs text-gold hover:underline" onClick={() => setShowGrid((v) => !v)}>{tr('Raster & Karte…')}</button>
            <span className="text-xs text-zinc-500">{hint}{save.isPending ? tr(' · speichert…') : ''}{tool === 'place' && placing ? ` · setzt: ${placing.label}` : ''}</span>
          </div>
        )}
        {draft && showGrid && <MapSettings draft={draft} change={change} onGone={() => setSelectedId(null)} onCopied={(id) => setSelectedId(id)} />}
      </Card>

      <div className="flex gap-3 items-stretch">
        <div className="relative flex-1 min-w-0 rounded-lg overflow-hidden" style={{ height: 'calc(100dvh - 200px)', minHeight: 360 }}>
          {draft ? (
            <BattleMapCanvas key={draft.id} map={draft} gm tool={tool} placing={placing} fog={draft.fog && preview}
              canMove={() => true} onChange={change} onSelect={setPicked}
              onMove={(t, x, y) => change({ ...draft, tokens: draft.tokens.map((k) => (k.id === t.id ? { ...k, x, y } : k)) })} />
          ) : (
            <div className="h-full grid place-items-center text-sm text-zinc-400 p-6 text-center">{tr('Lade rechts unter „Karten“ ein Kartenbild hoch (z. B. aus Dungeondraft, Watabou oder einem Abenteuer).')}</div>
          )}
          {/* Phone: actions for the selected token as a bar over the map. */}
          {actions && <div className="lg:hidden absolute left-2 right-2 bottom-2">{actions}</div>}
          {/* Phone: library as an overlay. */}
          {drawer && (
            <div className="lg:hidden absolute inset-0 bg-black/50 flex justify-end" onClick={() => setDrawer(false)}>
              <div className="w-[88%] max-w-sm h-full overflow-y-auto rpg-panel p-3" onClick={(e) => e.stopPropagation()}>{library}</div>
            </div>
          )}
        </div>
        {/* Desktop: sidebar with the selected token's actions and the library. */}
        <aside className="hidden lg:flex flex-col gap-3 w-80 flex-shrink-0" style={{ height: 'calc(100dvh - 200px)', minHeight: 360 }}>
          {actions}
          <div className="rpg-panel p-3 flex-1 min-h-0 overflow-y-auto">{library}</div>
        </aside>
      </div>
    </div>
  );
}

/** Grid size/offset, name, duplicate and delete for the current map. */
function MapSettings({ draft, change, onGone, onCopied }: { draft: BattleMap; change: (m: BattleMap) => void; onGone: () => void; onCopied: (id: number) => void }) {
  const del = useDeleteMap();
  const duplicate = useDuplicateMap();
  const toast = useToasts((s) => s.push);
  const [detecting, setDetecting] = useState(false);
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <label className="w-40">{tr('Name')}<Input value={draft.name} onChange={(e) => change({ ...draft, name: e.target.value })} /></label>
      <label className="w-24">{tr('Feld (px)')}<Input type="number" min={8} value={draft.gridSize} onChange={(e) => change({ ...draft, gridSize: Math.max(8, +e.target.value) })} /></label>
      <label className="w-24">{tr('Versatz X')}<Input type="number" value={draft.gridOffsetX} onChange={(e) => change({ ...draft, gridOffsetX: +e.target.value })} /></label>
      <label className="w-24">{tr('Versatz Y')}<Input type="number" value={draft.gridOffsetY} onChange={(e) => change({ ...draft, gridOffsetY: +e.target.value })} /></label>
      <label className="flex items-center gap-1.5 h-9"><input type="checkbox" checked={draft.showGrid} onChange={(e) => change({ ...draft, showGrid: e.target.checked })} /> {tr('Eigenes Raster zeichnen')}</label>
      <Button variant="ghost" className="!h-9 text-sm" disabled={detecting} onClick={async () => {
        setDetecting(true);
        const { grid } = await detectGrid(draft.imageUrl).finally(() => setDetecting(false));
        if (!grid) { toast({ title: tr('Kein Raster erkannt'), message: tr('Feldgröße und Versatz bitte von Hand einstellen.') }); return; }
        change({ ...draft, gridSize: grid.size, gridOffsetX: grid.offsetX, gridOffsetY: grid.offsetY, showGrid: false });
        toast({ title: tr('Raster erkannt'), message: tr('{v} px pro Feld übernommen.', { v: Math.round(grid.size) }) });
      }}>{detecting ? tr('Suche…') : tr('Raster erkennen')}</Button>
      <Button variant="ghost" className="!h-9 text-sm" disabled={duplicate.isPending}
        onClick={async () => { const m = await duplicate.mutateAsync(draft.id); onCopied(m.id); toast({ title: tr('Karte dupliziert'), message: m.name }); }}>{tr('Duplizieren')}</Button>
      <Button variant="danger" className="!h-9 text-sm" onClick={() => { if (window.confirm(tr('Karte „{name}“ löschen?', { name: draft.name }))) { del.mutate(draft.id); onGone(); } }}>{tr('Karte löschen')}</Button>
    </div>
  );
}

/** Actions for the token tapped on the map: remove, GM-only on/off, size. */
function TokenActions({ t, onRemove, onToggleHidden, onSize, onClose }: {
  t: MapToken; onRemove: () => void; onToggleHidden: () => void; onSize: (n: number) => void; onClose: () => void;
}) {
  return (
    <div className="rpg-panel leaf px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold flex items-center gap-1.5 min-w-0">
        {t.imageUrl ? <img src={t.imageUrl} alt="" className="w-6 h-6 object-contain" /> : <span className="text-lg">{t.icon}</span>}
        <span className="truncate">{t.label}</span>
      </span>
      <Button variant="danger" className="!h-8 !px-3 text-xs" onClick={onRemove}>{tr('🗑 Entfernen')}</Button>
      <Button variant="ghost" className="!h-8 !px-3 text-xs" onClick={onToggleHidden}>{t.hidden ? tr('👁 Für Spieler zeigen') : tr('🙈 Verdecken')}</Button>
      <Select value={t.size || 1} onChange={(e) => onSize(+e.target.value)} className="!h-8 !w-20 text-xs" aria-label={tr('Größe')}>
        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}×{n}</option>)}
      </Select>
      <button className="ml-auto text-xs text-zinc-500" onClick={onClose} aria-label={tr('Auswahl aufheben')}>✕</button>
    </div>
  );
}

/** Sidebar library: "Objekte" (characters, monsters, built-in and own pieces as tiles) and "Karten" (map thumbnails). */
function Library({ panel, setPanel, maps, currentId, placing, onPick, onOpenMap, onMapGone }: {
  panel: 'objects' | 'maps'; setPanel: (p: 'objects' | 'maps') => void; maps: BattleMap[]; currentId: number | null;
  placing: Placing | null; onPick: (p: Placing) => void; onOpenMap: (id: number) => void; onMapGone: (id: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <Button variant={panel === 'objects' ? undefined : 'ghost'} className="flex-1 !h-9 text-sm" onClick={() => setPanel('objects')}>{tr('Objekte')}</Button>
        <Button variant={panel === 'maps' ? undefined : 'ghost'} className="flex-1 !h-9 text-sm" onClick={() => setPanel('maps')}>{tr('Karten')}</Button>
      </div>
      {panel === 'objects' ? <ObjectLibrary placing={placing} onPick={onPick} /> : <MapLibrary maps={maps} currentId={currentId} onOpen={onOpenMap} onGone={onMapGone} />}
    </div>
  );
}

const HIDDEN_KEY = 'pf-map-hidden-builtins';

/** Small round ✕ in a tile's corner. */
function RemoveTile({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button title={title} aria-label={title} onClick={onClick}
      className="absolute top-1 right-1 w-5 h-5 rounded-full grid place-items-center text-[11px] leading-none bg-[#f4e8cc] ring-1 ring-[#a87a1f] text-[#7a2a1a] hover:bg-red-700 hover:text-white shadow">✕</button>
  );
}

type Tile = { key: string; group: string; label: string; icon: string; imageUrl?: string | null; hidden?: boolean; placing: Placing; asset?: MapAsset };

function ObjectLibrary({ placing, onPick }: { placing: Placing | null; onPick: (p: Placing) => void }) {
  const monsters = useMonsters().data ?? [];
  const characters = (useGmCharacters().data ?? []).map((r) => r.character);
  const assets = useMapAssets().data ?? [];
  const delAsset = useDeleteMapAsset();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('Alle');
  const [adding, setAdding] = useState(false);
  // ponytail: removed built-ins are remembered per browser; move to the server if GMs switch devices a lot.
  const [hiddenBuiltins, setHiddenBuiltins] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]'); } catch { return []; } });
  const saveHidden = (v: string[]) => { setHiddenBuiltins(v); try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };
  const hideBuiltin = (key: string) => saveHidden([...hiddenBuiltins, key]);
  const sizeOf = (s: string) => ({ Large: 2, Huge: 3, Gargantuan: 4, Colossal: 4 } as Record<string, number>)[s] ?? 1;
  const tiles: Tile[] = [
    ...characters.map((c) => ({ key: `c${c.id}`, group: 'Charaktere', label: c.name, icon: c.name.slice(0, 1).toUpperCase(),
      placing: { kind: 'character' as const, refId: c.id, label: c.name, icon: c.name.slice(0, 1).toUpperCase(), size: 1 } })),
    ...monsters.map((m) => ({ key: `m${m.id}`, group: 'Monster', label: m.name, icon: '👹',
      placing: { kind: 'monster' as const, refId: m.id, label: m.name, icon: m.name.slice(0, 1).toUpperCase(), size: sizeOf(m.size) } })),
    { key: 'm-free', group: 'Monster', label: tr('Monster (frei)'), icon: '👹', placing: { kind: 'monster', refId: null, label: tr('Monster'), icon: 'M', size: 1 } },
    ...BUILTIN.map((f) => ({ key: `b${f.label}`, group: f.category, label: f.label, icon: f.icon, hidden: f.hidden,
      placing: { kind: 'object' as const, refId: null, label: f.label, icon: f.icon, size: f.size ?? 1, hidden: f.hidden } })),
    ...assets.map((a) => ({ key: `a${a.id}`, group: CATEGORIES.includes(a.category) ? a.category : 'Eigene', label: a.name, icon: a.icon, imageUrl: a.imageUrl,
      hidden: a.hidden, asset: a, placing: { kind: 'object' as const, refId: null, label: a.name, icon: a.icon, imageUrl: a.imageUrl, size: a.size, hidden: a.hidden } })),
  ];
  // Group values stay German keys (stored on assets, compared below); only the buttons are translated.
  const groups = ['Alle', 'Charaktere', 'Monster', ...CATEGORIES, ...(assets.some((a) => !CATEGORIES.includes(a.category)) ? ['Eigene'] : [])];
  const shown = tiles.filter((t) => !hiddenBuiltins.includes(t.key) && (group === 'Alle' || t.group === group) && (!q || t.label.toLowerCase().includes(q.toLowerCase())));
  const isPicked = (t: Tile) => !!placing && placing.kind === t.placing.kind && placing.label === t.placing.label && (placing.refId ?? null) === (t.placing.refId ?? null);
  return (
    <div className="space-y-2">
      <Input placeholder={tr('Suchen…')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-1">
        {groups.map((g) => (
          <button key={g} onClick={() => setGroup(g)}
            className={`text-xs px-2 py-1 rounded-full border ${group === g ? 'bg-gold/20 border-gold text-gold font-semibold' : 'border-zinc-300 dark:border-white/10'}`}>{GROUP_LABEL[g] ?? g}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {shown.map((t) => (
          <div key={t.key} className="relative">
            <button onClick={() => onPick(t.placing)} title={t.label}
              className={`w-full aspect-square rounded-lg border flex flex-col items-center justify-center gap-1 p-1 ${isPicked(t) ? 'border-gold bg-gold/15' : 'border-zinc-300 dark:border-white/10 hover:border-gold/60'}`}>
              {t.imageUrl ? <img src={t.imageUrl} alt="" className="w-9 h-9 object-contain" />
                : <span className={`text-2xl leading-none ${t.placing.kind === 'character' ? 'w-9 h-9 rounded-full grid place-items-center bg-[#f4e8cc] ring-2 ring-[#a87a1f] text-base font-bold text-[#3a2408]' : ''}`}>{t.icon}</span>}
              <span className="text-[10.5px] leading-tight text-center line-clamp-2">{t.label}</span>
              {t.hidden && <span className="absolute top-1 left-1 text-[10px]" title={tr('nur für GM sichtbar')}>🙈</span>}
            </button>
            {t.asset && <RemoveTile title={tr('Aus der Bibliothek löschen')}
              onClick={() => { if (window.confirm(tr('„{label}“ aus der Bibliothek löschen? (Auf Karten gesetzte bleiben.)', { label: t.label }))) delAsset.mutate(t.asset!.id); }} />}
            {t.key.startsWith('b') && <RemoveTile title={tr('Aus der Liste entfernen')} onClick={() => hideBuiltin(t.key)} />}
          </div>
        ))}
      </div>
      {shown.length === 0 && <p className="text-xs text-zinc-500">{tr('Nichts gefunden.')}</p>}
      {hiddenBuiltins.length > 0 && <button className="block text-xs text-gold hover:underline" onClick={() => saveHidden([])}>{tr('{length} entfernte Standard-Objekte zurückholen', { length: hiddenBuiltins.length })}</button>}
      <button className="text-xs text-gold hover:underline" onClick={() => setAdding((v) => !v)}>{adding ? tr('Abbrechen') : tr('+ Eigenes Objekt in die Bibliothek')}</button>
      {adding && <NewAssetForm onDone={() => setAdding(false)} />}
    </div>
  );
}

/** Map library: thumbnails with search; upload a new map image. */
function MapLibrary({ maps, currentId, onOpen, onGone }: { maps: BattleMap[]; currentId: number | null; onOpen: (id: number) => void; onGone: (id: number) => void }) {
  const create = useCreateMap();
  const del = useDeleteMap();
  const toast = useToasts((s) => s.push);
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const shown = maps.filter((m) => (!q || m.name.toLowerCase().includes(q.toLowerCase())) && (!onlyActive || m.isActive));
  async function upload(file: File) {
    try {
      const { map, gridFound } = await create.mutateAsync(file);
      onOpen(map.id);
      toast({ title: tr('Karte angelegt'), message: gridFound ? tr('Raster im Bild erkannt ({v} px) und übernommen — jetzt Wände zeichnen.', { v: Math.round(map.gridSize) }) : tr('Kein Raster im Bild — eigenes Raster eingeblendet. Größe unter „Raster & Karte…“ anpassen.') });
    }
    catch { toast({ title: tr('Hochladen fehlgeschlagen'), message: tr('Bilddatei bis 20 MB (PNG, JPG, WebP).') }); }
  }
  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      <Button className="w-full !h-9 text-sm" disabled={create.isPending} onClick={() => fileRef.current?.click()}>{create.isPending ? tr('Lädt hoch…') : tr('+ Karte hochladen')}</Button>
      <Input placeholder={tr('Karten suchen…')} value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> {tr('nur die für Spieler sichtbare')}</label>
      <div className="grid grid-cols-2 gap-2">
        {shown.map((m) => (
          <div key={m.id} className="relative">
            <button onClick={() => onOpen(m.id)}
              className={`w-full text-left rounded-lg border overflow-hidden ${m.id === currentId ? 'border-gold ring-2 ring-gold/40' : 'border-zinc-300 dark:border-white/10 hover:border-gold/60'}`}>
              <img src={m.imageUrl} alt="" className="w-full aspect-[4/3] object-cover bg-zinc-800" />
              <span className="block px-1.5 py-1 text-xs truncate">{m.isActive ? '● ' : ''}{m.name}</span>
            </button>
            <RemoveTile title={tr('Karte löschen')} onClick={() => { if (window.confirm(tr('Karte „{name}“ mit Wänden und Figuren löschen?', { name: m.name }))) { del.mutate(m.id); onGone(m.id); } }} />
          </div>
        ))}
      </div>
      {shown.length === 0 && <p className="text-xs text-zinc-500">{maps.length === 0 ? tr('Noch keine Karten.') : tr('Nichts gefunden.')}</p>}
    </div>
  );
}

function NewAssetForm({ onDone }: { onDone: () => void }) {
  const create = useCreateMapAsset();
  const upload = useUploadImage();
  const toast = useToasts((s) => s.push);
  const [f, setF] = useState({ name: '', category: 'Einrichtung', icon: '', imageUrl: '' as string | null, size: 1, hidden: false });
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm rounded-lg ring-1 ring-inset ring-zinc-300 dark:ring-white/10 p-2">
      <label className="w-32">{tr('Name')}<Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tr('z. B. Hebel')} /></label>
      <label className="w-32">{tr('Kategorie')}
        <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, hidden: e.target.value === 'Verdeckt' || f.hidden })}>
          {[...CATEGORIES, 'Eigene'].map((c) => <option key={c} value={c}>{GROUP_LABEL[c] ?? c}</option>)}
        </Select>
      </label>
      <label className="w-20">{tr('Emoji')}<Input value={f.icon} maxLength={8} onChange={(e) => setF({ ...f, icon: e.target.value })} placeholder="🎚️" /></label>
      <label className="text-xs">{tr('oder Bild')}
        <input type="file" accept="image/*" className="block text-xs" onChange={async (e) => {
          const file = e.target.files?.[0]; if (!file) return;
          try { setF({ ...f, imageUrl: await upload.mutateAsync(file) }); } catch { toast({ title: tr('Upload fehlgeschlagen'), message: tr('Bild bis 5 MB.') }); }
        }} />
      </label>
      {f.imageUrl && <img src={f.imageUrl} alt="" className="w-9 h-9 object-contain" />}
      <label className="w-20">{tr('Felder')}<Select value={f.size} onChange={(e) => setF({ ...f, size: +e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}×{n}</option>)}</Select></label>
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} /> {tr('nur für GM sichtbar')}</label>
      <Button className="!h-9 text-sm" disabled={!f.name.trim() || (!f.icon.trim() && !f.imageUrl) || create.isPending || upload.isPending}
        onClick={async () => {
          await create.mutateAsync({ name: f.name.trim(), category: f.category, icon: f.icon.trim(), imageUrl: f.imageUrl || null, size: f.size, hidden: f.hidden });
          toast({ title: tr('In der Bibliothek'), message: tr('{name} steht jetzt auf allen Karten zur Verfügung.', { name: f.name }) });
          onDone();
        }}>{tr('Speichern')}</Button>
    </div>
  );
}
