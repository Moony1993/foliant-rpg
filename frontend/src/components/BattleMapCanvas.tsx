import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { breakIntersections, compute, inPolygon, type Vector2D } from 'visibility-polygon';
import type { BattleMap, MapToken, MapWall } from '../lib/types';

export type MapTool = 'select' | 'wall' | 'door' | 'erase' | 'place' | 'reveal';

/** Pixel position of a grid intersection / cell centre (map coordinates = image pixels). */
const px = (m: BattleMap, gx: number, gy: number): Vector2D => [m.gridOffsetX + gx * m.gridSize, m.gridOffsetY + gy * m.gridSize];
const cellCenter = (m: BattleMap, t: { x: number; y: number; size?: number }): Vector2D =>
  px(m, t.x + (t.size ?? 1) / 2, t.y + (t.size ?? 1) / 2);

const isCharacter = (t: MapToken) => t.kind === 'character';

/** Visibility polygons of the viewing tokens (walls and closed doors block sight). */
export function visibility(m: BattleMap, sees: (t: MapToken) => boolean = isCharacter): Vector2D[][] {
  const w = m.imageWidth || 2000, h = m.imageHeight || 2000;
  const segs: Vector2D[][] = m.walls.filter((x) => !(x.door && x.open)).map((x) => [px(m, x.x1, x.y1), px(m, x.x2, x.y2)]);
  segs.push([[0, 0], [w, 0]], [[w, 0], [w, h]], [[w, h], [0, h]], [[0, h], [0, 0]]);
  const broken = breakIntersections(segs);
  return m.tokens.filter(sees).map((t) => {
    const [x, y] = cellCenter(m, t);
    // A token exactly on a wall vertex breaks the algorithm; nudge it a hair.
    return compute([Math.min(w - 1, Math.max(1, x + 0.01)), Math.min(h - 1, Math.max(1, y + 0.013))], broken);
  });
}

/** Token images by URL (loaded once, shared by all tokens using them). */
function useImages(urls: string[]) {
  const [imgs, setImgs] = useState<Record<string, HTMLImageElement>>({});
  const key = [...new Set(urls)].sort().join('|');
  useEffect(() => {
    for (const u of key ? key.split('|') : []) {
      if (imgs[u]) continue;
      const i = new window.Image();
      i.onload = () => setImgs((m) => ({ ...m, [u]: i }));
      i.src = u;
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return imgs;
}

function useImage(url: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return;
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = url;
  }, [url]);
  return img;
}

/**
 * Battle map on a Konva stage. Mouse and touch: drag to pan (or drag a token), wheel / two-finger pinch to zoom,
 * tap a token then tap a cell to move it. GM tools edit walls, doors, tokens and revealed cells (everything snaps
 * to the grid); `fog` shows what the party's characters can see (players always, the GM as a preview).
 */
export function BattleMapCanvas({ map, tool = 'select', placing, canMove, fog, sees = isCharacter, gm, onChange, onMove, onSelect }: {
  map: BattleMap;
  tool?: MapTool;
  /** Token template to drop with the "place" tool. */
  placing?: Omit<MapToken, 'id' | 'x' | 'y'> | null;
  /** May this viewer move the token? */
  canMove: (t: MapToken) => boolean;
  /** Draw the fog of war (players: always; GM: player preview). */
  fog: boolean;
  /** Whose sight lifts the fog: a player only their own characters; the GM preview the whole party. */
  sees?: (t: MapToken) => boolean;
  gm: boolean;
  /** GM edits (walls, tokens, reveals). */
  onChange?: (m: BattleMap) => void;
  /** A token was moved to a cell. */
  onMove: (t: MapToken, x: number, y: number) => void;
  /** The tapped (selected) token changed — the GM gets an action bar for it. */
  onSelect?: (id: string | null) => void;
}) {
  const img = useImage(map.imageUrl);
  const tokenImgs = useImages(map.tokens.map((t) => t.imageUrl).filter((u): u is string => !!u));
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 0, x: 0, y: 0 });
  const [chain, setChain] = useState<Vector2D | null>(null);      // last wall point (grid units)
  const [hover, setHover] = useState<Vector2D | null>(null);      // pointer (grid intersection) for the wall preview
  const [selected, setSelectedState] = useState<string | null>(null);  // tapped token waiting for a target cell
  const setSelected = (id: string | null) => { setSelectedState(id); onSelect?.(id); };
  const painting = useRef<null | boolean>(null);                  // reveal brush: adding (true) or removing (false)
  const pinch = useRef<{ dist: number; center: Vector2D } | null>(null);
  // Held mouse wheel pans the map in every tool; the button never reaches Konva (no click, no wall, no erase).
  const midPan = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = midPan.current; if (!s) return;
      if (!(e.buttons & 4)) { midPan.current = null; return; } // wheel released somewhere we got no pointerup
      setView((v) => ({ ...v, x: v.x + e.clientX - s.x, y: v.y + e.clientY - s.y }));
      midPan.current = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => { if (e.button === 1) midPan.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);
  const stopMiddle = (e: React.PointerEvent | React.MouseEvent) => {
    // Right button too: it only ends a wall (contextmenu, still delivered) and must not click/erase anything.
    if (e.button === 2) { e.stopPropagation(); return; }
    if (e.button !== 1) return;
    e.preventDefault(); e.stopPropagation(); // also no browser auto-scroll
    // pointerdown, not mousedown: preventDefault on pointerdown suppresses the mouse events that would follow.
    if (e.type === 'pointerdown') midPan.current = { x: e.clientX, y: e.clientY };
    if (e.type === 'pointerup') midPan.current = null; // stopped here, so the window listener never sees it
  };
  const W = map.imageWidth || img?.width || 2000, H = map.imageHeight || img?.height || 2000;
  const cols = Math.ceil((W - map.gridOffsetX) / map.gridSize), rows = Math.ceil((H - map.gridOffsetY) / map.gridSize);

  // Fit the map to the available width once we know both sizes.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // Fit once the container is measured and the image size is known (until then W/H are placeholders).
    if (view.scale === 0 && size.w > 0 && size.h > 0 && W > 0 && (map.imageWidth > 0 || img)) {
      const s = Math.min(size.w / W, size.h / H);
      setView({ scale: s, x: (size.w - W * s) / 2, y: (size.h - H * s) / 2 });
    }
  }, [size, W, H, view.scale, map.imageWidth, img]);
  useEffect(() => { setChain(null); setSelected(null); }, [tool, map.id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setChain(null); setSelected(null); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  // sees is a fresh closure each render; key it by the viewing tokens instead.
  const viewerKey = map.tokens.filter(sees).map((t) => t.id).join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const polys = useMemo(() => (fog ? visibility(map, sees) : []), [fog, map, viewerKey]);
  const revealed = useMemo(() => new Set(map.revealed), [map.revealed]);
  const seen = (t: MapToken) => {
    const c = cellCenter(map, t);
    return revealed.has(`${t.x},${t.y}`) || polys.some((p) => inPolygon(c, p));
  };

  // Pointer in map coordinates → nearest grid intersection / cell.
  const pointer = (): Vector2D | null => {
    const p = stage.current?.getRelativePointerPosition();
    return p ? [p.x, p.y] : null;
  };
  const toIntersection = ([x, y]: Vector2D): Vector2D =>
    [Math.round((x - map.gridOffsetX) / map.gridSize), Math.round((y - map.gridOffsetY) / map.gridSize)];
  const toCell = ([x, y]: Vector2D): Vector2D =>
    [Math.floor((x - map.gridOffsetX) / map.gridSize), Math.floor((y - map.gridOffsetY) / map.gridSize)];
  const inside = ([cx, cy]: Vector2D) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;

  const edit = (patch: Partial<BattleMap>) => onChange?.({ ...map, ...patch });
  const addWall = (a: Vector2D, b: Vector2D, door: boolean) => {
    if (a[0] === b[0] && a[1] === b[1]) return;
    edit({ walls: [...map.walls, { x1: a[0], y1: a[1], x2: b[0], y2: b[1], door, open: false }] });
  };
  const paint = (cell: Vector2D) => {
    if (!inside(cell) || painting.current === null) return;
    const key = `${cell[0]},${cell[1]}`;
    if (revealed.has(key) === painting.current) return;
    edit({ revealed: painting.current ? [...map.revealed, key] : map.revealed.filter((k) => k !== key) });
  };

  function onTap(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const p = pointer();
    if (!p || pinch.current || ('button' in e.evt && e.evt.button === 2)) return;
    if (tool === 'wall' || tool === 'door') {
      const q = toIntersection(p);
      if (!chain) { setChain(q); return; }
      addWall(chain, q, tool === 'door');
      // Walls continue as a chain (tap the same point or press Esc to stop); doors are single segments.
      setChain(tool === 'wall' && (q[0] !== chain[0] || q[1] !== chain[1]) ? q : null);
      return;
    }
    if (tool === 'place' && placing) {
      const [x, y] = toCell(p);
      if (!inside([x, y])) return;
      edit({ tokens: [...map.tokens, { ...placing, id: crypto.randomUUID?.() ?? String(Date.now()), x, y }] });
      return;
    }
    // Select: tap a cell to move the selected token there.
    if (tool === 'select' && selected && e.target === e.target.getStage() || (tool === 'select' && selected && e.target.getClassName?.() === 'Image')) {
      const t = map.tokens.find((x) => x.id === selected);
      const [x, y] = toCell(p);
      if (t && inside([x, y])) onMove(t, x, y);
      setSelected(null);
    }
  }

  function zoomAt(center: Vector2D, factor: number) {
    setView((v) => {
      const scale = Math.min(6, Math.max(0.05, v.scale * factor));
      const mx = (center[0] - v.x) / v.scale, my = (center[1] - v.y) / v.scale;
      return { scale, x: center[0] - mx * scale, y: center[1] - my * scale };
    });
  }

  function onTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    const rect = stage.current!.container().getBoundingClientRect();
    const a: Vector2D = [t[0].clientX - rect.left, t[0].clientY - rect.top], b: Vector2D = [t[1].clientX - rect.left, t[1].clientY - rect.top];
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const center: Vector2D = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    stage.current!.stopDrag();
    if (pinch.current) {
      zoomAt(center, dist / pinch.current.dist);
      setView((v) => ({ ...v, x: v.x + center[0] - pinch.current!.center[0], y: v.y + center[1] - pinch.current!.center[1] }));
    }
    pinch.current = { dist, center };
  }

  const panning = tool === 'select' || !gm;
  const wallColor = (w: MapWall) => (w.door ? (w.open ? '#d9b26b' : '#8b5a2b') : '#e04848');

  return (
    <div ref={wrap} className="w-full h-full touch-none select-none" style={{ background: '#1a120b' }}
      onMouseDownCapture={stopMiddle} onPointerDownCapture={stopMiddle} onMouseUpCapture={stopMiddle} onPointerUpCapture={stopMiddle} onAuxClickCapture={stopMiddle}>
      {view.scale > 0 && (
        <Stage ref={stage} width={size.w} height={size.h} scaleX={view.scale} scaleY={view.scale} x={view.x} y={view.y}
          draggable={panning}
          onDragEnd={(e) => { if (e.target === stage.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() })); }}
          onWheel={(e) => { e.evt.preventDefault(); const p = stage.current!.getPointerPosition(); if (p) zoomAt([p.x, p.y], e.evt.deltaY < 0 ? 1.12 : 1 / 1.12); }}
          onClick={onTap} onTap={onTap}
          // Right click ends the wall/door chain (the tool stays, the next click starts a new wall).
          onContextMenu={(e) => { e.evt.preventDefault(); setChain(null); setHover(null); }}
          onTouchMove={onTouchMove} onTouchEnd={() => { setTimeout(() => { pinch.current = null; }, 50); }}
          onMouseDown={() => { if (tool === 'reveal' && gm) { const p = pointer(); if (!p) return; const c = toCell(p); painting.current = !revealed.has(`${c[0]},${c[1]}`); paint(c); } }}
          onTouchStart={(e) => { if (e.evt.touches.length === 1 && tool === 'reveal' && gm) { const p = pointer(); if (!p) return; const c = toCell(p); painting.current = !revealed.has(`${c[0]},${c[1]}`); paint(c); } }}
          onMouseMove={() => { const p = pointer(); if (!p) return; if (tool === 'wall' || tool === 'door') setHover(toIntersection(p)); if (painting.current !== null) paint(toCell(p)); }}
          onTouchMoveCapture={() => { const p = pointer(); if (p && painting.current !== null) paint(toCell(p)); }}
          onMouseUp={() => { painting.current = null; }} onTouchEndCapture={() => { painting.current = null; }}
        >
          <Layer listening={tool === 'select' || tool === 'place' || tool === 'wall' || tool === 'door' || tool === 'reveal' || tool === 'erase'}>
            {img && <KImage image={img} width={W} height={H} />}
            {map.showGrid && <Shape listening={false} sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              for (let c = 0; c <= cols; c++) { const x = map.gridOffsetX + c * map.gridSize; ctx.moveTo(x, map.gridOffsetY); ctx.lineTo(x, map.gridOffsetY + rows * map.gridSize); }
              for (let r = 0; r <= rows; r++) { const y = map.gridOffsetY + r * map.gridSize; ctx.moveTo(map.gridOffsetX, y); ctx.lineTo(map.gridOffsetX + cols * map.gridSize, y); }
              ctx.strokeShape(shape);
            }} stroke="rgba(0,0,0,.35)" strokeWidth={1 / view.scale} />}
          </Layer>

          {/* Walls and doors: visible to the GM; players see them only where they can see. */}
          <Layer>
            {map.walls.map((w, i) => (
              <Line key={i} points={[...px(map, w.x1, w.y1), ...px(map, w.x2, w.y2)]} stroke={wallColor(w)}
                strokeWidth={(w.door ? 7 : 5) / Math.max(view.scale, 0.4)} lineCap="round" dash={w.door && w.open ? [10, 8] : undefined}
                opacity={gm ? 0.9 : w.door ? 0.9 : 0} hitStrokeWidth={18 / view.scale}
                onClick={() => { if (!gm) return; if (tool === 'erase') edit({ walls: map.walls.filter((_, j) => j !== i) });
                  else if (tool === 'select' && w.door) edit({ walls: map.walls.map((x, j) => (j === i ? { ...x, open: !x.open } : x)) }); }}
                onTap={() => { if (!gm) return; if (tool === 'erase') edit({ walls: map.walls.filter((_, j) => j !== i) });
                  else if (tool === 'select' && w.door) edit({ walls: map.walls.map((x, j) => (j === i ? { ...x, open: !x.open } : x)) }); }} />
            ))}
            {chain && hover && <Line points={[...px(map, ...chain), ...px(map, ...hover)]} stroke="#ffd36b" strokeWidth={3 / view.scale} dash={[8, 6]} listening={false} />}
            {chain && <Circle x={px(map, ...chain)[0]} y={px(map, ...chain)[1]} radius={6 / view.scale} fill="#ffd36b" listening={false} />}
          </Layer>

          {/* Tokens. Players only see monsters/objects inside the party's sight or revealed cells. */}
          <Layer>
            {map.tokens.filter((t) => gm || !fog || sees(t) || seen(t)).map((t) => {
              const [cx, cy] = cellCenter(map, t);
              const r = (map.gridSize * (t.size || 1)) / 2;
              const movable = (tool === 'select' || !gm) && canMove(t);
              return (
                <Group key={t.id} x={cx} y={cy} draggable={movable} opacity={t.hidden ? 0.5 : 1}
                  onDragEnd={(e) => {
                    const [x, y] = toCell([e.target.x(), e.target.y()]);
                    const s = t.size || 1;
                    const nx = Math.min(cols - s, Math.max(0, Math.round(x - (s - 1) / 2))), ny = Math.min(rows - s, Math.max(0, Math.round(y - (s - 1) / 2)));
                    e.target.position({ x: cellCenter(map, { x: nx, y: ny, size: s })[0], y: cellCenter(map, { x: nx, y: ny, size: s })[1] });
                    if (nx !== t.x || ny !== t.y) onMove(t, nx, ny);
                  }}
                  onClick={(e) => { e.cancelBubble = true; if (gm && tool === 'erase') { edit({ tokens: map.tokens.filter((x) => x.id !== t.id) }); return; }
                    if (movable) setSelected(selected === t.id ? null : t.id); }}
                  onTap={(e) => { e.cancelBubble = true; if (gm && tool === 'erase') { edit({ tokens: map.tokens.filter((x) => x.id !== t.id) }); return; }
                    if (movable) setSelected(selected === t.id ? null : t.id); }}>
                  {/* Furnishings have no disc — this invisible circle is their tap/drag area (and the selection ring). */}
                  {t.kind === 'object' && (
                    <Circle radius={r * 0.9} fill="rgba(0,0,0,0.01)" stroke={selected === t.id ? '#ffd36b' : undefined} strokeWidth={r * 0.12} />
                  )}
                  {t.kind !== 'object' && (
                    <Circle radius={r * 0.86} fill={t.kind === 'character' ? '#f4e8cc' : '#5d1414'}
                      stroke={selected === t.id ? '#ffd36b' : t.kind === 'character' ? '#a87a1f' : '#2a0a0a'} strokeWidth={selected === t.id ? r * 0.18 : r * 0.1}
                      shadowColor="black" shadowBlur={6} shadowOpacity={0.6} />
                  )}
                  {t.imageUrl && tokenImgs[t.imageUrl] && (
                    <KImage image={tokenImgs[t.imageUrl]} width={r * 1.8} height={r * 1.8} offsetX={r * 0.9} offsetY={r * 0.9} listening={false} />
                  )}
                  <Text visible={!(t.imageUrl && tokenImgs[t.imageUrl])} text={t.icon || t.label.slice(0, 1).toUpperCase()} fontSize={r * (t.kind === 'object' ? 1.5 : 1)} width={r * 2} height={r * 2}
                    offsetX={r} offsetY={r} align="center" verticalAlign="middle" fill={t.kind === 'monster' ? '#fbeccc' : '#3a2408'} fontStyle="bold" listening={false} />
                  <Text text={t.label} fontSize={Math.max(10, r * 0.42)} y={r * 0.9} width={map.gridSize * 3} offsetX={map.gridSize * 1.5} align="center"
                    fill="#fff" stroke="#000" strokeWidth={0.6} fontStyle="bold" listening={false} />
                </Group>
              );
            })}
          </Layer>

          {/* Fog: black over everything except what the characters see and the revealed cells. */}
          {fog && (
            <Layer listening={false} opacity={gm ? 0.6 : 1}>
              <Rect x={-W} y={-H} width={W * 3} height={H * 3} fill="#0b0705" />
              {polys.map((p, i) => <Line key={i} points={p.flat()} closed fill="#000" globalCompositeOperation="destination-out" />)}
              {map.revealed.map((k) => {
                const [x, y] = k.split(',').map(Number);
                return <Rect key={k} x={px(map, x, y)[0]} y={px(map, x, y)[1]} width={map.gridSize} height={map.gridSize} fill="#000" globalCompositeOperation="destination-out" />;
              })}
            </Layer>
          )}
        </Stage>
      )}
    </div>
  );
}
