import DiceBox, { type RollResult } from '@3d-dice/dice-box';

const CONTAINER_ID = 'dice-box-overlay';
const BACKDROP_ID  = 'dice-box-backdrop';
// The dice-box assets live under public/assets/dice-box/assets/ (ammo, themes, …),
// so assetPath must include that trailing segment or the lib 404s on ammo.wasm.wasm.
const ASSET_PATH   = '/assets/dice-box/assets/';

let instance: DiceBox | null = null;
let initPromise: Promise<void> | null = null;

// dice-box uses a fixed vertical-FOV camera and scales its world by the canvas
// aspect ratio. A fullscreen portrait canvas therefore squishes the dice into an
// unreadable sliver on phones. Fix: render into a centred SQUARE canvas (aspect 1
// → no distortion, same framing on every device) over a separate full-screen
// backdrop. The square is inflated by dpr and scaled back so it stays sharp on
// HiDPI screens (the offscreen worker can't read devicePixelRatio itself).
function sizeContainer(el: HTMLElement) {
  const dpr  = Math.min(window.devicePixelRatio || 1, 3);
  const side = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.92);
  el.style.width  = `${side * dpr}px`;
  el.style.height = `${side * dpr}px`;
  el.style.transform = `translate(-50%, -50%) scale(${1 / dpr})`;
}

// Re-measure the container and push the (dpr-inflated) size to the offscreen
// worker so its backing store matches the physical pixels *right now*. Must run
// after init and every time the overlay is shown — the worker renders at DPR 1
// and only learns the real resolution from a resize. Reading dpr/viewport live
// also handles the window moving to a monitor with a different pixel ratio.
// dice-box has no public resize(): its only path to the worker is a (rAF-debounced)
// window "resize" listener that sends canvas.clientWidth/Height. Without it the
// worker keeps the canvas default 300×150 → pixelated and stretched to the square.
function syncSize() {
  const el = document.getElementById(CONTAINER_ID);
  if (!el) return;
  sizeContainer(el);
  window.dispatchEvent(new Event('resize'));
}

function onWindowResize() {
  const el = document.getElementById(CONTAINER_ID);
  if (el) sizeContainer(el); // dice-box's own resize listener then forwards the new size
}

function getOrCreateContainer(): HTMLElement {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    const backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    Object.assign(backdrop.style, {
      position: 'fixed', inset: '0', zIndex: '9998',
      visibility: 'hidden', pointerEvents: 'none', background: 'rgba(0,0,0,0.8)',
    });
    document.body.appendChild(backdrop);

    el = document.createElement('div');
    el.id = CONTAINER_ID;
    Object.assign(el.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transformOrigin: 'center',
      zIndex: '9999',
      visibility: 'hidden',
      pointerEvents: 'none',
      background: 'transparent',
    });
    sizeContainer(el);
    document.body.appendChild(el);
    window.addEventListener('resize', onWindowResize);
  }
  return el;
}

export async function initDiceBox(): Promise<void> {
  if (initPromise) return initPromise;

  const container = getOrCreateContainer();

  initPromise = (async () => {
    const { default: DiceBox } = await import('@3d-dice/dice-box');
    instance = new DiceBox({
      assetPath: ASSET_PATH,
      container: `#${CONTAINER_ID}`,
      id: 'dice-box-canvas',
      // Keep the default offscreen worker (offscreen:false failed to render at all
      // in some browsers). A larger scale makes the pips legible despite the
      // worker rendering at DPR 1.
      // ponytail: tuned for the square (aspect-1) canvas; nudge if dice look off.
      scale: 18,
      gravity: 2,
      settleTimeout: 4000,
      enableShadows: true,
      shadowTransparency: 0.6,
      spinForce: 6,
      throwForce: 6,
    });
    await instance.init();
    // ensure canvas fills container
    const canvas = container.querySelector('canvas');
    if (canvas) {
      Object.assign(canvas.style, { width: '100%', height: '100%' });
    }
    // canvas CSS size was just finalised — hand the real (dpr-inflated) resolution
    // to the worker, which otherwise keeps whatever it measured mid-init.
    syncSize();
  })();

  return initPromise;
}

export function showOverlay(onTap?: () => void) {
  const el = document.getElementById(CONTAINER_ID);
  const backdrop = document.getElementById(BACKDROP_ID);
  if (!el || !backdrop) return;
  syncSize(); // resync in case the window resized / changed monitor while hidden
  el.style.visibility = 'visible';
  Object.assign(backdrop.style, { visibility: 'visible', pointerEvents: 'auto' });
  // The square canvas is transparent + click-through, so the backdrop catches taps.
  if (onTap) backdrop.addEventListener('click', onTap, { once: true });
}

export function hideOverlay() {
  const el = document.getElementById(CONTAINER_ID);
  const backdrop = document.getElementById(BACKDROP_ID);
  if (el) el.style.visibility = 'hidden';
  if (backdrop) Object.assign(backdrop.style, { visibility: 'hidden', pointerEvents: 'none' });
}

/** Roll notation like "1d20" and resolve with the integer result. */
export async function rollDice(notation: string): Promise<number> {
  if (!instance) throw new Error('DiceBox not initialised — call initDiceBox() first');
  instance.clear();

  return new Promise((resolve) => {
    instance!.onRollComplete = (results: RollResult[]) => {
      const value: number = results?.[0]?.value ?? results?.[0]?.rolls?.[0]?.value ?? 1;
      resolve(value);
    };
    instance!.roll(notation);
  });
}
