import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Siren, ShieldAlert, Clock, Activity, MapPin, UserX, Video, Pencil, Save, X, Trash2, Film, Play } from 'lucide-react';

// IRIS — Perimeter Intrusion (ROI-only). Live GPU inference feed (downscaled,
// smooth) + draggable ROI editor + auto event clips: a person ENTERING the ROI
// raises an intrusion alert and records a browser-playable H.264 clip (pre/post
// roll) served from the on-device service at <host>:7300.

const PERIM_BASE = `http://${typeof window !== 'undefined' ? window.location.hostname : '10.10.0.219'}:7300`;
type Severity = 'red' | 'yellow' | 'green';
interface PAlert { id: string; alertType: string; severity: Severity; title: string; description?: string; zone?: string; timestamp: string; clip?: string; }
interface Clip { name: string; url: string; start: string; duration: number; }
type Pt = [number, number];

function sevColor(s: Severity) {
  return s === 'red' ? 'text-red-400 bg-red-500/15 border-red-500/30'
    : s === 'yellow' ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
    : 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
}
function ago(iso: string) {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s/60)}m ago` : `${Math.floor(s/3600)}h ago`;
}

export function PerimeterIntrusionPage() {
  const [alerts, setAlerts] = useState<PAlert[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [playing, setPlaying] = useState<Clip | null>(null);
  const [edit, setEdit] = useState(false);
  const [zone, setZone] = useState<Pt[]>([]);
  const drag = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let dead = false;
    const poll = async () => {
      try {
        const [a, h, c] = await Promise.all([
          fetch(`${PERIM_BASE}/alerts`).then(r => r.json()),
          fetch(`${PERIM_BASE}/health`).then(r => r.json()),
          fetch(`${PERIM_BASE}/clips`).then(r => r.json()),
        ]);
        if (!dead) { setAlerts(Array.isArray(a) ? a : []); setHealth(h); setClips(Array.isArray(c) ? c : []); }
      } catch { /* warming */ }
    };
    poll(); const id = setInterval(poll, 2000);
    return () => { dead = true; clearInterval(id); };
  }, []);

  const loadZone = useCallback(async () => {
    try { const z = await fetch(`${PERIM_BASE}/zones`).then(r => r.json()); setZone((z.zone || []).map((p: number[]) => [p[0], p[1]] as Pt)); }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { loadZone(); }, [loadZone]);

  const stats = useMemo(() => ({
    intrusions: health?.intrusions ?? 0, occupancy: health?.occupancy ?? 0,
    fps: health?.fps ?? 0, live: !!health?.live, recording: !!health?.recording,
  }), [health]);

  const norm = (e: React.MouseEvent | React.PointerEvent): Pt => {
    const r = boxRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const onVideoClick = (e: React.MouseEvent) => { if (edit && drag.current === null) setZone(z => [...z, norm(e)]); };
  const onMove = (e: React.PointerEvent) => { if (edit && drag.current !== null) { const p = norm(e); setZone(z => z.map((q, i) => i === drag.current ? p : q)); } };
  const save = async () => {
    if (zone.length < 3) { setEdit(false); return; }
    await fetch(`${PERIM_BASE}/zones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone }) });
    setEdit(false);
  };

  return (
    <div className="h-full w-full overflow-auto bg-background text-foreground p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20"><Siren className="w-6 h-6 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Perimeter Intrusion</h1>
            <p className="text-sm text-muted-foreground">Live ROI intrusion detection · auto event-clips · on-device inference</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${stats.live ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-amber-400 bg-amber-500/10 border-amber-500/30'}`}>
          <span className={`w-2 h-2 rounded-full ${stats.live ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
          {stats.live ? `LIVE · ${stats.fps} fps` : 'CONNECTING'}{stats.recording ? ' · ● REC' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'In ROI now', value: stats.occupancy, icon: MapPin, c: 'text-sky-400' },
          { label: 'Intrusions', value: stats.intrusions, icon: ShieldAlert, c: 'text-red-400' },
          { label: 'Event Clips', value: clips.length, icon: Film, c: 'text-violet-400' },
          { label: 'System', value: stats.live ? 'ARMED' : '—', icon: Activity, c: 'text-emerald-400' },
        ].map(s => { const Ic = s.icon; return (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</span><Ic className={`w-4 h-4 ${s.c}`} /></div>
            <div className={`mt-2 text-2xl font-bold ${s.c}`}>{s.value}</div>
          </div>); })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-zinc-950 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-2"><Video className="w-4 h-4 text-amber-400" /> Live Inference — {health?.source?.includes('rtsp') ? 'camera' : 'perimeter-219'}</span>
            <div className="flex items-center gap-2">
              {!edit ? (
                <button onClick={() => { loadZone(); setEdit(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"><Pencil className="w-3.5 h-3.5" /> Edit ROI</button>
              ) : (
                <>
                  <button onClick={() => setZone([])} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10"><Trash2 className="w-3.5 h-3.5" /> Clear</button>
                  <button onClick={save} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"><Save className="w-3.5 h-3.5" /> Save</button>
                  <button onClick={() => { setEdit(false); loadZone(); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
          </div>
          <div ref={boxRef} onClick={onVideoClick} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}
               className="relative bg-black aspect-video select-none" style={{ cursor: edit ? 'crosshair' : 'default' }}>
            <img src={`${PERIM_BASE}/stream.mjpg`} alt="perimeter live" className="absolute inset-0 w-full h-full object-fill" draggable={false} />
            {edit && (
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
                {zone.length >= 2 && <polygon points={zone.map(p => `${p[0]},${p[1]}`).join(' ')} fill="rgba(245,158,11,0.18)" stroke="#f59e0b" strokeWidth={0.004} />}
                {zone.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={0.013} fill="#f59e0b" stroke="#fff" strokeWidth={0.003}
                    style={{ cursor: 'grab' }} onPointerDown={(e) => { e.stopPropagation(); drag.current = i; }} />
                ))}
              </svg>
            )}
            {edit && <div className="absolute bottom-2 left-2 text-[11px] text-amber-200/90 bg-black/60 rounded px-2 py-1">Click to add ROI points · drag dots to adjust · ≥3 points · Save</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2"><Siren className="w-4 h-4 text-amber-400" /><span className="text-sm font-semibold">Intrusion Alerts</span></div>
          <div className="flex-1 overflow-auto divide-y divide-white/5 max-h-[420px]">
            {alerts.length === 0 && <div className="px-4 py-6 text-sm text-muted-foreground">ROI armed — monitoring.</div>}
            {alerts.map(a => (
              <div key={a.id} className="px-4 py-3 hover:bg-white/5">
                <div className="flex items-start justify-between gap-2">
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${sevColor(a.severity)}`}>
                    {a.alertType === 'loitering' ? <UserX className="w-3 h-3" /> : a.alertType === 'clip' ? <Film className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}{a.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground inline-flex items-center gap-1"><Clock className="w-3 h-3" />{ago(a.timestamp)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground"><span className="text-foreground/80 font-medium">{a.zone}</span>{a.description ? ` — ${a.description}` : ''}
                  {a.clip && <button onClick={() => setPlaying({ name: a.clip!, url: a.clip!, start: a.timestamp, duration: 0 })} className="ml-2 text-violet-300 underline">play clip</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2"><Film className="w-4 h-4 text-violet-400" /><span className="text-sm font-semibold">Event Clips</span><span className="text-xs text-muted-foreground">({clips.length}) — auto-recorded on ROI entry</span></div>
        {clips.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No event clips yet. When a person enters the ROI a clip is recorded (with a moment before & after) and appears here.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
            {clips.map(c => (
              <button key={c.name} onClick={() => setPlaying(c)} className="group relative rounded-xl overflow-hidden border border-white/10 bg-black aspect-video">
                <video src={`${PERIM_BASE}${c.url}`} className="w-full h-full object-cover opacity-80" muted preload="metadata" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition"><Play className="w-8 h-8 text-white/90" /></div>
                <div className="absolute bottom-0 inset-x-0 px-2 py-1 text-[10px] text-white bg-black/60 flex justify-between"><span>{c.start?.slice(11) || c.name.replace('clip_','').replace('.mp4','')}</span>{c.duration ? <span>{c.duration}s</span> : null}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {playing && (
        <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-6" onClick={() => setPlaying(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2"><span className="text-sm text-white font-semibold flex items-center gap-2"><Film className="w-4 h-4 text-violet-400" /> {playing.name}</span>
              <button onClick={() => setPlaying(null)} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button></div>
            <video src={`${PERIM_BASE}${playing.url}`} className="w-full rounded-xl border border-white/10 bg-black" controls autoPlay />
          </div>
        </div>
      )}
    </div>
  );
}

export default PerimeterIntrusionPage;
