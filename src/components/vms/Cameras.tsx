import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Search, RefreshCw, MapPin, Circle, Maximize2 } from 'lucide-react';
import { HlsPlayer } from '@irisdrone/components/vms/HlsPlayer';
import { useVmsCameras, hlsUrl } from './useVmsCameras';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// MagicBox-style camera management — a grid of camera tiles with live HLS
// preview, status and location, wired to our /api/camera-health.
export function VmsCameras() {
  const navigate = useNavigate();
  const { cameras, loading, reload } = useVmsCameras();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return cameras;
    return cameras.filter((c) => `${c.name} ${c.location}`.toLowerCase().includes(t));
  }, [cameras, q]);

  const online = cameras.filter((c) => c.status === 'online').length;

  return (
    <div className="flex h-full w-full flex-1 flex-col gap-4 p-4 text-foreground overflow-y-auto">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Cameras</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {loading ? 'Loading…' : `${cameras.length} cameras · ${online} online`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cameras, locations…"
              className="h-9 w-64 rounded-lg border border-border bg-card pl-8 pr-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={reload} title="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((c) => (
          <div key={c.id}
            className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40">
            <div className="relative aspect-video bg-muted">
              {c.status === 'online' ? (
                <HlsPlayer src={hlsUrl(c.id)} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Camera className="h-7 w-7 opacity-40" />
                  <span className="text-[11px] uppercase tracking-widest">Offline</span>
                </div>
              )}
              <button onClick={() => navigate('/vms/liveview')}
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg border border-border bg-background/80 text-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
                title="Open in live wall">
                <Maximize2 className="h-4 w-4" />
              </button>
              <span className={cn('absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur',
                c.status === 'online' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-500/15 text-zinc-400')}>
                <Circle className={cn('h-2 w-2 fill-current', c.status === 'online' && 'animate-pulse')} />
                {c.status}
              </span>
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-semibold">{c.name}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{c.location || 'Unassigned'}</span>
              </div>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full grid place-items-center py-16 text-muted-foreground">
            <Camera className="h-8 w-8 opacity-40" />
            <p className="mt-2 text-sm">No cameras match “{q}”.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default VmsCameras;
