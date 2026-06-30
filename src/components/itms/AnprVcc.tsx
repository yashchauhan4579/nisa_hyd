import { useCallback, useEffect, useRef, useState } from 'react';
import { Car, ScanLine, Plus, Play, Square, Trash2, Camera, RefreshCw, Gauge, Cpu } from 'lucide-react';

// IRIS · ITMS — ANPR & VCC. Self-contained module wired DIRECTLY to the local
// ANPR engine on 219 (FastAPI :8003, proxied as /itmsapi). Real data only — no
// mock layer. Shows just two things the operator asked for: number-plate reads
// (ANPR) and vehicle classification / counts (VCC). Cameras are plug-and-play:
// add an RTSP source here and the worker starts processing it.

const API = '/itmsapi';

interface Read {
  id: number;
  camera_id: number;
  plate_number?: string | null;
  plateNumber?: string | null;
  confidence?: number;
  timestamp: string;
  violationType?: string;
  plateImageUrl?: string;
  snapshotUrl?: string;
  vehicle_image?: string;
}
interface Cam { id: number; name: string; rtsp_url: string; is_active?: boolean; status?: string; }
interface Counts { active_cameras: number; today_violations: number; pending_reviews: number; system_status: string; }

async function jget(path: string) {
  const r = await fetch(API + path, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
// the ANPR engine guards mutations (add/start/stop/delete) with a bearer token;
// reads are public. Log in once with the box's local operator account.
let TOKEN = '';
async function ensureToken() {
  if (TOKEN) return TOKEN;
  try {
    const r = await fetch(API + '/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    if (r.ok) TOKEN = (await r.json()).access_token || '';
  } catch { /**/ }
  return TOKEN;
}
async function jmut(path: string, method: string, body?: unknown) {
  const t = await ensureToken();
  return fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const plateOf = (r: Read) => r.plateNumber || r.plate_number || '';
const timeFmt = (t: string) => { try { return new Date(t).toLocaleTimeString(); } catch { return t; } };

export function AnprVcc() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [reads, setReads] = useState<Read[]>([]);
  const [cams, setCams] = useState<Cam[]>([]);
  const [name, setName] = useState('');
  const [rtsp, setRtsp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [c, v, cam] = await Promise.all([
        jget('/api/counts'),
        jget('/api/violations?page=1&page_size=60'),
        jget('/api/cameras'),
      ]);
      setCounts(c);
      setReads((v.violations || []).filter((x: Read) => plateOf(x)));
      setCams(Array.isArray(cam) ? cam : []);
      setErr('');
    } catch {
      setErr('engine unreachable');
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = window.setInterval(load, 4000);
    return () => window.clearInterval(timer.current);
  }, [load]);

  const addCam = async () => {
    if (!name.trim() || !rtsp.trim()) return;
    setBusy(true);
    try {
      const r = await jmut('/api/cameras', 'POST', { name: name.trim(), rtsp_url: rtsp.trim() });
      if (!r.ok) setErr('add failed (' + r.status + ')');
      setName(''); setRtsp('');
      await load();
    } catch { setErr('add failed'); }
    setBusy(false);
  };
  const camAction = async (id: number, action: 'start' | 'stop') => {
    try { await jmut(`/api/cameras/${id}/${action}`, 'POST'); } catch { /**/ }
    load();
  };
  const delCam = async (id: number) => {
    try { await jmut(`/api/cameras/${id}`, 'DELETE'); } catch { /**/ }
    load();
  };

  const detections = counts?.today_violations ?? 0;
  const activeCams = counts?.active_cameras ?? 0;
  const online = counts?.system_status === 'online';

  return (
    <div className="h-full w-full overflow-auto bg-background text-foreground">
      {/* header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-white/10 bg-zinc-900/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/30 to-violet-500/20 border border-amber-400/30 flex items-center justify-center">
            <Car className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="text-[10px] tracking-[2px] text-violet-300/80 uppercase">IRIS · ITMS</div>
            <div className="text-base font-bold leading-none">ANPR &amp; VCC</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${online ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500'}`} />
            {err ? 'reconnecting…' : online ? 'ENGINE LIVE' : 'starting…'}
          </span>
          <button onClick={load} className="p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* stat cards */}
        <div className="grid grid-cols-4 gap-3">
          <Stat icon={<Camera className="w-4 h-4" />} n={activeCams} l="Active Cameras" tone="violet" />
          <Stat icon={<Car className="w-4 h-4" />} n={detections} l="Detections Today" tone="amber" />
          <Stat icon={<ScanLine className="w-4 h-4" />} n={reads.length} l="Plate Reads" tone="emerald" />
          <Stat icon={<Cpu className="w-4 h-4" />} n={online ? 'On' : '—'} l="Engine (219)" tone="violet" />
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* ANPR — plate reads */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <ScanLine className="w-4 h-4 text-amber-300" />
              <h2 className="text-sm font-bold">ANPR · Number Plate Reads</h2>
              <span className="text-[10px] text-zinc-500">{reads.length} shown</span>
            </div>
            {reads.length === 0 ? (
              <Empty msg="No plate reads yet. Add a camera that sees vehicles → reads appear here live." />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {reads.map((r) => (
                  <div key={r.id} className="flex gap-3 p-2.5 rounded-xl bg-zinc-900/50 border border-white/10">
                    <div className="w-24 h-16 rounded-lg bg-black/60 overflow-hidden shrink-0 flex items-center justify-center">
                      {r.plateImageUrl
                        ? <img src={API + r.plateImageUrl} className="w-full h-full object-cover" />
                        : <Car className="w-6 h-6 text-zinc-700" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono font-bold text-amber-300 tracking-wider truncate">{plateOf(r)}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">Cam {r.camera_id} · {timeFmt(r.timestamp)}</div>
                      {typeof r.confidence === 'number' && r.confidence > 0 && (
                        <div className="text-[10px] text-violet-300 mt-1">{Math.round(r.confidence * 100)}% conf</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* VCC + camera manager */}
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2"><Gauge className="w-4 h-4 text-violet-300" /><h2 className="text-sm font-bold">VCC · Vehicle Counts</h2></div>
              <div className="rounded-xl bg-zinc-900/50 border border-white/10 p-3 space-y-2">
                <Row k="Total detections (today)" v={detections} />
                <Row k="Plate reads captured" v={reads.length} />
                <Row k="Active cameras" v={activeCams} />
                {cams.length > 0 && <div className="pt-1 border-t border-white/10 mt-1" />}
                {cams.map((c) => (
                  <Row key={c.id} k={`↳ ${c.name}`} v={reads.filter((r) => r.camera_id === c.id).length} sub />
                ))}
              </div>
            </div>

            {/* plug-and-play camera onboarding */}
            <div>
              <div className="flex items-center gap-2 mb-2"><Plus className="w-4 h-4 text-emerald-300" /><h2 className="text-sm font-bold">Cameras · Plug &amp; Play</h2></div>
              <div className="rounded-xl bg-zinc-900/50 border border-white/10 p-3 space-y-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Camera name (e.g. Gate-1)"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400/50" />
                <input value={rtsp} onChange={(e) => setRtsp(e.target.value)} placeholder="rtsp://user:pass@ip:554/..."
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-amber-400/50" />
                <button onClick={addCam} disabled={busy || !name || !rtsp}
                  className="w-full flex items-center justify-center gap-1.5 bg-amber-500/90 hover:bg-amber-500 disabled:opacity-40 text-black text-xs font-bold rounded-lg py-1.5">
                  <Plus className="w-3.5 h-3.5" /> {busy ? 'Adding…' : 'Add Camera'}
                </button>
                {err && <div className="text-[10px] text-red-400">{err}</div>}

                {cams.length === 0 ? (
                  <div className="text-[11px] text-zinc-500 pt-1">No cameras yet. Add an RTSP source above to start ANPR/VCC.</div>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {cams.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-xs bg-black/30 rounded-lg px-2 py-1.5">
                        <Camera className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="flex-1 truncate">{c.name}</span>
                        <button onClick={() => camAction(c.id, 'start')} title="Start" className="p-1 text-emerald-400 hover:bg-white/10 rounded"><Play className="w-3.5 h-3.5" /></button>
                        <button onClick={() => camAction(c.id, 'stop')} title="Stop" className="p-1 text-amber-400 hover:bg-white/10 rounded"><Square className="w-3.5 h-3.5" /></button>
                        <button onClick={() => delCam(c.id)} title="Delete" className="p-1 text-red-400 hover:bg-white/10 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, n, l, tone }: { icon: React.ReactNode; n: React.ReactNode; l: string; tone: 'violet' | 'amber' | 'emerald' }) {
  const tones: Record<string, string> = {
    violet: 'from-violet-500/15 border-violet-400/30 text-violet-200',
    amber: 'from-amber-500/15 border-amber-400/30 text-amber-200',
    emerald: 'from-emerald-500/15 border-emerald-400/30 text-emerald-200',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-b ${tones[tone]} to-transparent border p-3`}>
      <div className="flex items-center gap-1.5 opacity-80">{icon}<span className="text-[9.5px] uppercase tracking-wide">{l}</span></div>
      <div className="text-2xl font-extrabold text-white mt-1.5 leading-none">{n}</div>
    </div>
  );
}
function Row({ k, v, sub }: { k: string; v: React.ReactNode; sub?: boolean }) {
  return <div className={`flex items-center justify-between ${sub ? 'text-[11px] text-zinc-400' : 'text-xs'}`}><span className="truncate">{k}</span><span className="font-bold text-white tabular-nums">{v}</span></div>;
}
function Empty({ msg }: { msg: string }) {
  return <div className="h-40 flex items-center justify-center text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-xl px-6">{msg}</div>;
}

export default AnprVcc;
