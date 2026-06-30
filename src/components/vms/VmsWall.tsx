import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Video, Grid2x2, Grid3x3, Server, ChevronDown, Check } from 'lucide-react';

// IRIS VMS — Live View. H.264 substream cameras grouped by NVR. Always-on streams
// (re-served by each node's MediaMTX, proxied through 219) with self-healing
// playback so the wall plays constantly. Pick cameras from the NVR tree on the left.

interface Cam { src: string; label: string }
interface Nvr { id: string; name: string; cams: Cam[] }
const NVRS: Nvr[] = [
  { id: '221', name: 'NVR 10.10.10.19 · node 221', cams: [
    { src: '/hls221/cam2', label: 'Camera 2' },
    { src: '/hls221/cam4', label: 'Camera 4' },
    { src: '/hls221/cam8', label: 'Camera 8' },
  ] },
  { id: '219', name: 'NVR 10.10.9.254 · node 219', cams: [
    { src: '/hls219/cam13', label: 'Camera 13' },
    { src: '/hls219/cam14', label: 'Camera 14' },
    { src: '/hls219/cam15', label: 'Camera 15' },
    { src: '/hls219/cam16', label: 'Camera 16' },
  ] },
];
const ALL = NVRS.flatMap(n => n.cams);

// Self-healing HLS tile: detects black/stalled/paused video and rebuilds the
// stream automatically, seeks to the live edge, and retries forever when the
// backend feed is briefly down — so a tile never stays black.
function Tile({ cam }: { cam: Cam }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'loading' | 'live' | 'error'>('loading');
  useEffect(() => {
    const v = ref.current; if (!v) return;
    let hls: Hls | null = null;
    let destroyed = false;
    let lastT = -1, stalled = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const seekLive = () => {
      try {
        const p = (hls as any)?.liveSyncPosition;
        if (typeof p === 'number' && isFinite(p)) v.currentTime = p;
        else if (v.buffered.length) v.currentTime = v.buffered.end(v.buffered.length - 1);
      } catch { /**/ }
    };
    const teardown = () => { try { hls?.destroy(); } catch { /**/ } hls = null; };
    const reload = (delay = 0) => {
      if (destroyed || retry) return;            // one rebuild in flight at a time
      setStatus('loading');
      retry = setTimeout(() => { retry = null; teardown(); setup(); }, delay);
    };
    const setup = () => {
      if (destroyed) return;
      const url = `${cam.src}/index.m3u8?_=${Date.now()}`;  // fresh manifest each rebuild
      if (!Hls.isSupported()) {
        if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().catch(() => {}); }
        else setStatus('error');
        return;
      }
      hls = new Hls({
        liveSyncDuration: 2, liveMaxLatencyDuration: 10,
        maxBufferLength: 6, backBufferLength: 4,
        manifestLoadingMaxRetry: 6, manifestLoadingRetryDelay: 1000, manifestLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 6, fragLoadingRetryDelay: 1000, fragLoadingTimeOut: 15000,
      });
      hls.loadSource(url); hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { stalled = 0; v.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) {
          if (d.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) { try { hls?.startLoad(); seekLive(); } catch { /**/ } }
          return;
        }
        // fatal (network 404/500/down, media, etc) -> rebuild with backoff, forever
        reload(2500);
      });
    };

    const onPlaying = () => { setStatus('live'); stalled = 0; };
    const onError = () => reload(2000);
    const onEnded = () => reload(500);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('error', onError);
    v.addEventListener('ended', onEnded);
    setup();

    // watchdog: every 3s. Frozen currentTime (regardless of paused/black) -> nudge,
    // then full rebuild if still frozen. This is the core fix for "stays black".
    const wd = setInterval(() => {
      if (destroyed || retry) return;
      const t = v.currentTime;
      if (t === lastT) stalled += 1; else { stalled = 0; if (status !== 'live') setStatus('live'); }
      lastT = t;
      if (stalled === 1) { try { hls?.startLoad(); seekLive(); v.play().catch(() => {}); } catch { /**/ } }
      else if (stalled >= 2) { stalled = 0; reload(0); }   // ~6s frozen -> rebuild
    }, 3000);

    return () => {
      destroyed = true;
      clearInterval(wd);
      if (retry) clearTimeout(retry);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('error', onError);
      v.removeEventListener('ended', onEnded);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam.src]);
  return (
    <div className="relative aspect-video bg-zinc-950 rounded-xl overflow-hidden border border-white/10">
      <video ref={ref} autoPlay muted playsInline className="w-full h-full object-cover" />
      {status !== 'live' && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
          {status === 'error' ? <span className="text-xs text-red-400/80">reconnecting…</span> : <Video className="w-7 h-7 opacity-30 animate-pulse" />}
        </div>
      )}
      <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-amber-300">{cam.label}</span>
      <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${status === 'live' ? 'bg-emerald-400 animate-pulse' : status === 'error' ? 'bg-amber-500' : 'bg-zinc-500'}`} />
    </div>
  );
}

export function VmsWall() {
  const [cols, setCols] = useState(3);
  const [sel, setSel] = useState<Set<string>>(() => new Set(ALL.map(c => c.src)));
  const [open, setOpen] = useState<Set<string>>(() => new Set(NVRS.map(n => n.id)));
  const toggle = (src: string) => setSel(s => { const n = new Set(s); n.has(src) ? n.delete(src) : n.add(src); return n; });
  const toggleNvr = (id: string) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const shown = useMemo(() => ALL.filter(c => sel.has(c.src)), [sel]);

  return (
    <div className="h-full w-full flex bg-background text-foreground">
      {/* NVR device tree */}
      <aside className="w-64 shrink-0 border-r border-white/10 bg-zinc-900/40 overflow-auto p-3">
        <div className="flex items-center gap-2 px-1 pb-3 mb-1 border-b border-white/10">
          <Video className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-semibold">Live View</span>
        </div>
        {NVRS.map(nvr => {
          const liveCount = nvr.cams.filter(c => sel.has(c.src)).length;
          return (
            <div key={nvr.id} className="mb-2">
              <button onClick={() => toggleNvr(nvr.id)} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 text-left">
                <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open.has(nvr.id) ? '' : '-rotate-90'}`} />
                <Server className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold flex-1 truncate">{nvr.name}</span>
                <span className="text-[10px] text-emerald-400">{liveCount}/{nvr.cams.length}</span>
              </button>
              {open.has(nvr.id) && (
                <div className="ml-5 mt-0.5 flex flex-col gap-0.5">
                  {nvr.cams.map(c => {
                    const on = sel.has(c.src);
                    return (
                      <button key={c.src} onClick={() => toggle(c.src)} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs ${on ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-400 hover:bg-white/5'}`}>
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${on ? 'bg-amber-500 border-amber-500' : 'border-white/20'}`}>{on && <Check className="w-2.5 h-2.5 text-black" />}</span>
                        <Video className="w-3 h-3 shrink-0" />
                        <span className="flex-1 truncate">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </aside>

      {/* Player grid */}
      <main className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Live View</h1>
            <p className="text-xs text-muted-foreground">{shown.length} playing · {ALL.length} cameras · 2 NVRs</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-400 font-semibold mr-1">● LIVE</span>
            <button onClick={() => setCols(2)} className={`p-1.5 rounded-lg border ${cols === 2 ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'border-white/10 text-zinc-400'}`}><Grid2x2 className="w-4 h-4" /></button>
            <button onClick={() => setCols(3)} className={`p-1.5 rounded-lg border ${cols === 3 ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'border-white/10 text-zinc-400'}`}><Grid3x3 className="w-4 h-4" /></button>
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-zinc-600">Select cameras from the NVR list to play.</div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {shown.map(c => <Tile key={c.src} cam={c} />)}
          </div>
        )}
      </main>
    </div>
  );
}
export default VmsWall;
