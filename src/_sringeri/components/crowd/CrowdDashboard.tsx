import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { apiClient, type CrowdAnalysis, type CrowdAlert } from '@sringeri/lib/api';
import {
  Users, Loader2, TrendingUp, Activity,
  Clock, Bell, Radio,
  ShieldAlert, Eye, Layers, X, Maximize2, ArrowUpDown
} from 'lucide-react';
import { useCrowdDashboard } from '@sringeri/contexts/CrowdDashboardContext';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
  RadialBarChart, RadialBar, PieChart, Pie, Cell
} from 'recharts';

// ─── helpers ────────────────────────────────────────────────────────────────

const FRS_ALERT_TYPES = new Set(['person_match', 'face_match', 'person_detected', 'unknown_person']);

function densityConfig(level: string) {
  if (level === 'CRITICAL') return { text: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/40', glow: '#ef4444', bar: 'bg-red-500' };
  if (level === 'HIGH')     return { text: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/40', glow: '#f97316', bar: 'bg-orange-500' };
  if (level === 'MEDIUM')   return { text: 'text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/40', glow: '#eab308', bar: 'bg-yellow-500' };
  return { text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', glow: '#10b981', bar: 'bg-emerald-500' };
}

function timeSince(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// A camera posts a fresh count every ~15s. If its latest reading is older
// than this, treat it as STALE/OFFLINE: don't count it toward "live now",
// and badge it so operators don't read a frozen number as live.
const STALE_MS = 60_000;
function isStaleTs(ts?: string | null) {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > STALE_MS;
}

// Crowd trend chip from the pipeline's movementType (occupancy trend).
function trendChip(mt?: string | null) {
  if (mt === 'INFLOW')  return { txt: '↑ Busier', cls: 'text-emerald-400' };
  if (mt === 'OUTFLOW') return { txt: '↓ Calmer', cls: 'text-amber-400' };
  return { txt: '→ Steady', cls: 'text-zinc-400' };
}

// Footfall trend is scoped to the main gate (Gopura Entrance) only — summing
// every camera double-counts the same devotee as they pass interior cameras,
// so the trend tracks entries at the main gate, matching "Footfall Today".
const GOPURA_TREND_DEVICE_ID = 'cam_b4fb044013f79eb6';

// ─── main component ──────────────────────────────────────────────────────────

type TimeRange = '1H' | '24H' | '7D';

// The backend already buckets timestamps in Asia/Kolkata (IST) but the
// resulting `period` value is serialised as a UTC ISO string whose digits
// represent the IST clock time (Postgres TO_TIMESTAMP after AT TIME ZONE).
// Read those digits via the UTC accessors so we don't accidentally re-shift
// by the local +5:30 offset and display every label 5.5h late.
const TIME_RANGE_CFG: Record<TimeRange, { label: string; hours: number; granularity: '5min' | 'hour' | 'day'; subtitle: string; formatPeriod: (d: Date) => string }> = {
  '1H':  { label: '1H',   hours: 1,   granularity: '5min', subtitle: 'Entries per 5 min',   formatPeriod: (d) => `${d.getUTCHours().toString().padStart(2,'0')}:${(Math.floor(d.getUTCMinutes()/5)*5).toString().padStart(2,'0')}` },
  '24H': { label: '24H',  hours: 24,  granularity: 'hour',  subtitle: 'Entries per hour',    formatPeriod: (d) => `${d.getUTCHours().toString().padStart(2,'0')}:00` },
  '7D':  { label: '7D',   hours: 168, granularity: 'day',   subtitle: 'Total footfall per day', formatPeriod: (d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()] },
};

// Severity tiers for a trend value. The trend value is now entries
// during the slot (5-min/hour/day) — line-crossing footfall, not
// instantaneous occupancy. Hour buckets land in the hundreds-to-low
// thousands for a temple of this size; days land in the tens of
// thousands. 5-min slots are a tenth of an hour, so the tiers scale.
type CrowdTiers = {
  thresholds: [number, number, number]; // [tier3, tier2, tier1] high→low
  donutLabels: [string, string, string, string];
  tags: [string, string, string, string];
  tagColors: Record<string, string>;
};
function crowdTiers(tr: TimeRange): CrowdTiers {
  if (tr === '7D') {
    return {
      thresholds: [15000, 5000, 1500],
      donutLabels: ['Busy day (15k+)', 'High (5k+)', 'Moderate (1.5k+)', 'Light (<1.5k)'],
      tags: ['BUSY', 'HIGH', 'MODERATE', 'LIGHT'],
      tagColors: {
        BUSY: 'bg-red-500/20 text-red-400', HIGH: 'bg-orange-500/20 text-orange-400',
        MODERATE: 'bg-yellow-500/20 text-yellow-400', LIGHT: 'bg-emerald-500/20 text-emerald-400',
      },
    };
  }
  if (tr === '24H') {
    // Hourly entries — busy temple hour ≈ 1.5k entries across all gates
    return {
      thresholds: [1500, 800, 300],
      donutLabels: ['Peak hour (1.5k+)', 'Busy (800+)', 'Moderate (300+)', 'Quiet (<300)'],
      tags: ['PEAK', 'BUSY', 'MODERATE', 'QUIET'],
      tagColors: {
        PEAK: 'bg-red-500/20 text-red-400', BUSY: 'bg-orange-500/20 text-orange-400',
        MODERATE: 'bg-yellow-500/20 text-yellow-400', QUIET: 'bg-emerald-500/20 text-emerald-400',
      },
    };
  }
  // 1H — entries per 5-min slot (one-twelfth of hourly tiers)
  return {
    thresholds: [125, 70, 25],
    donutLabels: ['Peak (125+)', 'Busy (70+)', 'Moderate (25+)', 'Quiet (<25)'],
    tags: ['PEAK', 'BUSY', 'MODERATE', 'QUIET'],
    tagColors: {
      PEAK: 'bg-red-500/20 text-red-400', BUSY: 'bg-orange-500/20 text-orange-400',
      MODERATE: 'bg-yellow-500/20 text-yellow-400', QUIET: 'bg-emerald-500/20 text-emerald-400',
    },
  };
}

export function CrowdDashboard() {
  const [latestAnalyses, setLatestAnalyses] = useState<CrowdAnalysis[]>([]);
  const [alerts, setAlerts]                 = useState<CrowdAlert[]>([]);
  // Severity counts over ALL unresolved alerts — independent of the
  // 30-row display limit on the `alerts` list below.
  const [alertStats, setAlertStats]         = useState<{ total: number; RED: number; ORANGE: number; YELLOW: number }>({ total: 0, RED: 0, ORANGE: 0, YELLOW: 0 });
  const [liveFrames, setLiveFrames]         = useState<Record<string, string>>({});
  const [loading, setLoading]               = useState(true);
  const [selectedHotspot, setSelectedHotspot] = useState<MergedCamera | null>(null);
  const [selectedAlert, setSelectedAlert]     = useState<CrowdAlert | null>(null);
  const [timeRange, setTimeRange]           = useState<TimeRange>('24H');
  const { autoRefresh } = useCrowdDashboard();

  // `people` is the per-bucket footfall delta (what the backend returns);
  // `cumulative` is the running total — the chart plots `cumulative` so
  // the curve grows monotonically through the day. Keeping `people`
  // around because peak-hour / avg-crowd derivations still use it.
  const [trendData, setTrendData] = useState<Array<{ hour: string; people: number; max: number; cumulative: number }>>([]);
  // Critical (Red) capacity from backend thresholds — used as the
  // denominator for the "Congestion %" stat so 100% means at the
  // configured maximum capacity.
  const [criticalLimit, setCriticalLimit] = useState<number | null>(null);

  const fetchHistorical = async (range: TimeRange) => {
    const cfg = TIME_RANGE_CFG[range];
    const startTime = new Date(Date.now() - cfg.hours * 3_600_000).toISOString();
    try {
      // No deviceId filter → backend sums end_cum across ALL flow cameras
      // per bucket, so the chart shows per-hour footfall aggregated across
      // every entrance (not Gopura alone).
      const trend = await apiClient.getCrowdTrend({ startTime, granularity: cfg.granularity });
      // Two values per bucket:
      //   `cumulative` — the actual cumulative_count snapshot (chart Y axis).
      //   `people`     — the per-bucket organic growth used by Peak Hour /
      //                  Avg Crowd / Footfall KPIs. We deliberately compute
      //                  this from cumulative DIFFS within the SAME calendar
      //                  day, not from the backend's `avgPeople` delta. Why:
      //                    - The backend clamps cross-midnight negative
      //                      deltas to end_cum, which causes the first bucket
      //                      of a day to show today's MAX as a fake "hourly".
      //                    - Manual cumulative_count adjustments (the bump/
      //                      drop recipe) shift all of today's rows
      //                      uniformly, so intra-day diffs stay organic, but
      //                      the first-bucket-of-day diff against yesterday
      //                      catches the shift. Skipping the first bucket of
      //                      each day removes both artifacts cleanly.
      const formatted = (trend || []).map((b, i, arr) => {
        const period = new Date(b.period);
        const cum = b.cumulative ?? 0;
        const prev = i > 0 ? arr[i - 1] : null;
        const sameDay = prev != null && new Date(prev.period).toDateString() === period.toDateString();
        const hourly = sameDay ? Math.max(0, cum - (prev!.cumulative ?? 0)) : 0;
        return {
          hour: cfg.formatPeriod(period),
          people: hourly,
          max: b.maxPeople,
          cumulative: cum,
        };
      });
      setTrendData(formatted);
    } catch {
      setTrendData([]);
    }
  };

  const fetchAll = async () => {
    try {
      const [latest, alts, stats] = await Promise.all([
        apiClient.getLatestCrowdAnalysis(),
        apiClient.getCrowdAlerts({ isResolved: false, limit: 30 }),
        apiClient.getCrowdAlertStats({ isResolved: false }).catch(() => null),
      ]);
      setLatestAnalyses(Array.isArray(latest) ? latest : []);
      setAlerts(Array.isArray(alts) ? alts.filter(a => !FRS_ALERT_TYPES.has(a.alertType)) : []);
      if (stats) setAlertStats(stats);
    } catch (err) {
      console.error('Failed to fetch crowd data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFrames = async () => {
    try {
      const frames = await apiClient.getAllLiveFrames();
      if (frames && typeof frames === 'object') setLiveFrames(frames);
    } catch { /* no frames yet */ }
  };

  useEffect(() => { fetchAll(); fetchFrames(); }, []);

  // Pull crowd alert thresholds (Yellow / Orange / Red) once on mount.
  // The Red value is the configured CRITICAL maximum capacity.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/crowd/alert-thresholds', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (cancelled || !t) return;
        const red = typeof t.red === 'number' ? t.red : null;
        setCriticalLimit(red && red > 0 ? red : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Re-fetch historical whenever time range changes
  useEffect(() => { fetchHistorical(timeRange); }, [timeRange]);

  // Analysis data: refresh every 5s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  // Live frames: always poll every 2s for near-real-time display
  useEffect(() => {
    const id = setInterval(fetchFrames, 2000);
    return () => clearInterval(id);
  }, []);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const flowCameras    = useMemo(() => latestAnalyses.filter(a => a.modelType === 'yolov8-crowd-flow'), [latestAnalyses]);
  const densityCameras = useMemo(() => latestAnalyses.filter(a => a.modelType !== 'yolov8-crowd-flow'), [latestAnalyses]);

  // "Footfall Today" = devotees who entered, counted at the MAIN GATE
  // (Gopura Entrance) ONLY. Summing all cameras double-counts the same
  // devotee as they pass interior cameras, so footfall tracks the main
  // entrance alone.
  const gopuraFlow = useMemo(() =>
    flowCameras.find(a => (a.device?.name ?? '').toLowerCase().includes('gopura')), [flowCameras]);
  const gopuraFootfall  = gopuraFlow?.cumulativeCount ?? 0;
  // Entry Rate = people/min arriving at the main gate (Gopura).
  const gopuraEntryRate = gopuraFlow?.flowRate ?? 0;
  const gopuraTrend     = (gopuraFlow as any)?.movementType as string | undefined;
  const totalPeopleFromTrend = useMemo(() => trendData.reduce((s, d) => s + d.people, 0), [trendData]);
  const totalPeople = timeRange === '24H' ? gopuraFootfall : totalPeopleFromTrend;

  const totalPeopleLabel = timeRange === '1H' ? 'Footfall (Last Hour)' : timeRange === '7D' ? 'Footfall (7 Days)' : 'Footfall Today';
  const totalPeopleSub = timeRange === '1H' ? 'Avg per 5-min slot' : timeRange === '7D' ? 'Total entries across days' : 'People who entered today';

  // Current live occupancy — FRESH density cameras only. A stalled/offline
  // camera's frozen count must not inflate the live total.
  const liveNow       = useMemo(() => densityCameras.filter(a => !isStaleTs(a.timestamp)).reduce((s, a) => s + (a.peopleCount ?? 0), 0), [densityCameras]);
  const activeCameras = useMemo(() => densityCameras.filter(a => a.peopleCount != null && !isStaleTs(a.timestamp)).length, [densityCameras]);
  const totalCameras  = useMemo(() => new Set(densityCameras.map(a => a.deviceId)).size, [densityCameras]);
  const staleCameras  = Math.max(0, totalCameras - activeCameras);

  // Capacity gauge for the temple — tune CAPACITY_LIMIT to the venue
  const CAPACITY_LIMIT = 800;
  const capacityPct = Math.min(100, Math.round((liveNow / CAPACITY_LIMIT) * 100));
  const capacityState = capacityPct >= 90 ? 'critical' : capacityPct >= 65 ? 'high' : capacityPct >= 35 ? 'medium' : 'safe';
  const capacityColor = capacityState === 'critical' ? '#ef4444' : capacityState === 'high' ? '#f97316' : capacityState === 'medium' ? '#eab308' : '#10b981';
  const capacityLabel = capacityState === 'critical' ? 'CROWD LIMIT NEAR' : capacityState === 'high' ? 'BUSY' : capacityState === 'medium' ? 'MODERATE' : 'COMFORTABLE';


  // ── Trend chart (server-side aggregated) ──────────────────────────────────
  const peakHours     = useMemo(() => [...trendData].sort((a, b) => b.people - a.people).slice(0, 5), [trendData]);
  // Crowd level buckets — thresholds depend on the time range
  // (concurrent people for 1H/24H, daily footfall for 7D).
  const crowdBuckets = useMemo(() => {
    let low = 0, medium = 0, high = 0, critical = 0;
    const [tC, tH, tM] = crowdTiers(timeRange).thresholds;
    trendData.forEach(d => {
      if (d.people >= tC) critical++;
      else if (d.people >= tH) high++;
      else if (d.people >= tM) medium++;
      else low++;
    });
    return { low, medium, high, critical };
  }, [trendData, timeRange]);
  const highRiskCount = crowdBuckets.high + crowdBuckets.critical;
  const avgCrowd      = useMemo(() => trendData.length ? Math.round(trendData.reduce((s, d) => s + d.people, 0) / trendData.length) : 0, [trendData]);
  const peakMax       = peakHours[0]?.people || 1;

  // Labels adapt to time range
  const periodLabel   = timeRange === '7D' ? '7D' : timeRange === '24H' ? '24H' : '1H';
  const highRiskLabel = timeRange === '7D' ? 'Busy Days' : 'High-Risk';
  const avgLabel      = timeRange === '7D' ? 'Avg Daily' : 'Avg Crowd';

  // ── Sparklines (from latest analyses, lightweight) ──────────────────────
  const deviceSparklines = useMemo(() => {
    const map: Record<string, number[]> = {};
    latestAnalyses.forEach(a => {
      if (!map[a.deviceId]) map[a.deviceId] = [];
      map[a.deviceId].push(a.peopleCount ?? 0);
    });
    return map;
  }, [latestAnalyses]);

  // Merge both pipelines per camera (density + flow → one combined record).
  const allCameras: MergedCamera[] = useMemo(() => {
    const byDevice = new Map<string, { density?: CrowdAnalysis; flow?: CrowdAnalysis }>();
    for (const a of latestAnalyses) {
      const slot = byDevice.get(a.deviceId) ?? {};
      if (a.modelType === 'yolov8-crowd-flow') slot.flow = a;
      else slot.density = a;
      byDevice.set(a.deviceId, slot);
    }
    const out: MergedCamera[] = [];
    byDevice.forEach((rows, deviceId) => {
      const ref = rows.density ?? rows.flow;
      if (!ref) return;
      out.push({
        deviceId,
        device: ref.device,
        name: ref.device?.name || deviceId,
        livePeople: rows.density?.peopleCount ?? rows.flow?.peopleCount ?? 0,
        densityLevel: rows.density?.densityLevel ?? rows.flow?.densityLevel ?? 'LOW',
        congestion: rows.density?.congestionLevel ?? null,
        entriesToday: rows.flow?.cumulativeCount ?? null,
        entryRate: rows.flow?.flowRate ?? null,
        trend: ((rows.flow ?? rows.density) as any)?.movementType ?? null,
        timestamp: ref.timestamp,
        isStale: isStaleTs(ref.timestamp),
        densityRow: rows.density ?? null,
        flowRow: rows.flow ?? null,
      });
    });
    // Live cameras first (by density), stale/offline cameras pushed to the end.
    out.sort((a, b) => (a.isStale ? 1 : 0) - (b.isStale ? 1 : 0) || b.livePeople - a.livePeople);
    return out;
  }, [latestAnalyses]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-amber-500/30 animate-ping absolute inset-0" />
            <Loader2 className="w-12 h-12 animate-spin text-amber-500 relative" />
          </div>
          <p className="text-sm text-zinc-400 tracking-wide">Loading crowd intelligence…</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="h-full w-full flex overflow-hidden bg-zinc-950">

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto scroll-on-hover">
        <div className="p-5 space-y-5">

          {/* Crowd header — neutral dark + blue (unified IRIS identity) */}
          <div
            className="rounded-2xl border border-white/10 overflow-hidden relative bg-card"
          >
            <div
              className="absolute inset-0 opacity-[0.06] pointer-events-none"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, #f59e0b 0 1px, transparent 1px 14px)'
              }}
            />
            <div className="relative px-5 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold text-amber-300/80 uppercase tracking-[0.2em]">
                    IRIS Command Center
                  </p>
                  <h1 className="text-sm font-bold text-white tracking-tight truncate">
                    Crowd Intelligence
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300/90">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                  </span>
                  Live
                </div>
                <div className="flex gap-1 bg-zinc-900/80 border border-amber-500/20 rounded-lg p-0.5">
                  {(['1H','24H','7D'] as TimeRange[]).map(r => (
                    <button
                      key={r}
                      onClick={() => setTimeRange(r)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                        timeRange === r
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard
              label={totalPeopleLabel}
              value={totalPeople.toLocaleString()}
              sub={totalPeopleSub}
              icon={<Users className="w-5 h-5" />}
              gradient="from-amber-500/20 to-amber-500/5"
              borderColor="border-amber-500/30"
              glowColor="rgba(245,158,11,0.18)"
              textColor="text-amber-200"
            />
            <KpiCard
              label="Live Now"
              value={liveNow.toLocaleString()}
              sub={`${activeCameras}/${densityCameras.length} density cams reporting`}
              icon={<Radio className="w-5 h-5" />}
              gradient="from-emerald-500/20 to-emerald-500/5"
              borderColor="border-emerald-500/30"
              glowColor="rgba(16,185,129,0.15)"
              textColor="text-emerald-300"
            />

            {/* Temple Capacity Gauge — replaces the old Crowd Flow card */}
            <div
              className="relative rounded-2xl border p-4 overflow-hidden col-span-1"
              style={{
                borderColor: `${capacityColor}55`,
                background: `linear-gradient(180deg, ${capacityColor}26 0%, ${capacityColor}05 100%)`,
                boxShadow: `0 0 24px ${capacityColor}22`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-3 opacity-90" style={{ color: capacityColor }}>
                <ShieldAlert className="w-5 h-5" />
                <span className="text-[10px] font-semibold uppercase tracking-widest">Zone Capacity</span>
              </div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-black tracking-tight tabular-nums" style={{ color: capacityColor }}>
                  {capacityPct}<span className="text-base ml-0.5">%</span>
                </p>
                <p className="text-[10px] font-bold tabular-nums text-zinc-400">
                  {liveNow.toLocaleString()} <span className="text-zinc-600">/ {CAPACITY_LIMIT.toLocaleString()}</span>
                </p>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${capacityPct}%`, background: capacityColor, boxShadow: `0 0 10px ${capacityColor}80` }}
                />
              </div>
              <p className="text-[10px] font-bold mt-1.5 tracking-widest" style={{ color: capacityColor }}>
                {capacityLabel}
              </p>
            </div>

            <KpiCard
              label="Entry Rate"
              value={gopuraFlow ? `${Math.round(gopuraEntryRate)}` : '—'}
              sub={gopuraFlow ? `people / min · ${trendChip(gopuraTrend).txt}` : 'No gate data'}
              icon={<ArrowUpDown className="w-5 h-5" />}
              gradient="from-amber-500/20 to-amber-500/5"
              borderColor="border-amber-500/30"
              glowColor="rgba(139,92,246,0.15)"
              textColor="text-amber-300"
            />
          </div>

          {/* Trend + Peak Hours */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            {/* Area chart */}
            <div className="xl:col-span-2 rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10">
                    <TrendingUp className="w-4 h-4 text-amber-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">Crowd Footfall Trend · All Cameras</p>
                    <p className="text-[10px] text-zinc-500">{TIME_RANGE_CFG[timeRange].subtitle}</p>
                  </div>
                </div>
                <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded-full px-2.5 py-1 font-mono">{TIME_RANGE_CFG[timeRange].label}</span>
              </div>
              <div className="p-4">
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={190}>
                    <AreaChart data={trendData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="crowdGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12, padding: '8px 12px' }}
                        labelStyle={{ color: '#71717a', marginBottom: 4 }}
                        itemStyle={{ color: '#f59e0b' }}
                        cursor={{ stroke: 'rgba(245,158,11,0.25)', strokeWidth: 1 }}
                      />
                      <Area type="monotone" dataKey="people" name="People this hour" stroke="#f59e0b" strokeWidth={2} fill="url(#crowdGrad)" dot={false} activeDot={{ r: 5, fill: '#f59e0b', strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[190px] flex flex-col items-center justify-center gap-2">
                    <Activity className="w-8 h-8 text-zinc-700" />
                    <p className="text-sm text-zinc-600">Pipeline populating data…</p>
                    <p className="text-xs text-zinc-700">Check back in a few seconds</p>
                  </div>
                )}
              </div>
            </div>

            {/* Peak hours + radial chart + summary */}
            <div className="rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm overflow-hidden flex flex-col">
              {/* Peak hours */}
              <div className="px-4 pt-3 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-3.5 h-3.5 text-orange-400" />
                  <p className="text-xs font-semibold text-zinc-200">Peak {timeRange === '7D' ? 'Days' : 'Hours'} · {TIME_RANGE_CFG[timeRange].label}</p>
                </div>
                {peakHours.length > 0 ? (
                  <div className="space-y-0">
                    {peakHours.slice(0, 3).map((slot, i) => {
                      const fills = ['bg-gradient-to-r from-red-500 to-red-400','bg-gradient-to-r from-orange-500 to-orange-400','bg-gradient-to-r from-amber-500 to-yellow-400','bg-gradient-to-r from-amber-500 to-amber-400','bg-gradient-to-r from-zinc-500 to-zinc-400'];
                      const glows = ['shadow-red-500/20','shadow-orange-500/20','shadow-amber-500/20','shadow-amber-500/20','shadow-zinc-500/20'];
                      const textColors = ['text-red-400','text-orange-400','text-amber-400','text-amber-300','text-zinc-400'];
                      const _tiers = crowdTiers(timeRange);
                      const [_t3, _t2, _t1] = _tiers.thresholds;
                      const densityTag = slot.people >= _t3 ? _tiers.tags[0]
                        : slot.people >= _t2 ? _tiers.tags[1]
                        : slot.people >= _t1 ? _tiers.tags[2] : _tiers.tags[3];
                      const tagColors = _tiers.tagColors;
                      return (
                        <div key={slot.hour} className="flex items-center gap-2 py-1 border-b border-white/[0.03] last:border-0">
                          <span className={`text-[9px] font-bold shrink-0 ${i === 0 ? 'text-orange-400' : 'text-zinc-600'}`}>{i + 1}</span>
                          <span className="text-[11px] text-zinc-300 font-mono shrink-0">{slot.hour}</span>
                          <span className={`text-[7px] font-bold px-1 py-px rounded ${tagColors[densityTag]} shrink-0`}>{densityTag}</span>
                          <span className="flex-1" />
                          <span className={`text-xs font-bold tabular-nums ${textColors[i]}`}>{slot.people}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-700 text-center py-8">No data yet</p>
                )}
              </div>

              {/* Summary: donut with legend + stats row */}
              <div className="px-4 py-2 flex-1">
                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Overview · {periodLabel}</p>
                {(() => {
                  const total = trendData.length || 1;
                  const _dLabels = crowdTiers(timeRange).donutLabels;
                  const donutData = [
                    { name: _dLabels[0], value: crowdBuckets.critical, fill: '#ef4444', pct: Math.round(crowdBuckets.critical / total * 100) },
                    { name: _dLabels[1], value: crowdBuckets.high, fill: '#f97316', pct: Math.round(crowdBuckets.high / total * 100) },
                    { name: _dLabels[2], value: crowdBuckets.medium, fill: '#eab308', pct: Math.round(crowdBuckets.medium / total * 100) },
                    { name: _dLabels[3], value: crowdBuckets.low, fill: '#22c55e', pct: Math.round(crowdBuckets.low / total * 100) },
                  ].filter(d => d.value > 0);
                  return (
                    <div className="space-y-2">
                      {/* Donut + legend inline */}
                      <div className="flex items-center gap-3">
                        <div className="w-[64px] h-[64px] shrink-0 relative">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={donutData} cx="50%" cy="50%" innerRadius={18} outerRadius={28} dataKey="value" stroke="none" paddingAngle={3}>
                                {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-zinc-200">{periodLabel}</span>
                          </div>
                        </div>
                        <div className="flex-1 space-y-1">
                          {donutData.map(d => (
                            <div key={d.name} className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
                              <span className="text-[10px] text-zinc-400 flex-1 truncate">{d.name}</span>
                              <span className="text-[10px] font-bold text-zinc-300 tabular-nums">{d.value}</span>
                              <span className="text-[8px] text-zinc-600 tabular-nums">{d.pct}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Stats strip */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
                        {[
                          { label: avgLabel, value: avgCrowd.toLocaleString(), color: 'text-zinc-100' },
                          // Real unresolved-alert total (stats endpoint),
                          // not the 30-row display list.
                          { label: 'Alerts', value: alertStats.total.toLocaleString(), color: 'text-amber-400' },
                          // Distinct cameras — latestAnalyses has one row
                          // per (device, pipeline), so dedupe by deviceId.
                          { label: 'Cameras', value: String(new Set(latestAnalyses.map(a => a.deviceId)).size), color: 'text-amber-300' },
                        ].map(s => (
                          <div key={s.label} className="text-center">
                            <p className={`text-sm font-bold tabular-nums ${s.color}`}>{s.value}</p>
                            <p className="text-[8px] text-zinc-600 uppercase mt-0.5">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* All cameras — gates first, then density */}
          <div className="rounded-2xl border border-amber-500/15 bg-zinc-900/60 backdrop-blur-sm overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <Radio className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">All Cameras</p>
                </div>
              </div>
              <span className="text-[10px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1 font-bold">
                {activeCameras}/{totalCameras} live{staleCameras > 0 ? ` · ${staleCameras} offline` : ''}
              </span>
            </div>
            <div className="p-4">
              {allCameras.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Users className="w-8 h-8 text-zinc-700" />
                  <p className="text-sm text-zinc-600">No camera data available</p>
                </div>
              ) : (
                <div className="flex gap-4 overflow-x-scroll pb-3 scrollbar-visible">
                  {allCameras.map((c) => (
                    <CameraCard
                      key={c.deviceId}
                      camera={c}
                      sparkline={deviceSparklines[c.deviceId] ?? []}
                      liveFrame={liveFrames[c.deviceId] ?? null}
                      onClick={() => setSelectedHotspot(c)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Alerts Sidebar ──────────────────────────────────────────────────── */}
      <div className="w-[280px] shrink-0 border-l border-white/5 bg-zinc-900/50 flex flex-col overflow-hidden">

        {/* Sidebar header */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-500/10">
                <Bell className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">Crowd Signals</p>
                <p className="text-[10px] text-zinc-500">Live alert feed</p>
              </div>
            </div>
            {alertStats.total > 0 && (
              <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-black">
                {alertStats.total}
              </span>
            )}
          </div>

          {/* Severity counts — from the stats endpoint (counts ALL
              unresolved alerts, not just the 30-row display list). */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Critical', sev: 'RED' as const,    color: 'bg-red-500/15 text-red-400 border-red-500/30' },
              { label: 'Warning',  sev: 'ORANGE' as const,  color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
              { label: 'Notice',   sev: 'YELLOW' as const,  color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
            ].map(({ label, sev, color }) => (
              <div key={sev} className={`rounded-lg border text-center py-1.5 ${color}`}>
                <p className="text-base font-bold tabular-nums">
                  {alertStats[sev]}
                </p>
                <p className="text-[9px] font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Alert list */}
        <div className="flex-1 overflow-y-auto scroll-on-hover p-3 space-y-2">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-700">
              <div className="w-14 h-14 rounded-full bg-zinc-800/60 flex items-center justify-center">
                <Bell className="w-6 h-6 opacity-40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-500">All Clear</p>
                <p className="text-xs text-zinc-700 mt-0.5">No active crowd alerts</p>
              </div>
            </div>
          ) : (
            alerts.map(alert => <AlertCard key={alert.id} alert={alert} onClick={() => setSelectedAlert(alert)} />)
          )}
        </div>
      </div>

    </div>

    {/* ── Hotspot Detail Modal ─────────────────────────────────────────────── */}
    {selectedHotspot && (
      <HotspotModal
        camera={selectedHotspot}
        liveFrame={liveFrames[selectedHotspot.deviceId] ?? null}
        onClose={() => setSelectedHotspot(null)}
      />
    )}

    {/* ── Alert Detail Modal ────────────────────────────────────────────────── */}
    {selectedAlert && (
      <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} criticalLimit={criticalLimit} />
    )}
    </>
  );
}

// ─── Hotspot Modal ────────────────────────────────────────────────────────────

function HotspotModal({ camera, liveFrame, onClose }: {
  camera: MergedCamera; liveFrame: string | null; onClose: () => void;
}) {
  const cfg = densityConfig(camera.densityLevel);
  const name = camera.name;
  const currentCount = camera.livePeople;
  // "Today Total" = footfall = crowd-flow line crossings (entriesToday).
  // NOT the head-detection cumulative_count, which counts every unique
  // ByteTrack id and massively overcounts (a single devotee re-IDed
  // several times = many "unique tracks").
  const dailyTotal = camera.entriesToday ?? null;
  const congestion = camera.congestion ?? Math.min(100, currentCount * 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-lg rounded-2xl border ${cfg.border} overflow-hidden`}
        style={{ background: 'rgba(12,12,18,0.97)', boxShadow: `0 0 60px ${cfg.glow}30` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Live frame */}
        <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
          {liveFrame && !camera.isStale ? (
            <img src={liveFrame} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-zinc-900"
              style={{ background: `radial-gradient(ellipse at 50% 60%, ${cfg.glow}12 0%, transparent 70%)` }}>
              <Users className="w-16 h-16" style={{ color: cfg.glow, opacity: 0.2 }} />
              {camera.isStale && (
                <p className="text-[11px] text-zinc-500">No live signal · last seen {timeSince(camera.timestamp)}</p>
              )}
            </div>
          )}

          {/* LIVE / OFFLINE badge */}
          {camera.isStale ? (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-zinc-800/90 border border-zinc-600 rounded-full px-2.5 py-1">
              <span className="inline-flex rounded-full h-2 w-2 bg-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Offline</span>
            </div>
          ) : liveFrame && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 rounded-full px-2.5 py-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
              </span>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Live</span>
            </div>
          )}

          {/* Density badge */}
          <div className={`absolute top-3 right-10 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${cfg.bg} ${cfg.border} ${cfg.text} border`}>
            {camera.densityLevel}
          </div>

          {/* Gradient overlay */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/90 to-transparent" />
          <p className="absolute bottom-3 left-4 text-base font-bold text-white">{name}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px bg-white/5">
          {[
            { label: 'Live Now', value: camera.isStale ? '—' : currentCount.toString(), color: camera.isStale ? 'text-zinc-500' : cfg.text },
            { label: 'Today Total', value: dailyTotal != null ? dailyTotal.toLocaleString() : '—', color: 'text-zinc-200' },
            { label: 'Congestion', value: `${congestion}%`, color: cfg.text },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-zinc-900/80 px-4 py-3 text-center">
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-1">{label}</p>
              <p className={`text-xl font-black tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Congestion bar */}
        <div className="px-4 py-3">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${cfg.bar} rounded-full transition-all duration-700`}
              style={{ width: `${congestion}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Modal ─────────────────────────────────────────────────────────────

function AlertModal({ alert, onClose, criticalLimit }: { alert: CrowdAlert; onClose: () => void; criticalLimit?: number | null }) {
  const cfg = densityConfig(alert.severity === 'RED' ? 'CRITICAL' : alert.severity === 'ORANGE' ? 'HIGH' : alert.severity === 'YELLOW' ? 'MEDIUM' : 'LOW');
  const severityLabel = alert.severity === 'RED' ? 'Critical' : alert.severity === 'ORANGE' ? 'Warning' : alert.severity === 'YELLOW' ? 'Notice' : 'Info';
  const camName = alert.device?.name || alert.deviceId;
  const frame = alert.frameUrl || alert.frameSnapshot || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-md rounded-2xl border ${cfg.border} overflow-hidden`}
        style={{ background: 'rgba(12,12,18,0.97)', boxShadow: `0 0 60px ${cfg.glow}30` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Snapshot frame */}
        <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
          {frame ? (
            <img src={frame} alt={camName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900"
              style={{ background: `radial-gradient(ellipse at 50% 60%, ${cfg.glow}12 0%, transparent 70%)` }}>
              <Users className="w-16 h-16" style={{ color: cfg.glow, opacity: 0.2 }} />
            </div>
          )}

          {/* Severity badge */}
          <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.border} ${cfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.bar}`} />
            {severityLabel}
          </div>

          {/* Timestamp badge */}
          <div className="absolute top-3 right-10 flex items-center gap-1 bg-black/70 rounded-full px-2.5 py-1">
            <Clock className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] text-zinc-300 font-semibold">{timeSince(alert.timestamp)}</span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/90 to-transparent" />
          <p className="absolute bottom-3 left-4 text-base font-bold text-white">{camName}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-px bg-white/5">
          {[
            { label: 'People',     value: alert.peopleCount != null ? alert.peopleCount.toString() : '', color: cfg.text },
            { label: 'Density',    value: alert.densityLevel || '', color: cfg.text },
            // Congestion = peopleCount as a percentage of the configured
            // CRITICAL (Red) capacity from /api/crowd/alert-thresholds.
            // 100% = at maximum capacity. Falls back to actual/threshold
            // ratio if the critical limit isn't loaded yet.
            { label: 'Congestion', value: (() => {
              const a = alert as any;
              if (typeof a.congestionLevel === 'number') return `${Math.round(a.congestionLevel)}%`;
              const people = a.peopleCount ?? a.actualValue;
              if (typeof people === 'number' && criticalLimit && criticalLimit > 0) {
                return `${Math.round((people / criticalLimit) * 100)}%`;
              }
              return '';
            })(), color: cfg.text },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-zinc-900/80 px-4 py-3 text-center">
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold mb-1">{label}</p>
              <p className={`text-lg font-black tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Alert details */}
        <div className="px-4 py-3 border-t border-white/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-zinc-100 mb-0.5">{alert.title}</p>
              {alert.description && (
                <p className="text-[11px] text-zinc-400">{alert.description}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-semibold text-zinc-400 tabular-nums">
                {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-[10px] text-zinc-600">
                {new Date(alert.timestamp).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, gradient, borderColor, glowColor, textColor }: {
  label: string; value: string; sub: string; icon: React.ReactNode;
  gradient: string; borderColor: string; glowColor: string; textColor: string;
}) {
  return (
    <div
      className={`relative rounded-2xl border ${borderColor} bg-gradient-to-b ${gradient} p-4 overflow-hidden`}
      style={{ boxShadow: `0 0 24px ${glowColor}` }}
    >
      {/* subtle grid texture */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 0,transparent 50%),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '24px 24px' }}
      />
      <div className="relative">
        <div className={`flex items-center gap-1.5 mb-3 ${textColor} opacity-80`}>
          {icon}
          <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
        </div>
        <p className={`text-3xl font-black tracking-tight tabular-nums ${textColor}`}>{value}</p>
        <p className="text-[10px] text-zinc-600 mt-1 font-medium">{sub}</p>
      </div>
    </div>
  );
}

// ─── Summary Row ─────────────────────────────────────────────────────────────

function SummaryRow({ label, value, valueColor, icon }: {
  label: string; value: string; valueColor: string; icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className={`flex items-center gap-1.5 text-zinc-500`}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-sm font-bold tabular-nums ${valueColor}`}>{value}</span>
    </div>
  );
}

// ─── Hotspot Card ─────────────────────────────────────────────────────────────

function HotspotCard({ analysis, sparkline, liveFrame, onClick }: {
  analysis: CrowdAnalysis; sparkline: number[]; liveFrame: string | null; onClick: () => void;
}) {
  const isFlow        = analysis.modelType === 'yolov8-crowd-flow';
  const currentCount  = analysis.peopleCount ?? 0;
  const dailyTotal    = analysis.cumulativeCount ?? null;
  const cfg           = densityConfig(analysis.densityLevel);
  const sparkData     = sparkline.map((v, i) => ({ i, v }));
  const name          = analysis.device?.name || analysis.deviceId;
  const congestion    = analysis.congestionLevel ?? Math.min(100, currentCount * 3);
  const flowRate      = analysis.flowRate ?? 0;

  return (
    <div
      className={`group shrink-0 w-52 rounded-2xl border ${cfg.border} overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform duration-200`}
      style={{ background: 'rgba(15,15,20,0.8)', boxShadow: `0 0 20px ${cfg.glow}18` }}
      onClick={onClick}
    >
      {/* Live frame or placeholder */}
      <div className="relative h-32 bg-zinc-900">
        {liveFrame ? (
          <img
            src={liveFrame}
            alt={name}
            className="w-full h-full object-cover"
            style={{ imageRendering: 'auto' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: `radial-gradient(ellipse at 50% 60%, ${cfg.glow}12 0%, transparent 70%)` }}>
            <Users className="w-10 h-10" style={{ color: cfg.glow, opacity: 0.3 }} />
          </div>
        )}

        {/* LIVE + camera-type badges (top-left) */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {liveFrame && (
            <div className="flex items-center gap-1 bg-black/70 rounded-full px-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
              </span>
              <span className="text-[9px] font-bold text-white uppercase tracking-wider">Live</span>
            </div>
          )}
          {isFlow ? (
            <div className="bg-amber-500/90 text-amber-950 rounded-full px-2 py-0.5">
              <span className="text-[9px] font-black uppercase tracking-widest">Gate</span>
            </div>
          ) : (
            <div className="bg-amber-500/80 text-white rounded-full px-2 py-0.5">
              <span className="text-[9px] font-black uppercase tracking-widest">Density</span>
            </div>
          )}
        </div>

        {/* Density label */}
        <div className={`absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.border} ${cfg.text} border`}>
          {analysis.densityLevel}
        </div>

        {/* Expand icon */}
        <div className="absolute top-2 right-2 w-5 h-5 rounded bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="w-3 h-3 text-white" />
        </div>

        {/* Overlay gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/80 to-transparent" />

        {/* Camera name on overlay */}
        <p className="absolute bottom-2 left-3 right-3 text-xs font-semibold text-white truncate">{name}</p>
      </div>

      {/* Sparkline */}
      {sparkData.length > 1 ? (
        <div className="h-9 bg-black/40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barSize={8}>
              <Bar dataKey="v" fill={cfg.glow} opacity={0.6} radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-9 bg-black/40" />
      )}

      {/* Stats */}
      <div className="px-3 py-2.5 space-y-2">

        {isFlow ? (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[9px] text-amber-400/80 uppercase tracking-widest font-semibold">Entries Today</p>
                <p className="text-2xl font-black tabular-nums tracking-tight text-amber-300">{(dailyTotal ?? 0).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">Entry Rate</p>
                <p className={`text-sm font-bold tabular-nums ${trendChip((analysis as any).movementType).cls}`}>
                  {Math.round(flowRate)} people/min
                </p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[9px] text-zinc-600 mb-1">
                <span>In view</span>
                <span className="text-zinc-400">{currentCount} people</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, currentCount * 3)}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">Live Now</p>
                <p className={`text-2xl font-black tabular-nums tracking-tight ${cfg.text}`}>{currentCount}</p>
              </div>
              {dailyTotal != null && (
                <div className="text-right">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">Tracked</p>
                  <p className="text-sm font-bold tabular-nums text-zinc-300">{dailyTotal.toLocaleString()}</p>
                </div>
              )}
            </div>
            <div>
              <div className="flex justify-between text-[9px] text-zinc-600 mb-1">
                <span>Congestion</span>
                <span className={cfg.text}>{congestion}%</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${cfg.bar} rounded-full transition-all duration-700`}
                  style={{ width: `${congestion}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Unified Camera Card (flow + density combined per camera) ────────────────

type MergedCamera = {
  deviceId: string;
  device: CrowdAnalysis['device'];
  name: string;
  livePeople: number;
  densityLevel: string;
  congestion: number | null;
  entriesToday: number | null;
  entryRate: number | null;
  trend: string | null;
  timestamp: string;
  isStale: boolean;
  densityRow: CrowdAnalysis | null;
  flowRow: CrowdAnalysis | null;
};

function CameraCard({ camera, sparkline, liveFrame, onClick }: {
  camera: MergedCamera; sparkline: number[]; liveFrame: string | null; onClick: () => void;
}) {
  const cfg          = densityConfig(camera.densityLevel);
  const sparkData    = sparkline.map((v, i) => ({ i, v }));
  const congestion   = camera.congestion ?? Math.min(100, camera.livePeople * 3);
  const hasFlow      = camera.flowRow != null;
  const hasDensity   = camera.densityRow != null;
  const stale        = camera.isStale;

  return (
    <div
      className={`group shrink-0 w-56 rounded-2xl border ${stale ? 'border-zinc-700/60' : cfg.border} overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform duration-200`}
      style={{ background: 'rgba(15,15,20,0.8)', boxShadow: stale ? 'none' : `0 0 20px ${cfg.glow}18`, opacity: stale ? 0.6 : 1 }}
      onClick={onClick}
    >
      {/* Live frame */}
      <div className="relative h-32 bg-zinc-900">
        {liveFrame && !stale ? (
          <img src={liveFrame} alt={camera.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: `radial-gradient(ellipse at 50% 60%, ${cfg.glow}12 0%, transparent 70%)` }}>
            <Users className="w-10 h-10" style={{ color: cfg.glow, opacity: 0.3 }} />
          </div>
        )}

        {/* LIVE / OFFLINE + pipeline badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {stale ? (
            <div className="flex items-center gap-1 bg-zinc-800/90 border border-zinc-600 rounded-full px-2 py-0.5">
              <span className="inline-flex rounded-full h-1.5 w-1.5 bg-zinc-400" />
              <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider">Offline</span>
            </div>
          ) : liveFrame && (
            <div className="flex items-center gap-1 bg-black/70 rounded-full px-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
              </span>
              <span className="text-[9px] font-bold text-white uppercase tracking-wider">Live</span>
            </div>
          )}
          {hasFlow && (
            <div className="bg-amber-500/90 text-amber-950 rounded-full px-1.5 py-[2px] flex items-center">
              <span className="text-[8px] font-bold uppercase tracking-wider leading-none">Flow</span>
            </div>
          )}
          {hasDensity && (
            <div className="bg-amber-500/80 text-white rounded-full px-1.5 py-[2px] flex items-center">
              <span className="text-[8px] font-bold uppercase tracking-wider leading-none">Density</span>
            </div>
          )}
        </div>

        {/* Density label */}
        <div className={`absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.border} ${cfg.text} border`}>
          {camera.densityLevel}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/80 to-transparent" />
        <p className="absolute bottom-2 left-3 right-3 text-xs font-semibold text-white truncate">{camera.name}</p>
      </div>

      {/* Sparkline */}
      {sparkData.length > 1 ? (
        <div className="h-9 bg-black/40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barSize={8}>
              <Bar dataKey="v" fill={cfg.glow} opacity={0.6} radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-9 bg-black/40" />
      )}

      {/* Combined stats: Live (density) + Entries (flow) */}
      <div className="px-3 py-2.5 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-amber-500/5 border border-amber-500/15 px-2 py-1.5">
            <p className="text-[8px] text-amber-300/80 uppercase tracking-widest font-semibold">Live</p>
            <p className={`text-lg font-black tabular-nums leading-tight ${stale ? 'text-zinc-500' : cfg.text}`}>{stale ? '—' : camera.livePeople}</p>
            <p className="text-[8px] text-zinc-500 -mt-0.5">{stale ? `last seen ${timeSince(camera.timestamp)}` : 'in view'}</p>
          </div>
          <div className="rounded-md bg-amber-500/5 border border-amber-500/15 px-2 py-1.5">
            <p className="text-[8px] text-amber-300/80 uppercase tracking-widest font-semibold">Entries</p>
            <p className="text-lg font-black tabular-nums leading-tight text-amber-300">
              {camera.entriesToday != null ? camera.entriesToday.toLocaleString() : '—'}
            </p>
            <p className={`text-[8px] -mt-0.5 ${camera.entryRate != null ? trendChip(camera.trend).cls : 'text-zinc-500'}`}>
              {camera.entryRate != null ? `${Math.round(camera.entryRate)} people/min` : 'no flow yet'}
            </p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[9px] text-zinc-600 mb-1">
            <span>Congestion</span>
            <span className={cfg.text}>{Math.round(congestion)}%</span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${cfg.bar} rounded-full transition-all duration-700`}
              style={{ width: `${congestion}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Card ───────────────────────────────────────────────────────────────

function AlertCard({ alert, onClick }: { alert: CrowdAlert; onClick: () => void }) {
  const cfg = densityConfig(alert.severity === 'RED' ? 'CRITICAL' : alert.severity === 'ORANGE' ? 'HIGH' : alert.severity === 'YELLOW' ? 'MEDIUM' : 'LOW');
  const severityLabel = alert.severity === 'RED' ? 'Critical' : alert.severity === 'ORANGE' ? 'Warning' : alert.severity === 'YELLOW' ? 'Notice' : 'Info';
  const camName = alert.device?.name || alert.deviceId;
  const frame = alert.frameUrl || alert.frameSnapshot || null;

  return (
    <div className={`rounded-xl border ${cfg.border} bg-zinc-900/80 overflow-hidden cursor-pointer hover:brightness-110 transition-all duration-150`} onClick={onClick}>
      {/* Top accent line */}
      <div className={`h-0.5 w-full ${cfg.bar}`} />

      <div className="flex gap-2.5 p-2.5">
        {/* Snapshot at alert time */}
        <div className="relative shrink-0 w-16 h-14 rounded-lg overflow-hidden bg-zinc-800">
          {frame ? (
            <img src={frame} alt={camName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Users className="w-5 h-5 text-zinc-700" />
            </div>
          )}
          {/* severity dot */}
          <span className={`absolute top-1 left-1 w-1.5 h-1.5 rounded-full ${cfg.bar}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className={`text-[9px] font-black uppercase tracking-widest ${cfg.text}`}>
                {severityLabel}
              </span>
              <span className="text-[9px] text-zinc-600 tabular-nums">{timeSince(alert.timestamp)}</span>
            </div>
            <p className="text-[11px] font-semibold text-zinc-100 leading-snug truncate">{alert.title}</p>
            <p className="text-[10px] text-zinc-500 truncate">{camName}</p>
          </div>

          {alert.peopleCount != null && (
            <div className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold ${cfg.bg} border ${cfg.border} ${cfg.text}`}>
              <Users className="w-2.5 h-2.5" />
              {alert.peopleCount} people
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
