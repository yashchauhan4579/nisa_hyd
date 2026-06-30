import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  apiClient, type Vehicle, type SearchResult, type FRSPerson, type FRSDetection, type VehicleDetection, type Device,
} from '@/lib/api';
import { CameraMapPicker, type MapCamera } from '@/components/maps/CameraMapPicker';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Search, Car, ScanFace, MapPin, Clock, Cpu, Radio, AlertTriangle,
  Crosshair, Loader2, Sparkles, Activity, ExternalLink, Maximize2, X, RefreshCw,
  Route, Users, BarChart3, Play, Pause, Bell, Mail, MessageCircle, Phone, MessageSquare,
} from 'lucide-react';

const ACCENT = 'var(--brand-accent)';

// ── Simulated GPU budget (UI-only; no backend / worker calls) ────────────────
const SLOTS_TOTAL = 100;
const SLOTS_BASELINE = 68; // pretend this much is already allocated platform-wide

type TargetType = 'plate' | 'description' | 'person';

// A clicked result, normalized so one popup can preview clips, faces or plates.
type HitDetail = {
  kind: 'clip' | 'face' | 'plate';
  img?: string | null;
  title: string;
  cam: string;
  time: string;
  deviceId?: string;
  timestamp?: number;   // seconds; enables clip playback for CLIP hits
  score?: number;
  openUrl?: string;     // optional "open full record" deep-link
};
const ANALYTIC: Record<TargetType, { key: string; label: string; cost: number }> = {
  plate: { key: 'ANPR', label: 'ANPR (plate)', cost: 1 },
  description: { key: 'SEARCH', label: 'CLIP Search', cost: 2 },
  person: { key: 'FRS', label: 'Face Recognition', cost: 3 },
};

const TIME_PRESETS = [
  { k: '24h', label: 'Last 24 hours', hours: 24 },
  { k: '7d', label: 'Last 7 days', hours: 168 },
  { k: '30d', label: 'Last 30 days', hours: 720 },
  { k: 'any', label: 'Any time', hours: 0 },
];

// ── localStorage-backed investigation history (demo persistence) ─────────────
const LS_KEY = 'iris.investigations';
type Investigation = {
  id: string;
  createdAt: number;
  targetType: TargetType;
  plate?: string;
  description?: string;
  personId?: string;
  personName?: string;
  timeKey: string;
  areaCamIds: string[];
  resultCount: number;
  deployedCamIds: string[];
  analyticKey: string;
  slotCost: number;
  status: 'active' | 'closed';
};
const loadCases = (): Investigation[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
};
const saveCases = (c: Investigation[]) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch { /* quota */ }
};
const caseLabel = (c: Investigation) =>
  c.targetType === 'plate' ? (c.plate || 'plate')
    : c.targetType === 'person' ? (c.personName || 'person')
      : `"${c.description || ''}"`;

// ── Results cache (keyed by query signature) so past cases load instantly ────
const LS_RESULTS = 'iris.invresults';
type QueryInputs = { targetType: TargetType; plate: string; description: string; personId: string; timeKey: string; selCamIds: string[] };
type CachedResults = { vehicles: Vehicle[]; clips: SearchResult[]; faceHits: FRSDetection[]; at: number };
const sigOf = (i: QueryInputs) => {
  const term = (i.targetType === 'plate' ? i.plate : i.targetType === 'description' ? i.description : i.personId).trim().toLowerCase();
  return `${i.targetType}|${term}|${i.timeKey}|${[...i.selCamIds].sort().join(',')}`;
};
const loadResultsMap = (): Record<string, CachedResults> => { try { return JSON.parse(localStorage.getItem(LS_RESULTS) || '{}'); } catch { return {}; } };
const getCachedResults = (sig: string): CachedResults | null => loadResultsMap()[sig] || null;
const setCachedResults = (sig: string, r: CachedResults) => {
  try { const m = loadResultsMap(); m[sig] = r; localStorage.setItem(LS_RESULTS, JSON.stringify(m)); } catch { /* quota */ }
};
const agoLabel = (at?: number | null) => {
  if (!at) return '';
  const m = Math.floor((Date.now() - at) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
};

const hasGeo = (d?: { lat?: number; lng?: number } | null) =>
  !!d && Number.isFinite(d.lat) && Number.isFinite(d.lng) && ((d!.lat as number) !== 0 || (d!.lng as number) !== 0);
const detImg = (d?: VehicleDetection) => d?.vehicleImageUrl || d?.fullImageUrl || d?.plateImageUrl || undefined;

// Marked sample data (shown when a tab has no real data for the current target).
const SAMPLE_ASSOC = [
  { plate: 'AP39XY4412', type: '2W', cam: 'Benz Circle', when: '±2 min' },
  { plate: 'AP31AB9087', type: '4W', cam: 'MG Road', when: '±4 min' },
  { plate: 'TS09CD1234', type: 'AUTO', cam: 'Auto Nagar', when: '±1 min' },
];
const SAMPLE_HOURS = [0, 0, 0, 0, 0, 1, 3, 6, 9, 7, 4, 3, 2, 2, 3, 5, 8, 11, 9, 6, 3, 2, 1, 0];
const SAMPLE_TOPCAMS = [
  { cam: 'Benz Circle', n: 41, pct: 62 }, { cam: 'MG Road', n: 14, pct: 21 }, { cam: 'Auto Nagar', n: 7, pct: 11 },
];
// Dummy movement path around Vijayawada — used on the map when the target's real
// detections have no geo, so the playback always has something to show.
const DUMMY_VJA_ROUTE = [
  { lat: 16.5193, lng: 80.6305, cam: 'Kanaka Durga', label: '08:42 AM' },
  { lat: 16.5062, lng: 80.6480, cam: 'Benz Circle', label: '08:55 AM' },
  { lat: 16.4995, lng: 80.6580, cam: 'MG Road', label: '09:08 AM' },
  { lat: 16.4885, lng: 80.6712, cam: 'Auto Nagar', label: '09:24 AM' },
  { lat: 16.5040, lng: 80.6890, cam: 'Ramavarappadu Ring', label: '09:41 AM' },
];

type Stop = { lat: number; lng: number; cam: string; label: string };

// Animated route map: polyline + numbered markers, current step highlighted.
function RouteLayer({ stops, active }: { stops: Stop[]; active: number }) {
  const map = useMap();
  useEffect(() => {
    const c = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(c);
    return () => ro.disconnect();
  }, [map]);
  useEffect(() => {
    const latlngs = stops.map((s) => [s.lat, s.lng] as [number, number]);
    const layers: L.Layer[] = [];
    if (latlngs.length > 1) layers.push(L.polyline(latlngs, { color: '#f59e0b', weight: 3, opacity: 0.6, dashArray: '6 7' }).addTo(map));
    stops.forEach((s, i) => {
      const isActive = i === active, visited = i <= active;
      const fill = isActive ? '#f59e0b' : visited ? '#b45309' : '#52525b';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${isActive ? 26 : 20}px;height:${isActive ? 26 : 20}px;border-radius:50%;background:${fill};border:2px solid #18181b;color:#000;font-size:11px;font-weight:800;display:grid;place-items:center;box-shadow:${isActive ? '0 0 0 4px rgba(245,158,11,.25)' : 'none'}">${i + 1}</div>`,
        iconSize: [isActive ? 26 : 20, isActive ? 26 : 20], iconAnchor: [isActive ? 13 : 10, isActive ? 13 : 10],
      });
      const m = L.marker([s.lat, s.lng], { icon, zIndexOffset: isActive ? 1000 : 0 }).addTo(map);
      m.bindTooltip(`${i + 1}. ${s.cam} · ${s.label}`, { direction: 'top', offset: [0, -12], className: 'sight-tip' });
      layers.push(m);
    });
    if (active >= 0 && stops[active]) map.setView([stops[active].lat, stops[active].lng], Math.max(map.getZoom(), 14), { animate: true });
    else if (latlngs.length) map.fitBounds(L.latLngBounds(latlngs).pad(0.35));
    return () => layers.forEach((l) => map.removeLayer(l));
  }, [stops, active, map]);
  return null;
}
function RouteMap({ stops, active }: { stops: Stop[]; active: number }) {
  if (!stops.length) return null;
  const c = stops[Math.min(Math.max(active, 0), stops.length - 1)] || stops[0];
  return (
    <MapContainer center={[c.lat, c.lng]} zoom={14} style={{ height: '100%', width: '100%', background: '#0a0a0a' }} attributionControl={false} scrollWheelZoom>
      <style>{`.sight-tip{background:#18181b;color:#fafafa;border:1px solid rgba(255,255,255,.12);font-size:11px;font-weight:600;padding:2px 7px;border-radius:6px}.sight-tip:before{border-top-color:rgba(255,255,255,.12)}`}</style>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      <RouteLayer stops={stops} active={active} />
    </MapContainer>
  );
}

const fmtTime = (s?: string | number | null) => {
  if (s == null) return '';
  const d = typeof s === 'number' ? new Date(s * (s < 1e12 ? 1000 : 1)) : new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
};

export function InvestigatePage() {
  const [targetType, setTargetType] = useState<TargetType>('plate');
  const [plate, setPlate] = useState('');
  const [description, setDescription] = useState('');
  const [persons, setPersons] = useState<FRSPerson[]>([]);
  const [personId, setPersonId] = useState('');
  const [timeKey, setTimeKey] = useState('7d');

  const [cameras, setCameras] = useState<Device[]>([]);
  const [selCamIds, setSelCamIds] = useState<string[]>([]); // area selected on map
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clips, setClips] = useState<SearchResult[]>([]);
  const [faceHits, setFaceHits] = useState<FRSDetection[]>([]);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // Simulated deployment state
  const [deployed, setDeployed] = useState(false);
  const [deployCamIds, setDeployCamIds] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<{ id: number; cam: string; text: string; at: number }[]>([]);
  const alertSeq = useRef(0);

  // Investigation history (localStorage CRUD)
  const [cases, setCases] = useState<Investigation[]>(() => loadCases());
  const [leftTab, setLeftTab] = useState<'new' | 'history'>('new');
  const [caseId, setCaseId] = useState<string | null>(null); // the case the current deployment maps to
  const persist = useCallback((next: Investigation[]) => { setCases(next); saveCases(next); }, []);

  // Intel panel (route / associates / pattern) — real for a plate target, else sample.
  const [intelTab, setIntelTab] = useState<'route' | 'associates' | 'pattern'>('route');
  const [targetDets, setTargetDets] = useState<VehicleDetection[]>([]);
  const [routeStep, setRouteStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [assoc, setAssoc] = useState<{ id?: string; plate: string; type: string; cam: string; when: string }[]>([]);
  const [assocState, setAssocState] = useState<'idle' | 'loading' | 'done'>('idle');
  // Notification channels (UI-only demo of what's available).
  const [notify, setNotify] = useState<Record<string, boolean>>({ alert: true, whatsapp: false, email: false, call: false, sms: false });
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyPhone, setNotifyPhone] = useState('');
  const [panelH, setPanelH] = useState(288); // resizable intel panel height (px)
  const [activeHit, setActiveHit] = useState<HitDetail | null>(null); // result preview popup
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY, startH = panelH;
    const onMove = (ev: MouseEvent) => setPanelH(Math.max(180, Math.min(window.innerHeight * 0.82, startH + (startY - ev.clientY))));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.userSelect = ''; };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    apiClient.getDevices({ type: 'CAMERA' }).then((d) => setCameras(d as Device[])).catch(() => {});
    apiClient.getFRSPersons().then(setPersons).catch(() => {});
  }, []);

  const mapCams: MapCamera[] = useMemo(
    () => cameras
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && (c.lat !== 0 || c.lng !== 0))
      .map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, status: c.status })),
    [cameras],
  );
  const camName = useCallback((id: string) => cameras.find((c) => c.id === id)?.name?.replace(/^Camera\s+/i, '') || id, [cameras]);

  const canRun = (targetType === 'plate' && plate.trim()) || (targetType === 'description' && description.trim()) || (targetType === 'person' && personId);

  // Runs a query. preferCache=true paints cached results instantly (for opening a
  // past case); the Refresh button always re-fetches live and re-caches.
  const executeQuery = useCallback(async (inp: QueryInputs, opts: { preferCache?: boolean } = {}) => {
    setRan(true); setDeployed(false); setAlerts([]); setCaseId(null);
    const sig = sigOf(inp);
    if (opts.preferCache) {
      const c = getCachedResults(sig);
      if (c) {
        setVehicles(c.vehicles); setClips(c.clips); setFaceHits(c.faceHits);
        setCachedAt(c.at); setFromCache(true); setLoading(false);
        return;
      }
    }
    setLoading(true); setFromCache(false); setVehicles([]); setClips([]); setFaceHits([]);
    const ids = inp.selCamIds.length ? inp.selCamIds : undefined;
    const p = TIME_PRESETS.find((x) => x.k === inp.timeKey);
    const start = p && p.hours ? new Date(Date.now() - p.hours * 3_600_000).toISOString() : undefined;
    let vs: Vehicle[] = [], cl: SearchResult[] = [], fh: FRSDetection[] = [];
    try {
      if (inp.targetType === 'plate' && inp.plate.trim()) {
        vs = (await apiClient.getVehicles({ plateNumber: inp.plate.trim(), deviceIds: ids?.join(','), startTime: start, limit: 60, orderBy: 'last_seen', orderDir: 'desc' })).vehicles;
      } else if (inp.targetType === 'description' && inp.description.trim()) {
        cl = (await apiClient.search({ query: inp.description.trim(), topK: 36, deviceIds: ids })).results;
      } else if (inp.targetType === 'person' && inp.personId) {
        const r = await apiClient.getFRSDetections({ personId: inp.personId, startTime: start, limit: 60, ...(inp.selCamIds.length === 1 ? { deviceId: inp.selCamIds[0] } : {}) });
        fh = inp.selCamIds.length > 1 ? r.filter((d) => inp.selCamIds.includes(d.deviceId)) : r;
      }
      setVehicles(vs); setClips(cl); setFaceHits(fh);
      const at = Date.now();
      setCachedAt(at);
      setCachedResults(sig, { vehicles: vs.slice(0, 24), clips: cl.slice(0, 24), faceHits: fh.slice(0, 24), at });
    } catch (e) { console.error('Investigate query failed', e); }
    finally { setLoading(false); }
  }, []);

  const inputs = (): QueryInputs => ({ targetType, plate, description, personId, timeKey, selCamIds });
  const run = () => executeQuery(inputs(), { preferCache: false });
  // Pivot the whole investigation onto a co-occurring plate (chain analysis).
  const pivotToPlate = (p: string) => {
    setTargetType('plate'); setPlate(p); setDescription(''); setPersonId(''); setLeftTab('new'); setIntelTab('route');
    executeQuery({ targetType: 'plate', plate: p, description: '', personId: '', timeKey, selCamIds }, { preferCache: false });
  };

  // Cameras where this target actually appeared (drives the deploy recommendation).
  const hitCamIds = useMemo(() => {
    const s = new Set<string>();
    vehicles.forEach((v) => { const d = v.detections?.[0]?.deviceId; if (d) s.add(d); });
    clips.forEach((c) => s.add(c.deviceId));
    faceHits.forEach((f) => s.add(f.deviceId));
    return Array.from(s);
  }, [vehicles, clips, faceHits]);

  // Recommendation = the selected area cameras, else the cameras where it was seen.
  const recCamIds = useMemo(() => (selCamIds.length ? selCamIds : hitCamIds), [selCamIds, hitCamIds]);
  const analytic = ANALYTIC[targetType];
  const recCost = recCamIds.length * analytic.cost;
  // GPU usage = baseline + every ACTIVE saved investigation's cost.
  const activeSlots = useMemo(() => cases.filter((c) => c.status === 'active').reduce((s, c) => s + c.slotCost, 0), [cases]);
  const usedSlots = SLOTS_BASELINE + activeSlots;
  const freeSlots = SLOTS_TOTAL - usedSlots;
  const overBudget = !deployed && recCost > freeSlots;

  const resultCount = vehicles.length + clips.length + faceHits.length;

  // ── Intel: detections of the target vehicle (plate target) drive route + pattern ──
  const targetVehicle = vehicles[0] || null;
  useEffect(() => {
    setRouteStep(0); setPlaying(false); setAssoc([]); setAssocState('idle');
    if (!targetVehicle) { setTargetDets([]); return; }
    apiClient.getVehicleDetections(targetVehicle.id, { limit: 100 }).then(setTargetDets).catch(() => setTargetDets([]));
  }, [targetVehicle?.id]);

  const routeStops = useMemo(() => targetDets
    .filter((d) => hasGeo(d.device))
    .map((d) => ({ id: d.id, dev: d.deviceId, cam: (d.device!.name || d.device!.id).replace(/^Camera\s+/i, ''), lat: d.device!.lat, lng: d.device!.lng, t: new Date(d.timestamp).getTime(), img: detImg(d) }))
    .sort((a, b) => a.t - b.t), [targetDets]);
  const hourHist = useMemo(() => { const h = new Array(24).fill(0); targetDets.forEach((d) => { const x = new Date(d.timestamp); if (!isNaN(x.getTime())) h[x.getHours()] += 1; }); return h; }, [targetDets]);
  const topCams = useMemo(() => {
    const m = new Map<string, number>();
    targetDets.forEach((d) => { const c = (d.device?.name || d.deviceId).replace(/^Camera\s+/i, ''); m.set(c, (m.get(c) || 0) + 1); });
    const tot = targetDets.length || 1;
    return Array.from(m.entries()).map(([cam, n]) => ({ cam, n, pct: Math.round((n / tot) * 100) })).sort((a, b) => b.n - a.n).slice(0, 4);
  }, [targetDets]);

  const hasRoute = routeStops.length >= 2;
  const hasPattern = targetDets.length > 0;
  // Stops shown on the map: real geo route, else the dummy Vijayawada path.
  const displayStops = useMemo<Stop[]>(() => (hasRoute
    ? routeStops.map((s) => ({ lat: s.lat, lng: s.lng, cam: s.cam, label: fmtTime(s.t) }))
    : DUMMY_VJA_ROUTE), [hasRoute, routeStops]);

  // Associates: other vehicles at the same cameras within ±5 min of the target's stops.
  const loadAssociates = useCallback(async () => {
    if (!targetVehicle || assocState !== 'idle' || routeStops.length === 0) return;
    setAssocState('loading');
    const seen = new Map<string, { id: string; plate: string; type: string; cam: string; when: string }>();
    for (const p of routeStops.slice(-6)) {
      try {
        const r = await apiClient.getVehicles({
          deviceIds: p.dev, startTime: new Date(p.t - 300_000).toISOString(), endTime: new Date(p.t + 300_000).toISOString(), limit: 20,
        });
        r.vehicles.forEach((v) => {
          if (v.id !== targetVehicle.id && v.plateNumber && !seen.has(v.id)) {
            seen.set(v.id, { id: v.id, plate: v.plateNumber, type: v.vehicleType, cam: p.cam, when: '±5 min' });
          }
        });
      } catch { /* skip */ }
    }
    setAssoc(Array.from(seen.values()).slice(0, 12));
    setAssocState('done');
  }, [targetVehicle, assocState, routeStops]);
  useEffect(() => { if (intelTab === 'associates') loadAssociates(); }, [intelTab, loadAssociates]);

  // Route scrubber auto-advance.
  useEffect(() => {
    if (!playing || displayStops.length < 2) return;
    const id = setInterval(() => setRouteStep((s) => (s + 1 >= displayStops.length ? 0 : s + 1)), 900);
    return () => clearInterval(id);
  }, [playing, displayStops.length]);

  // ── Simulated live alert feed once "deployed" ──────────────────────────────
  useEffect(() => {
    if (!deployed || !deployCamIds.length) return;
    const label = targetType === 'plate' ? (plate.trim().toUpperCase() || 'target')
      : targetType === 'person' ? (persons.find((p) => p.id === personId)?.name || 'person of interest')
        : `"${description.trim()}"`;
    const id = setInterval(() => {
      const cam = deployCamIds[Math.floor((Date.now() / 1000) % deployCamIds.length)];
      alertSeq.current += 1;
      setAlerts((prev) => [{
        id: alertSeq.current,
        cam: camName(cam),
        text: `${analytic.key} match — ${label}`,
        at: Date.now(),
      }, ...prev].slice(0, 12));
    }, 4500);
    return () => clearInterval(id);
  }, [deployed, deployCamIds, targetType, plate, description, personId, persons, analytic.key, camName]);

  const deploy = () => {
    if (!recCamIds.length || overBudget) return;
    const inv: Investigation = {
      id: `inv_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
      createdAt: Date.now(),
      targetType,
      plate: targetType === 'plate' ? plate.trim().toUpperCase() : undefined,
      description: targetType === 'description' ? description.trim() : undefined,
      personId: targetType === 'person' ? personId : undefined,
      personName: targetType === 'person' ? persons.find((p) => p.id === personId)?.name : undefined,
      timeKey, areaCamIds: selCamIds, resultCount,
      deployedCamIds: recCamIds, analyticKey: analytic.key, slotCost: recCost, status: 'active',
    };
    persist([inv, ...cases]);
    setCaseId(inv.id);
    setDeployCamIds(recCamIds);
    setDeployed(true);
    setAlerts([]);
  };
  const standDown = () => {
    setDeployed(false); setDeployCamIds([]); setAlerts([]);
    if (caseId) persist(cases.map((c) => (c.id === caseId ? { ...c, status: 'closed' as const } : c)));
    setCaseId(null);
  };

  // History CRUD
  const deleteCase = (id: string) => persist(cases.filter((c) => c.id !== id));
  const toggleCase = (id: string) => persist(cases.map((c) => (c.id === id ? { ...c, status: c.status === 'active' ? 'closed' as const : 'active' as const } : c)));
  const loadCase = (c: Investigation) => {
    const inp: QueryInputs = {
      targetType: c.targetType, plate: c.plate || '', description: c.description || '',
      personId: c.personId || '', timeKey: c.timeKey, selCamIds: c.areaCamIds || [],
    };
    setTargetType(inp.targetType); setPlate(inp.plate); setDescription(inp.description); setPersonId(inp.personId);
    setTimeKey(inp.timeKey); setSelCamIds(inp.selCamIds);
    setLeftTab('new');
    executeQuery(inp, { preferCache: true }); // instant from cache, Refresh re-fetches
  };

  return (
    <div className="h-full w-full flex overflow-hidden bg-zinc-950 text-zinc-100" style={{ ['--accent-color' as any]: ACCENT }}>
      {/* ── Left: case builder ──────────────────────────────────────────── */}
      <aside className="w-[340px] shrink-0 border-r border-white/5 flex flex-col overflow-y-auto">
        <div className="px-5 pt-5 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10">
              <Crosshair className="h-5 w-5" style={{ color: ACCENT }} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">Investigate</h1>
              <p className="text-[11px] text-zinc-500">Find · locate · deploy · track</p>
            </div>
          </div>
          <div className="flex gap-1 bg-zinc-900/70 border border-white/10 rounded-lg p-0.5">
            {(['new', 'history'] as const).map((t) => (
              <button key={t} onClick={() => setLeftTab(t)}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition ${leftTab === t ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'}`}>
                {t === 'new' ? 'New case' : `History${cases.length ? ` · ${cases.length}` : ''}`}
              </button>
            ))}
          </div>
        </div>

        {leftTab === 'history' ? (
          <div className="p-3 space-y-2 overflow-y-auto">
            {cases.length === 0 ? (
              <Empty icon={<Crosshair className="h-8 w-8" />} title="No past investigations" sub="Deploy a case and it'll be saved here." />
            ) : cases.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-zinc-900/50 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  {c.targetType === 'plate' ? <Car className="h-3.5 w-3.5 text-amber-400" /> : c.targetType === 'person' ? <ScanFace className="h-3.5 w-3.5 text-amber-400" /> : <Search className="h-3.5 w-3.5 text-amber-400" />}
                  <span className="text-[13px] font-semibold font-mono truncate flex-1">{caseLabel(c)}</span>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${c.status === 'active' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-700/40 text-zinc-400'}`}>{c.status}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-zinc-500 mb-2">
                  <span>{c.analyticKey}</span>
                  <span>{c.deployedCamIds.length} cam · {c.slotCost} slot{c.slotCost > 1 ? 's' : ''}</span>
                  <span>{c.resultCount} hits</span>
                  <span className="ml-auto">{fmtTime(c.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => loadCase(c)} className="flex-1 rounded-md border border-white/10 py-1 text-[11px] font-semibold text-zinc-300 hover:border-amber-500/40 hover:text-amber-300">Load</button>
                  <button onClick={() => toggleCase(c.id)} className="flex-1 rounded-md border border-white/10 py-1 text-[11px] font-semibold text-zinc-300 hover:border-white/25">{c.status === 'active' ? 'Close' : 'Reopen'}</button>
                  <button onClick={() => deleteCase(c.id)} title="Delete" className="grid place-items-center h-7 w-7 rounded-md border border-white/10 text-zinc-500 hover:text-red-400 hover:border-red-500/40"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="p-5 space-y-5">
          {/* Target type */}
          <div>
            <Label icon={<Sparkles className="h-3.5 w-3.5" />}>What are you looking for?</Label>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              {([['plate', 'Plate', Car], ['description', 'Describe', Search], ['person', 'Person', ScanFace]] as const).map(([k, l, Icon]) => (
                <button key={k} onClick={() => setTargetType(k)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-[11px] font-semibold transition ${
                    targetType === k ? 'bg-amber-500 text-black border-amber-500' : 'border-white/10 text-zinc-400 hover:border-white/25'}`}>
                  <Icon className="h-4 w-4" /> {l}
                </button>
              ))}
            </div>
          </div>

          {/* Target input */}
          <div>
            {targetType === 'plate' && (
              <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && run()}
                placeholder="Number plate — e.g. AP07EF0123"
                className="w-full bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50" />
            )}
            {targetType === 'description' && (
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                placeholder='Describe — e.g. "man in red shirt on a motorcycle"'
                className="w-full bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none" />
            )}
            {targetType === 'person' && (
              <select value={personId} onChange={(e) => setPersonId(e.target.value)}
                className="w-full bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500/50">
                <option value="">{persons.length ? 'Select a person…' : 'No FRS persons available'}</option>
                {persons.map((p) => <option key={p.id} value={p.id}>{p.name}{p.threatLevel ? ` · ${p.threatLevel}` : ''}</option>)}
              </select>
            )}
          </div>

          {/* Time */}
          <div>
            <Label icon={<Clock className="h-3.5 w-3.5" />}>Time window</Label>
            <select value={timeKey} onChange={(e) => setTimeKey(e.target.value)}
              className="w-full mt-2 bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50">
              {TIME_PRESETS.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
            </select>
          </div>

          {/* Area + map */}
          <div>
            <div className="flex items-center justify-between">
              <Label icon={<MapPin className="h-3.5 w-3.5" />}>Area of interest</Label>
              <button onClick={() => setMapModalOpen(true)} title="Expand map"
                className="flex items-center gap-1 text-[10px] font-semibold text-zinc-400 hover:text-amber-300 transition">
                <Maximize2 className="h-3 w-3" /> Expand
              </button>
            </div>
            <div className="mt-2 rounded-lg overflow-hidden border border-white/10 relative">
              <CameraMapPicker cameras={mapCams} selected={selCamIds} onChange={setSelCamIds} height={180} />
              <button onClick={() => setMapModalOpen(true)} title="Expand map"
                className="absolute top-2 right-2 z-[400] grid h-7 w-7 place-items-center rounded-md bg-black/70 border border-white/15 text-zinc-200 hover:text-amber-300 hover:border-amber-500/40">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[11px] text-zinc-500">
                {selCamIds.length ? `${selCamIds.length} camera${selCamIds.length > 1 ? 's' : ''} selected` : `${mapCams.length} cameras · tap to scope`}
              </p>
              {selCamIds.length > 0 && (
                <button onClick={() => setSelCamIds([])} className="text-[11px] font-semibold text-amber-400 hover:underline">Clear</button>
              )}
            </div>
          </div>

          <button onClick={run} disabled={loading || !canRun}
            className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-black disabled:opacity-40 transition"
            style={{ background: ACCENT }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Run investigation
          </button>
        </div>
        )}
      </aside>

      {/* ── Center: results ────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {!ran ? (
            <Empty icon={<Crosshair className="h-10 w-10" />} title="Start an investigation"
              sub="Pick a target, optionally scope an area + time, then Run. Historical hits appear here; deploy live tracking on the right." />
          ) : loading ? (
            <Empty icon={<Loader2 className="h-10 w-10 animate-spin" />} title="Searching…" sub="Querying ANPR / Search / FRS across the selected scope." />
          ) : resultCount === 0 ? (
            <Empty icon={<Search className="h-10 w-10" />} title="No historical hits" sub="Widen the time window or area — or deploy live tracking to catch it going forward." />
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 gap-3">
                <p className="text-sm text-zinc-300">
                  <span className="font-bold text-white">{resultCount}</span> historical hit{resultCount > 1 ? 's' : ''} · across <span className="font-bold text-white">{hitCamIds.length}</span> camera{hitCamIds.length > 1 ? 's' : ''}
                  {cachedAt && <span className="text-[11px] text-zinc-500 ml-2">· {fromCache ? 'cached' : 'live'} {agoLabel(cachedAt)}</span>}
                </p>
                <button onClick={run} disabled={loading || !canRun} title="Re-fetch live"
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-1.5 text-[12px] font-semibold text-zinc-300 hover:border-amber-500/50 hover:text-amber-300 transition disabled:opacity-40">
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {/* Plate hits */}
                {vehicles.map((v) => {
                  const det = v.detections?.[0];
                  const img = det?.vehicleImageUrl || det?.fullImageUrl || det?.plateImageUrl;
                  return <HitCard key={v.id} img={img} title={v.plateNumber || 'UNKNOWN'} cam={camName(det?.deviceId || '')} time={fmtTime(v.lastSeen)} onOpen={() => window.open(`/itms/anpr/${v.id}`, '_blank')} />;
                })}
                {/* Search clips */}
                {clips.map((c) => (
                  <HitCard key={c.id} img={c.thumbnailUrl} title={`${(c.score * 100).toFixed(0)}% match`} cam={camName(c.deviceId) || c.deviceName} time={c.timeLabel}
                    onOpen={() => setActiveHit({ kind: 'clip', img: c.thumbnailUrl, title: `${(c.score * 100).toFixed(0)}% match`, cam: camName(c.deviceId) || c.deviceName, time: c.timeLabel, deviceId: c.deviceId, timestamp: c.timestamp, score: c.score })} />
                ))}
                {/* Face hits */}
                {faceHits.map((f) => (
                  <HitCard key={f.id} img={f.faceSnapshotUrl || f.fullSnapshotUrl || undefined} title={`${(f.matchScore * 100).toFixed(0)}% match`} cam={camName(f.deviceId)} time={fmtTime(f.timestamp)}
                    onOpen={() => setActiveHit({ kind: 'face', img: f.faceSnapshotUrl || f.fullSnapshotUrl || undefined, title: `${(f.matchScore * 100).toFixed(0)}% match`, cam: camName(f.deviceId), time: fmtTime(f.timestamp), deviceId: f.deviceId, score: f.matchScore, openUrl: '/analytics/frs' })} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Intel panel: Route · Associates · Pattern (resizable) ─────── */}
        {ran && (
          <div className="shrink-0 border-t border-white/10 flex flex-col bg-zinc-950/60 relative" style={{ height: panelH }}>
            {/* drag handle */}
            <div onMouseDown={startResize} title="Drag to resize"
              className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize group z-10 flex items-center justify-center">
              <div className="h-1 w-10 rounded-full bg-white/15 group-hover:bg-amber-500/60 transition" />
            </div>
            <div className="flex items-center gap-1 px-3 border-b border-white/5">
              {([['route', 'Route', Route], ['associates', 'Associates', Users], ['pattern', 'Pattern', BarChart3]] as const).map(([k, l, Icon]) => (
                <button key={k} onClick={() => setIntelTab(k)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition ${intelTab === k ? 'border-amber-500 text-amber-300' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                  <Icon className="h-3.5 w-3.5" /> {l}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {intelTab === 'route' && (() => {
                const stops = displayStops;
                const step = Math.min(routeStep, Math.max(0, stops.length - 1));
                const cur = stops[step];
                const mapH = Math.max(140, panelH - 168); // explicit px so leaflet renders
                return (
                  <div className="flex flex-col gap-2">
                    <PanelHeader real={hasRoute} title="Movement trace" sub={`${stops.length} stops · now at ${cur ? cur.cam : '—'}`} />
                    <div style={{ height: mapH }} className="rounded-lg overflow-hidden border border-white/10">
                      <RouteMap stops={stops} active={step} />
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => setPlaying((p) => !p)} className="grid place-items-center h-8 w-8 rounded-full text-black shrink-0" style={{ background: ACCENT }}>
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                      </button>
                      <input type="range" min={0} max={stops.length - 1} value={step} onChange={(e) => { setRouteStep(Number(e.target.value)); setPlaying(false); }} className="flex-1 accent-amber-500" />
                      <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">{step + 1}/{stops.length} · {cur ? cur.label : ''}</span>
                    </div>
                  </div>
                );
              })()}

              {intelTab === 'associates' && (() => {
                if (targetVehicle && assocState === 'loading') {
                  return <div className="h-full flex items-center justify-center text-zinc-500 text-sm gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Scanning ±5 min windows…</div>;
                }
                const real = assoc.length > 0;
                const rows = real ? assoc : SAMPLE_ASSOC;
                return (
                  <div>
                    <PanelHeader real={real} title="Co-occurring vehicles" sub="click to investigate · same camera · ±5 min" />
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {rows.map((a, i) => (
                        <div key={i} onClick={() => pivotToPlate(a.plate)} title={`Investigate ${a.plate}`}
                          className="group relative rounded-lg border border-white/10 bg-zinc-900/50 p-2.5 cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/[0.04] transition">
                          <div className="flex items-center gap-1.5 pr-5">
                            <Car className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span className="text-[12px] font-mono font-semibold truncate">{a.plate}</span>
                          </div>
                          <p className="text-[10px] text-zinc-500 mt-1 truncate">{a.type} · {a.cam}</p>
                          <p className="text-[10px] text-zinc-600">{a.when}</p>
                          {(a as { id?: string }).id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); window.open(`/itms/anpr/${(a as { id?: string }).id}`, '_blank', 'noopener,noreferrer'); }}
                              title="Open ANPR record in new tab"
                              className="absolute top-2 right-2 text-zinc-600 hover:text-amber-300 opacity-0 group-hover:opacity-100 transition">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {intelTab === 'pattern' && (() => {
                const real = hasPattern;
                const hours = real ? hourHist : SAMPLE_HOURS;
                const cams = real ? topCams : SAMPLE_TOPCAMS;
                const max = Math.max(1, ...hours);
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div>
                      <PanelHeader real={real} title="When · hour of day" sub="" />
                      <div className="flex items-end gap-0.5 h-24">
                        {hours.map((n, h) => (
                          <div key={h} className="flex-1 flex flex-col justify-end h-full" title={`${String(h).padStart(2, '0')}:00 · ${n}`}>
                            <div className="w-full rounded-t bg-amber-500" style={{ height: `${Math.max((n / max) * 100, n > 0 ? 6 : 2)}%` }} />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-[9px] text-zinc-600 mt-1"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
                    </div>
                    <div>
                      <PanelHeader real={real} title="Where · most seen" sub="" />
                      <div className="space-y-2">
                        {cams.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-[12px]">
                            <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span className="flex-1 truncate">{c.cam}</span>
                            <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${c.pct}%` }} /></div>
                            <span className="text-zinc-400 tabular-nums w-9 text-right">{c.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </main>

      {/* ── Right: GPU deployment (simulated) + live feed ──────────────── */}
      <aside className="w-[330px] shrink-0 border-l border-white/5 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-amber-400" />
          <div>
            <p className="text-sm font-semibold">Live Deployment</p>
            <p className="text-[10px] text-zinc-500">GPU analytics allocation · simulated</p>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Budget meter */}
          <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-zinc-400 font-semibold uppercase tracking-wider">GPU slots</span>
              <span className="tabular-nums"><span className="font-bold text-white">{usedSlots}</span><span className="text-zinc-500">/{SLOTS_TOTAL}</span></span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden flex">
              <div className="h-full bg-zinc-500" style={{ width: `${(SLOTS_BASELINE / SLOTS_TOTAL) * 100}%` }} title="Baseline allocation" />
              {activeSlots > 0 && <div className="h-full bg-amber-500" style={{ width: `${(activeSlots / SLOTS_TOTAL) * 100}%` }} title="Active investigations" />}
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1.5">
              <span><span className="inline-block w-2 h-2 rounded-sm bg-zinc-500 mr-1 align-middle" />Baseline {SLOTS_BASELINE}</span>
              <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-500 mr-1 align-middle" />Active {activeSlots}</span>
              <span className="text-emerald-400 font-semibold">{freeSlots} free</span>
            </div>
          </div>

          {/* Notify on match — UI-only demo of available channels */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5"><Bell className="h-3.5 w-3.5 text-amber-400" /> Notify on match</p>
            <div className="space-y-1.5">
              {([
                ['alert', 'In-app alert', Bell, null],
                ['whatsapp', 'WhatsApp', MessageCircle, 'phone'],
                ['email', 'Email', Mail, 'email'],
                ['sms', 'SMS', MessageSquare, 'phone'],
                ['call', 'Voice call', Phone, 'phone'],
              ] as const).map(([key, label, Icon, kind]) => {
                const on = notify[key];
                return (
                  <div key={key}>
                    <button type="button" onClick={() => setNotify((n) => ({ ...n, [key]: !n[key] }))}
                      className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition ${on ? 'border-amber-500/40 bg-amber-500/[0.06] text-amber-200' : 'border-white/10 text-zinc-400 hover:border-white/20'}`}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 text-left">{label}</span>
                      <span className={`relative w-7 h-4 rounded-full transition ${on ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
                      </span>
                    </button>
                    {on && kind === 'email' && (
                      <input value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} type="email" placeholder="officer@dept.gov.in"
                        className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-amber-500/40" />
                    )}
                    {on && kind === 'phone' && (
                      <input value={notifyPhone} onChange={(e) => setNotifyPhone(e.target.value)} type="tel" placeholder="+91 90000 00000"
                        className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] font-mono focus:outline-none focus:border-amber-500/40" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!deployed ? (
            <>
              {/* Recommendation */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Recommended deployment</p>
                {recCamIds.length === 0 ? (
                  <div className="text-[12px] text-zinc-600 rounded-lg border border-dashed border-white/10 p-3 text-center">
                    Run an investigation (or select area cameras) to get a deployment plan.
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 mb-2 text-[12px]">
                      Activate <span className="font-bold text-amber-300">{analytic.label}</span> on{' '}
                      <span className="font-bold">{recCamIds.length}</span> camera{recCamIds.length > 1 ? 's' : ''}
                      {selCamIds.length ? ' in the selected area' : ' where the target appeared'}.
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                      {recCamIds.map((id) => (
                        <div key={id} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                          <Radio className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                          <span className="flex-1 truncate">{camName(id)}</span>
                          <span className="text-[10px] font-semibold text-amber-300/90">{analytic.key}</span>
                          <span className="text-[10px] text-zinc-500 tabular-nums">{analytic.cost} slot{analytic.cost > 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[12px]">
                      <span className="text-zinc-400">Total cost</span>
                      <span className={`font-bold tabular-nums ${overBudget ? 'text-red-400' : 'text-amber-300'}`}>{recCost} slot{recCost > 1 ? 's' : ''}</span>
                    </div>
                    {overBudget && <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Exceeds free capacity — free up slots or narrow the area.</p>}
                    <button onClick={deploy} disabled={overBudget}
                      className="w-full mt-3 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-black disabled:opacity-40 transition"
                      style={{ background: ACCENT }}>
                      <Activity className="h-4 w-4" /> Deploy live tracking
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Active deployment */}
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-300">
                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" /></span>
                    Live on {deployCamIds.length} camera{deployCamIds.length > 1 ? 's' : ''}
                  </span>
                  <button onClick={standDown} className="text-[11px] font-semibold text-zinc-400 hover:text-white">Stand down</button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {deployCamIds.map((id) => (
                    <span key={id} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300/90 border border-emerald-500/20">{camName(id)}</span>
                  ))}
                </div>
              </div>

              {/* Live alert feed */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-amber-400" /> Live alerts
                </p>
                {alerts.length === 0 ? (
                  <div className="text-[12px] text-zinc-600 rounded-lg border border-dashed border-white/10 p-4 text-center flex items-center justify-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Watching for matches…
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {alerts.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/50 px-2.5 py-2 text-[12px]">
                        <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">LIVE</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{a.text}</p>
                          <p className="text-[10px] text-zinc-500">{a.cam} · just now</p>
                        </div>
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── Expanded map modal ─────────────────────────────────────────── */}
      {mapModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setMapModalOpen(false)}>
          <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-zinc-950 overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-semibold">Area of interest — select cameras</p>
                <span className="text-[11px] text-zinc-500">{selCamIds.length ? `${selCamIds.length} selected` : `${mapCams.length} cameras`}</span>
              </div>
              <div className="flex items-center gap-2">
                {selCamIds.length > 0 && (
                  <button onClick={() => setSelCamIds([])} className="text-[11px] font-semibold text-amber-400 hover:underline">Clear</button>
                )}
                <button onClick={() => setMapModalOpen(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <CameraMapPicker cameras={mapCams} selected={selCamIds} onChange={setSelCamIds} height={Math.round(window.innerHeight * 0.7)} />
          </div>
        </div>
      )}

      {/* Result preview popup (clip playback for CLIP hits, snapshot for faces) */}
      {activeHit && <HitModal hit={activeHit} onClose={() => setActiveHit(null)} />}
    </div>
  );
}

// ── small building blocks ────────────────────────────────────────────────────
function PanelHeader({ real, title, sub }: { real: boolean; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <p className="text-[12px] font-bold text-zinc-200">{title}</p>
      {sub && <span className="text-[11px] text-zinc-500">{sub}</span>}
      {!real && <span className="ml-auto text-[9px] font-black uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">Sample</span>}
    </div>
  );
}
function Label({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{icon}{children}</div>;
}
function Empty({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="text-zinc-700 mb-4">{icon}</div>
      <p className="text-sm font-semibold text-zinc-300">{title}</p>
      <p className="text-xs text-zinc-600 mt-1 max-w-sm">{sub}</p>
    </div>
  );
}
function HitCard({ img, title, cam, time, onOpen }: { img?: string | null; title: string; cam: string; time: string; onOpen?: () => void }) {
  return (
    <button onClick={onOpen} className={`block text-left rounded-xl overflow-hidden border border-white/10 bg-zinc-900/60 ${onOpen ? 'cursor-pointer hover:border-amber-500/40' : 'cursor-default'} transition`}>
      <div className="aspect-video bg-black/40 flex items-center justify-center relative">
        {img ? <img src={img} alt={title} className="w-full h-full object-cover" loading="lazy" /> : <Car className="h-6 w-6 text-zinc-700" />}
        {onOpen && <ExternalLink className="absolute top-1 right-1 h-3.5 w-3.5 text-white/70" />}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold font-mono truncate">{title}</p>
        <p className="text-[10px] text-zinc-500 truncate flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{cam}</p>
        <p className="text-[10px] text-zinc-600">{time}</p>
      </div>
    </button>
  );
}

// Result preview popup. For CLIP hits it pulls the surrounding clip frames from
// the search sidecar (/searchapi/clip) and auto-plays them; for face/plate hits
// it just shows the enlarged snapshot. Mirrors SearchPage's ClipModal behavior.
function HitModal({ hit, onClose }: { hit: HitDetail; onClose: () => void }) {
  const [frames, setFrames] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loadingClip, setLoadingClip] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    if (hit.kind === 'clip' && hit.deviceId && hit.timestamp != null) {
      setLoadingClip(true);
      apiClient.getSearchClip(hit.deviceId, hit.timestamp)
        .then((c) => { if (alive) { setFrames(c.frames || []); setIdx(c.matchIndex || 0); } })
        .catch(() => { if (alive) setFrames([]); })
        .finally(() => { if (alive) setLoadingClip(false); });
    }
    return () => { alive = false; };
  }, [hit]);

  useEffect(() => {
    if (!playing || !frames || frames.length < 2) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % frames.length), 1000 / 6);
    return () => window.clearInterval(id);
  }, [playing, frames]);

  const big = frames && frames.length ? frames[Math.min(idx, frames.length - 1)] : hit.img;
  const hasClip = hit.kind === 'clip';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden border border-white/10 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            {hit.kind === 'clip' ? <Search className="h-4 w-4 text-amber-400 shrink-0" /> : hit.kind === 'face' ? <ScanFace className="h-4 w-4 text-amber-400 shrink-0" /> : <Car className="h-4 w-4 text-amber-400 shrink-0" />}
            <p className="text-sm font-semibold font-mono truncate">{hit.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative bg-black flex items-center justify-center" style={{ minHeight: 280 }}>
          {big ? (
            <img src={big} alt={hit.title} className="max-h-[60vh] w-auto object-contain" />
          ) : (
            <div className="py-20 text-zinc-700"><ScanFace className="h-10 w-10" /></div>
          )}
          {loadingClip && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
            </div>
          )}
          {hasClip && frames && frames.length > 1 && (
            <button onClick={() => setPlaying((p) => !p)}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/90 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-300">
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </button>
          )}
        </div>
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-[12px] text-zinc-400 min-w-0">
            <span className="inline-flex items-center gap-1 truncate"><MapPin className="h-3 w-3" />{hit.cam}</span>
            <span className="inline-flex items-center gap-1 shrink-0"><Clock className="h-3 w-3" />{hit.time}</span>
            {hit.score != null && <span className="inline-flex items-center gap-1 shrink-0"><Sparkles className="h-3 w-3" />{(hit.score * 100).toFixed(0)}%</span>}
          </div>
          {hit.openUrl && (
            <a href={hit.openUrl} target="_blank" rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-1.5 text-[12px] font-semibold text-zinc-300 hover:border-amber-500/50 hover:text-amber-300 transition">
              <ExternalLink className="h-3.5 w-3.5" /> Open record
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default InvestigatePage;
