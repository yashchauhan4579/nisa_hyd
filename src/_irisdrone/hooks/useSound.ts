/**
 * OVERSIGHT tactical sound system.
 *
 * - Single shared HTMLAudioElement per name (cached)
 * - Master + per-category mute via localStorage
 * - Master volume scalar (0..1)
 * - First-user-interaction primer to defeat browser autoplay block
 */

const audioCache = new Map<string, HTMLAudioElement>();

export type SoundEffect =
  // Brand & identity
  | 'boot' | 'login-success' | 'login-fail' | 'logout'
  // Navigation
  | 'nav-route' | 'nav-back' | 'drawer-open' | 'drawer-close' | 'chord-pending'
  // Action confirmations
  | 'approve' | 'reject' | 'delete' | 'save' | 'copy' | 'submit' | 'cancel'
  // Alerts & threats
  | 'alert-new' | 'alert-critical' | 'violation-detect' | 'watchlist-hit'
  | 'device-offline' | 'device-online'
  // UI micro-interactions
  | 'hover' | 'click' | 'tab-switch' | 'filter-apply'
  | 'toggle-on' | 'toggle-off' | 'kbd-hint' | 'select-open'
  // Scan & process
  | 'scan-pulse' | 'data-load' | 'process-done' | 'image-load'
  // Mode/state changes
  | 'theme-toggle' | 'accent-change' | 'lock' | 'warning'
  // Widget grid system
  | 'widget-grab' | 'widget-drop' | 'widget-resize' | 'widget-snap'
  | 'counter-tick' | 'radar-sweep' | 'heatmap-bloom'
  // Backwards compat (old names still used in some files)
  | 'success' | 'error' | 'notification' | 'expand' | 'collapse'
  | 'violation-alert' | 'watchlist-alert' | 'crowd-alert';

type SoundCategory = 'brand' | 'nav' | 'action' | 'alert' | 'ui' | 'scan' | 'mode';

const CATEGORY: Record<string, SoundCategory> = {
  boot: 'brand', 'login-success': 'brand', 'login-fail': 'brand', logout: 'brand',
  'nav-route': 'nav', 'nav-back': 'nav', 'drawer-open': 'nav', 'drawer-close': 'nav', 'chord-pending': 'nav',
  approve: 'action', reject: 'action', delete: 'action', save: 'action', copy: 'action', submit: 'action', cancel: 'action',
  'alert-new': 'alert', 'alert-critical': 'alert', 'violation-detect': 'alert', 'watchlist-hit': 'alert',
  'device-offline': 'alert', 'device-online': 'alert',
  hover: 'ui', click: 'ui', 'tab-switch': 'ui', 'filter-apply': 'ui',
  'toggle-on': 'ui', 'toggle-off': 'ui', 'kbd-hint': 'ui', 'select-open': 'ui',
  'scan-pulse': 'scan', 'data-load': 'scan', 'process-done': 'scan', 'image-load': 'scan',
  'theme-toggle': 'mode', 'accent-change': 'mode', lock: 'mode', warning: 'mode',
  'widget-grab': 'ui', 'widget-drop': 'ui', 'widget-resize': 'ui', 'widget-snap': 'ui',
  'counter-tick': 'ui', 'radar-sweep': 'scan', 'heatmap-bloom': 'scan',
  // legacy aliases
  success: 'action', error: 'action', notification: 'alert',
  expand: 'nav', collapse: 'nav',
  'violation-alert': 'alert', 'watchlist-alert': 'alert', 'crowd-alert': 'alert',
};

/** Map legacy/alias names to current files */
const ALIAS: Record<string, string> = {
  success: 'approve',
  error: 'reject',
  notification: 'alert-new',
  expand: 'drawer-open',
  collapse: 'drawer-close',
  'violation-alert': 'violation-detect',
  'watchlist-alert': 'watchlist-hit',
  'crowd-alert': 'alert-new',
};

/** Per-effect base volume (0..1) — multiplied by master volume */
const VOLUME: Record<string, number> = {
  boot: 0.5, 'login-success': 0.5, 'login-fail': 0.5, logout: 0.5,
  'nav-route': 0.18, 'nav-back': 0.18, 'drawer-open': 0.3, 'drawer-close': 0.3, 'chord-pending': 0.25,
  approve: 0.5, reject: 0.5, delete: 0.45, save: 0.3, copy: 0.2, submit: 0.35, cancel: 0.25,
  'alert-new': 0.55, 'alert-critical': 0.7, 'violation-detect': 0.5, 'watchlist-hit': 0.6,
  'device-offline': 0.45, 'device-online': 0.4,
  hover: 0.1, click: 0.18, 'tab-switch': 0.22, 'filter-apply': 0.25,
  'toggle-on': 0.28, 'toggle-off': 0.25, 'kbd-hint': 0.3, 'select-open': 0.22,
  'scan-pulse': 0.18, 'data-load': 0.3, 'process-done': 0.4, 'image-load': 0.15,
  'theme-toggle': 0.32, 'accent-change': 0.28, lock: 0.45, warning: 0.4,
  'widget-grab': 0.3, 'widget-drop': 0.32, 'widget-resize': 0.2, 'widget-snap': 0.35,
  'counter-tick': 0.12, 'radar-sweep': 0.15, 'heatmap-bloom': 0.18,
};

const STORAGE_KEYS = {
  master: 'iris_sound_master',
  volume: 'iris_sound_volume',
  brand: 'iris_sound_brand',
  nav: 'iris_sound_nav',
  action: 'iris_sound_action',
  alert: 'iris_sound_alert',
  ui: 'iris_sound_ui',
  scan: 'iris_sound_scan',
  mode: 'iris_sound_mode',
} as const;

function getBool(key: string, fallback = true): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === 'true';
  } catch { return fallback; }
}

function getNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
}

export function isSoundEnabled(): boolean {
  return getBool(STORAGE_KEYS.master, true);
}

export function getMasterVolume(): number {
  return Math.max(0, Math.min(1, getNum(STORAGE_KEYS.volume, 0.7)));
}

export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(STORAGE_KEYS.master, String(on)); } catch {}
}

export function setMasterVolume(v: number): void {
  try { localStorage.setItem(STORAGE_KEYS.volume, String(Math.max(0, Math.min(1, v)))); } catch {}
}

export function isCategoryEnabled(cat: SoundCategory): boolean {
  // UI sounds default to OFF for first-time users (less noisy); everything else defaults ON
  const fallback = cat !== 'ui';
  return getBool(STORAGE_KEYS[cat], fallback);
}

export function setCategoryEnabled(cat: SoundCategory, on: boolean): void {
  try { localStorage.setItem(STORAGE_KEYS[cat], String(on)); } catch {}
}

function resolveName(name: string): string {
  return ALIAS[name] || name;
}

function getAudio(name: string): HTMLAudioElement {
  const file = resolveName(name);
  let audio = audioCache.get(file);
  if (!audio) {
    audio = new Audio(`/sounds/${file}.mp3`);
    audio.preload = 'auto';
    audioCache.set(file, audio);
  }
  return audio;
}

export function playSound(name: SoundEffect | string): void {
  if (!isSoundEnabled()) return;
  const cat = CATEGORY[name as string] || 'ui';
  if (!isCategoryEnabled(cat)) return;

  try {
    const audio = getAudio(name as string);
    const baseVol = VOLUME[name as string] ?? VOLUME[resolveName(name as string)] ?? 0.4;
    audio.volume = Math.max(0, Math.min(1, baseVol * getMasterVolume()));
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // ignore — autoplay blocked or asset missing
  }
}

/**
 * Prime the audio context on first user gesture so subsequent plays
 * are not blocked by browser autoplay policy.
 */
let primed = false;
export function primeAudio(): void {
  if (primed) return;
  primed = true;
  // Touch the most-used effects so they're cached + a silent play unlock
  ['nav-route', 'click', 'approve', 'alert-new'].forEach((n) => {
    const a = getAudio(n);
    a.muted = true;
    a.play().then(() => { a.pause(); a.muted = false; a.currentTime = 0; }).catch(() => {});
  });
}

if (typeof window !== 'undefined') {
  const onFirst = () => {
    primeAudio();
    // Eagerly create + resume the siren's AudioContext so the very
    // next watchlist alert can start the oscillator immediately
    // instead of having to wait for another user gesture.
    try {
      const ctx = ensureSirenCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {}
    window.removeEventListener('pointerdown', onFirst);
    window.removeEventListener('keydown', onFirst);
  };
  window.addEventListener('pointerdown', onFirst, { once: true });
  window.addEventListener('keydown', onFirst, { once: true });
}

/**
 * Watchlist hit siren — synthesized via Web Audio API so it sounds like
 * a real emergency-vehicle alarm (two-tone sweep between ~520 Hz and
 * ~1040 Hz) instead of a looped sample clip. Cuts through ambient room
 * noise and can't be mistaken for the routine alert sounds. Idempotent:
 * startSiren() while running is a no-op; stopSiren() unwinds cleanly.
 */
let sirenCtx: AudioContext | null = null;
let sirenOsc: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let sirenRunning = false;
let sirenPendingStart = false;

function ensureSirenCtx(): AudioContext | null {
  const Ctor: typeof AudioContext | undefined =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!sirenCtx || sirenCtx.state === 'closed') sirenCtx = new Ctor();
  return sirenCtx;
}

export function startSiren(): void {
  if (!isSoundEnabled()) return;
  if (!isCategoryEnabled('alert')) return;
  if (sirenRunning) return;
  try {
    const ctx0 = ensureSirenCtx();
    if (!ctx0) return;
    // Browsers won't let an AudioContext play audio until there's been a
    // user gesture. The background poll has none, so if we're still
    // suspended, defer the actual start to the next pointer/key event.
    if (ctx0.state === 'suspended') {
      sirenPendingStart = true;
      ctx0.resume().catch(() => {});
      const retry = () => {
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('keydown', retry);
        if (sirenPendingStart) {
          sirenPendingStart = false;
          startSiren();
        }
      };
      window.addEventListener('pointerdown', retry, { once: true });
      window.addEventListener('keydown', retry, { once: true });
      return;
    }

    const ctx = sirenCtx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth'; // richer harmonic content = more "alarm" character
    const now = ctx.currentTime;

    // Two-tone siren: ramp 520 Hz → 1040 Hz → 520 Hz, ~1.4 s cycle,
    // looping continuously. Setting setValueCurveAtTime with a long
    // duration keeps the sweep going without scheduling per-cycle.
    const cycle = 1.4;
    const cycles = 600; // ~14 minutes of buffered ramp; siren is killed earlier
    const points: number[] = [];
    for (let i = 0; i < cycles; i++) {
      points.push(520, 1040);
    }
    points.push(520);
    osc.frequency.setValueCurveAtTime(new Float32Array(points), now, cycle * cycles);

    // Hard cap volume because sawtooth + high freq is piercing; scale by master.
    const target = 0.55 * getMasterVolume();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, target), now + 0.04);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);

    sirenOsc = osc;
    sirenGain = gain;
    sirenRunning = true;
  } catch {
    // ignore — AudioContext denied or unsupported
  }
}

export function stopSiren(): void {
  if (!sirenRunning) return;
  try {
    if (sirenCtx && sirenGain && sirenOsc) {
      const t = sirenCtx.currentTime;
      // Fast fade-out to avoid a click on stop
      sirenGain.gain.cancelScheduledValues(t);
      sirenGain.gain.setValueAtTime(sirenGain.gain.value, t);
      sirenGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      sirenOsc.stop(t + 0.08);
    }
  } catch {
    // ignore
  }
  sirenOsc = null;
  sirenGain = null;
  sirenRunning = false;
}

export function isSirenRunning(): boolean {
  return sirenRunning;
}
