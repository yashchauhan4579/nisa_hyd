import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import {
  AlertTriangle, Car, Shield, Eye, Users, Activity,
  TrendingUp, Clock, MapPin, BarChart3, RefreshCw, PieChart as PieChartIcon,
  Monitor, Bell,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@irisdrone/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@irisdrone/components/ui/tabs';
import { HudBadge } from '@irisdrone/components/ui/hud-badge';
import { Skeleton } from '@irisdrone/components/ui/skeleton';
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from '@irisdrone/components/ui/empty';
import { apiClient } from '@irisdrone/lib/api';
import type { ViolationStats, VehicleStats, VCCStats, AlertStats, Hotspot } from '@irisdrone/lib/api';

// ── Types ──────────────────────────────────────────────────────────────

type TimeRange = 'today' | '7d' | '30d';

interface AllStats {
  violations: ViolationStats | null;
  vehicles: VehicleStats | null;
  vcc: VCCStats | null;
  alerts: AlertStats | null;
  hotspots: Hotspot[] | null;
}

// ── Constants ──────────────────────────────────────────────────────────

const CHART_COLORS = [
  '#f59e0b', '#fbbf24', '#a5b4fc', '#c7d2fe',
  '#d97706', '#b45309', '#3730a3', '#312e81',
  '#f59e0b', '#d97706', '#10b981', '#f59e0b',
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

function getTimeRangeParams(range: TimeRange): { startTime?: string; endTime?: string } {
  const now = new Date();
  const end = now.toISOString();
  let start: Date;
  switch (range) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }
  return { startTime: start.toISOString(), endTime: end };
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
      <p className="text-zinc-400 text-xs font-mono mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-zinc-100 text-sm font-mono">
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
        <CardContent className="p-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-20 mb-2" />
          <Skeleton className="h-4 w-16" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="group hover:border-amber-500/20 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono tracking-widest text-zinc-500">{label}</span>
          <Icon className="h-4 w-4 text-zinc-600" />
        </div>
        <div className="text-3xl font-mono font-bold text-zinc-100 mb-1">{typeof value === 'number' ? formatNumber(value) : value}</div>
        {badge && <HudBadge variant={badgeVariant || 'default'} size="sm">{badge}</HudBadge>}
      </CardContent>
    </Card>
  );
}

// ── Chart Wrapper ──────────────────────────────────────────────────────

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-mono tracking-wider text-zinc-400">{title}</CardTitle>
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
  const [activeTab, setActiveTab] = useState('violations');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<AllStats>({
    violations: null,
    vehicles: null,
    vcc: null,
    alerts: null,
    hotspots: null,
  });

  const fetchData = useCallback(async () => {
    try {
      const timeParams = getTimeRangeParams(timeRange);
      const [violations, vehicles, vcc, alerts, hotspots] = await Promise.allSettled([
        apiClient.getViolationStats(timeParams),
        apiClient.getVehicleStats(),
        apiClient.getVCCStats(timeParams),
        apiClient.getAlertStats(),
        apiClient.getHotspots(),
      ]);
      setStats({
        violations: violations.status === 'fulfilled' ? violations.value : null,
        vehicles: vehicles.status === 'fulfilled' ? vehicles.value : null,
        vcc: vcc.status === 'fulfilled' ? vcc.value : null,
        alerts: alerts.status === 'fulfilled' ? alerts.value : null,
        hotspots: hotspots.status === 'fulfilled' ? hotspots.value : null,
      });
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeRange]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // ── Derived data ─────────────────────────────────────────────────────

  const violationsByType = stats.violations?.byType
    ? Object.entries(stats.violations.byType).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
    : [];

  const violationsByHour = stats.violations?.byTime
    ? stats.violations.byTime.map((d) => ({ hour: `${String(d.hour).padStart(2, '0')}:00`, count: d.count }))
    : stats.violations?.byHour
      ? Object.entries(stats.violations.byHour).map(([h, c]) => ({ hour: `${String(h).padStart(2, '0')}:00`, count: c }))
      : [];

  const violationsByDevice = stats.violations?.byDevice
    ? Object.entries(stats.violations.byDevice).map(([device, count]) => ({ device, count }))
    : [];

  const vehiclesByType = stats.vehicles?.byType
    ? Object.entries(stats.vehicles.byType).map(([name, value]) => ({ name, value }))
    : [];

  const vccByTime = stats.vcc?.byTime
    ? stats.vcc.byTime.map((d) => ({ time: d.hour || d.day || d.week || d.month || '', count: d.count }))
    : [];

  const vccByVehicleType = stats.vcc?.byVehicleType
    ? Object.entries(stats.vcc.byVehicleType).map(([name, value]) => ({ name, value }))
    : [];

  const hotspotsBySeverity = stats.hotspots
    ? (['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const).map((sev) => ({
        name: sev,
        value: stats.hotspots!.filter((h) => h.hotspotSeverity === sev).length,
      })).filter((d) => d.value > 0)
    : [];

  const hotspotsByDensity = stats.hotspots
    ? (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((level) => ({
        name: level,
        value: stats.hotspots!.filter((h) => h.densityLevel === level).length,
      })).filter((d) => d.value > 0)
    : [];

  const alertsByType = stats.alerts?.byType
    ? Object.entries(stats.alerts.byType).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
    : [];

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-full p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-amber-400" />
          <h1 className="text-xl font-mono font-bold text-zinc-100">
            Analytics
          </h1>
          <HudBadge variant="default" size="sm">Live</HudBadge>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-white/5 border border-white/5 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex bg-white/5 rounded-lg border border-white/5 p-1">
            {(['today', '7d', '30d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-xs font-mono tracking-wider rounded-md transition-colors ${
                  timeRange === range
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`}
              >
                {range === 'today' ? 'Today' : range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Violations"
          value={stats.violations?.total ?? 0}
          icon={AlertTriangle}
          badge={stats.violations ? `${stats.violations.pending} Pending` : undefined}
          badgeVariant="warning"
          loading={loading}
        />
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
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="violations">Violations</TabsTrigger>
          <TabsTrigger value="traffic">Traffic</TabsTrigger>
          <TabsTrigger value="crowd">Crowd</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        {/* ── Violations Tab ─────────────────────────────────────────── */}
        <TabsContent value="violations">
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
              <Skeleton className="h-64 lg:col-span-2" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {/* Violation Type Breakdown */}
              <ChartCard title="Violations by Type">
                {violationsByType.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={violationsByType} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" width={110} tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]}>
                          {violationsByType.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-72">
                    <EmptyIcon><BarChart3 /></EmptyIcon>
                    <EmptyTitle>No violation type data</EmptyTitle>
                    <EmptyDescription>Violation type breakdown will appear when violations are recorded.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>

              {/* Hourly Trend */}
              <ChartCard title="Violations by Hour">
                {violationsByHour.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={violationsByHour} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                        <defs>
                          <linearGradient id="violationGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="hour" tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="count" name="Violations" stroke="#f59e0b" fill="url(#violationGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-72">
                    <EmptyIcon><Clock /></EmptyIcon>
                    <EmptyTitle>No hourly data</EmptyTitle>
                    <EmptyDescription>Hourly violation trends will appear when data is available.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>

              {/* By Device Table */}
              <ChartCard title="Violations by Device" className="lg:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left py-3 px-4 text-[11px] font-mono tracking-wider text-zinc-500">Device</th>
                        <th className="text-right py-3 px-4 text-[11px] font-mono tracking-wider text-zinc-500">Violations</th>
                        <th className="text-right py-3 px-4 text-[11px] font-mono tracking-wider text-zinc-500">% of Total</th>
                        <th className="text-left py-3 px-4 text-[11px] font-mono tracking-wider text-zinc-500">Distribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {violationsByDevice
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 10)
                        .map((d) => {
                          const pct = stats.violations?.total ? ((d.count / stats.violations.total) * 100) : 0;
                          return (
                            <tr key={d.device} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4 font-mono text-zinc-300 text-xs flex items-center gap-2">
                                <MapPin className="h-3 w-3 text-zinc-600" />
                                {d.device}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-zinc-100">{formatNumber(d.count)}</td>
                              <td className="py-3 px-4 text-right font-mono text-zinc-400">{pct.toFixed(1)}%</td>
                              <td className="py-3 px-4">
                                <div className="w-full bg-white/5 rounded-full h-1.5">
                                  <div
                                    className="bg-amber-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      {violationsByDevice.length === 0 && (
                        <tr>
                          <td colSpan={4}>
                            <Empty className="min-h-0 py-8">
                              <EmptyIcon><Monitor /></EmptyIcon>
                              <EmptyTitle>No device data</EmptyTitle>
                              <EmptyDescription>Device-level violation breakdown will appear when data is recorded.</EmptyDescription>
                            </Empty>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </ChartCard>

              {/* Status Breakdown */}
              <ChartCard title="Violation Status" className="lg:col-span-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
                  {[
                    { label: 'Pending', value: stats.violations?.pending ?? 0, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    { label: 'Approved', value: stats.violations?.approved ?? 0, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    { label: 'Rejected', value: stats.violations?.rejected ?? 0, color: 'text-red-400', bg: 'bg-red-500/10' },
                    { label: 'Fined', value: stats.violations?.fined ?? 0, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                  ].map((s) => (
                    <div key={s.label} className={`${s.bg} rounded-lg p-4 border border-white/5`}>
                      <span className="text-[10px] font-mono tracking-widest text-zinc-500">{s.label}</span>
                      <div className={`text-2xl font-mono font-bold mt-1 ${s.color}`}>{formatNumber(s.value)}</div>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </div>
          )}
        </TabsContent>

        {/* ── Traffic Tab ─────────────────────────────────────────────── */}
        <TabsContent value="traffic">
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
                        <div className="text-xl font-mono font-bold text-zinc-100">
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
                        { label: 'With Make/Model', value: stats.vcc.classification.withMakeModel, total: stats.vcc.totalDetections, color: '#fbbf24' },
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

        {/* ── Crowd Tab ──────────────────────────────────────────────── */}
        <TabsContent value="crowd">
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
                              {h.name}
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

        {/* ── Alerts Tab ─────────────────────────────────────────────── */}
        <TabsContent value="alerts">
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {/* Alert Stats */}
              <ChartCard title="Alert Overview">
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {[
                    { label: 'Total', value: stats.alerts?.total ?? 0, color: 'text-zinc-100', bg: 'bg-white/[0.02]' },
                    { label: 'Unread', value: stats.alerts?.unread ?? 0, color: 'text-red-400', bg: 'bg-red-500/10' },
                    { label: 'Read', value: stats.alerts?.read ?? 0, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    { label: 'Today', value: stats.alerts?.today ?? 0, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                  ].map((s) => (
                    <div key={s.label} className={`${s.bg} rounded-lg p-4 border border-white/5`}>
                      <span className="text-[10px] font-mono tracking-widest text-zinc-500">{s.label}</span>
                      <div className={`text-2xl font-mono font-bold mt-1 ${s.color}`}>{formatNumber(s.value)}</div>
                    </div>
                  ))}
                </div>
              </ChartCard>

              {/* Alert Type Breakdown */}
              <ChartCard title="Alerts by Type">
                {alertsByType.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={alertsByType} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="value" name="Alerts" radius={[4, 4, 0, 0]}>
                          {alertsByType.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty className="min-h-0 h-64">
                    <EmptyIcon><Bell /></EmptyIcon>
                    <EmptyTitle>No alert type data</EmptyTitle>
                    <EmptyDescription>Alert type breakdown will appear when alerts are generated.</EmptyDescription>
                  </Empty>
                )}
              </ChartCard>

              {/* Read vs Unread donut */}
              <ChartCard title="Read vs Unread" className="lg:col-span-2">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 py-4">
                  <div className="h-48 w-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Unread', value: stats.alerts?.unread ?? 0 },
                            { name: 'Read', value: stats.alerts?.read ?? 0 },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          dataKey="value"
                          nameKey="name"
                          paddingAngle={2}
                          stroke="none"
                        >
                          <Cell fill="#ef4444" />
                          <Cell fill="#10b981" />
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-zinc-400 font-mono text-xs">Unread</span>
                      <span className="text-zinc-100 font-mono font-bold text-lg ml-2">{formatNumber(stats.alerts?.unread ?? 0)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-zinc-400 font-mono text-xs">Read</span>
                      <span className="text-zinc-100 font-mono font-bold text-lg ml-2">{formatNumber(stats.alerts?.read ?? 0)}</span>
                    </div>
                  </div>
                </div>
              </ChartCard>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
