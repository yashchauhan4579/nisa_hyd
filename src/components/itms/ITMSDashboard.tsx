import { useState, useEffect, useRef } from 'react';
import { apiClient, type VCCStats, type VCCRealtime } from '@/lib/api';
import { Activity, Clock, Loader2, Maximize2, Minimize2, Camera } from 'lucide-react';
import { FaMotorcycle, FaCar, FaBus, FaTruck } from 'react-icons/fa';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { VCCInsights } from '@/components/tvcc/VCCInsights';
import { WhepPlayer } from '@/components/video/WhepPlayer';
import { CountUp } from '@/components/tvcc/CountUp';
import type { CameraOption } from '@/components/tvcc/CameraSelector';
import { useFullscreen } from '@/contexts/FullscreenContext';
import { useDataCache } from '@/contexts/DataCacheContext';

interface HealthStats {
  total: number;
  online: number;
  offline: number;
  avgLatency: number;
  uptime: number;
}

interface CameraHealth {
  id: string;
  cameraId: string;
  location: string;
  status: string;
  lastPing: string;
  latencyMs: number;
  history?: { timestamp: string; latencyMs: number; status: string }[];
}

const ALL_LIVE_FEEDS = [
  { label: 'atcc_3_jq_ap_khandagiri', url: '/webrtc/live/atcc_3_jq_ap_khandagiri' },
  { label: 'atcc_2_jq_ap_mahavir_chowk', url: '/webrtc/live/atcc_2_jq_ap_mahavir_chowk' },
  { label: 'atcc_2_gsq_ap_ghatika_naka_gate', url: '/webrtc/live/atcc_2_gsq_ap_ghatika_naka_gate' },
  { label: 'atcc_1_jsq_ap_siripur', url: '/webrtc/live/atcc_1_jsq_ap_siripur' },
  { label: 'atcc_1_jvsq_ap_ximb', url: '/webrtc/live/atcc_1_jvsq_ap_ximb' },
  { label: 'atcc_1_info_ap_patia', url: '/webrtc/live/atcc_1_info_ap_patia' },
  { label: 'atcc_1_dsq_ap_patia', url: '/webrtc/live/atcc_1_dsq_ap_patia' },
];

const getVehicleTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    'HMV': 'bg-amber-900',
    'BUS': 'bg-amber-800',
    '4W': 'bg-amber-600',
    'AUTO': 'bg-amber-500',
    '2W': 'bg-amber-400',
    'UNKNOWN': 'bg-gray-500',
  };
  return colors[type] || 'bg-gray-500';
};

const getVehicleTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    '2W': '2 Wheeler',
    '4W': '4 Wheeler',
    'AUTO': 'Auto',
    'BUS': 'Bus',
    'HMV': 'Heavy Vehicle',
    'UNKNOWN': 'Unknown',
  };
  return labels[type] || type;
};

const getVehicleTypeIcon = (type: string) => {
  const icons: Record<string, React.ReactNode> = {
    '2W': <FaMotorcycle className="w-5 h-5" />,
    '4W': <FaCar className="w-5 h-5" />,
    'AUTO': (
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-5 h-5">
        <path d="M21 11.18V9.72c0-.47-.16-.92-.46-1.28L16.6 3.72c-.38-.46-.94-.72-1.54-.72H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h.18C3.6 16.16 4.7 17 6 17s2.4-.84 2.82-2h8.37a2.996 2.996 0 0 0 5.82-1c-.01-1.3-.85-2.4-2.01-2.82zM6 15c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm1-3.83A3.014 3.014 0 0 0 3.17 13H3v-3h4v1.17zM7 8H3V5h4v3zm7 5H9v-3h3V8H9V5h5v8zm2-6.88L18.4 9H16V6.12zM17.17 13H16v-2h3v.17c-.85.3-1.53.98-1.83 1.83zM20 15c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
      </svg>
    ),
    'BUS': <FaBus className="w-5 h-5" />,
    'HMV': <FaTruck className="w-5 h-5" />,
  };
  return icons[type] || <FaCar className="w-5 h-5" />;
};

export function ITMSDashboard() {
  const { isFullscreen, setIsFullscreen } = useFullscreen();
  const { cameras: cachedCameras, getCameras } = useDataCache();
  const [stats, setStats] = useState<VCCStats | null>(null);
  const [realtime, setRealtime] = useState<VCCRealtime | null>(null);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [healthStats, setHealthStats] = useState<HealthStats>({ total: 0, online: 0, offline: 0, avgLatency: 0, uptime: 0 });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);

  // Initialize with the first 4 feeds (indices 0, 1, 2, 3)
  const [activeFeeds, setActiveFeeds] = useState<number[]>([0, 1, 2, 3]);
  const failedFeeds = useRef<Set<number>>(new Set());

  // Handle stream failure and fallback to the next available feed
  const handleStreamError = (failedFeedIndex: number) => {
    // Guard: ignore if already marked as failed (prevents double-fire race)
    if (failedFeeds.current.has(failedFeedIndex)) return;
    failedFeeds.current.add(failedFeedIndex);

    setActiveFeeds(prev => {
      const activeIdx = prev.indexOf(failedFeedIndex);
      if (activeIdx === -1) return prev;

      // Find a spare feed not currently shown and not failed
      const unusedIndex = ALL_LIVE_FEEDS.findIndex((_, idx) =>
        !prev.includes(idx) && !failedFeeds.current.has(idx)
      );

      if (unusedIndex !== -1) {
        const newFeeds = [...prev];
        newFeeds[activeIdx] = unusedIndex;
        return newFeeds;
      }

      return prev;
    });
  };

  // Fixed date range: last 7 days
  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  };

  const fetchStats = async (silent = false) => {
    try {
      if (!silent) setStatsLoading(true);
      const range = getDateRange();
      const data = await apiClient.getVCCStats({
        startTime: range.startTime,
        endTime: range.endTime,
        groupBy: 'day',
      });
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch VCC stats:', err);
    } finally {
      if (!silent) setStatsLoading(false);
    }
  };

  const fetchRealtime = async () => {
    try {
      const data = await apiClient.getVCCRealtime();
      setRealtime(data);
    } catch (err) {
      console.error('Failed to fetch realtime data:', err);
    }
  };

  const fetchCameras = async () => {
    try {
      const devices = await getCameras();
      setCameras(devices.map(d => ({ id: d.id, name: d.name, metadata: d.metadata })));
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
    }
  };

  const fetchHealth = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/camera-health', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data: CameraHealth[] = (await res.json()) || [];
        const total = data.length;
        const online = data.filter(c => c.status === 'online').length;
        const offline = total - online;
        const avgLatency = online > 0
          ? Math.round(data.filter(c => c.status === 'online').reduce((acc, c) => acc + c.latencyMs, 0) / online)
          : 0;
        const allHistory = data.flatMap(c => c.history || []);
        let uptime = 0;
        if (allHistory.length > 0) {
          const onlineCount = allHistory.filter(h => h.status === 'online').length;
          uptime = Math.round((onlineCount / allHistory.length) * 1000) / 10;
        }
        setHealthStats({ total, online, offline, avgLatency, uptime });
      }
    } catch (err) {
      console.error('Failed to fetch health:', err);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    // Fire all fetches independently — each section renders as its data arrives
    fetchStats();
    fetchRealtime();
    fetchCameras();
    fetchHealth();
    setLoading(false);

    // Realtime refresh every 5s
    const realtimeInterval = setInterval(fetchRealtime, 5000);
    // Stats refresh every 60s (silent to avoid blocking UI)
    const statsInterval = setInterval(() => fetchStats(true), 60000);
    // Health refresh every 30s
    const healthInterval = setInterval(fetchHealth, 30000);
    // Retry failed streams every 2 minutes — clears failure state so recovered streams get another chance
    const retryInterval = setInterval(() => {
      failedFeeds.current.clear();
      setActiveFeeds([0, 1, 2, 3]);
    }, 2 * 60 * 1000);

    return () => {
      clearInterval(realtimeInterval);
      clearInterval(statsInterval);
      clearInterval(healthInterval);
      clearInterval(retryInterval);
    };
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      // Reset fullscreen state when component unmounts
      setIsFullscreen(false);
    };
  }, [setIsFullscreen]);

  // No full-page blocking spinner — sections render independently

  const totalDetections = stats?.totalDetections || 0;
  const byVehicleType = stats?.byVehicleType || {};
  const byTime = stats?.byTime || [];

  return (
    <div className="h-full w-full overflow-y-auto p-4 space-y-4 bg-background/50">
      {/* Header Container */}
      <div className="glass p-4 rounded-xl flex items-center justify-between mb-4 relative overflow-hidden border border-black/5 dark:border-white/5 shadow-lg">
        <div className="absolute top-0 left-1/4 w-[500px] h-full bg-amber-500/10 blur-[80px] pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:bg-clip-text dark:text-transparent dark:bg-gradient-to-r dark:from-amber-100 dark:to-white drop-shadow-sm">
            ITMS Dashboard
          </h1>
          <div className="h-4 w-px bg-black/20 dark:bg-white/20 mx-1"></div>
          <span className="text-xs font-semibold text-amber-800/70 dark:text-amber-200/70 tracking-wide uppercase mt-0.5 border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full">Last 7 Days</span>
        </div>
        <div className="relative z-10">
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors border border-transparent hover:border-black/10 dark:hover:border-white/10"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Row 1 & 2: KPI Cards + Peak/Quiet/Busiest (VCCInsights) */}
      <VCCInsights
        stats={stats}
        overallStats={stats}
        loading={statsLoading}
        cameras={cameras}
        isSingleCamera={false}
        healthStats={healthStats}
      />

      {/* Row 3: Health Summary - Individual Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        {/* Total Approaches */}
        <Card className="glass p-4 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.05] transition-all duration-300 border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 shadow-lg">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity bg-amber-500" />
          <div className="flex flex-col z-10">
            <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase mb-1">Total Approaches</span>
            <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground group-hover:text-amber-600 dark:text-white dark:group-hover:text-amber-50 transition-colors">
              {healthLoading ? <Loader2 className="w-5 h-5 animate-spin text-amber-400" /> : <CountUp end={healthStats.total} />}
            </div>
            <div className="text-[11px] font-semibold text-amber-400/80 mt-0.5">Connected Cameras</div>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
            <Camera className="w-6 h-6" />
          </div>
        </Card>

        {/* System Status */}
        <Card className="glass p-4 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.05] transition-all duration-300 border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 shadow-lg">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity bg-green-500" />
          <div className="flex flex-col z-10">
            <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase mb-1">System Status</span>
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-green-500">{healthLoading ? '...' : healthStats.online}</span>
                <span className="text-[10px] font-bold text-green-600/60 dark:text-green-500/60 uppercase">Up</span>
              </div>
              <div className="w-px h-6 bg-black/10 dark:bg-white/10" />
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-red-500">{healthLoading ? '...' : healthStats.offline}</span>
                <span className="text-[10px] font-bold text-red-600/60 dark:text-red-500/60 uppercase">Down</span>
              </div>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-500/10 text-green-500 group-hover:bg-green-500/20 transition-colors">
            <Activity className="w-6 h-6" />
          </div>
        </Card>

        {/* Avg Latency */}
        <Card className="glass p-4 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.05] transition-all duration-300 border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 shadow-lg">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity bg-amber-500" />
          <div className="flex flex-col z-10 text-left">
            <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase mb-1">Avg Latency</span>
            <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground group-hover:text-amber-600 dark:text-white dark:group-hover:text-amber-50 transition-colors">
              {healthLoading ? <Loader2 className="w-5 h-5 animate-spin text-amber-400" /> : <CountUp end={healthStats.avgLatency} />}
              <span className="text-sm font-medium text-muted-foreground ml-1">ms</span>
            </div>
            <div className="text-[11px] font-semibold text-amber-400/80 mt-0.5">Network Response</div>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
            <Clock className="w-6 h-6" />
          </div>
        </Card>

        {/* System Uptime */}
        <Card className="glass p-4 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.05] transition-all duration-300 border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 shadow-lg">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity bg-amber-500" />
          <div className="flex flex-col z-10 w-full pr-12">
            <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase mb-1">System Uptime</span>
            <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground group-hover:text-amber-600 dark:text-white dark:group-hover:text-amber-50 transition-colors">
              {healthLoading ? '0.0%' : `${healthStats.uptime.toFixed(1)}%`}
            </div>
            <div className="mt-1.5 w-full bg-black/5 dark:bg-white/5 h-1.5 rounded-full overflow-hidden border border-black/5 dark:border-white/5">
              <div
                className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                style={{ width: `${healthStats.uptime}%` }}
              />
            </div>
          </div>
          <div className="absolute right-4 w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors z-20">
            <Activity className="w-6 h-6" />
          </div>
        </Card>
      </div>

      {/* Row 4: Live Camera Feeds */}
      <Card className="glass p-4 relative overflow-hidden group/card border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 transition-all duration-300">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-64 bg-amber-500 blur-[150px] opacity-[0.03] pointer-events-none" />
        <h2 className="text-lg font-semibold tracking-tight mb-4 relative z-10 flex items-center gap-2">
          Live Camera Feeds
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        </h2>
        <div className="grid grid-cols-4 gap-4 relative z-10">
          {activeFeeds.map((feedIndex) => {
            const feed = ALL_LIVE_FEEDS[feedIndex];
            if (!feed) return null;
            return (
              <div key={feed.label} className="flex flex-col">
                <div className="aspect-video rounded-lg overflow-hidden border border-black/10 dark:border-white/10">
                  <WhepPlayer
                    url={feed.url}
                    className="w-full h-full"
                    onStatusChange={(status) => {
                      if (status === 'failed') {
                        handleStreamError(feedIndex);
                      }
                    }}
                  />
                </div>
                <div className="text-sm font-medium text-center mt-2 text-muted-foreground">{feed.label}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Row 4: Vehicle Type Distribution */}
      <Card className="glass p-4 relative overflow-hidden group/card border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 transition-all duration-300">
        <div className="absolute -top-20 right-20 w-64 h-64 bg-amber-500 blur-[100px] opacity-[0.05] pointer-events-none" />
        <h2 className="text-lg font-semibold tracking-tight mb-4 flex items-center gap-2 relative z-10">
          Vehicle Type Distribution
          {statsLoading && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
        </h2>
        {statsLoading ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm relative z-10">Loading vehicle data…</div>
        ) : !stats ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm relative z-10">No data available</div>
        ) : (() => {
          const displayTypes = ['2W', '4W', 'AUTO', 'BUS', 'HMV'];
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
              {displayTypes.map((type) => {
                const count = Number(byVehicleType?.[type]) || 0;
                const percentage = totalDetections > 0 ? ((count / totalDetections) * 100).toFixed(1) : '0';

                const glowColors: Record<string, string> = {
                  '2W': 'bg-amber-400',
                  '4W': 'bg-amber-500',
                  'AUTO': 'bg-amber-600',
                  'BUS': 'bg-amber-700',
                  'HMV': 'bg-amber-900',
                };

                return (
                  <Card key={type} className="glass p-4 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.05] transition-all duration-300 border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 shadow-lg">
                    {/* Subtle glow */}
                    <div className={cn("absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-10 group-hover:opacity-25 transition-opacity", glowColors[type])} />

                    <div className="flex flex-col z-10">
                      <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase mb-1">
                        {getVehicleTypeLabel(type)}
                      </span>
                      <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground group-hover:text-amber-600 dark:text-white dark:group-hover:text-amber-50 transition-colors">
                        <CountUp end={count} />
                      </div>
                      <div className="text-[11px] font-semibold text-amber-400/80 mt-0.5">
                        {percentage}%
                      </div>
                    </div>

                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 group-hover:border-black/20 dark:group-hover:border-white/20 transition-colors", getVehicleTypeColor(type).replace('bg-', 'text-'))}>
                      {getVehicleTypeIcon(type)}
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        })()}
      </Card>

      {/* Row 5: Detections Over Time */}
      <Card className="glass p-4 relative overflow-hidden group/card border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 transition-all duration-300">
        <div className="absolute top-10 left-10 w-64 h-64 bg-amber-500 blur-[100px] opacity-[0.05] pointer-events-none" />
        <h2 className="text-lg font-semibold tracking-tight mb-4 flex items-center gap-2 relative z-10">
          Detections Over Time
          {statsLoading && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
        </h2>
        {statsLoading ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">Loading chart data…</div>
        ) : byTime && byTime.length > 0 ? (
          <div className="h-80 w-full p-4 relative group/chart">
            {(() => {
              const counts = byTime.map(item => Number(item.count) || 0);
              const maxCount = Math.max(...counts, 1);
              const isSinglePoint = byTime.length === 1;

              const points = byTime.map((item, index) => {
                // If there's only one point, center it horizontally
                const x = isSinglePoint ? 50 : (index / (byTime.length - 1)) * 100;
                const y = 100 - ((Number(item.count) || 0) / maxCount) * 100;
                return { x, y, item, count: Number(item.count) || 0 };
              });

              // If it's a single point, draw a horizontal line across the chart
              const pathD = isSinglePoint
                ? `M 0,${points[0].y} L 100,${points[0].y}`
                : `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
              const areaD = `${pathD} L 100,100 L 0,100 Z`;

              return (
                <>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible z-0">
                    <defs>
                      <linearGradient id="dashboardTrendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={areaD} fill="url(#dashboardTrendGradient)" vectorEffect="non-scaling-stroke" />
                    {isSinglePoint && <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5,5" opacity={0.5} />}
                    <path d={pathD} fill="none" stroke={isSinglePoint ? "transparent" : "#f59e0b"} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="absolute inset-0 w-full h-full z-10 pointer-events-none">
                    {points.map((p, index) => {
                      const rawLabel = p.item.hour || p.item.day || p.item.week || p.item.month || '';
                      let label = rawLabel;
                      try {
                        const date = new Date(rawLabel);
                        if (!isNaN(date.getTime())) {
                          if (p.item.hour) label = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                          else label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }
                      } catch (_e) { /* ignore */ }
                      return (
                        <div
                          key={index}
                          className="absolute transform -translate-x-1/2 -translate-y-1/2 group pointer-events-auto hover:z-50"
                          style={{ left: `${p.x}%`, top: `${p.y}%` }}
                        >
                          <div className="w-3 h-3 bg-amber-500 rounded-full border-2 border-background shadow-sm transition-all group-hover:w-4 group-hover:h-4 group-hover:border-amber-300"></div>
                          <div className={cn("absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none",
                            index === 0 ? "left-0" : index === points.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"
                          )}>
                            <div className="bg-black/90 text-white text-xs p-2 rounded shadow-lg">
                              <div className="font-bold">{p.count.toLocaleString()} vehicles</div>
                              <div className="text-gray-400">{label}</div>
                            </div>
                            <div className={cn("w-2 h-2 bg-black/90 rotate-45 -mt-1",
                              index === 0 ? "ml-1.5" : index === points.length - 1 ? "mr-1.5 ml-auto" : "mx-auto"
                            )}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">No data available</div>
        )}
      </Card>
    </div>
  );
}
