import { useState, useEffect, useCallback } from 'react';
import { cacheGet, cacheSet } from '@/lib/persistentCache';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import {
  Car, Shield, Eye, Users, Activity,
  TrendingUp, Clock, MapPin, RefreshCw, PieChart as PieChartIcon,
  ScanFace, UserCheck, UserX,
} from 'lucide-react';
// Host-shell import (sanctioned pattern, like FeatureFlags): AI-services status
// cards for the CLIP search + forensics sidecars.
import { SidecarSummary } from '@/components/analytics/SidecarSummary';
import { Button } from '@sringeri/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@sringeri/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@sringeri/components/ui/tabs';
import { HudBadge } from '@sringeri/components/ui/hud-badge';
import { Skeleton } from '@sringeri/components/ui/skeleton';
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from '@sringeri/components/ui/empty';
import { apiClient } from '@sringeri/lib/api';
import type { VehicleStats, VCCStats, AlertStats, CrowdAnalysis, Person, FRSMatch } from '@sringeri/lib/api';

// ── Types ──────────────────────────────────────────────────────────────

type TimeRange = 'today' | '7d' | '30d';

interface AllStats {
  vehicles: VehicleStats | null;
  vcc: VCCStats | null;
  alerts: AlertStats | null;
  /** Latest analysis row per camera (feeds the Active Hotspots table). */
  hotspots: CrowdAnalysis[] | null;
  /** ALL analysis rows in the selected window (feeds the distribution charts —
   *  same feed the Crowd page uses). */
  crowdRows: CrowdAnalysis[] | null;
  frsPersons: Person[] | null;
  frsDetections: FRSMatch[] | null;
}

// ── Constants ──────────────────────────────────────────────────────────

const CHART_COLORS = [
  '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a',
  '#b45309', '#92400e', '#78350f', '#451a03',
  '#10b981', '#34d399', '#f59e0b', '#fbbf24',
];

const SEVERITY_COLORS: Record<string, string> = {
  GREEN: '#10b981',
  YELLOW: '#f59e0b',
  ORANGE: '#f97316',
  RED: '#ef4444',
};

const DENSITY_COLORS: Record<string, string> = {
  LOW: '#10b981',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

// ── Helpers ────────────────────────────────────────────────────────────

function getTimeRangeParams(_range: TimeRange): { startTime?: string; endTime?: string } {
  // Demo: the analytics only ran for ~2 days a while back, so today/7d/30d windows
  // are all empty. Always fetch from far in the past so all data shows regardless of
  // the selected range (the backend GROUP BY returns only buckets that have data).
  return { startTime: new Date('2020-01-01T00:00:00Z').toISOString(), endTime: new Date().toISOString() };
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Custom Tooltip ─────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-zinc-400 text-[11px] font-mono mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-zinc-100 text-xs font-mono">
          <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: entry.color }} />
          {entry.name}: {formatNumber(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  badge,
  badgeVariant,
  loading,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-7 w-20 mb-2" />
          <Skeleton className="h-4 w-16" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="group hover:border-amber-500/20 transition-colors border border-white/5 bg-zinc-900/30 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono tracking-widest text-zinc-500">{label}</span>
          <Icon className="h-3.5 w-3.5 text-zinc-600" />
        </div>
        <div className="text-2xl font-mono font-bold text-zinc-100 mb-1">{typeof value === 'number' ? formatNumber(value) : value}</div>
        {badge && <HudBadge variant={badgeVariant || 'default'} size="sm">{badge}</HudBadge>}
      </CardContent>
    </Card>
  );
}

// ── Chart Wrapper ──────────────────────────────────────────────────────

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`border border-white/5 bg-zinc-900/30 backdrop-blur-sm ${className || ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-mono tracking-wider text-zinc-400">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [activeTab, setActiveTab] = useState('traffic');
  // Seed from the persistent (reload-surviving) cache so the dashboard repaints
  // instantly on re-open / F5; then revalidate in the background.
  const cacheKey = (tr: string) => `analytics:${tr}`;
  const cachedInit = cacheGet<AllStats>(cacheKey('7d'));
  const [loading, setLoading] = useState(!cachedInit);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<AllStats>(cachedInit?.data ?? {
    vehicles: null,
    vcc: null,
    alerts: null,
    hotspots: null,
    crowdRows: null,
    frsPersons: null,
    frsDetections: null,
  });

  const fetchData = useCallback(async () => {
    try {
      const timeParams = getTimeRangeParams(timeRange);
      const [vehicles, vcc, alerts, crowdRows, frsPersons, frsDetections] = await Promise.allSettled([
        apiClient.getVehicleStats(),
        apiClient.getVCCStats(timeParams),
        apiClient.getAlertStats(),
        // Same windowed feed the Crowd page uses (light projection) — the
        // /latest endpoint only returns a handful of rows and starves the
        // distribution charts.
        apiClient.getCrowdAnalysis({ startTime: timeParams.startTime, light: true, limit: 6000 }),
        apiClient.getPersons(),
        apiClient.getFRSDetections({ startTime: timeParams.startTime, limit: 1000 }),
      ]);
      const rows = crowdRows.status === 'fulfilled' ? (crowdRows.value || []) : [];
      // Latest row per camera → Active Hotspots table.
      const latestByCam = new Map<string, CrowdAnalysis>();
      for (const r of rows) {
        const prev = latestByCam.get(r.deviceId);
        if (!prev || new Date(r.timestamp).getTime() > new Date(prev.timestamp).getTime()) {
          latestByCam.set(r.deviceId, r);
        }
      }
      const next: AllStats = {
        vehicles: vehicles.status === 'fulfilled' ? vehicles.value : null,
        vcc: vcc.status === 'fulfilled' ? vcc.value : null,
        alerts: alerts.status === 'fulfilled' ? alerts.value : null,
        hotspots: rows.length ? Array.from(latestByCam.values()) : null,
        crowdRows: rows.length ? rows : null,
        frsPersons: frsPersons.status === 'fulfilled' ? frsPersons.value : null,
        frsDetections: frsDetections.status === 'fulfilled' ? frsDetections.value : null,
      };
      setStats(next);
      cacheSet(cacheKey(timeRange), next);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeRange]);

  useEffect(() => {
    // Only block with the skeleton when we have nothing cached for this range.
    if (!cacheGet(cacheKey(timeRange))) setLoading(true);
    else { const c = cacheGet<AllStats>(cacheKey(timeRange)); if (c) setStats(c.data); }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // ── Derived data ─────────────────────────────────────────────────────

  const vehiclesByType = stats.vehicles?.byType
    ? Object.entries(stats.vehicles.byType).map(([name, value]) => ({ name, value }))
    : [];

  // Hour buckets arrive as UTC timestamps — show IST labels (same conversion
  // the VCC page uses).
  const vccByTime = stats.vcc?.byTime
    ? stats.vcc.byTime.map((d) => {
        const raw = d.hour || d.day || d.week || d.month || '';
        let time = String(raw);
        if (d.hour) {
          const parsed = new Date(String(raw).trim().replace(' ', 'T') + 'Z');
          if (!isNaN(parsed.getTime())) {
            time = parsed.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
          }
        }
        return { time, count: d.count };
      })
    : [];

  const vccByVehicleType = stats.vcc?.byVehicleType
    ? Object.entries(stats.vcc.byVehicleType).map(([name, value]) => ({ name, value }))
    : [];

  // Distributions count EVERY analysis row in the window (the live feed the
  // Crowd page shows), not just the latest row per camera.
  const hotspotsBySeverity = stats.crowdRows
    ? (['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const).map((sev) => ({
        name: sev,
        value: stats.crowdRows!.filter((h) => h.hotspotSeverity === sev).length,
      })).filter((d) => d.value > 0)
    : [];

  const hotspotsByDensity = stats.crowdRows
    ? (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((level) => ({
        name: level,
        value: stats.crowdRows!.filter((h) => h.densityLevel === level).length,
      })).filter((d) => d.value > 0)
    : [];

  const timeWindowStart = (() => {
    const p = getTimeRangeParams(timeRange);
    return p.startTime ? new Date(p.startTime).getTime() : 0;
  })();

  const frsWindowDetections = (stats.frsDetections || []).filter((d) => {
    const ts = new Date(d.timestamp).getTime();
    return Number.isFinite(ts) && ts >= timeWindowStart;
  });

  const frsKnownDetections = frsWindowDetections.filter((d) => Boolean(d.personId)).length;
  const frsAverageConfidence = frsWindowDetections.length > 0
    ? frsWindowDetections.reduce((sum, d) => sum + (Number(d.confidence) || 0), 0) / frsWindowDetections.length
    : 0;

  // FRS detections bucketed per IST hour — the over-time graph.
  const frsOverTime = (() => {
    const buckets = new Map<number, number>();
    for (const d of frsWindowDetections) {
      const ts = new Date(d.timestamp).getTime();
      if (!Number.isFinite(ts)) continue;
      const hr = Math.floor(ts / 3_600_000) * 3_600_000;
      buckets.set(hr, (buckets.get(hr) || 0) + 1);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hr, count]) => ({
        time: new Date(hr).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }),
        count,
      }));
  })();

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-hidden relative iris-dashboard-root">
      <div className="h-full p-4 md:p-6 lg:p-8 flex flex-col gap-6 overflow-hidden">
      {/* Analytics header — neutral IRIS identity */}
      <div className="rounded-2xl border border-white/10 overflow-hidden relative bg-card">
        <div className="relative px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold text-amber-300/80 uppercase tracking-[0.2em]">
                IRIS Command Center
              </p>
              <h1 className="text-sm font-bold text-white tracking-tight truncate">
                Surveillance Analytics
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
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 border-amber-500/20 hover:bg-amber-500/10"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-amber-300 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <div className="flex bg-zinc-900/80 border border-amber-500/20 rounded-lg p-0.5">
              {(['today', '7d', '30d'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${
                    timeRange === range
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                  }`}
                >
                  {range === 'today' ? 'Today' : range}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Vehicles"
          value={stats.vehicles?.total ?? 0}
          icon={Car}
          badge={stats.vehicles ? `${formatNumber(stats.vehicles.detectionsToday)} Today` : undefined}
          badgeVariant="info"
          loading={loading}
        />
        <StatCard
          label="Active Alerts"
          value={stats.alerts?.unread ?? 0}
          icon={Shield}
          badge={stats.alerts ? `${stats.alerts.today} Today` : undefined}
          badgeVariant="danger"
          loading={loading}
        />
        <StatCard
          label="Watchlisted"
          value={stats.vehicles?.watchlisted ?? 0}
          icon={Eye}
          badge="Monitoring"
          badgeVariant="warning"
          loading={loading}
        />
        <StatCard
          label="Crowd Hotspots"
          value={stats.hotspots?.length ?? 0}
          icon={Users}
          badge={
            stats.hotspots
              ? `${stats.hotspots.filter((h) => h.hotspotSeverity === 'RED').length} Critical`
              : undefined
          }
          badgeVariant="danger"
          loading={loading}
        />
        <StatCard
          label="FRS Matches"
          value={frsKnownDetections}
          icon={ScanFace}
          badge={`${frsKnownDetections} Today`}
          badgeVariant="info"
          loading={loading}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 overflow-hidden">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger className="text-xs" value="traffic">Traffic</TabsTrigger>
          <TabsTrigger className="text-xs" value="crowd">Crowd</TabsTrigger>
          <TabsTrigger className="text-xs" value="frs">FRS</TabsTrigger>
          <TabsTrigger className="text-xs" value="services">AI Services</TabsTrigger>
        </TabsList>

        {/* ── Traffic Tab ─────────────────────────────────────────────── */}
        <TabsContent value="traffic" className="h-full overflow-y-auto pr-1">
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
              <Skeleton className="h-64 lg:col-span-2" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {/* Vehicle Type Pie */}
              <ChartCard title="Vehicle Type Distribution">
                {vehiclesByType.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={vehiclesByType}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          dataKey="value"
                          nameKey="name"
                          paddingAngle={2}
                          stroke="none"
                        >
                          {vehiclesByType.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          formatter={(value: string) => <span className="text-zinc-400 text-xs font-mono">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-72">
                    <EmptyIcon><PieChartIcon /></EmptyIcon>
                    <EmptyTitle>No vehicle type data</EmptyTitle>
                    <EmptyDescription>Vehicle type distribution will appear when detections are recorded.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>

              {/* VCC Stats Summary */}
              <ChartCard title="VCC Classification Stats">
                <div className="space-y-4 mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Total Detections', value: stats.vcc?.totalDetections ?? 0, icon: Activity },
                      { label: 'Unique Vehicles', value: stats.vcc?.uniqueVehicles ?? 0, icon: Car },
                      { label: 'Peak Hour', value: stats.vcc?.peakHour != null ? `${String(stats.vcc.peakHour).padStart(2, '0')}:00` : '--', icon: Clock },
                      { label: 'Avg / Hour', value: stats.vcc?.averagePerHour ?? 0, icon: TrendingUp },
                    ].map((item) => (
                      <div key={item.label} className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
                        <div className="flex items-center gap-2 mb-1">
                          <item.icon className="h-3 w-3 text-zinc-600" />
                          <span className="text-[10px] font-mono tracking-widest text-zinc-500">{item.label}</span>
                        </div>
                        <div className="text-lg font-mono font-bold text-zinc-100">
                          {typeof item.value === 'number' ? formatNumber(item.value) : item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  {stats.vcc?.classification && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono tracking-widest text-zinc-500">Classification Breakdown</span>
                      {[
                        { label: 'With Plates', value: stats.vcc.classification.withPlates, total: stats.vcc.totalDetections, color: '#f59e0b' },
                        { label: 'Full Classification', value: stats.vcc.classification.fullClassification, total: stats.vcc.totalDetections, color: '#10b981' },
                      ].map((bar) => {
                        const pct = bar.total > 0 ? (bar.value / bar.total) * 100 : 0;
                        return (
                          <div key={bar.label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-mono text-zinc-400">{bar.label}</span>
                              <span className="font-mono text-zinc-300">{formatNumber(bar.value)} ({pct.toFixed(1)}%)</span>
                            </div>
                            <div className="w-full bg-white/5 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: bar.color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ChartCard>

              {/* VCC by Vehicle Type Bar Chart */}
              <ChartCard title="VCC by Vehicle Type">
                {vccByVehicleType.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={vccByVehicleType} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                          {vccByVehicleType.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-72">
                    <EmptyIcon><Car /></EmptyIcon>
                    <EmptyTitle>No VCC data</EmptyTitle>
                    <EmptyDescription>Vehicle classification data will appear when detections are processed.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>

              {/* Detections Timeline */}
              <ChartCard title="Detections Timeline">
                {vccByTime.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={vccByTime} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line type="monotone" dataKey="count" name="Detections" stroke="#fbbf24" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-72">
                    <EmptyIcon><TrendingUp /></EmptyIcon>
                    <EmptyTitle>No detection timeline</EmptyTitle>
                    <EmptyDescription>Detection timeline will populate as vehicle data is recorded.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>
            </div>
          )}
        </TabsContent>

        {/* ── FRS Tab ─────────────────────────────────────────────── */}
        <TabsContent value="frs" className="h-full overflow-y-auto pr-1">
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
              <Skeleton className="h-72 lg:col-span-2" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <ChartCard title="FRS Overview">
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="bg-white/[0.02] rounded-lg p-4 border border-white/5">
                    <span className="text-[10px] font-mono tracking-widest text-zinc-500">Indexed Persons</span>
                    <div className="text-xl font-mono font-bold mt-1 text-zinc-100">{formatNumber(stats.frsPersons?.length ?? 0)}</div>
                  </div>
                  <div className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/20">
                    <span className="text-[10px] font-mono tracking-widest text-zinc-500">Detections ({timeRange})</span>
                    <div className="text-xl font-mono font-bold mt-1 text-amber-300">{formatNumber(frsWindowDetections.length)}</div>
                  </div>
                  <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-500/20">
                    <span className="text-[10px] font-mono tracking-widest text-zinc-500">Known Matches</span>
                    <div className="text-xl font-mono font-bold mt-1 text-emerald-300">{formatNumber(frsKnownDetections)}</div>
                  </div>
                  <div className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/20">
                    <span className="text-[10px] font-mono tracking-widest text-zinc-500">Watchlist Persons</span>
                    <div className="text-xl font-mono font-bold mt-1 text-amber-300">{formatNumber(stats.frsPersons?.length ?? 0)}</div>
                  </div>
                </div>
                <div className="mt-4 text-xs font-mono text-zinc-400 flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-zinc-600" />
                  Average Confidence: <span className="text-zinc-200">{(frsAverageConfidence * 100).toFixed(1)}%</span>
                </div>
              </ChartCard>

              <ChartCard title={`Watchlist · ${(stats.frsPersons || []).length} enrolled`}>
                {(stats.frsPersons || []).length > 0 ? (
                  <div className="h-64 overflow-y-auto pr-1">
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {(stats.frsPersons || []).map((p) => {
                        const threat = (p.threatLevel || '').toLowerCase();
                        const threatCls = threat === 'high' ? 'bg-red-500/15 text-red-300 border-red-500/30'
                          : threat === 'medium' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                        const initials = (p.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
                        return (
                          <div key={p.id} className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
                            <div className="aspect-square bg-zinc-950 relative grid place-items-center">
                              <span className="text-xl font-black text-amber-300/70">{initials}</span>
                              {p.faceImageUrl && (
                                <img src={p.faceImageUrl} alt={p.name} loading="lazy"
                                  className="absolute inset-0 w-full h-full object-cover"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                              )}
                            </div>
                            <div className="px-2 py-1.5">
                              <div className="text-[11px] font-semibold text-zinc-200 truncate">{p.name}</div>
                              <span className={`inline-block mt-0.5 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${threatCls}`}>{p.threatLevel || '—'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-64">
                    <EmptyIcon><UserCheck /></EmptyIcon>
                    <EmptyTitle>No watchlist profile data</EmptyTitle>
                    <EmptyDescription>Threat-level distribution appears when watchlist persons are enrolled.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>

              <ChartCard title="FRS Detections Over Time" className="lg:col-span-2">
                {frsOverTime.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={frsOverTime} margin={{ left: 0, right: 20, top: 10, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="time" tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={55} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="count" name="Detections" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-72">
                    <EmptyIcon><UserX /></EmptyIcon>
                    <EmptyTitle>No FRS detections in range</EmptyTitle>
                    <EmptyDescription>Detections will appear here when FRS ingest is active for selected cameras.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>
            </div>
          )}
        </TabsContent>

        {/* ── Crowd Tab ──────────────────────────────────────────────── */}
        <TabsContent value="crowd" className="h-full overflow-y-auto pr-1">
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {/* Hotspot Severity Breakdown */}
              <ChartCard title="Hotspot Severity Distribution">
                {hotspotsBySeverity.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={hotspotsBySeverity}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          dataKey="value"
                          nameKey="name"
                          paddingAngle={2}
                          stroke="none"
                        >
                          {hotspotsBySeverity.map((entry) => (
                            <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name]} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          formatter={(value: string) => <span className="text-zinc-400 text-xs font-mono">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-72">
                    <EmptyIcon><Users /></EmptyIcon>
                    <EmptyTitle>No hotspot data</EmptyTitle>
                    <EmptyDescription>Hotspot severity data will appear when crowd analysis is active.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>

              {/* Density Levels */}
              <ChartCard title="Crowd Density Levels">
                {hotspotsByDensity.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hotspotsByDensity} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="value" name="Locations" radius={[4, 4, 0, 0]}>
                          {hotspotsByDensity.map((entry) => (
                            <Cell key={entry.name} fill={DENSITY_COLORS[entry.name]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-72">
                    <EmptyIcon><Activity /></EmptyIcon>
                    <EmptyTitle>No density data</EmptyTitle>
                    <EmptyDescription>Crowd density levels will appear when monitoring locations are active.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>

              {/* Hotspot Details Table */}
              <ChartCard title="Active Hotspots" className="lg:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left py-3 px-4 text-[11px] font-mono tracking-wider text-zinc-500">Location</th>
                        <th className="text-right py-3 px-4 text-[11px] font-mono tracking-wider text-zinc-500">People Count</th>
                        <th className="text-center py-3 px-4 text-[11px] font-mono tracking-wider text-zinc-500">Severity</th>
                        <th className="text-center py-3 px-4 text-[11px] font-mono tracking-wider text-zinc-500">Density</th>
                        <th className="text-right py-3 px-4 text-[11px] font-mono tracking-wider text-zinc-500">Congestion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.hotspots || [])
                        .sort((a, b) => {
                          const sevOrder = { RED: 0, ORANGE: 1, YELLOW: 2, GREEN: 3 };
                          return (sevOrder[a.hotspotSeverity] ?? 4) - (sevOrder[b.hotspotSeverity] ?? 4);
                        })
                        .slice(0, 15)
                        .map((h) => (
                          <tr key={h.deviceId} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                            <td className="py-3 px-4 font-mono text-zinc-300 text-xs flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-zinc-600 flex-shrink-0" />
                              {h.device?.name || h.deviceId}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-zinc-100">{h.peopleCount ?? '--'}</td>
                            <td className="py-3 px-4 text-center">
                              <HudBadge
                                variant={
                                  h.hotspotSeverity === 'RED' ? 'danger'
                                    : h.hotspotSeverity === 'ORANGE' ? 'warning'
                                    : h.hotspotSeverity === 'YELLOW' ? 'warning'
                                    : 'success'
                                }
                                size="sm"
                              >
                                {h.hotspotSeverity}
                              </HudBadge>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <HudBadge
                                variant={
                                  h.densityLevel === 'CRITICAL' ? 'danger'
                                    : h.densityLevel === 'HIGH' ? 'warning'
                                    : h.densityLevel === 'MEDIUM' ? 'info'
                                    : 'success'
                                }
                                size="sm"
                              >
                                {h.densityLevel}
                              </HudBadge>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-zinc-400">
                              {h.congestionLevel != null ? `${h.congestionLevel}%` : '--'}
                            </td>
                          </tr>
                        ))}
                      {(!stats.hotspots || stats.hotspots.length === 0) && (
                        <tr>
                          <td colSpan={5}>
                            <Empty className="min-h-0 py-8">
                              <EmptyIcon><MapPin /></EmptyIcon>
                              <EmptyTitle>No active hotspots</EmptyTitle>
                              <EmptyDescription>Hotspot data will appear when crowd monitoring devices are active.</EmptyDescription>
                            </Empty>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </div>
          )}
        </TabsContent>

        {/* ── AI Services Tab — CLIP search + forensics sidecar status ── */}
        {/* (The old Alerts tab moved to the dedicated /alerts hub page.) */}
        <TabsContent value="services" className="h-full overflow-y-auto pr-1">
          <div className="mt-4">
            <SidecarSummary />
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
