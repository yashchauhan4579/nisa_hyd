import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api';
import { BrainCircuit, ScanSearch, ArrowRight, Wifi, WifiOff, Database } from 'lucide-react';

// Status cards for the two AI sidecars (CLIP search :8200 via /searchapi,
// forensics :8010 via /forensicsapi). Probes degrade gracefully — a dead
// sidecar shows an OFFLINE card, never throws. Reused by the Reports page
// via useSidecarStatus().

export interface SearchStatus {
  state: 'online' | 'offline' | 'mock';
  status?: string;
  indexed?: number;
  total?: number;
  cameraNames?: string[];
  cameras?: { name: string; status: string; frames?: number }[];
}

export interface ForensicsStatus {
  state: 'online' | 'degraded' | 'offline';
  liveTotal?: number;
  totalMoments?: number;
  totalAlerts?: number;
  cameras?: number;
  cameraNames?: string[];
  busiest?: string | null;
  videos?: number;
}

const USE_MOCK = String(import.meta.env.VITE_USE_MOCK ?? 'true') === 'true';

export function useSidecarStatus(pollMs = 15000) {
  const [search, setSearch] = useState<SearchStatus>({ state: 'offline' });
  const [forensics, setForensics] = useState<ForensicsStatus>({ state: 'offline' });

  const probe = useCallback(async () => {
    // CLIP search — /searchapi/videos carries cameras + index state.
    try {
      if (USE_MOCK) {
        setSearch({ state: 'mock', status: 'ready', indexed: 2, total: 2, cameraNames: ['Benz Circle', 'MG Road'] });
      } else {
        const res = await apiClient.getSearchCameras();
        setSearch({
          state: 'online',
          status: (res as any).status,
          indexed: (res as any).indexed,
          total: (res as any).total,
          cameraNames: (res.cameras || []).map((c: any) => c.name).slice(0, 6),
          cameras: (res.cameras || []).slice(0, 8).map((c: any) => ({ name: c.name, status: c.status, frames: c.frames })),
        });
      }
    } catch { setSearch({ state: 'offline' }); }

    // Forensics — deployed adapter has /overview; the local sidecar only /videos.
    try {
      if (USE_MOCK) {
        setForensics({ state: 'degraded', videos: 2 });
      } else {
        const ov = await fetch('/forensicsapi/overview');
        if (ov.ok) {
          const d = await ov.json();
          setForensics({
            state: 'online',
            liveTotal: d.live_total ?? d.liveTotal,
            totalMoments: d.total_moments ?? d.totalMoments,
            totalAlerts: d.total_alerts ?? d.totalAlerts,
            cameras: Array.isArray(d.cameras) ? d.cameras.length : d.cameras,
            cameraNames: Array.isArray(d.cameras) ? d.cameras.slice(0, 8) : [],
            busiest: d.busiest ?? null,
          });
        } else {
          const vids = await fetch('/forensicsapi/videos');
          if (vids.ok) {
            const v = await vids.json();
            setForensics({ state: 'degraded', videos: Array.isArray(v?.videos) ? v.videos.length : Array.isArray(v) ? v.length : 0 });
          } else setForensics({ state: 'offline' });
        }
      }
    } catch { setForensics({ state: 'offline' }); }
  }, []);

  useEffect(() => {
    probe();
    const id = setInterval(probe, pollMs);
    return () => clearInterval(id);
  }, [probe, pollMs]);

  return { search, forensics };
}

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok ? 'bg-emerald-500' : warn ? 'bg-amber-400' : 'bg-red-500';
  return (
    <span className="relative flex h-2.5 w-2.5">
      {ok && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
      <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">{label}</span>
      <div className="text-lg font-mono font-bold mt-0.5 text-zinc-100 tabular-nums">{value}</div>
    </div>
  );
}

export function SidecarSummary() {
  const navigate = useNavigate();
  const { search, forensics } = useSidecarStatus();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* IRIS Search (CLIP) */}
      <div className="rounded-xl border border-white/5 bg-zinc-900/30 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/25 grid place-items-center"><BrainCircuit className="w-4.5 h-4.5 text-amber-300" /></div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">IRIS Search</p>
              <p className="text-[10px] text-zinc-500 font-mono">CLIP semantic video search · :8200</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot ok={search.state === 'online'} warn={search.state === 'mock'} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${search.state === 'online' ? 'text-emerald-400' : search.state === 'mock' ? 'text-amber-300' : 'text-red-400'}`}>
              {search.state === 'mock' ? 'mock' : search.state}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {search.state === 'offline' ? (
            <div className="flex items-center gap-3 text-zinc-500 text-sm py-3"><WifiOff className="w-4 h-4 text-red-400/70" />Search sidecar unreachable — service may be down on this host.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Status" value={search.status ?? '—'} />
              <Metric label="Indexed" value={search.indexed ?? 0} />
              <Metric label="Cameras" value={search.total ?? 0} />
            </div>
          )}
          {search.cameras && search.cameras.length > 0 && (
            <div className="space-y-1">
              {search.cameras.map((c) => (
                <div key={c.name} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.status === 'ready' ? 'bg-emerald-500' : c.status === 'indexing' ? 'bg-amber-400 animate-pulse' : c.status === 'error' ? 'bg-red-500' : 'bg-zinc-600'}`} />
                  <span className="text-zinc-300 font-mono truncate flex-1">{c.name}</span>
                  <span className="text-[9px] uppercase tracking-wider text-zinc-500">{c.status}</span>
                  {typeof c.frames === 'number' && c.frames > 0 && <span className="text-[9px] text-zinc-600 font-mono tabular-nums">{c.frames.toLocaleString()} frames</span>}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => navigate('/search')}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25 transition-colors">
            Open IRIS Search <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* IRIS Observer */}
      <div className="rounded-xl border border-white/5 bg-zinc-900/30 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/25 grid place-items-center"><ScanSearch className="w-4.5 h-4.5 text-amber-300" /></div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">IRIS Observer</p>
              <p className="text-[10px] text-zinc-500 font-mono">frame-by-frame crowd AI · :8010</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot ok={forensics.state === 'online'} warn={forensics.state === 'degraded'} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${forensics.state === 'online' ? 'text-emerald-400' : forensics.state === 'degraded' ? 'text-amber-300' : 'text-red-400'}`}>
              {forensics.state}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {forensics.state === 'offline' ? (
            <div className="flex items-center gap-3 text-zinc-500 text-sm py-3"><WifiOff className="w-4 h-4 text-red-400/70" />Observer sidecar unreachable — service may be down on this host.</div>
          ) : forensics.state === 'degraded' ? (
            <div className="flex items-center gap-3 text-zinc-400 text-sm py-1"><Database className="w-4 h-4 text-amber-300/70" />{forensics.videos ?? 0} source video{(forensics.videos ?? 0) === 1 ? '' : 's'} loaded · analysis stats unavailable on this host.</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Live people" value={forensics.liveTotal ?? 0} />
                <Metric label="Moments" value={forensics.totalMoments ?? 0} />
                <Metric label="Alerts" value={forensics.totalAlerts ?? 0} />
              </div>
              {forensics.cameraNames && forensics.cameraNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {forensics.cameraNames.map((cam) => (
                    <span key={cam} className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${cam === forensics.busiest ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-white/10 bg-white/[0.03] text-zinc-400'}`}>
                      {cam}{cam === forensics.busiest ? ' · busiest' : ''}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <button onClick={() => navigate('/forensics')}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25 transition-colors">
            Open IRIS Observer <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="lg:col-span-2 text-[10px] text-zinc-600 flex items-center gap-1.5"><Wifi className="w-3 h-3" />Probed every 15 s through the Vite proxies (/searchapi, /forensicsapi). Cards degrade to OFFLINE when a sidecar is unreachable.</p>
    </div>
  );
}

export default SidecarSummary;
