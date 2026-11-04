/**
 * Finds a square grid painted into a map image: grid lines are sharp brightness steps that repeat at a fixed
 * distance, so the column/row edge profiles have peaks every `size` pixels. Returns null when there is no
 * clear, regular pattern (gridless map) — the caller then draws its own grid.
 */
export type DetectedGrid = { size: number; offsetX: number; offsetY: number };

// Contrast = lower-quartile edge strength on the comb ÷ overall mean; a real grid sits far above noise and room outlines.
const MIN_CELL = 12, MIN_LINES = 8, MIN_CONTRAST = 2.5;

/** Edge strength per column (vertical lines) and per row (horizontal lines) of an RGBA buffer. */
function profiles(rgba: Uint8ClampedArray, w: number, h: number) {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  const cols = new Float32Array(w), rows = new Float32Array(h);
  for (let y = 1; y < h; y++)
    for (let x = 1; x < w; x++) {
      const v = g[y * w + x];
      cols[x] += Math.abs(v - g[y * w + x - 1]);
      rows[y] += Math.abs(v - g[(y - 1) * w + x]);
    }
  return { cols, rows };
}

/** High-pass (minus local mean) so only sharp lines remain, then widened by ±1 px against rounding. */
function prepare(p: Float32Array) {
  const n = p.length, r = 6, hp = new Float32Array(n), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) { s += p[j]; c++; }
    hp[i] = Math.max(0, p[i] - s / c);
  }
  for (let i = 0; i < n; i++) out[i] = Math.max(hp[i], hp[i - 1] ?? 0, hp[i + 1] ?? 0);
  let mean = 0;
  for (const v of out) mean += v;
  mean /= n;
  return { d: out, mean: mean || 1 };
}

/** Best phase for a period and its contrast. */
function comb(pr: ReturnType<typeof prepare>, p: number) {
  const n = pr.d.length;
  let best = { z: -Infinity, phase: 0 };
  for (let ph = 0; ph < p; ph++) {
    // Lower quartile, not mean: every line of a grid is strong, while a few room outlines must not carry a period.
    const v: number[] = [];
    for (let x = ph; x < n; x += p) v.push(pr.d[Math.round(x)] ?? 0);
    v.sort((a, b) => a - b);
    const z = v[v.length >> 2] / pr.mean; // lower quartile: also rejects half-size and drifting periods
    if (z > best.z) best = { z, phase: ph };
  }
  return best;
}

/** Pure detection on pixels (image already scaled to work size). */
export function detectGridInPixels(rgba: Uint8ClampedArray, w: number, h: number): DetectedGrid | null {
  const { cols, rows } = profiles(rgba, w, h);
  const px = prepare(cols), py = prepare(rows);
  const maxP = Math.min(w, h) / MIN_LINES;
  const cands: { p: number; z: number; ox: number; oy: number }[] = [];
  for (let p = MIN_CELL; p <= maxP; p += 0.25) {
    const a = comb(px, p), b = comb(py, p);
    cands.push({ p, z: Math.min(a.z, b.z), ox: a.phase, oy: b.phase });
  }
  const top = Math.max(...cands.map((c) => c.z));
  if (!(top >= MIN_CONTRAST)) return null;
  // Multiples of the cell size score as well as the cell itself (every 2nd line is still a line): take the smallest.
  const near = (p: number) => cands.filter((c) => Math.abs(c.p - p) <= 0.75).sort((x, y) => y.z - x.z)[0];
  let hit = near(cands.find((c) => c.z >= top * 0.85)!.p);
  // Lines hidden under scenery can still make a multiple win. A real cell ½ or ⅓ the size has every one of its
  // lines strong; halfway between true lines there is nothing, so a too-small guess stays near 1.
  for (let again = true; again;) {
    again = false;
    for (const d of [2, 3]) {
      const sub = near(hit.p / d);
      if (sub && sub.z >= MIN_CONTRAST) { hit = sub; again = true; break; }
    }
  }
  return { size: hit.p, offsetX: hit.ox, offsetY: hit.oy };
}

/** Loads the image scaled to ≤1024 px; returns its natural size and the grid in image pixels (null = none found). */
export async function detectGrid(url: string): Promise<{ w: number; h: number; grid: DetectedGrid | null }> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    // Cross-origin images need CORS or the canvas is tainted; the query avoids a cached copy fetched without CORS.
    const cors = !url.startsWith('blob:');
    if (cors) i.crossOrigin = 'anonymous';
    i.src = cors ? `${url}${url.includes('?') ? '&' : '?'}grid` : url;
  });
  if (!img || !img.naturalWidth) return { w: 0, h: 0, grid: null };
  const nat = { w: img.naturalWidth, h: img.naturalHeight };
  const s = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { ...nat, grid: null };
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return { ...nat, grid: null }; } // tainted canvas (foreign host)
  const g = detectGridInPixels(data, w, h);
  if (!g) return { ...nat, grid: null };
  const size = g.size / s;
  return { ...nat, grid: { size: Math.round(size * 100) / 100, offsetX: Math.round((g.offsetX / s) % size), offsetY: Math.round((g.offsetY / s) % size) } };
}
