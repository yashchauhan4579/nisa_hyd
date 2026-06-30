import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  apiClient, type Vehicle, type VehicleDetection, type TrafficViolation,
} from '@/lib/api';
import {
  Loader2, Car, Eye, EyeOff, MapPin, Clock, Camera, AlertTriangle,
  ArrowLeft, Gauge, Hash, Palette, ExternalLink, FileText, User, ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  }) : '—';

const ago = (s?: string | null) => {
  if (!s) return '';
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
};

const TYPE_COLOR: Record<string, string> = {
  '2W': 'bg-amber-500', '4W': 'bg-green-500', AUTO: 'bg-yellow-500',
  BUS: 'bg-amber-500', HMV: 'bg-red-500', UNKNOWN: 'bg-gray-500',
};
const typeColor = (t?: string) => TYPE_COLOR[t || ''] || 'bg-gray-500';

const hasGeo = (d?: { lat?: number; lng?: number } | null) =>
  !!d && Number.isFinite(d.lat) && Number.isFinite(d.lng) && ((d!.lat as number) !== 0 || (d!.lng as number) !== 0);

const detImage = (d?: VehicleDetection) => d?.vehicleImageUrl || d?.fullImageUrl || d?.plateImageUrl || undefined;

type Junction = { id: string; lat: number; lng: number; name: string; count: number; last: string };

// ── inline multi-marker map ──────────────────────────────────────────────────
function MapMarkers({ junctions, focusId }: { junctions: Junction[]; focusId?: string }) {
  const map = useMap();
  useEffect(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim() || '#f59e0b';
    const layers: L.Layer[] = [];
    junctions.forEach((j) => {
      const active = j.id === focusId;
      const fill = active ? accent : '#a1a1aa';
      const icon = L.divIcon({
        className: '',
        html: `<svg width="${active ? 32 : 26}" height="${active ? 42 : 34}" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill="${fill}"/>
          <circle cx="17" cy="17" r="6" fill="#18181b"/></svg>`,
        iconSize: [active ? 32 : 26, active ? 42 : 34],
        iconAnchor: [active ? 16 : 13, active ? 42 : 34],
      });
      const m = L.marker([j.lat, j.lng], { icon }).addTo(map);
      m.bindTooltip(`${j.name} · ${j.count}×`, { direction: 'top', offset: [0, active ? -42 : -34], className: 'sight-tip' });
      layers.push(m);
    });
    if (focusId) {
      const f = junctions.find((j) => j.id === focusId);
      if (f) map.setView([f.lat, f.lng], 16, { animate: true });
    } else if (junctions.length === 1) {
      map.setView([junctions[0].lat, junctions[0].lng], 15);
    } else if (junctions.length > 1) {
      map.fitBounds(L.latLngBounds(junctions.map((j) => [j.lat, j.lng] as [number, number])).pad(0.3));
    }
    return () => layers.forEach((l) => map.removeLayer(l));
  }, [junctions, focusId, map]);
  return null;
}

function StatTile({ icon: Icon, label, value, accent }: { icon: any; label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', accent || 'bg-amber-500/10 text-amber-500')}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}

// ── Simulated VAHAN (RC) lookup — deterministic from the plate, no API call ──
type VahanRecord = {
  owner: string; regNo: string; regDate: string; make: string; model: string;
  vClass: string; fuel: string; color: string; rto: string; state: string;
  insUpto: string; fitnessUpto: string; chassis: string; engine: string; ownerSerial: number;
};
const VH_STATES: Record<string, string> = { AP: 'Andhra Pradesh', TS: 'Telangana', TG: 'Telangana', KA: 'Karnataka', TN: 'Tamil Nadu', MH: 'Maharashtra', DL: 'Delhi', KL: 'Kerala', TL: 'Telangana' };
const VH_RTO: Record<string, string> = { '39': 'Vijayawada', '07': 'Vijayawada', '40': 'Guntur', '16': 'Visakhapatnam', '31': 'Visakhapatnam', '09': 'Hyderabad', '37': 'Eluru', '38': 'Machilipatnam' };
const VH_OWNERS = ['Ravi Kumar', 'Suresh Babu', 'Lakshmi Narayana', 'Venkata Rao', 'Priya Sharma', 'Anil Reddy', 'Mohammed Imran', 'Sai Krishna', 'Devi Prasad', 'Naga Lakshmi', 'Srinivas Rao', 'Padmavathi'];
const VH_4W = [['Maruti Suzuki', 'Swift VXI'], ['Hyundai', 'i20 Sportz'], ['Tata', 'Nexon XM'], ['Toyota', 'Innova Crysta'], ['Honda', 'City ZX'], ['Mahindra', 'Scorpio N']];
const VH_2W = [['Honda', 'Activa 6G'], ['Bajaj', 'Pulsar 150'], ['TVS', 'Apache RTR 160'], ['Hero', 'Splendor Plus'], ['Royal Enfield', 'Classic 350']];
const VH_FUEL = ['Petrol', 'Diesel', 'CNG', 'Electric'];
const VH_COLOR = ['White', 'Silver', 'Black', 'Grey', 'Red', 'Blue', 'Maroon'];
const VH_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function vhHash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
function simulateVahan(plate: string, vehicle: Vehicle | null): VahanRecord {
  const p = (plate || 'AP00XX0000').toUpperCase();
  const h = vhHash(p);
  const st = p.slice(0, 2), rto = p.slice(2, 4);
  const is2W = vehicle?.vehicleType === '2W';
  const arr = is2W ? VH_2W : VH_4W;
  const mm = vehicle?.make && vehicle?.model ? [vehicle.make, vehicle.model] : arr[h % arr.length];
  const regYear = 2014 + (h % 11);
  const d2 = (n: number) => String(n).padStart(2, '0');
  const regDate = `${d2((h % 28) + 1)}-${VH_MON[(h >> 5) % 12]}-${regYear}`;
  return {
    owner: VH_OWNERS[(h >> 3) % VH_OWNERS.length],
    regNo: p, regDate, make: mm[0], model: mm[1],
    vClass: is2W ? 'Motor Cycle' : 'Motor Car (LMV)',
    fuel: vehicle?.vehicleType === '2W' ? VH_FUEL[h % 2] : VH_FUEL[h % VH_FUEL.length],
    color: vehicle?.color || VH_COLOR[(h >> 2) % VH_COLOR.length],
    rto: `${st}${rto} · ${VH_RTO[rto] || 'Regional Transport Office'}`,
    state: VH_STATES[st] || st,
    insUpto: `${d2((h % 28) + 1)}-${VH_MON[(h >> 6) % 12]}-${2025 + (h % 2)}`,
    fitnessUpto: `${d2((h % 28) + 1)}-${VH_MON[(h >> 7) % 12]}-${regYear + 15}`,
    chassis: `MA${(h % 9) + 1}NB${(p.slice(-4))}${d2(h % 90 + 10)}`,
    engine: `${st}${(h % 90) + 10}E${String((h >> 4) % 1_000_000).padStart(6, '0')}`,
    ownerSerial: (h % 3) + 1,
  };
}

// ── page ─────────────────────────────────────────────────────────────────────
export function VehicleDetailPage() {
  // `id` is a vehicle id by default; with ?src=violation it's a *violation* id
  // (the two tables have overlapping ids, so the source must be explicit).
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const src = searchParams.get('src'); // 'violation' | null
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [detections, setDetections] = useState<VehicleDetection[]>([]);
  const [violations, setViolations] = useState<TrafficViolation[]>([]);
  const [synthesized, setSynthesized] = useState(false); // header built from a plate with no vehicle row
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | undefined>();
  const [vahan, setVahan] = useState<VahanRecord | null>(null);
  const [vahanLoading, setVahanLoading] = useState(false);
  const fetchVahan = () => {
    setVahanLoading(true);
    // Simulated VAHAN lookup — no real API call; deterministic from the plate.
    setTimeout(() => { setVahan(simulateVahan(vehicle?.plateNumber || '', vehicle)); setVahanLoading(false); }, 1200);
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);

      // Resolve the plate + (optional) real vehicle, depending on the source.
      let veh: Vehicle | null = null;
      let plate = '';
      if (src === 'violation') {
        const vio = await apiClient.getViolation(id); // violations table
        plate = (vio.plateNumber || '').trim();
        const res = await apiClient.getVehicles({ plateNumber: plate, limit: 1 }).catch(() => null);
        veh = res?.vehicles?.[0] ?? null;
      } else {
        veh = await apiClient.getVehicle(id); // vehicles table
        plate = (veh.plateNumber || '').trim();
      }

      const vehId = veh?.id;

      // Detections + violations (by vehicle id where we have one, plus by plate).
      const [dets, byVeh] = await Promise.all([
        vehId ? apiClient.getVehicleDetections(vehId, { limit: 100 }).catch(() => [] as VehicleDetection[]) : Promise.resolve([] as VehicleDetection[]),
        vehId ? apiClient.getVehicleViolations(vehId, { limit: 100 }).catch(() => [] as TrafficViolation[]) : Promise.resolve([] as TrafficViolation[]),
      ]);
      const byPlate = plate
        ? await apiClient.getViolations({ plateNumber: plate, limit: 100 }).then((r) => r.violations).catch(() => [])
        : [];
      const merged = new Map<string | number, TrafficViolation>();
      [...byVeh, ...byPlate].forEach((v) => merged.set(v.id, v));
      const allViolations = Array.from(merged.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // No vehicle row → synthesize a header from the plate so the page still renders.
      if (!veh && plate) {
        veh = {
          id: '', plateNumber: plate, vehicleType: 'UNKNOWN', make: null, model: null, color: null,
          firstSeen: allViolations[allViolations.length - 1]?.timestamp || new Date().toISOString(),
          lastSeen: allViolations[0]?.timestamp || new Date().toISOString(),
          detectionCount: 0, isWatchlisted: false, createdAt: '', updatedAt: '',
        } as Vehicle;
        setSynthesized(true);
      } else {
        setSynthesized(false);
      }

      setVehicle(veh);
      setDetections(dets);
      setViolations(allViolations);
    } catch (err) {
      console.error('Failed to load vehicle:', err);
      setError(src === 'violation' ? 'Violation not found' : 'Vehicle not found');
    } finally {
      setLoading(false);
    }
  }, [id, src]);

  useEffect(() => { load(); }, [load]);

  const toggleWatchlist = async () => {
    if (!vehicle || !vehicle.id) return; // synthesized (plate-only) entries can't be watchlisted
    try {
      if (vehicle.isWatchlisted) {
        await apiClient.removeFromWatchlist(vehicle.id);
      } else {
        const reason = window.prompt('Reason for adding to watchlist:');
        if (!reason) return;
        await apiClient.addToWatchlist(vehicle.id, { reason, addedBy: 'user', alertOnDetection: true, alertOnViolation: true });
      }
      load();
    } catch (err) {
      console.error('Watchlist update failed:', err);
    }
  };

  // Distinct geo-located junctions (from both sightings and violations), with counts.
  const junctions = useMemo<Junction[]>(() => {
    const map = new Map<string, Junction>();
    const add = (dev: { id: string; lat: number; lng: number; name?: string } | null | undefined, ts: string) => {
      if (!hasGeo(dev)) return;
      const j = map.get(dev!.id) || { id: dev!.id, lat: dev!.lat, lng: dev!.lng, name: dev!.name || dev!.id, count: 0, last: ts };
      j.count += 1;
      if (new Date(ts) > new Date(j.last)) j.last = ts;
      map.set(dev!.id, j);
    };
    detections.forEach((d) => add(d.device, d.timestamp));
    violations.forEach((v) => add(v.device as any, v.timestamp));
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [detections, violations]);

  if (loading) {
    return <div className="h-full flex items-center justify-center bg-background/50"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
  }
  if (error || !vehicle) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-background/50">
        <Car className="w-12 h-12 opacity-50" />
        <p>{error || 'Vehicle not found'}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/itms/anpr')}>Back to ANPR</Button>
      </div>
    );
  }

  const hero = detections[0];
  const latestVio = violations[0];
  const heroImg = hero?.vehicleImageUrl || hero?.fullImageUrl || latestVio?.fullSnapshotUrl || undefined;
  const heroPlate = hero?.plateImageUrl || latestVio?.plateImageUrl || undefined;
  const daysActive = Math.max(1, Math.ceil((new Date(vehicle.lastSeen).getTime() - new Date(vehicle.firstSeen).getTime()) / 86_400_000));

  return (
    <div className="h-full overflow-y-auto bg-background/50">
      {/* ── Sticky header ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 glass border-b border-white/10 px-5 py-3">
        <div className="absolute top-0 left-1/4 w-[400px] h-full bg-amber-500/10 blur-[80px] pointer-events-none" />
        <div className="relative z-10 flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate('/itms/anpr')} title="Back to ANPR">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono tracking-tight">{vehicle.plateNumber || 'UNKNOWN'}</h1>
            <Badge className={cn('text-white', typeColor(vehicle.vehicleType))}>{vehicle.vehicleType}</Badge>
            {vehicle.isWatchlisted && <Badge variant="warning" className="gap-1"><Eye className="w-3 h-3" /> Watchlisted</Badge>}
            {vehicle.make && vehicle.model && <span className="text-sm text-muted-foreground">{vehicle.make} {vehicle.model}</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {junctions.length > 0 && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${junctions[0].lat},${junctions[0].lng}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center h-8 px-3 rounded-md text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4 mr-2" />Maps
              </a>
            )}
            {!synthesized && (
              <Button variant="outline" size="sm" onClick={toggleWatchlist}>
                {vehicle.isWatchlisted ? <><EyeOff className="w-4 h-4 mr-2" />Remove</> : <><Eye className="w-4 h-4 mr-2" />Watchlist</>}
              </Button>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="relative z-10 mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1 divide-x divide-white/5">
          <StatTile icon={Camera} label="Detections" value={vehicle.detectionCount} />
          <StatTile icon={AlertTriangle} label="Violations" value={violations.length} accent={violations.length ? 'bg-red-500/10 text-red-500' : undefined} />
          <StatTile icon={MapPin} label="Cameras" value={junctions.length || '—'} />
          <StatTile icon={Gauge} label="Days Active" value={daysActive} />
          <StatTile icon={Clock} label="First Seen" value={fmt(vehicle.firstSeen)} />
          <StatTile icon={Clock} label="Last Seen" value={<span title={fmt(vehicle.lastSeen)}>{ago(vehicle.lastSeen)}</span>} />
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="p-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* LEFT: hero + sightings + violations */}
        <div className="xl:col-span-2 space-y-4">
          {/* Hero sighting */}
          {(heroImg || heroPlate) && (
            <Card className="glass p-0 overflow-hidden relative">
              <div className="relative w-full bg-black flex items-center justify-center" style={{ height: 'min(48vh, 460px)' }}>
                {heroImg && <img src={heroImg} alt={vehicle.plateNumber || 'vehicle'} className="w-full h-full object-contain" />}
                {heroPlate && (
                  <div className="absolute top-3 right-3 rounded-md overflow-hidden border-2 border-amber-400/60 shadow-2xl bg-black/80 backdrop-blur">
                    <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-amber-400 font-semibold">Plate</div>
                    <img src={heroPlate} alt="Plate" className="block max-h-16 max-w-[220px] object-contain" />
                  </div>
                )}
                {hero && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 flex items-center gap-3 text-xs text-zinc-300">
                    {hero.device && <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-amber-400" />{hero.device.name || hero.device.id}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmt(hero.timestamp)}</span>
                    {hero.direction && <Badge variant="outline" className="text-[10px]">{hero.direction}</Badge>}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Sightings gallery */}
          <Card className="glass p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-500" /> Sightings ({detections.length})
            </h2>
            {detections.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">No detections recorded</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {detections.map((d) => {
                  const img = detImage(d);
                  const geo = hasGeo(d.device);
                  return (
                    <div
                      key={d.id}
                      onClick={() => geo && setFocusId(d.device!.id)}
                      className={cn('rounded-lg overflow-hidden border border-white/10 bg-black/30', geo && 'cursor-pointer hover:border-amber-500/50')}
                      title={geo ? 'Show on map' : undefined}
                    >
                      <div className="aspect-video bg-black/40 flex items-center justify-center">
                        {img ? <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Car className="w-6 h-6 text-muted-foreground/40" />}
                      </div>
                      <div className="p-2">
                        <div className="text-[11px] font-medium truncate flex items-center gap-1">
                          <MapPin className={cn('w-3 h-3 shrink-0', geo ? 'text-amber-500' : 'text-muted-foreground/50')} />
                          {d.device?.name || d.device?.id || 'Unknown camera'}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{fmt(d.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Violations */}
          {violations.length > 0 && (
            <Card className="glass p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" /> Violations ({violations.length})
              </h2>
              <div className="space-y-2">
                {violations.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => window.open('/itms/violations', '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-3 p-2 rounded-lg border border-white/5 hover:border-white/15 hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    {(v.fullSnapshotUrl || v.plateImageUrl) && (
                      <img src={v.fullSnapshotUrl || v.plateImageUrl || ''} alt="" className="w-20 h-14 object-cover rounded shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge className="bg-red-500 text-white text-[10px]">{v.violationType}</Badge>
                        <Badge variant={v.status === 'APPROVED' ? 'success' : v.status === 'REJECTED' ? 'destructive' : v.status === 'FINED' ? 'warning' : 'default'} className="text-[10px]">
                          {v.status}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">{fmt(v.timestamp)}</div>
                      {v.detectedSpeed ? <div className="text-[11px] font-semibold text-red-500">{v.detectedSpeed.toFixed(0)} km/h</div> : null}
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT: map (default) + camera list + attributes */}
        <div className="space-y-4">
          {/* Embedded map */}
          <Card className="glass p-0 overflow-hidden xl:sticky xl:top-[148px]">
            <style>{`.sight-tip{background:#18181b;color:#fafafa;border:1px solid rgba(255,255,255,.1);font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;}.sight-tip:before{border-top-color:rgba(255,255,255,.1);}`}</style>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-500" /> Movement
              </h2>
              {focusId && <button onClick={() => setFocusId(undefined)} className="text-[11px] text-amber-500 hover:underline">Reset view</button>}
            </div>
            {junctions.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                <MapPin className="w-8 h-8 opacity-40" /> No geo-located sightings
              </div>
            ) : (
              <MapContainer center={[junctions[0].lat, junctions[0].lng]} zoom={14} style={{ height: 300, background: '#0a0a0a' }} attributionControl={false} scrollWheelZoom={false}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                <MapMarkers junctions={junctions} focusId={focusId} />
              </MapContainer>
            )}
            {/* Camera list */}
            {junctions.length > 0 && (
              <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                {junctions.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setFocusId(j.id === focusId ? undefined : j.id)}
                    className={cn('w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/[0.04] transition-colors', j.id === focusId && 'bg-amber-500/10')}
                  >
                    <MapPin className={cn('w-4 h-4 shrink-0', j.id === focusId ? 'text-amber-500' : 'text-muted-foreground')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{j.name}</div>
                      <div className="text-[10px] text-muted-foreground">Last {ago(j.last)}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] tabular-nums">{j.count}×</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Attributes */}
          <Card className="glass p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Hash className="w-4 h-4 text-amber-500" /> Attributes
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Attr label="Type" value={vehicle.vehicleType} />
              <Attr label="Make / Model" value={vehicle.make && vehicle.model ? `${vehicle.make} ${vehicle.model}` : '—'} />
              <Attr label="Color" value={vehicle.color || '—'} icon={Palette} />
              <Attr label="Plate" value={vehicle.plateNumber || '—'} />
              <Attr label="First Seen" value={fmt(vehicle.firstSeen)} />
              <Attr label="Last Seen" value={fmt(vehicle.lastSeen)} />
            </dl>
          </Card>

          {/* VAHAN / RC lookup (simulated) */}
          <Card className="glass p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" /> VAHAN · RC
              </h2>
              {vahan && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">Simulated</span>
              )}
            </div>

            {!vahan ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Pull registration, make/model and owner details from the VAHAN database for <span className="font-mono font-semibold">{vehicle.plateNumber || '—'}</span>.</p>
                <Button onClick={fetchVahan} disabled={vahanLoading || !vehicle.plateNumber} size="sm" className="w-full gap-2">
                  {vahanLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Querying VAHAN…</> : <><ShieldCheck className="w-4 h-4" /> Fetch VAHAN details</>}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-3 py-2">
                  <User className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Registered Owner</div>
                    <div className="text-sm font-semibold truncate">{vahan.owner}</div>
                  </div>
                  {vahan.ownerSerial > 1 && <span className="ml-auto text-[10px] text-muted-foreground">Owner #{vahan.ownerSerial}</span>}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <Attr label="Reg. No" value={vahan.regNo} />
                  <Attr label="Reg. Date" value={vahan.regDate} />
                  <Attr label="Maker" value={vahan.make} />
                  <Attr label="Model" value={vahan.model} />
                  <Attr label="Class" value={vahan.vClass} />
                  <Attr label="Fuel" value={vahan.fuel} />
                  <Attr label="Color" value={vahan.color} />
                  <Attr label="RTO" value={vahan.rto} />
                  <Attr label="Insurance Upto" value={vahan.insUpto} />
                  <Attr label="Fitness Upto" value={vahan.fitnessUpto} />
                  <Attr label="Chassis No" value={vahan.chassis} />
                  <Attr label="Engine No" value={vahan.engine} />
                </dl>
                <button onClick={fetchVahan} className="text-[11px] font-semibold text-amber-400 hover:underline">Re-fetch</button>
              </>
            )}
          </Card>

          {/* Watchlist info */}
          {vehicle.watchlist && (
            <Card className="glass p-4 space-y-2 border-amber-500/30">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-500 flex items-center gap-2">
                <Eye className="w-4 h-4" /> Watchlist
              </h2>
              <Attr label="Reason" value={vehicle.watchlist.reason} />
              <Attr label="Added By" value={vehicle.watchlist.addedBy} />
              {vehicle.watchlist.notes && <Attr label="Notes" value={vehicle.watchlist.notes} />}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Attr({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: any }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium truncate flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        {value}
      </dd>
    </div>
  );
}

export default VehicleDetailPage;
