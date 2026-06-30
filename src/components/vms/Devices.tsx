import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Search, RefreshCw, Camera, Circle, MapPin, Wifi, Clock, Maximize2, Server, Activity,
} from 'lucide-react';
import { HlsPlayer } from '@irisdrone/components/vms/HlsPlayer';
import { hlsUrl } from './useVmsCameras';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const token = () => localStorage.getItem('token') || localStorage.getItem('iris_token');

interface DeviceRow {
  id: string; name: string; location: string; status: string;
  ip: string; latencyMs?: number; lastPing?: string;
}

// Hub-style device/camera management — searchable device list + a detail panel
// with a live preview and metadata. Wired to our /api/camera-health.
export function VmsDevices() {
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/camera-health', { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
      if (res.ok) {
        const data: Array<Record<string, any>> = await res.json();
        setRows(data.map((c) => ({
          id: c.deviceId ?? c.id ?? c.cameraId ?? '',
          name: c.name ?? c.cameraId ?? c.deviceId ?? c.id ?? 'Camera',
          location: c.location ?? '',
          status: c.status ?? 'offline',
          ip: c.id ?? c.ip ?? c.host ?? '—',
          latencyMs: c.latencyMs, lastPing: c.lastPing,
        })));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => `${r.name} ${r.location} ${r.ip}`.toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  useEffect(() => {
    if (!selectedId && filtered.length) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = rows.find((r) => r.id === selectedId) || null;
  const online = rows.filter((r) => r.status === 'online' || r.status === 'active').length;
  const isUp = (s: string) => s === 'online' || s === 'active';

  return (
    <div className="flex h-full w-full flex-1 flex-col gap-4 p-4 text-foreground lg:flex-row">
      {/* device list */}
      <aside className="flex w-full flex-col rounded-2xl border border-border bg-card shadow-sm lg:w-[26rem]">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Devices</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loading ? 'Loading…' : `${rows.length} devices · ${online} online`}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={load} title="Refresh">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search devices, IP, location…"
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map((r) => (
            <button key={r.id} onClick={() => setSelectedId(r.id)}
              className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                selectedId === r.id ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted')}>
              <Circle className={cn('h-2.5 w-2.5 shrink-0 fill-current', isUp(r.status) ? 'text-emerald-400' : 'text-zinc-600')} />
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-background">
                <Camera className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{r.ip} · {r.location || 'Unassigned'}</div>
              </div>
              {typeof r.latencyMs === 'number' && (
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{r.latencyMs}ms</span>
              )}
            </button>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="grid place-items-center py-12 text-muted-foreground">
              <Server className="h-7 w-7 opacity-40" /><p className="mt-2 text-sm">No devices match “{q}”.</p>
            </div>
          )}
        </div>
      </aside>

      {/* detail */}
      <section className="flex flex-1 flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h2 className="text-base font-semibold">{selected.name}</h2>
                <p className="text-xs text-muted-foreground">{selected.location || 'Unassigned'}</p>
              </div>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                isUp(selected.status) ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-500/15 text-zinc-400')}>
                <Circle className={cn('h-2 w-2 fill-current', isUp(selected.status) && 'animate-pulse')} />
                {isUp(selected.status) ? 'online' : 'offline'}
              </span>
            </div>
            <div className="grid flex-1 grid-rows-[1fr_auto] gap-4 p-4">
              <div className="relative overflow-hidden rounded-xl border border-border bg-black">
                {isUp(selected.status)
                  ? <HlsPlayer src={hlsUrl(selected.id)} className="h-full w-full object-cover" />
                  : <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Camera className="h-8 w-8 opacity-40" /><span className="text-xs uppercase tracking-widest">Offline</span>
                    </div>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: Wifi, label: 'Host / IP', value: selected.ip },
                  { icon: MapPin, label: 'Location', value: selected.location || '—' },
                  { icon: Activity, label: 'Latency', value: typeof selected.latencyMs === 'number' ? `${selected.latencyMs} ms` : '—' },
                  { icon: Clock, label: 'Last ping', value: selected.lastPing ? new Date(selected.lastPing).toLocaleTimeString() : '—' },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <m.icon className="h-3 w-3" /> {m.label}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold">{m.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Maximize2 className="h-9 w-9 opacity-30" /><p>Select a device to inspect</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default VmsDevices;
