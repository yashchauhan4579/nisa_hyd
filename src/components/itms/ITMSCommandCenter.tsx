import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  apiClient,
  type VCCStats,
  type VCCRealtime,
  type TrafficViolation,
  type Vehicle,
  type ViolationStats,
} from '@/lib/api';
import { RefreshCw, Camera, Car, Eye, AlertTriangle, ScanLine, Activity } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VCCHeatmap } from '@/components/tvcc/VCCHeatmap';

// NORMAL_VCC devices belong to the NVCC dashboard — exclude them from ITMS VCC stats.
const EXCLUDE_PREFIX = 'NORMAL_VCC';

// The backend's /api/vcc/stats returns byDevice items as { deviceId, deviceName, count },
// but KPIStats/VCCInsights read `.totalDetections`. Normalize so they don't crash on undefined.
function normalizeStats(s: VCCStats | null): VCCStats | null {
  if (!s) return s;
  const byDevice = (s.byDevice || []).map((d: any) => ({
    ...d,
    totalDetections: d.totalDetections ?? d.count ?? 0,
  }));
  return { ...s, byDevice } as VCCStats;
}

// ── Small local helpers (kept local to avoid cross-fork imports) ──────────────
function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

const VIOLATION_COLORS: Record<string, string> = {
  SPEED: 'bg-red-500', HELMET: 'bg-orange-500', WRONG_SIDE: 'bg-yellow-500',
  RED_LIGHT: 'bg-amber-500', NO_SEATBELT: 'bg-pink-500', OVERLOADING: 'bg-amber-500',
  ILLEGAL_PARKING: 'bg-gray-500', TRIPLE_RIDING: 'bg-amber-500', OTHER: 'bg-amber-500',
};
const VIOLATION_LABELS: Record<string, string> = {
  SPEED: 'Speed', HELMET: 'Helmet', WRONG_SIDE: 'Wrong Side', RED_LIGHT: 'Red Light',
  NO_SEATBELT: 'No Seatbelt', OVERLOADING: 'Overloading', ILLEGAL_PARKING: 'Parking',
  TRIPLE_RIDING: 'Triple Riding', OTHER: 'Other',
};
const violationColor = (t: string) => VIOLATION_COLORS[t] || 'bg-gray-500';
const violationLabel = (t: string) => VIOLATION_LABELS[t] || t;

// Only violations with an evidence image belong in the queue (mirrors hasViolationEvidence).
const hasEvidence = (v: TrafficViolation) =>
  Boolean((v.fullSnapshotUrl && v.fullSnapshotUrl.trim()) || (v.plateImageUrl && v.plateImageUrl.trim()));

const VTYPE_BADGE: Record<string, string> = {
  '2W': 'bg-amber-500', '4W': 'bg-green-500', AUTO: 'bg-yellow-500',
  BUS: 'bg-amber-500', HMV: 'bg-red-500', UNKNOWN: 'bg-gray-500',
};

export function ITMSCommandCenter() {
  const navigate = useNavigate();

  // VCC datasets
  const [stats, setStats] = useState<VCCStats | null>(null);        // last 7 days
  const [todayStats, setTodayStats] = useState<VCCStats | null>(null); // today (for the KPI)
  const [heatmap, setHeatmap] = useState<VCCStats | null>(null);   // last 7 days matrix
  const [realtime, setRealtime] = useState<VCCRealtime | null>(null);
  const [, setStatsLoading] = useState(true);
  const [, setTodayLoading] = useState(true);
  const [heatmapLoading, setHeatmapLoading] = useState(true);

  // Rolling activity graph (last 24h hourly, or last 60m by minute)
  const [activityStats, setActivityStats] = useState<VCCStats | null>(null);
  const [activityRange, setActivityRange] = useState<'24h' | '60m'>('24h');
  const [activityLoading, setActivityLoading] = useState(true);

  // Feeds
  const [violations, setViolations] = useState<TrafficViolation[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [violationStats, setViolationStats] = useState<ViolationStats | null>(null);

  const fetchStats = async (silent = false) => {
    try {
      if (!silent) setStatsLoading(true);
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      const data = await apiClient.getVCCStats({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        groupBy: 'day',
        excludeDevicePrefix: EXCLUDE_PREFIX,
      });
      setStats(normalizeStats(data));
    } catch (err) {
      console.error('CommandCenter: failed to fetch VCC stats', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchToday = async (silent = false) => {
    try {
      if (!silent) setTodayLoading(true);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const data = await apiClient.getVCCStats({
        startTime: start.toISOString(),
        endTime: new Date().toISOString(),
        groupBy: 'hour',
        excludeDevicePrefix: EXCLUDE_PREFIX,
      });
      setTodayStats(normalizeStats(data));
    } catch (err) {
      console.error("CommandCenter: failed to fetch today's stats", err);
    } finally {
      setTodayLoading(false);
    }
  };

  const fetchHeatmap = async (silent = false) => {
    try {
      if (!silent) setHeatmapLoading(true);
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      // No dedicated /api/vcc/heatmap route exists — VCCHeatmap builds the
      // day×hour matrix itself from hourly byTime, so fetch hourly stats.
      const data = await apiClient.getVCCStats({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        groupBy: 'hour',
        excludeDevicePrefix: EXCLUDE_PREFIX,
      });
      setHeatmap(normalizeStats(data));
    } catch (err) {
      console.error('CommandCenter: failed to fetch heatmap stats', err);
      setHeatmap(null);
    } finally {
      setHeatmapLoading(false);
    }
  };

  const fetchRealtime = async () => {
    try {
      setRealtime(await apiClient.getVCCRealtime({ excludeDevicePrefix: EXCLUDE_PREFIX }));
    } catch (err) {
      console.error('CommandCenter: failed to fetch realtime', err);
    }
  };

  const fetchViolations = async () => {
    try {
      // Pull a wide recent window, THEN keep the ones with evidence images.
      // (A small limit gets swamped when many recent rows have no snapshot yet.)
      const data = await apiClient.getViolations({ limit: 100 });
      setViolations(data.violations.filter(hasEvidence).slice(0, 20));
    } catch (err) {
      console.error('CommandCenter: failed to fetch violations', err);
    }
  };

  const fetchVehicles = async () => {
    try {
      const data = await apiClient.getVehicles({ limit: 40, orderBy: 'last_seen', orderDir: 'desc' });
      setVehicles(data.vehicles);
    } catch (err) {
      console.error('CommandCenter: failed to fetch vehicles', err);
    }
  };

  const fetchViolationStats = async () => {
    try {
      setViolationStats(await apiClient.getViolationStats());
    } catch (err) {
      console.error('CommandCenter: failed to fetch violation stats', err);
    }
  };

  const fetchActivity = async (silent = false) => {
    try {
      if (!silent) setActivityLoading(true);
      const end = new Date();
      const is24 = activityRange === '24h';
      const start = new Date(end.getTime() - (is24 ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000));
      const data = await apiClient.getVCCStats({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        groupBy: is24 ? 'hour' : 'minute',
        excludeDevicePrefix: EXCLUDE_PREFIX,
      });
      setActivityStats(data);
    } catch (err) {
      console.error('CommandCenter: failed to fetch activity', err);
    } finally {
      setActivityLoading(false);
    }
  };

  const refreshAll = () => {
    fetchStats();
    fetchToday();
    fetchHeatmap();
    fetchRealtime();
    fetchViolations();
    fetchVehicles();
    fetchViolationStats();
  };

  useEffect(() => {
    refreshAll();
    // Fast loop (5s): live counters + feeds.
    const fast = setInterval(() => {
      fetchRealtime();
      fetchToday(true);
      fetchViolations();
      fetchVehicles();
      fetchViolationStats();
    }, 5000);
    // Slow loop (60s): historical aggregates that don't need to flicker.
    const slow = setInterval(() => {
      fetchStats(true);
      fetchHeatmap(true);
    }, 60000);
    return () => { clearInterval(fast); clearInterval(slow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Activity graph: refetch + poll whenever the range toggle changes.
  useEffect(() => {
    fetchActivity();
    const id = setInterval(() => fetchActivity(true), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityRange]);

  // Rolling series ending "now": 24 hourly slots, or 60 one-minute slots.
  // Zero buckets are dropped so there are no empty bars.
  const bars = useMemo(() => {
    const unit = activityRange === '24h' ? 'hour' : 'minute';
    const slots = activityRange === '24h' ? 24 : 60;
    const stepMs = unit === 'hour' ? 3_600_000 : 60_000;
    const counts = new Map<number, number>();
    (activityStats?.byTime || []).forEach((it: any) => {
      const raw = (it.hour || it.minute || it.time_period || '').toString().trim().replace(' ', 'T');
      const safe = raw.endsWith('Z') ? raw : raw + 'Z';
      const d = new Date(safe);
      if (isNaN(d.getTime())) return;
      const floored = Math.floor(d.getTime() / stepMs) * stepMs;
      counts.set(floored, (counts.get(floored) || 0) + (Number(it.count) || 0));
    });
    const nowFloored = Math.floor(Date.now() / stepMs) * stepMs;
    const out: { label: string; count: number }[] = [];
    for (let i = slots - 1; i >= 0; i--) {
      const slot = nowFloored - i * stepMs;
      const count = counts.get(slot) || 0;
      if (count === 0) continue; // drop empty buckets
      const ist = new Date(slot + 5.5 * 3_600_000); // shift to IST, read as UTC
      const hh = String(ist.getUTCHours()).padStart(2, '0');
      const mm = String(ist.getUTCMinutes()).padStart(2, '0');
      out.push({ label: unit === 'hour' ? `${hh}:00` : `${hh}:${mm}`, count });
    }
    return out;
  }, [activityStats, activityRange]);
  const barsMax = Math.max(...bars.map((b) => b.count), 1);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 bg-background/50">
      {/* ── Top row: Latest Violations (no card chrome — desktop feel) ───── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Latest Violations
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm"
              onClick={refreshAll}
              className="h-6 w-6 p-0 hover:text-amber-600 dark:hover:text-amber-400"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate('/itms/violations')}>
              View All
            </Button>
          </div>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          {violations.length === 0 ? (
            <div className="w-full text-center text-muted-foreground text-sm py-8">
              No recent violations with evidence
            </div>
          ) : violations.map((v) => (
            <div
              key={v.id}
              onClick={() => navigate('/itms/violations')}
              className="relative h-80 aspect-[9/16] shrink-0 bg-black rounded-lg overflow-hidden border border-white/10 cursor-pointer hover:border-amber-500/50 hover:ring-1 hover:ring-amber-500/30 transition-all"
            >
              <img
                src={v.fullSnapshotUrl || v.plateImageUrl || ''}
                alt="Violation"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-1 left-1 right-1 flex items-center justify-between pointer-events-none">
                <Badge className={cn('text-[10px] px-1.5 py-0.5 text-white', violationColor(v.violationType))}>
                  {violationLabel(v.violationType)}
                </Badge>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pointer-events-none">
                {v.plateNumber && (
                  <div className="text-xs font-bold text-zinc-100 font-mono mb-0.5">{v.plateNumber}</div>
                )}
                <div className="text-[10px] text-zinc-400">{formatTimeAgo(v.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main grid: VCC widgets (3/4) + ANPR sidebar (1/4) ───────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 space-y-4">
          {/* ── Top: compact KPIs (2×2, 2/5) on the left, activity graph (3/5) on the right ── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
          {(() => {
            const totalCameras = 94;
            const activeCameras = stats?.byDevice?.length ?? 0;
            const camPct = totalCameras > 0 ? Math.round((activeCameras / totalCameras) * 100) : 0;
            const pending = violationStats?.pending ?? 0;
            return (
              <div className="grid grid-cols-2 gap-3 h-full lg:col-span-2">
                {/* Live Rate */}
                <Card className="glass p-3 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200">
                  <div className="absolute -top-6 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity bg-emerald-500" />
                  <div className="flex flex-col gap-0.5 z-10 min-w-0 pr-3">
                    <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Live Rate</p>
                    <h3 className="text-xl font-bold tabular-nums tracking-tight mt-0.5">{realtime?.perMinute ? Math.round(realtime.perMinute) : 0}</h3>
                    <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">Vehicles / min</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10 shrink-0 bg-emerald-500/10 text-emerald-500">
                    <Activity className="w-5 h-5" />
                  </div>
                </Card>

                {/* Vehicles Today */}
                <Card className="glass p-3 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200">
                  <div className="absolute -top-6 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity bg-amber-500" />
                  <div className="flex flex-col gap-0.5 z-10 min-w-0 pr-3">
                    <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Vehicles Today</p>
                    <h3 className="text-xl font-bold tabular-nums tracking-tight mt-0.5">{(todayStats?.totalDetections ?? 0).toLocaleString()}</h3>
                    <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">Detections today</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10 shrink-0 bg-amber-500/10 text-amber-500">
                    <Car className="w-5 h-5" />
                  </div>
                </Card>

                {/* Pending Violations — the actionable card */}
                <Card
                  onClick={() => navigate('/itms/violations')}
                  className="glass p-3 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200 cursor-pointer"
                >
                  <div className="absolute -top-6 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity bg-red-500" />
                  <div className="flex flex-col gap-0.5 z-10 min-w-0 pr-3">
                    <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Pending Violations</p>
                    <h3 className={cn('text-xl font-bold tabular-nums tracking-tight mt-0.5', pending > 0 && 'text-red-500')}>
                      {pending.toLocaleString()}
                    </h3>
                    <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">
                      {(violationStats?.total ?? 0).toLocaleString()} total · review queue
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10 shrink-0 bg-red-500/10 text-red-500">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                </Card>

                {/* Cameras Online */}
                <Card className="glass p-3 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200">
                  <div className="absolute -top-6 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity bg-amber-500" />
                  <div className="flex flex-col gap-0.5 z-10 w-full pr-3">
                    <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Cameras Online</p>
                    <h3 className="text-xl font-bold tabular-nums tracking-tight mt-0.5">{camPct}%</h3>
                    <div className="mt-1 w-full max-w-[150px] bg-secondary h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${camPct}%` }} />
                    </div>
                    <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">{activeCameras}/{totalCameras} online</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10 shrink-0 bg-amber-500/10 text-amber-500">
                    <Camera className="w-5 h-5" />
                  </div>
                </Card>
              </div>
            );
          })()}

            {/* Vehicle Activity — rolling window (last 24h / last 60m), no empty bars */}
            <Card className="glass p-4 relative overflow-hidden flex flex-col lg:col-span-3">
              <div className="absolute -top-20 right-0 w-64 h-64 bg-amber-500 blur-[100px] opacity-[0.05] pointer-events-none" />
              <div className="flex items-center justify-between mb-2 relative z-10">
                <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                  Vehicle Activity <span className="text-muted-foreground/60 normal-case font-normal">· IST</span>
                </h2>
                <div className="flex items-center p-0.5 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                  {(['24h', '60m'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setActivityRange(r)}
                      className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-md transition-colors',
                        activityRange === r
                          ? 'bg-amber-500 text-white'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {r === '24h' ? 'Last 24h' : 'Last 60m'}
                    </button>
                  ))}
                </div>
              </div>
              {activityLoading && bars.length === 0 ? (
                <div className="flex-1 min-h-[150px] flex items-end gap-1">
                  {Array.from({ length: 16 }, (_, i) => (
                    <div key={i} className="flex-1 bg-white/10 rounded-t animate-pulse" style={{ height: `${25 + (i % 6) * 12}%` }} />
                  ))}
                </div>
              ) : bars.length === 0 ? (
                <div className="flex-1 min-h-[150px] flex items-center justify-center text-muted-foreground text-sm">
                  No activity in the {activityRange === '24h' ? 'last 24 hours' : 'last 60 minutes'}
                </div>
              ) : (
                <div className="flex-1 min-h-[150px] flex items-end gap-1 relative z-10">
                  {bars.map((b, i) => {
                    const height = Math.max((b.count / barsMax) * 100, 4);
                    const tickEvery = activityRange === '24h' ? 4 : 10;
                    return (
                      <div key={i} className="flex-1 h-full flex flex-col justify-end items-center group relative min-w-[3px]">
                        <div
                          className="w-full rounded-t bg-amber-500 hover:bg-amber-400 cursor-pointer transition-all"
                          style={{ height: `${height}%` }}
                        >
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                            <div className="bg-black/90 text-white text-xs p-2 rounded shadow-lg">
                              <div className="font-bold">{b.count.toLocaleString()} vehicles</div>
                              <div className="text-gray-400">{b.label} IST</div>
                            </div>
                          </div>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 h-3 leading-3">
                          {i % tickEvery === 0 ? b.label : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Weekly Heatmap */}
          <VCCHeatmap stats={heatmap} loading={heatmapLoading} dayFormat="weekday" seamless />
        </div>

        {/* ── Right sidebar: Latest ANPR detections ─────────────────────── */}
        <div className="xl:col-span-1">
          <Card className="glass p-4 relative overflow-hidden xl:sticky xl:top-4">
            <div className="absolute -top-20 right-0 w-64 h-64 bg-amber-500 blur-[100px] opacity-[0.05] pointer-events-none" />
            <div className="flex items-center justify-between mb-3 relative z-10">
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-amber-500" /> Latest ANPR
              </h2>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate('/itms/anpr')}>
                View All
              </Button>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-180px)] pr-1 relative z-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              {vehicles.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <Car className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  No detections yet
                </div>
              ) : vehicles.map((veh) => {
                const det = veh.detections?.[0];
                const img = det?.vehicleImageUrl || det?.fullImageUrl || det?.plateImageUrl;
                const plateImg = det?.plateImageUrl;
                return (
                <div
                  key={veh.id}
                  onClick={() => navigate('/itms/anpr')}
                  className="flex gap-3 p-2 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/[0.04] transition-all cursor-pointer"
                >
                  {/* Vehicle / plate crop thumbnail */}
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-black/40 shrink-0 flex items-center justify-center">
                    {img ? (
                      <img src={img} alt={veh.plateNumber || 'vehicle'} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Car className="w-6 h-6 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-semibold text-sm font-mono truncate">{veh.plateNumber || 'UNKNOWN'}</span>
                      {veh.isWatchlisted && <Eye className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                      <Badge className={cn('text-[10px] ml-auto text-white shrink-0', VTYPE_BADGE[veh.vehicleType] || 'bg-gray-500')}>
                        {veh.vehicleType}
                      </Badge>
                    </div>
                    {/* Plate crop strip (when a vehicle image is the thumb, still show the plate read) */}
                    {plateImg && img !== plateImg && (
                      <img src={plateImg} alt="plate" className="h-6 rounded mb-1 object-cover bg-black/40" loading="lazy" />
                    )}
                    {veh.make && veh.model && (
                      <div className="text-xs text-muted-foreground truncate mb-0.5">{veh.make} {veh.model}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Camera className="w-3 h-3" /> {veh.detectionCount} · {formatTimeAgo(veh.lastSeen)}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ITMSCommandCenter;
