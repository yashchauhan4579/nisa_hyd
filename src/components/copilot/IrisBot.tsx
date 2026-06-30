// IRIS Buddy — the mascot. Hidden on login/landing; pops in with a jump once
// you're inside the app. On the home page it stands still (shake to free);
// elsewhere it hops around the screen, leaping over components. Drag to pin,
// shake to set it moving. Click to chat. Skin adapts to the active theme.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useBotSkin, type BotSkin } from './botSkins';
import ChatPanel from './ChatPanel';

const BOT_W = 74;
const BOT_H = 86;
const LS_KEY = 'irisbot_state';
const GREET_KEY = 'irisbot_greeted';

type Mode = 'wander' | 'pinned';

function loadState(): { mode: Mode; x: number; y: number } {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '');
    if (s && typeof s.x === 'number' && typeof s.y === 'number' && (s.mode === 'pinned' || s.mode === 'wander')) return s;
  } catch { /* fresh */ }
  return { mode: 'wander', x: Math.max(16, window.innerWidth - BOT_W - 48), y: Math.max(16, window.innerHeight - BOT_H - 40) };
}

function clampX(x: number) { return Math.min(Math.max(8, x), Math.max(8, window.innerWidth - BOT_W - 8)); }
function clampY(y: number) { return Math.min(Math.max(8, y), Math.max(8, window.innerHeight - BOT_H - 8)); }

// Toddler steps: small nudges left/right, mostly along the floor with the odd
// little hop up — like a baby learning to walk (and sometimes tumbling).
function toddleWaypoint(fromX: number, fromY: number): { x: number; y: number } {
  const vw = window.innerWidth, vh = window.innerHeight;
  const m = 16;
  const floor = vh - BOT_H - m;
  const dir = Math.random() < 0.5 ? -1 : 1;
  const step = 55 + Math.random() * 120;           // small baby step
  let x = clampX(fromX + dir * step);
  if (x <= m + 2 || x >= vw - BOT_W - m - 2) x = clampX(fromX - dir * step); // toddle back from edge
  // mostly the floor; once in a while a small clamber upward
  const y = Math.random() < 0.22 ? clampY(floor - (24 + Math.random() * 90)) : (fromY < floor - 30 ? clampY(fromY + 40 + Math.random() * 80) : floor);
  return { x, y };
}

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

const GREETING = "Hi there! I'm Buddy, and I work for IRIS. How may I help you?";

// Baby-voiced TTS via Deepgram (proxied through /copilot/tts). Pitches the
// audio up so it sounds like a little kid. Returns playback length in ms (0 if
// it couldn't play — autoplay may be blocked until the first user gesture).
let _audioCtx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return _audioCtx;
  } catch { return null; }
}
// unlock audio on the first user gesture anywhere (browser autoplay policy)
if (typeof window !== 'undefined') {
  const unlock = () => { const c = audioCtx(); if (c && c.state === 'suspended') c.resume().catch(() => {}); };
  window.addEventListener('pointerdown', unlock, { once: false });
}
const BABY_RATE = 1.16; // gentle youthful lift, but slow & welcoming
const BABY_VOICE = 'aura-luna-en'; // soft, warm, welcoming
async function speakBaby(text: string): Promise<number> {
  try {
    const ctx = audioCtx();
    if (!ctx) return 0;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const res = await fetch('/copilot/tts?voice=' + BABY_VOICE + '&text=' + encodeURIComponent(text));
    if (!res.ok) return 0;
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr.slice(0));
    if (ctx.state !== 'running') return 0; // still blocked → caller uses fallback timing
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = BABY_RATE;
    // gain envelope: short fade-in/out so there are no clicks at the edges
    const gain = ctx.createGain();
    const playDur = buf.duration / BABY_RATE;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(1, t0 + 0.04);
    gain.gain.setValueAtTime(1, t0 + Math.max(0.05, playDur - 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + playDur);
    src.connect(gain).connect(ctx.destination);
    src.start();
    return playDur * 1000;
  } catch { return 0; }
}

function BotSvg({ skin, hopping, blink, pupil, facing, wiggle }: {
  skin: BotSkin; hopping: boolean; blink: boolean; pupil: { x: number; y: number }; facing: number; wiggle: boolean;
}) {
  return (
    <svg
      width={BOT_W} height={BOT_H} viewBox="0 0 74 86"
      className={wiggle ? 'irisbot-wiggle' : ''}
      style={{
        transform: `scaleX(${facing})`,
        filter: `drop-shadow(0 4px 6px rgba(0,0,0,0.45)) drop-shadow(0 0 10px ${skin.glow})`,
        transition: 'filter 400ms',
        overflow: 'visible',
      }}
    >
      <line x1="37" y1="14" x2="37" y2="4" stroke={skin.bodyEdge} strokeWidth="2.5" />
      <circle cx="37" cy="4" r="3.4" fill={skin.accent}>
        <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
      </circle>
      {/* feet — tuck up while hopping */}
      <g style={{ transform: hopping ? 'translateY(-4px)' : 'none', transition: 'transform 160ms' }}>
        <rect x="16" y="72" width="16" height="11" rx="5.5" fill={skin.feet} />
        <rect x="42" y="72" width="16" height="11" rx="5.5" fill={skin.feet} />
      </g>
      <g>
        <rect x="10" y="14" width="54" height="60" rx="18" fill={skin.body} stroke={skin.bodyEdge} strokeWidth="2.5" />
        <rect x="17" y="24" width="40" height="28" rx="11" fill={skin.belly} />
        <g>
          <circle cx="29" cy="38" r="7.6" fill={skin.eyeSocket} />
          <circle cx="45" cy="38" r="7.6" fill={skin.eyeSocket} />
          {blink ? (
            <g stroke={skin.eye} strokeWidth="2.4" strokeLinecap="round">
              <line x1="24.5" y1="38" x2="33.5" y2="38" />
              <line x1="40.5" y1="38" x2="49.5" y2="38" />
            </g>
          ) : (
            <g fill={skin.eye}>
              <circle cx={29 + pupil.x} cy={38 + pupil.y} r="3.6">
                <animate attributeName="r" values="3.6;4.1;3.6" dur="2.6s" repeatCount="indefinite" />
              </circle>
              <circle cx={45 + pupil.x} cy={38 + pupil.y} r="3.6">
                <animate attributeName="r" values="3.6;4.1;3.6" dur="2.6s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </g>
        <rect x="31" y="58" width="12" height="3.2" rx="1.6" fill={skin.bodyEdge} opacity="0.85" />
        {skin.accessory === 'visor' && (
          <rect x="15" y="29" width="44" height="18" rx="9" fill="none" stroke={skin.accent} strokeWidth="1.8" opacity="0.9">
            <animate attributeName="opacity" values="0.9;0.4;0.9" dur="2.2s" repeatCount="indefinite" />
          </rect>
        )}
        {skin.accessory === 'cowboyHat' && (
          <g>
            <ellipse cx="37" cy="15" rx="24" ry="5.5" fill="#4a3320" stroke="#2c1d10" strokeWidth="1.5" />
            <path d="M24 15 Q24 2 37 2 Q50 2 50 15 Z" fill="#5d4126" stroke="#2c1d10" strokeWidth="1.5" />
            <rect x="24" y="10" width="26" height="3.6" fill="#2c1d10" />
          </g>
        )}
      </g>
    </svg>
  );
}

export default function IrisBot() {
  const skin = useBotSkin();
  const location = useLocation();
  const isHome = location.pathname === '/';

  const [, force] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hopping, setHopping] = useState(false);
  const [blink, setBlink] = useState(false);
  const [wiggle, setWiggle] = useState(false);
  const [facing, setFacing] = useState(1);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const [homeFreed, setHomeFreed] = useState(false);
  const [greet, setGreet] = useState(false);
  const [falling, setFalling] = useState(false);
  const fallingRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const stRef = useRef(loadState());
  const hopRef = useRef<{ from: { x: number; y: number }; to: { x: number; y: number }; start: number; dur: number; arc: number } | null>(null);
  const idleUntilRef = useRef(0);
  const dragRef = useRef<{ active: boolean; moved: boolean; shaken: boolean; offX: number; offY: number; downX: number; downY: number; lastDx: number; flips: number[] } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const homeFreedRef = useRef(false);
  const isHomeRef = useRef(isHome);
  const panelRef = useRef(false);
  useEffect(() => { isHomeRef.current = isHome; }, [isHome]);
  useEffect(() => { homeFreedRef.current = homeFreed; }, [homeFreed]);
  useEffect(() => { panelRef.current = panelOpen; }, [panelOpen]);

  const placeXY = useCallback((x: number, y: number, lift = 0) => {
    const el = elRef.current;
    if (el) el.style.transform = `translate3d(${x}px, ${y - lift}px, 0)`;
  }, []);
  const place = useCallback(() => placeXY(stRef.current.x, stRef.current.y), [placeXY]);

  const persist = useCallback(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(stRef.current)); } catch { /* ignore */ }
  }, []);

  // a baby tumble: tips over, sits a beat, wobbles back upright
  const triggerFall = useCallback(() => {
    fallingRef.current = true; setFalling(true); setHopping(false);
    const w = wrapperRef.current;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (w) {
      w.animate(
        [
          { transform: 'rotate(0deg) translateY(0)' },
          { transform: `rotate(${dir * 16}deg) translateY(0)`, offset: 0.18 },
          { transform: `rotate(${dir * 78}deg) translateY(12px)`, offset: 0.42 },
          { transform: `rotate(${dir * 78}deg) translateY(12px)`, offset: 0.66 },
          { transform: `rotate(${dir * -8}deg) translateY(0)`, offset: 0.86 },
          { transform: 'rotate(0deg) translateY(0)' },
        ],
        { duration: 1700, easing: 'cubic-bezier(.5,.05,.5,.95)' },
      );
    }
    setTimeout(() => {
      fallingRef.current = false; setFalling(false);
      idleUntilRef.current = performance.now() + 700 + Math.random() * 1800;
    }, 1750);
  }, []);

  // ------- hop loop -------
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const st = stRef.current;
      const dragging = dragRef.current && dragRef.current.active;
      const canRoam = st.mode === 'wander' && !panelRef.current && !dragging &&
        (!isHomeRef.current || homeFreedRef.current);

      if (canRoam) {
        if (fallingRef.current) {
          // mid-tumble — hold still until it gets back up
        } else if (!hopRef.current) {
          if (now >= idleUntilRef.current) {
            if (Math.random() < 0.16) {
              triggerFall();
            } else {
              const to = toddleWaypoint(st.x, st.y);
              const dist = Math.hypot(to.x - st.x, to.y - st.y);
              const arc = Math.min(34, 10 + dist * 0.14) + (Math.random() < 0.2 ? 14 : 0); // low baby hop
              hopRef.current = { from: { x: st.x, y: st.y }, to, start: now, dur: Math.max(620, Math.min(1500, dist * 4.5)), arc };
              if (Math.abs(to.x - st.x) > 4) setFacing(to.x >= st.x ? 1 : -1);
              setHopping(true);
            }
          }
        } else {
          const h = hopRef.current;
          const p = Math.min(1, (now - h.start) / h.dur);
          const e = easeInOut(p);
          st.x = h.from.x + (h.to.x - h.from.x) * e;
          st.y = h.from.y + (h.to.y - h.from.y) * e;
          const lift = h.arc * Math.sin(Math.PI * p);
          placeXY(st.x, st.y, lift);
          if (p >= 1) {
            st.x = h.to.x; st.y = h.to.y; hopRef.current = null;
            placeXY(st.x, st.y, 0);
            idleUntilRef.current = now + 850 + Math.random() * 2600; // slower, relaxed pacing
            setHopping(false);
          }
        }
      } else if (hopRef.current) {
        // movement gated off mid-hop — settle down
        hopRef.current = null; setHopping(false); place();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [place, placeXY]);

  // ------- blink -------
  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => { if (alive) { setBlink(false); loop(); } }, 150);
      }, 2600 + Math.random() * 4200);
    };
    loop();
    return () => { alive = false; };
  }, []);

  // ------- eyes track cursor -------
  useEffect(() => {
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const st = stRef.current;
        const cx = st.x + BOT_W / 2, cy = st.y + 38;
        const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
        const dist = Math.min(2.8, Math.hypot(e.clientX - cx, e.clientY - cy) / 60);
        setPupil({ x: +(Math.cos(ang) * dist).toFixed(1), y: +(Math.sin(ang) * dist).toFixed(1) });
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // ------- keep on screen on resize -------
  useEffect(() => {
    const onResize = () => { const st = stRef.current; st.x = clampX(st.x); st.y = clampY(st.y); place(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [place]);

  useEffect(() => { place(); }, [place]);

  // ------- entrance jump + greeting (ONCE per login, not on refresh) -------
  useEffect(() => {
    place();
    const el = elRef.current;
    if (el) {
      el.animate(
        [
          { transform: `translate3d(${stRef.current.x}px, ${stRef.current.y + 40}px, 0) scale(0.4)`, opacity: 0 },
          { transform: `translate3d(${stRef.current.x}px, ${stRef.current.y - 30}px, 0) scale(1.05)`, opacity: 1, offset: 0.6 },
          { transform: `translate3d(${stRef.current.x}px, ${stRef.current.y}px, 0) scale(1)`, opacity: 1 },
        ],
        { duration: 820, easing: 'cubic-bezier(.34,1.4,.64,1)' },
      );
    }
    // Greet exactly once per login. Keyed off the auth token signature: a reload
    // keeps the same token → stays silent; a fresh login mints a new token → greets.
    let tok = '';
    try { tok = localStorage.getItem('token') || localStorage.getItem('iris_token') || ''; } catch { /* ignore */ }
    const sig = 'g:' + tok.slice(-28);
    let greetedFor = '';
    try { greetedFor = localStorage.getItem(GREET_KEY) || ''; } catch { /* ignore */ }
    if (!tok || greetedFor === sig) return; // no token, or already greeted this login
    try { localStorage.setItem(GREET_KEY, sig); } catch { /* ignore */ }

    let hideTimer: ReturnType<typeof setTimeout>;
    const showTimer = setTimeout(async () => {
      setGreet(true);
      const ms = await speakBaby(GREETING);
      const dur = ms > 0 ? ms + 700 : 8000; // sync to speech, or fallback if audio blocked
      hideTimer = setTimeout(() => setGreet(false), dur);
    }, 700);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------- drag / pin / shake-to-free / click -------
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const st = stRef.current;
    hopRef.current = null; setHopping(false);
    dragRef.current = { active: true, moved: false, shaken: false, offX: e.clientX - st.x, offY: e.clientY - st.y, downX: e.clientX, downY: e.clientY, lastDx: 0, flips: [] };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !d.active) return;
    const st = stRef.current;
    const nx = clampX(e.clientX - d.offX), ny = clampY(e.clientY - d.offY);
    const dx = nx - st.x;
    if (!d.moved && Math.hypot(e.clientX - d.downX, e.clientY - d.downY) > 6) d.moved = true;
    if (Math.abs(dx) > 3) {
      const sign = Math.sign(dx);
      if (d.lastDx !== 0 && sign !== 0 && sign !== d.lastDx) {
        const now = performance.now();
        d.flips = d.flips.filter((t) => now - t < 800);
        d.flips.push(now);
        if (d.flips.length >= 4) {
          // shaken → start moving (and free it on the home page)
          d.active = false; d.shaken = true; d.flips = [];
          st.mode = 'wander';
          hopRef.current = null;
          idleUntilRef.current = performance.now() + 400;
          if (isHomeRef.current) setHomeFreed(true);
          persist();
          setWiggle(true);
          setTimeout(() => setWiggle(false), 700);
          force((v) => v + 1);
          return;
        }
      }
      if (sign !== 0) d.lastDx = sign;
    }
    st.x = nx; st.y = ny;
    placeXY(nx, ny, 0);
    setGreet(false);
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    if (!d) return;
    const wasActive = d.active;
    d.active = false;
    if (d.shaken || !wasActive) return;
    if (d.moved) {
      stRef.current.mode = 'pinned'; // dropped → stays put anywhere
      persist();
      force((v) => v + 1);
    } else {
      setGreet(false);
      setPanelOpen((o) => !o);
    }
  };

  const st = stRef.current;
  const pinned = st.mode === 'pinned';
  const still = isHome && !homeFreed && !pinned;

  return (
    <>
      <style>{`
        @keyframes irisbot-wiggle { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } }
        @keyframes irisbot-idlebob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes irisbot-toddle { 0%,100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
        .irisbot-toddle { animation: irisbot-toddle 0.6s ease-in-out infinite; }
        @keyframes irisbot-cloudin { 0% { opacity: 0; transform: translate(-50%, 8px) scale(0.85); } 100% { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        .irisbot-wiggle { animation: irisbot-wiggle 0.18s 4; }
        .irisbot-root { position: fixed; top: 0; left: 0; z-index: 99990; cursor: grab; touch-action: none; user-select: none; will-change: transform; }
        .irisbot-root:active { cursor: grabbing; }
        .irisbot-idle { animation: irisbot-idlebob 3.4s ease-in-out infinite; }
        .irisbot-pin { position: absolute; top: -4px; right: -6px; font-size: 11px; opacity: 0.85; pointer-events: none; }
        .irisbot-cloud { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); width: 210px;
          padding: 11px 13px; border-radius: 16px; font-size: 12.5px; line-height: 1.4; font-weight: 500;
          animation: irisbot-cloudin .4s cubic-bezier(.34,1.56,.64,1); pointer-events: none; backdrop-filter: blur(6px); }
        .irisbot-cloud:after { content: ''; position: absolute; left: 50%; top: 100%; transform: translateX(-50%);
          border: 8px solid transparent; }
      `}</style>
      <div
        ref={elRef}
        className="irisbot-root"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title={pinned ? 'IRIS Buddy — pinned (drag & shake to set me free)' : still ? 'IRIS Buddy — shake me to roam, click to chat' : 'IRIS Buddy — click to chat, drag to pin me'}
      >
        {greet && (
          <div
            className="irisbot-cloud"
            style={{
              background: 'rgba(12,17,28,0.94)', color: '#e9edf5',
              border: `1px solid ${skin.accent}66`, boxShadow: `0 8px 28px rgba(0,0,0,0.5), 0 0 18px ${skin.glow}`,
            }}
          >
            <span style={{ color: skin.accent, fontWeight: 700 }}>Hi there! I'm Buddy</span>, and I work for IRIS. How may I help you?
            <span style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', borderTop: `8px solid ${skin.accent}66`, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', width: 0, height: 0 }} />
          </div>
        )}
        <div ref={wrapperRef} className={still ? 'irisbot-idle' : (hopping && !falling ? 'irisbot-toddle' : '')}>
          <BotSvg skin={skin} hopping={hopping} blink={blink} pupil={pupil} facing={facing} wiggle={wiggle} />
        </div>
        {pinned && <span className="irisbot-pin">📌</span>}
      </div>
      {panelOpen && (
        <ChatPanel
          skin={skin}
          anchor={{ x: st.x, y: st.y, w: BOT_W, h: BOT_H }}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </>
  );
}
