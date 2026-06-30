import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search, SlidersHorizontal, Play, Pause, X, Sparkles, Loader2,
  LayoutGrid, Gauge, Filter, ChevronLeft, ChevronRight, Video, Plus, Trash2,
  Check, List, MapPin, Upload, FileVideo, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { apiClient, type SearchResult, type SearchClip, type SearchCamera, type Device } from '@/lib/api';
import { CameraMapPicker, type MapCamera } from '@/components/maps/CameraMapPicker';
import { SmoothImg } from '@/components/ui/smooth-img';
import { staggerContainer, fadeUp, spring } from '@/components/premium';

const ACCENT = 'var(--brand-accent)';

// CLIP models exposed by the indexer (Atom/poc/indexer.py registry).
// ViT-B/32 is first because it's the model the saved index + cached weights use
// on this CPU-only host; the larger models require (re)indexing + GPU.
const MODELS = [
  { key: 'ViT-B-32', label: 'ViT-B/32 (indexed · fast)' },
  { key: 'ViT-SO400M-14-SigLIP2', label: 'SigLIP2 SO400M (needs GPU/index)' },
  { key: 'ViT-H-14-quickgelu', label: 'ViT-H/14 DFN5B (needs GPU/index)' },
  { key: 'ViT-L-14', label: 'ViT-L/14 (needs GPU/index)' },
];

const SUGGESTIONS = [
  'person crossing the street',
  'white car at the intersection',
  'motorcycle without helmet',
  'crowd gathering near the gate',
  'auto rickshaw in the wrong lane',
];

function scoreColor(score: number) {
  const pct = score * 100;
  if (pct >= 26) return '#22c55e';
  if (pct >= 23) return '#eab308';
  return '#ef4444';
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [model, setModel] = useState(MODELS[0].key);
  const [fps, setFps] = useState(2);
  const [topK, setTopK] = useState(24);
  // 0 by default — an unfiltered search returns everything (up to topK);
  // raise the slider to filter down.
  const [minScore, setMinScore] = useState(0);
  const [columns, setColumns] = useState(4);
  const [nms, setNms] = useState(true);
  const [nmsWindow, setNmsWindow] = useState(2);
  const [dedup, setDedup] = useState(true);
  // Advanced tuning lives behind the settings (sliders) button; keep search plain by default.
  const [railOpen, setRailOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hidden, setHidden] = useState(0);
  const [searched, setSearched] = useState(false);
  const [active, setActive] = useState<SearchResult | null>(null);
  const reduce = useReducedMotion();

  // Camera + time filters (next to the Search button). Camera is sent to the
  // indexer (deviceIds); time is applied client-side over the epoch timestamps.
  const [camIds, setCamIds] = useState<string[]>([]); // empty = all cameras
  const [timeFilter, setTimeFilter] = useState<string>('any');
  const [camPickerOpen, setCamPickerOpen] = useState(false);
  const [camMode, setCamMode] = useState<'list' | 'map'>('list');
  const [devices, setDevices] = useState<Device[]>([]);

  // Inference cameras (what the CLIP engine indexes). Managed inline here so it's
  // reachable from the search page itself, not only global Settings.
  const [cams, setCams] = useState<SearchCamera[]>([]);
  const [camName, setCamName] = useState('');
  const [camSrc, setCamSrc] = useState('');
  const [camBusy, setCamBusy] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [addCamOpen, setAddCamOpen] = useState(false); // "Add a live camera" modal (hero)

  // Upload-a-video-to-search flow (popup + indexing progress).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [upOpen, setUpOpen] = useState(false);
  const [upPhase, setUpPhase] = useState<'uploading' | 'indexing' | 'ready' | 'error'>('uploading');
  const [upPct, setUpPct] = useState(0);
  const [upName, setUpName] = useState('');
  const [upId, setUpId] = useState('');
  const [upErr, setUpErr] = useState('');
  // Confirmation toast on the search page after a clip is selected for search.
  const [selToast, setSelToast] = useState<string | null>(null);
  useEffect(() => {
    if (!selToast) return;
    const t = setTimeout(() => setSelToast(null), 6000);
    return () => clearTimeout(t);
  }, [selToast]);

  const loadCams = useCallback(async () => {
    try { setCams((await apiClient.getSearchCameras()).cameras || []); } catch { /* offline */ }
  }, []);
  useEffect(() => {
    loadCams();
    const t = setInterval(loadCams, 5000);
    return () => clearInterval(t);
  }, [loadCams]);

  // Device coords (to plot search cameras on the map; correlated by id).
  useEffect(() => {
    (async () => {
      try { setDevices((await apiClient.getDevices({ type: 'CAMERA' })) as Device[]); } catch { /* offline */ }
    })();
  }, []);

  const addCam = async (): Promise<boolean> => {
    if (!camSrc.trim()) { setCamErr('Stream URL or file path required'); return false; }
    setCamBusy(true); setCamErr('');
    let ok = false;
    try {
      await apiClient.addSearchCamera({ name: camName.trim() || camSrc.trim(), source: camSrc.trim() });
      setCamName(''); setCamSrc(''); await loadCams(); ok = true;
    } catch (e) { setCamErr(e instanceof Error ? e.message : 'Failed to add'); }
    finally { setCamBusy(false); }
    return ok;
  };
  // Hero "Add a live camera" modal submit — close on success, keep open on error.
  const submitAddCam = async () => { if (await addCam()) setAddCamOpen(false); };
  const removeCam = async (id: string) => {
    setCamBusy(true);
    try { await apiClient.removeSearchCamera(id); await loadCams(); } catch { /* noop */ }
    finally { setCamBusy(false); }
  };
  // Pause a live camera (stop recording new segments, keep its indexed data) or
  // resume it. Pausing maps from a non-paused live cam; resume from a paused one.
  const toggleCamPause = async (c: SearchCamera) => {
    setCamBusy(true);
    try { await apiClient.setSearchCameraPaused(c.id, c.status !== 'paused'); await loadCams(); }
    catch { /* noop */ } finally { setCamBusy(false); }
  };

  const onUploadFile = async (file: File | null) => {
    if (!file) return;
    setUpOpen(true); setUpPhase('uploading'); setUpPct(0); setUpErr(''); setUpId('');
    setUpName(file.name);
    try {
      const cam = await apiClient.uploadSearchVideo(file, file.name.replace(/\.[^.]+$/, ''), setUpPct);
      setUpId(cam.id); setUpName(cam.name); setUpPhase('indexing');
      await loadCams();
    } catch (e) {
      setUpErr(e instanceof Error ? e.message : 'Upload failed'); setUpPhase('error');
    }
  };
  const pickFile = () => fileInputRef.current?.click();
  // Watch the polled camera list; flip the popup to ready/error when indexing ends.
  useEffect(() => {
    if (upPhase !== 'indexing' || !upId) return;
    const c = cams.find((x) => x.id === upId);
    if (!c) return;
    if (c.status === 'ready') setUpPhase('ready');
    else if (c.status === 'error') { setUpErr(c.error || 'Indexing failed'); setUpPhase('error'); }
  }, [cams, upPhase, upId]);
  // Operator clicks "Search this video" → scope to the uploaded clip, close the
  // upload popup, and raise a confirmation toast on the search page itself.
  const searchUploaded = () => {
    if (upId) setCamIds([upId]);
    setUpOpen(false);
    setSelToast(upName || 'Uploaded video');
    if (query.trim()) runSearch(query);
  };

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await apiClient.search({
        query: q, model, fps, topK,
        minScore: minScore / 100,
        nms, nmsWindow, dedup,
        deviceIds: camIds.length ? camIds : undefined,
      });
      setResults(res.results);
      setHidden(res.hidden);
    } catch {
      setResults([]);
      setHidden(0);
    } finally {
      setLoading(false);
    }
  }, [model, fps, topK, minScore, nms, nmsWindow, dedup, camIds]);

  // Time presets → hours. Applied client-side; only when timestamps look like
  // absolute epochs (live-indexed footage), so relative-timestamp indexes aren't
  // silently emptied.
  const TIME_PRESETS: { k: string; label: string; hours: number }[] = [
    { k: 'any', label: 'Any time', hours: 0 },
    { k: '1h', label: 'Last 1 hour', hours: 1 },
    { k: '6h', label: 'Last 6 hours', hours: 6 },
    { k: '24h', label: 'Last 24 hours', hours: 24 },
    { k: '7d', label: 'Last 7 days', hours: 168 },
  ];
  // An uploaded clip's camera id → its upload epoch (parsed from the saved
  // filename "<epoch>_name.ext"). Lets the time filter judge upload results by
  // WHEN they were uploaded, not by their (relative) in-clip frame timestamp.
  const uploadTimeById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cams) {
      const isUp = c.kind === 'upload' || c.id.startsWith('UP-') || (c.source || '').includes('/uploads/');
      if (!isUp) continue;
      const mt = (c.source || '').match(/\/(\d{9,})_/);
      if (mt) m.set(c.id, Number(mt[1]));
    }
    return m;
  }, [cams]);

  const view = useMemo(() => {
    let rs = results;
    if (camIds.length) rs = rs.filter((r) => camIds.includes(r.deviceId));
    const preset = TIME_PRESETS.find((p) => p.k === timeFilter);
    if (preset && preset.hours > 0) {
      const cutoff = Date.now() / 1000 - preset.hours * 3600;
      rs = rs.filter((r) => {
        const up = uploadTimeById.get(r.deviceId);
        if (up != null) return up >= cutoff;                                  // uploads: by upload time
        return r.timestamp > 1_000_000_000 ? r.timestamp >= cutoff : true;    // live cams: by epoch frame time
      });
    }
    // Always rank by confidence, highest first — for live/RTSP cameras AND
    // uploaded clips alike (both carry the same semantic `score`).
    return [...rs].sort((a, b) => b.score - a.score);
  }, [results, camIds, timeFilter, uploadTimeById]);

  // Search cameras plotted on the map: correlate to a Device (by id, then name) for coords.
  const camMapCams: MapCamera[] = useMemo(() => {
    const byId = new Map(devices.map((d) => [d.id, d]));
    const byName = new Map(devices.map((d) => [(d.name || '').toLowerCase(), d]));
    return cams.map((c) => {
      const d = byId.get(c.id) || byName.get((c.name || '').toLowerCase());
      return { id: c.id, name: c.name, lat: d?.lat ?? NaN, lng: d?.lng ?? NaN, status: c.status };
    });
  }, [cams, devices]);
  const toggleCam = (id: string) =>
    setCamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const isUploadCam = (c: SearchCamera) =>
    c.kind === 'upload' || c.id.startsWith('UP-') || (c.source || '').includes('/uploads/');
  // Friendly display label: live/paused streams become "Live Camera N" (sorted) —
  // shared by the filter picker AND the management drawer so naming is consistent
  // and credentialed RTSP URLs never show as a raw name. Uploads/static keep theirs.
  const liveLabelById = useMemo(() => {
    const m = new Map<string, string>();
    cams
      .filter((c) => !isUploadCam(c) && (c.status === 'live' || c.status === 'paused' || c.kind === 'live'))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .forEach((c, i) => m.set(c.id, `Live Camera ${i + 1}`));
    return m;
  }, [cams]);
  const camLabel = (c: SearchCamera) => liveLabelById.get(c.id) || c.name;
  // Picker list: live/paused streams shown as "Live Camera N" + uploads (badge);
  // the redundant static cam219_chX test clips are folded out.
  const pickerCams = useMemo(() => {
    const uploads = cams.filter(isUploadCam);
    const live = cams
      .filter((c) => liveLabelById.has(c.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((c) => ({ cam: c, label: liveLabelById.get(c.id) as string }));
    const out = [...live, ...uploads.map((u) => ({ cam: u, label: u.name }))];
    // Never show an empty picker when cameras exist (e.g. no live stream yet).
    return out.length === 0 && cams.length ? cams.map((c) => ({ cam: c, label: c.name })) : out;
  }, [cams, liveLabelById]);

  // ── Reusable pieces (Google-style pill bar + filter chips + suggestions) ──
  const pillBar = (hero: boolean) => (
    <div className="flex items-center gap-2 w-full">
      <div className={`relative flex-1 flex items-center gap-3 rounded-full border border-white/10 bg-zinc-900/70
                       ${hero ? 'px-6 py-3.5 shadow-[0_2px_24px_rgba(0,0,0,0.4)]' : 'px-5 py-2.5 shadow-md'}
                       focus-within:border-amber-500/50 focus-within:ring-2 focus-within:ring-amber-500/20 transition`}>
        <Search className={`${hero ? 'h-5 w-5' : 'h-4 w-4'} text-zinc-500 shrink-0`} />
        <input
          value={query}
          autoFocus={hero}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch(query)}
          placeholder='Describe what to find — e.g. "white car at the intersection"'
          // pill shows the focus ring (focus-within); suppress the input's own
          // box-shadow so the cyberpunk theme doesn't draw a 2nd rectangle
          className={`flex-1 bg-transparent ${hero ? 'text-base' : 'text-sm'} placeholder:text-zinc-600 focus:outline-none`}
          style={{ boxShadow: 'none' }}
        />
        {query && (
          <button onClick={() => setQuery('')} className="shrink-0 text-zinc-500 hover:text-zinc-300" title="Clear">
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="h-5 w-px bg-white/10 shrink-0" />
        <button onClick={() => setRailOpen((o) => !o)} title="Search settings"
          className="shrink-0 text-zinc-400 hover:text-amber-300 transition"><SlidersHorizontal className="h-4 w-4" /></button>
      </div>
      <button
        onClick={() => runSearch(query)}
        disabled={loading || !query.trim()}
        className={`shrink-0 rounded-full font-semibold text-black disabled:opacity-40 transition flex items-center gap-2
                    ${hero ? 'px-7 py-3.5 text-base' : 'px-5 py-2.5 text-sm'}`}
        style={{ background: ACCENT }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        Search
      </button>
    </div>
  );

  const filterRow = (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Camera filter — button opens a List | Map picker popover */}
      <div className="relative">
        <button type="button" onClick={() => setCamPickerOpen((o) => !o)} title="Filter by camera"
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900/70 border border-white/10 px-3.5 py-1.5 text-xs text-zinc-300 hover:border-amber-500/50 transition">
          <Video className="h-3.5 w-3.5 text-zinc-500" />
          {camIds.length === 0 ? 'All cameras' : `${camIds.length} camera${camIds.length > 1 ? 's' : ''}`}
          <ChevronRight className="h-3 w-3 text-zinc-500 rotate-90" />
        </button>
        {camPickerOpen && (
          <>
            <div className="fixed inset-0 z-[40]" onClick={() => setCamPickerOpen(false)} />
            <div className="absolute left-0 top-full z-[50] mt-2 w-[340px] rounded-xl border border-border bg-card p-3 text-card-foreground shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex gap-1.5">
                  {([['list', 'List', List], ['map', 'Map', MapPin]] as const).map(([k, label, Icon]) => (
                    <button key={k} type="button" onClick={() => setCamMode(k)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                        camMode === k ? 'border-amber-500 bg-amber-500 text-black' : 'border-border bg-background/60 text-foreground hover:bg-accent'
                      }`}>
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>
                {camIds.length > 0 && (
                  <button type="button" onClick={() => setCamIds([])} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">Clear</button>
                )}
              </div>
              {camMode === 'map' ? (
                <CameraMapPicker cameras={camMapCams} selected={camIds} onChange={setCamIds} height={300} />
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background/60">
                  {pickerCams.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">No cameras yet — add one below.</p>
                  ) : (
                    pickerCams.map(({ cam: c, label }) => {
                      const on = camIds.includes(c.id);
                      return (
                        <button key={c.id} type="button" onClick={() => toggleCam(c.id)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent">
                          <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                          {isUploadCam(c) && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                              <Upload className="h-2.5 w-2.5" /> upload
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {/* Time filter */}
      <div className="relative">
        <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} title="Filter by time"
          className="appearance-none rounded-full bg-zinc-900/70 border border-white/10 pl-3.5 pr-8 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/50 transition">
          {TIME_PRESETS.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
        </select>
        <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500 rotate-90 pointer-events-none" />
      </div>
    </div>
  );

  const suggestionChips = (
    <div className="flex flex-wrap gap-2 justify-center">
      {SUGGESTIONS.map((s) => (
        <button key={s} onClick={() => { setQuery(s); runSearch(s); }}
          className="text-[11px] px-3 py-1.5 rounded-full bg-zinc-900/60 border border-white/10 text-zinc-400 hover:text-amber-300 hover:border-amber-500/30 transition">
          {s}
        </button>
      ))}
    </div>
  );

  // Search-settings body — rendered inside a slide-over drawer (below) so the
  // sliders button in the search bar works on the hero AND the results page.
  const railBody = (
    <div className="space-y-6">
      {/* Inference cameras */}
      <div>
        <ControlHead icon={<Video className="h-3.5 w-3.5" />} label="Cameras (inference)" />
        <div className="mt-2 space-y-1.5">
          {cams.length === 0 && (
            <p className="text-[11px] text-zinc-500">No cameras yet — add one below.</p>
          )}
          {cams.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg bg-zinc-900/70 border border-white/10 px-2.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" title={c.status}
                style={{ background: c.status === 'ready' ? '#22c55e' : c.status === 'error' ? '#ef4444' : c.status === 'paused' ? '#71717a' : c.status === 'live' ? '#22c55e' : '#f59e0b' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-zinc-200 truncate">{camLabel(c)}</p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {c.status === 'ready' ? `ready · ${c.frames ?? 0}f`
                    : c.status === 'error' ? (c.error || 'error')
                    : c.status === 'paused' ? `paused · ${c.frames ?? 0}f`
                    : c.status === 'live' ? `live · ${c.frames ?? 0}f` : 'indexing…'}
                </p>
              </div>
              {(c.status === 'live' || c.status === 'paused') && (
                <button onClick={() => toggleCamPause(c)} disabled={camBusy}
                  className="shrink-0 text-zinc-500 hover:text-amber-300 transition disabled:opacity-40"
                  title={c.status === 'paused' ? 'Resume indexing' : 'Pause indexing'}>
                  {c.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
              )}
              <button onClick={() => removeCam(c.id)} disabled={camBusy}
                className="shrink-0 text-zinc-500 hover:text-red-400 transition" title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1.5">
          <input value={camName} onChange={(e) => setCamName(e.target.value)} placeholder="Name (optional)"
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-amber-500/40" />
          <input value={camSrc} onChange={(e) => setCamSrc(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCam(); }}
            placeholder="rtsp://…  or  stream URL / file path"
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-amber-500/40" />
          <button onClick={addCam} disabled={camBusy}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold text-black disabled:opacity-40 transition"
            style={{ background: ACCENT }}>
            {camBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add camera
          </button>
          <button onClick={pickFile}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition hover:brightness-110"
            style={{ color: ACCENT, background: 'rgba(var(--brand-accent-rgb),0.12)', border: '1px solid rgba(var(--brand-accent-rgb),0.45)' }}>
            <Upload className="h-3.5 w-3.5" /> Upload a video file
          </button>
          {camErr && <p className="text-[10px] text-red-400">{camErr}</p>}
        </div>
      </div>

      <Slider label="Sample rate" icon={<Gauge className="h-3.5 w-3.5" />}
        value={fps} min={0.5} max={5} step={0.5} suffix=" fps" onChange={setFps} />

      <Slider label="Results to show" icon={<LayoutGrid className="h-3.5 w-3.5" />}
        value={topK} min={4} max={50} step={1} onChange={setTopK} />

      <div>
        <ControlHead icon={<LayoutGrid className="h-3.5 w-3.5" />} label="Grid density" />
        <div className="flex gap-2 mt-2">
          {[3, 4, 6].map((c) => (
            <button key={c} onClick={() => setColumns(c)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                columns === c ? 'text-black border-transparent' : 'text-zinc-400 border-white/10 hover:border-white/20'
              }`}
              style={columns === c ? { background: ACCENT } : undefined}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <Slider label="Min score" icon={<Filter className="h-3.5 w-3.5" />}
        value={minScore} min={0} max={50} step={1} suffix="%" onChange={setMinScore} />
    </div>
  );

  return (
    <div className="h-full w-full overflow-hidden bg-background text-foreground flex flex-col"
      style={{ ['--accent-color' as any]: ACCENT }}>

      {!searched ? (
        /* ── Google-style centered hero (before first search) ── */
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
          <div className="flex flex-col items-center gap-2 mb-8">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
                <Sparkles className="h-6 w-6" style={{ color: ACCENT }} />
              </div>
              <h1 className="text-4xl font-black tracking-tight">IRIS <span style={{ color: ACCENT }}>Search</span></h1>
            </div>
            <p className="text-sm text-zinc-500">Semantic video search — describe it, find it across every camera.</p>
          </div>
          <div className="w-full max-w-2xl space-y-4">
            {pillBar(true)}
            <div className="flex justify-center">{filterRow}</div>
            {suggestionChips}
            <div className="flex flex-col items-center gap-2 pt-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">or</span>
              <div className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
                <button onClick={pickFile}
                  className="group flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-black shadow-lg transition hover:scale-[1.03] active:scale-95"
                  style={{ background: ACCENT, boxShadow: '0 10px 30px -10px rgba(var(--brand-accent-rgb), 0.6)' }}>
                  <Upload className="h-4 w-4" /> Upload a video to search
                </button>
                <button onClick={() => { setCamErr(''); setAddCamOpen(true); }}
                  className="group flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-black shadow-lg transition hover:scale-[1.03] active:scale-95"
                  style={{ background: ACCENT, boxShadow: '0 10px 30px -10px rgba(var(--brand-accent-rgb), 0.6)' }}>
                  <Video className="h-4 w-4" /> Add a live camera
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Compact top bar + results (after searching) ── */
        <>
          <header className="shrink-0 px-6 pt-4 pb-3 border-b border-white/5 space-y-2.5">
            <div className="flex items-center gap-4">
              <button onClick={() => { setSearched(false); setResults([]); }} className="flex items-center gap-2 shrink-0" title="New search">
                <div className="grid h-8 w-8 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                  <Sparkles className="h-4 w-4" style={{ color: ACCENT }} />
                </div>
                <span className="text-sm font-bold tracking-tight hidden md:inline">IRIS <span style={{ color: ACCENT }}>Search</span></span>
              </button>
              <div className="flex-1 max-w-3xl">{pillBar(false)}</div>
            </div>
            {filterRow}
          </header>

          <div className="flex-1 flex overflow-hidden">
            {/* Results */}
        <main className="flex-1 overflow-y-auto p-6">
          {!searched ? (
            <EmptyState icon={<Search className="h-10 w-10" />}
              title="Search your camera footage in plain language"
              sub="Matches your description against every indexed frame across all cameras." />
          ) : loading ? (
            <EmptyState icon={<Loader2 className="h-10 w-10 animate-spin" />}
              title="Searching indexed footage…" sub={`Scoring frames against “${query}”`} />
          ) : view.length === 0 ? (
            <EmptyState icon={<Search className="h-10 w-10" />}
              title={results.length > 0 ? 'No matches for these filters' : 'No matches above the score threshold'}
              sub={results.length > 0 ? 'Widen the camera or time filter, or lower the min-score.' : 'Lower the min-score, or try a different description.'} />
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-zinc-300">
                  <span className="font-bold text-white">{view.length}</span> results
                  {view.length !== results.length && <span className="text-zinc-500"> · {results.length - view.length} filtered out</span>}
                  {hidden > 0 && <span className="text-zinc-500"> · {hidden} hidden below {minScore}%</span>}
                </p>
                <p className="text-[11px] uppercase tracking-widest text-zinc-600 font-semibold">“{query}”</p>
              </div>
              <motion.div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                variants={reduce ? undefined : staggerContainer} initial={reduce ? undefined : 'hidden'} animate={reduce ? undefined : 'show'}>
                {view.map((r, i) => {
                  const c = scoreColor(r.score);
                  return (
                  <motion.button key={r.id} onClick={() => setActive(r)} variants={reduce ? undefined : fadeUp}
                    whileHover={reduce ? undefined : { y: -4, transition: spring }}
                    whileTap={reduce ? undefined : { scale: 0.985 }}
                    className="group block w-full rounded-xl overflow-hidden
                               border border-white/10 bg-zinc-900/60 hover:border-amber-500/40 transition text-left"
                    style={{ boxShadow: `0 8px 28px -16px ${c}55` }}>
                    <div className="relative">
                      <SmoothImg src={r.thumbnailUrl} alt={r.deviceName} containerClassName="w-full aspect-video" className="w-full h-full object-cover" />
                      <span className="absolute top-2 right-2 grid place-items-center h-5 min-w-[20px] px-1 rounded-md bg-black/70 text-[10px] font-black tabular-nums text-white/90 backdrop-blur-sm" title="Rank">
                        #{i + 1}
                      </span>
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black tabular-nums backdrop-blur-sm"
                        style={{ color: c, borderColor: `${c}66`, background: `linear-gradient(135deg, ${c}33, ${c}11)` }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                        {(r.score * 100).toFixed(0)}%
                      </span>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30">
                        <span className="h-11 w-11 rounded-full bg-amber-400/90 flex items-center justify-center">
                          <Play className="h-5 w-5 text-black ml-0.5" />
                        </span>
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-zinc-200 truncate">{r.deviceName}</p>
                      <p className="text-[10px] text-zinc-500 tabular-nums">{r.timeLabel}</p>
                    </div>
                  </motion.button>
                  );
                })}
              </motion.div>
            </>
          )}
        </main>
          </div>
        </>
      )}

      {/* Search-settings slide-over — opened by the sliders button in the search
          bar; works on the hero (default) page as well as the results page. */}
      <AnimatePresence>
        {railOpen && (
          <>
            <motion.div key="rail-bg" className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setRailOpen(false)} />
            <motion.aside key="rail" className="fixed right-0 top-0 z-[111] h-full w-80 max-w-[88vw] overflow-y-auto border-l border-white/10 bg-zinc-950 p-5 shadow-2xl"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.2 }}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight">
                  <SlidersHorizontal className="h-4 w-4" style={{ color: ACCENT }} /> Search settings
                </h3>
                <button onClick={() => setRailOpen(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5" title="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {railBody}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* "Add a live camera" modal — opened from the hero button next to Upload. */}
      <AnimatePresence>
        {addCamOpen && (
          <motion.div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAddCamOpen(false)}>
            <motion.div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden"
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4" style={{ color: ACCENT }} />
                  <p className="text-sm font-semibold">Add a live camera</p>
                </div>
                <button onClick={() => setAddCamOpen(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <div className="px-5 py-5 space-y-3">
                <p className="text-xs text-zinc-500">Paste an RTSP or HLS stream URL — it’s indexed live so you can search it.</p>
                <input value={camName} onChange={(e) => setCamName(e.target.value)} placeholder="Name (optional)"
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50" />
                <input value={camSrc} autoFocus onChange={(e) => setCamSrc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitAddCam(); }}
                  placeholder="rtsp://…  or  http://…/index.m3u8"
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-500/50" />
                {camErr && <p className="text-xs text-red-400">{camErr}</p>}
                <button onClick={submitAddCam} disabled={camBusy}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold text-black disabled:opacity-40 transition"
                  style={{ background: ACCENT }}>
                  {camBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add camera
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active && <ClipModal key="clip" result={active} onClose={() => setActive(null)} />}
      </AnimatePresence>

      {/* Hidden picker for the "upload a video" flow */}
      <input ref={fileInputRef} type="file" accept="video/*,.mp4,.mkv,.mov,.avi" className="hidden"
        onChange={(e) => { onUploadFile(e.target.files?.[0] || null); e.target.value = ''; }} />

      <AnimatePresence>
        {upOpen && (
          <UploadModal
            phase={upPhase} pct={upPct} name={upName} error={upErr}
            onSearch={searchUploaded}
            onRetry={pickFile}
            onClose={() => setUpOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Confirmation toast on the search page: the uploaded clip is now the active
          search scope. Auto-dismisses; click × to close sooner. */}
      <AnimatePresence>
        {selToast && (
          <motion.div key="seltoast"
            className="fixed top-5 left-1/2 z-[130] -translate-x-1/2 w-[min(92vw,30rem)]"
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
            <div className="flex items-center gap-3 rounded-xl border bg-zinc-950/95 px-4 py-3 shadow-2xl backdrop-blur"
              style={{ borderColor: 'rgba(var(--brand-accent-rgb),0.5)', boxShadow: '0 12px 40px -12px rgba(var(--brand-accent-rgb),0.45)' }}>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
              <p className="flex-1 text-sm text-zinc-200">
                “<span className="font-semibold" style={{ color: ACCENT }}>{selToast}</span>” is selected — you can search.
              </p>
              <button onClick={() => setSelToast(null)} className="shrink-0 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/5" title="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Upload + indexing progress popup ───
function UploadModal({ phase, pct, name, error, onSearch, onRetry, onClose }: {
  phase: 'uploading' | 'indexing' | 'ready' | 'error';
  pct: number; name: string; error: string;
  onSearch: () => void; onRetry: () => void; onClose: () => void;
}) {
  return (
    <motion.div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden"
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <FileVideo className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-sm font-semibold truncate">{name || 'Uploaded video'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-6">
          {phase === 'uploading' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Upload className="h-4 w-4 text-amber-400" /> Uploading… {pct}%
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ACCENT }} />
              </div>
            </div>
          )}
          {phase === 'indexing' && (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
              <p className="text-sm font-semibold text-zinc-200">Indexing footage…</p>
              <p className="text-xs text-zinc-500">Building the search index. This can take a minute for longer clips — you can keep it open.</p>
            </div>
          )}
          {phase === 'ready' && (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <CheckCircle2 className="h-9 w-9 text-green-400" />
              <p className="text-sm font-semibold text-zinc-100">Indexed &amp; ready to search</p>
              <p className="text-xs text-zinc-500">“{name}” is now searchable. Open it to search within this video.</p>
              <div className="flex gap-2 pt-1">
                <button onClick={onSearch} className="rounded-lg px-4 py-2 text-sm font-semibold text-black" style={{ background: ACCENT }}>
                  Search this video
                </button>
                <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 hover:border-white/20">
                  Done
                </button>
              </div>
            </div>
          )}
          {phase === 'error' && (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <AlertTriangle className="h-9 w-9 text-red-400" />
              <p className="text-sm font-semibold text-zinc-100">Upload failed</p>
              <p className="text-xs text-red-400 max-w-xs">{error}</p>
              <div className="flex gap-2 pt-1">
                <button onClick={onRetry} className="rounded-lg px-4 py-2 text-sm font-semibold text-black" style={{ background: ACCENT }}>
                  Try another file
                </button>
                <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 hover:border-white/20">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Clip preview modal with custom scrubber ───
function ClipModal({ result, onClose }: { result: SearchResult; onClose: () => void }) {
  const [clip, setClip] = useState<SearchClip | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<number | null>(null);
  const matchFrame = useMemo(() => (clip ? Math.floor(clip.frames.length / 2) : 0), [clip]);

  useEffect(() => {
    apiClient.getSearchClip(result.deviceId, result.timestamp).then((c) => { setClip(c); setFrame(0); });
  }, [result]);

  useEffect(() => {
    if (!clip || !playing) return;
    timer.current = window.setInterval(() => {
      setFrame((f) => (f + 1) % clip.frames.length);
    }, (1000 / clip.clipFps) / speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [clip, playing, speed]);

  const onMatch = frame === matchFrame;

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <motion.div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0f172a] overflow-hidden" onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.92, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div>
            <p className="text-sm font-bold text-zinc-100">{result.deviceName}</p>
            <p className="text-[11px] text-zinc-500 tabular-nums">
              {result.timeLabel} · <span style={{ color: scoreColor(result.score) }}>{(result.score * 100).toFixed(0)}% match</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative bg-black aspect-video flex items-center justify-center">
          {clip ? <img src={clip.frames[frame]} className="max-h-full max-w-full" alt="" /> : <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />}
          {onMatch && (
            <span className="absolute top-3 right-3 px-2.5 py-1 rounded-md text-[10px] font-black bg-red-600 text-white flex items-center gap-1">
              ● MATCH
            </span>
          )}
        </div>

        {/* scrubber */}
        {clip && (
          <div className="px-5 py-4">
            <div className="relative h-2 rounded-full bg-zinc-800 cursor-pointer mb-3"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                setFrame(Math.round(((e.clientX - rect.left) / rect.width) * (clip.frames.length - 1)));
              }}>
              <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${(frame / (clip.frames.length - 1)) * 100}%`, background: ACCENT }} />
              {/* white match tick */}
              <div className="absolute -top-0.5 h-3 w-0.5 bg-white" style={{ left: `${(matchFrame / (clip.frames.length - 1)) * 100}%` }} title="matched frame" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setFrame((f) => Math.max(0, f - 1))} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setPlaying((p) => !p)} className="p-2 rounded-lg text-black" style={{ background: ACCENT }}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button onClick={() => setFrame((f) => Math.min(clip.frames.length - 1, f + 1))} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400"><ChevronRight className="h-4 w-4" /></button>
              <span className="text-[11px] text-zinc-500 tabular-nums ml-1">frame {frame + 1}/{clip.frames.length}</span>
              <div className="ml-auto flex gap-1">
                {[0.5, 1, 2, 3].map((s) => (
                  <button key={s} onClick={() => setSpeed(s)}
                    className={`px-2 py-1 rounded text-[11px] font-semibold ${speed === s ? 'text-black' : 'text-zinc-400 hover:text-white'}`}
                    style={speed === s ? { background: ACCENT } : undefined}>{s}×</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── small building blocks ───
function ControlHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-zinc-400">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </div>
  );
}
function Control({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div><ControlHead icon={icon} label={label} /><div className="mt-2">{children}</div></div>;
}
function Slider({ label, icon, value, min, max, step, suffix = '', onChange }:
  { label: string; icon?: React.ReactNode; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <ControlHead icon={icon ?? <span />} label={label} />
        <span className="text-xs font-bold tabular-nums" style={{ color: ACCENT }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2 accent-amber-500" />
    </div>
  );
}
function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="w-full flex items-center justify-between text-left">
      <div>
        <p className="text-xs font-semibold text-zinc-200">{label}</p>
        {hint && <p className="text-[10px] text-zinc-500">{hint}</p>}
      </div>
      <span className={`relative w-9 h-5 rounded-full transition ${value ? '' : 'bg-zinc-700'}`} style={value ? { background: ACCENT } : undefined}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${value ? 'left-4' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="text-zinc-700 mb-4">{icon}</div>
      <p className="text-sm font-semibold text-zinc-300">{title}</p>
      <p className="text-xs text-zinc-600 mt-1 max-w-sm">{sub}</p>
    </div>
  );
}
