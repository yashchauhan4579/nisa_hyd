// IRIS Copilot chat panel — SSE client for the copilot service (:8020 via
// /copilot proxy). Renders messages, detection thumbnails, status/typing,
// brain badge (groq/qwen), quick-action chips, and executes UI actions.
import { useCallback, useEffect, useRef, useState } from 'react';
import { type BotSkin } from './botSkins';
import { useUiActions } from './useUiActions';

interface Msg {
  role: 'user' | 'bot';
  text: string;
  images?: string[];
  brain?: string;
}

const PANEL_W = 392;
const PANEL_H = 540;

function sessionId(): string {
  try {
    let s = localStorage.getItem('irisbot_session');
    if (!s) { s = `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; localStorage.setItem('irisbot_session', s); }
    return s;
  } catch { return 'default'; }
}

// minimal markdown: **bold**, bullet lines, newlines
function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>
  );
}
function renderText(text: string) {
  return text.split('\n').map((line, i) => {
    const isBullet = /^\s*[-•*]\s+/.test(line);
    const body = isBullet ? line.replace(/^\s*[-•*]\s+/, '') : line;
    return (
      <div key={i} style={isBullet ? { paddingLeft: 12 } : undefined}>
        {isBullet ? <>• {renderInline(body)}</> : renderInline(body)}
      </div>
    );
  });
}

const CHIPS = [
  'Last 2 FRS alerts',
  'Crowd right now',
  'Camera health',
  'Observer brief',
  'Vehicle count today',
];

// Quick-launch tiles: jump straight to any module page.
const MODULES: { label: string; icon: string; path: string }[] = [
  { label: 'Home', icon: '🏠', path: '/' },
  { label: 'Live View', icon: '📹', path: '/vms/liveview' },
  { label: 'Cameras', icon: '🎥', path: '/vms/cameras' },
  { label: 'Cam Health', icon: '🩺', path: '/vms/camerahealth' },
  { label: 'Map', icon: '🗺️', path: '/vms/map' },
  { label: 'ANPR', icon: '🚗', path: '/itms/anpr' },
  { label: 'Violations', icon: '🚦', path: '/itms/violations' },
  { label: 'VCC', icon: '🚙', path: '/itms/vcc' },
  { label: 'Crowd', icon: '👥', path: '/analytics/crowd' },
  { label: 'FRS', icon: '🧑', path: '/analytics/frs' },
  { label: 'Analytics', icon: '📊', path: '/analytics/dashboard' },
  { label: 'Search', icon: '🔍', path: '/search' },
  { label: 'Observer', icon: '🎞️', path: '/forensics' },
  { label: 'Alerts', icon: '🔔', path: '/alerts' },
  { label: 'Reports', icon: '📄', path: '/analytics/reports' },
  { label: 'Settings', icon: '⚙️', path: '/settings' },
];

export default function ChatPanel({ skin, anchor, onClose }: {
  skin: BotSkin;
  anchor: { x: number; y: number; w: number; h: number };
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [health, setHealth] = useState<string>('…');
  const [modulesOpen, setModulesOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const runUiAction = useUiActions();

  // anchor panel beside the bot, clamped to viewport
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = anchor.x + anchor.w + 14;
  if (left + PANEL_W > vw - 8) left = anchor.x - PANEL_W - 14;
  if (left < 8) left = Math.max(8, Math.min(vw - PANEL_W - 8, anchor.x));
  let top = Math.max(8, Math.min(anchor.y - PANEL_H / 2 + anchor.h / 2, vh - PANEL_H - 8));

  useEffect(() => {
    fetch('/copilot/health').then((r) => r.json())
      .then((h) => setHealth(h.ok ? 'online' : 'offline'))
      .catch(() => setHealth('offline'));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' });
  }, [msgs, status]);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    setStatus('Thinking…');
    try {
      const res = await fetch('/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId(),
          message: q,
          authToken: localStorage.getItem('token') || localStorage.getItem('iris_token') || undefined,
          context: {
            path: window.location.pathname,
            theme: document.documentElement.getAttribute('data-theme') ||
              (document.documentElement.classList.contains('light') ? 'light' : 'dark'),
          },
        }),
      });
      if (!res.ok || !res.body) throw new Error(`copilot ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let ev: any;
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type === 'status') setStatus(ev.text);
          else if (ev.type === 'ui') runUiAction(ev.action);
          else if (ev.type === 'message') {
            setMsgs((m) => [...m, { role: 'bot', text: ev.text, images: ev.images, brain: ev.brain }]);
            setStatus(null);
          }
        }
      }
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'bot', text: `I can't reach the copilot service (${e?.message || e}). Make sure iris-chatbot is running on :8020.` }]);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }, [busy, runUiAction]);

  return (
    <>
      <div
        className="irisbuddy-panel"
        style={{
          position: 'fixed', left, top, width: PANEL_W, height: PANEL_H, zIndex: 99991,
          display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden',
          background: `linear-gradient(180deg, rgba(16,22,34,0.92) 0%, rgba(9,12,20,0.95) 100%)`,
          border: `1px solid ${skin.accent}44`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 30px ${skin.glow}`,
          backdropFilter: 'blur(18px) saturate(140%)', color: '#e8ecf4', fontSize: 13,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          borderBottom: `1px solid ${skin.accent}22`,
          background: `linear-gradient(180deg, ${skin.accent}14, transparent)` }}>
          <span style={{ position: 'relative', display: 'inline-flex', width: 30, height: 30, borderRadius: 10,
            alignItems: 'center', justifyContent: 'center', fontSize: 16,
            background: `${skin.accent}22`, border: `1px solid ${skin.accent}55` }}>
            🤖
            <span style={{ position: 'absolute', right: -2, bottom: -2, width: 9, height: 9, borderRadius: 99,
              background: health === 'online' ? '#22c55e' : '#ef4444', border: '2px solid #0b0f18' }} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <strong style={{ color: '#f3f5fa', letterSpacing: 0.3, fontSize: 14 }}>
              IRIS <span style={{ color: skin.accent }}>Buddy</span>
            </strong>
            <span style={{ fontSize: 9.5, opacity: 0.55, letterSpacing: 0.5 }}>powered by WiredLeap AI</span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none',
            color: '#9aa3b2', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: 4, borderRadius: 8 }}>✕</button>
        </div>

        {/* messages */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.length === 0 && (
            <div style={{ opacity: 0.9 }}>
              <div style={{ marginBottom: 12, padding: '11px 13px', borderRadius: 14,
                background: `${skin.accent}12`, border: `1px solid ${skin.accent}33` }}>
                <strong style={{ color: skin.accent }}>Hi, I'm Buddy.</strong> I can pull up <strong>FRS, crowd, vehicles,
                observer, alerts & cameras</strong>, send detections to <strong>WhatsApp</strong> (just give me a number),
                and take you anywhere in IRIS. What do you need?
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CHIPS.map((c) => (
                  <button key={c} onClick={() => send(c)}
                    style={{ background: `${skin.accent}1a`, border: `1px solid ${skin.accent}55`, color: skin.accent, borderRadius: 99, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <div style={{
                padding: '9px 12px', borderRadius: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap',
                background: m.role === 'user'
                  ? `linear-gradient(135deg, ${skin.accent}33, ${skin.accent}1c)`
                  : 'rgba(255,255,255,0.055)',
                border: m.role === 'user' ? `1px solid ${skin.accent}55` : '1px solid rgba(255,255,255,0.07)',
                boxShadow: m.role === 'user' ? `0 2px 10px ${skin.glow}` : '0 1px 6px rgba(0,0,0,0.25)',
                borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
              }}>
                {renderText(m.text)}
                {m.images && m.images.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {m.images.map((u, j) => (
                      <img key={j} src={u} alt="frame"
                        onClick={() => setLightbox(u)}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        style={{ width: 104, height: 78, objectFit: 'cover', borderRadius: 8, border: `1px solid ${skin.accent}55`, cursor: 'zoom-in' }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {status && (
            <div style={{ alignSelf: 'flex-start', fontSize: 11, opacity: 0.7, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="irisbot-dots" style={{ color: skin.accent }}>●●●</span> {status}
            </div>
          )}
        </div>

        {/* module launcher */}
        <div style={{ borderTop: `1px solid ${skin.accent}22` }}>
          <button
            onClick={() => setModulesOpen((o) => !o)}
            style={{ width: '100%', background: 'none', border: 'none', color: skin.accent, cursor: 'pointer',
              fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', padding: '6px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.85 }}
          >
            <span>⊞ Jump to module</span>
            <span style={{ transition: 'transform 200ms', transform: modulesOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>
          {modulesOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '2px 10px 10px',
              maxHeight: 188, overflowY: 'auto' }}>
              {MODULES.map((m) => {
                const here = window.location.pathname === m.path;
                return (
                  <button
                    key={m.path}
                    onClick={() => { runUiAction({ action: 'navigate', target: m.path }); setModulesOpen(false); }}
                    title={`Go to ${m.label}`}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
                      background: here ? `${skin.accent}26` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${here ? skin.accent : 'rgba(255,255,255,0.09)'}`,
                      color: '#e5e7eb', fontSize: 10, lineHeight: 1.1, transition: 'all 140ms',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${skin.accent}22`; e.currentTarget.style.borderColor = `${skin.accent}aa`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = here ? `${skin.accent}26` : 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = here ? skin.accent : 'rgba(255,255,255,0.09)'; }}
                  >
                    <span style={{ fontSize: 17 }}>{m.icon}</span>
                    <span style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{m.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* input */}
        <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${skin.accent}33` }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(input); }}
            placeholder="Ask anything… or 'send last 2 FRS alerts to 98XXXXXXXX'"
            style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 11px', color: '#e5e7eb', outline: 'none', fontSize: 13 }}
          />
          <button onClick={() => send(input)} disabled={busy}
            style={{ background: skin.accent, color: '#0a0f1a', border: 'none', borderRadius: 10, padding: '0 14px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            ➤
          </button>
        </div>
        <style>{`
          @keyframes irisbot-dots { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }
          .irisbot-dots { animation: irisbot-dots 1.1s infinite; letter-spacing: 2px; font-size: 8px; }
        `}</style>
      </div>

      {/* lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightbox} alt="frame" style={{ maxWidth: '88vw', maxHeight: '88vh', borderRadius: 10, border: `1px solid ${skin.accent}77` }} />
        </div>
      )}
    </>
  );
}
