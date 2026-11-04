// Self-check for the grid detector on synthetic maps: node frontend/scripts/gridDetect.check.ts
import assert from 'node:assert/strict';
import { detectGridInPixels } from '../src/lib/gridDetect.ts';

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function map(w: number, h: number, paint: (x: number, y: number) => number) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = paint(x, y), i = (y * w + x) * 4;
      a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255;
    }
  return a;
}

// Stone floor with noise, rooms (big dark blocks) and a faint 1-px grid every 37.5 px starting at 10/22.
const rooms = (x: number, y: number) => (x > 300 && x < 520 && y > 100 && y < 400 ? 60 : 0);
const line = (v: number, off: number, size: number) => Math.abs(((v - off) % size + size) % size) < 1;
const gridded = map(800, 600, (x, y) => 170 - rooms(x, y) + rnd() * 40 - (line(x, 10, 37.5) || line(y, 22, 37.5) ? 45 : 0));
const g = detectGridInPixels(gridded, 800, 600);
assert.ok(g, 'grid expected');
assert.ok(Math.abs(g.size - 37.5) <= 0.5, `size ${g.size}`);
assert.ok(Math.abs(g.offsetX - 10) <= 1 && Math.abs(g.offsetY - 22) <= 1, `offset ${g.offsetX}/${g.offsetY}`);

// Faint grid (barely visible, 70 px cells, image scaled down later in the browser) is still found.
const faint = detectGridInPixels(map(900, 700, (x, y) => 150 - rooms(x, y) + rnd() * 40 - (line(x, 5, 70) || line(y, 33, 70) ? 18 : 0)), 900, 700);
assert.ok(faint && Math.abs(faint.size - 70) <= 0.5, `faint ${JSON.stringify(faint)}`);

// Every other line half hidden under scenery: still the real cell (40 px), not the double.
const half = (v: number) => (((v - 8) % 80) + 80) % 80 < 1;
const occluded = detectGridInPixels(map(800, 640, (x, y) => 160 + rnd() * 30
  - (half(x) || half(y) ? 50 : line(x, 8, 40) || line(y, 8, 40) ? 20 : 0)), 800, 640);
assert.ok(occluded && Math.abs(occluded.size - 40) <= 0.5, `occluded ${JSON.stringify(occluded)}`);

// Same map without grid lines → no grid.
assert.equal(detectGridInPixels(map(800, 600, (x, y) => 170 - rooms(x, y) + rnd() * 40), 800, 600), null);

// Smooth outdoor map (gradient + noise) → no grid.
assert.equal(detectGridInPixels(map(640, 640, (x, y) => 80 + x / 8 + y / 10 + rnd() * 50), 640, 640), null);

console.log('gridDetect ok', g);
