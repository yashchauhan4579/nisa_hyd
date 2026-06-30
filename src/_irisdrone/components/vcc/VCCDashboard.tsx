import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient, type VCCStats, type VCCRealtime, type VCCDeviceStats } from '@irisdrone/lib/api';
import { BarChart3, Loader2, RefreshCw, ArrowLeft, Camera } from 'lucide-react';
import { FaMotorcycle, FaCar, FaBus, FaTruck } from 'react-icons/fa';

// Error boundary to catch and display runtime errors instead of blank screen
class VCCErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('VCC Dashboard crash:', error, info); }
  render() {
    if (this.state.error) return (
      <div className="p-8 text-red-400">
        <h2 className="text-xl font-bold mb-2">VCC Dashboard Error</h2>
        <pre className="text-sm whitespace-pre-wrap bg-red-950/30 p-4 rounded">{this.state.error.message}{'\n'}{this.state.error.stack}</pre>
        <button className="mt-4 px-4 py-2 bg-red-600 text-white rounded" onClick={() => this.setState({ error: null })}>Retry</button>
      </div>
    );
    return this.props.children;
  }
}

import { Button } from '@irisdrone/components/ui/button';
import { Card } from '@irisdrone/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@irisdrone/components/ui/tabs';
import { cn } from '@irisdrone/lib/utils';
import { DateTimeRangePicker, type DateTimeRange } from '@irisdrone/components/vcc/DateTimeRangePicker';
import { MultiCameraSelector, type CameraOption } from '@irisdrone/components/vcc/MultiCameraSelector';
import { VCCInsights } from '@irisdrone/components/vcc/VCCInsights';
import { VCCHeatmap } from '@irisdrone/components/vcc/VCCHeatmap';
import { VCCDevicesView } from '@irisdrone/components/vcc/VCCDevicesView';
import { VCCReportModal } from '@irisdrone/components/vcc/VCCReportModal';
import { utcHourToIST, toIST, getTodayStartIST } from '@irisdrone/lib/dateUtils';
import { KPIStats } from './KPIStats';
import { CountUp } from './CountUp';
import { useTheme } from '@irisdrone/contexts/ThemeContext';

export function VCCDashboard() {
  return <VCCErrorBoundary><VCCDashboardInner /></VCCErrorBoundary>;
}

function VCCDashboardInner() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [stats, setStats] = useState<VCCStats | null>(null);
  const [todayStats, setTodayStats] = useState<VCCStats | null>(null);
  const [heatmapStats, setHeatmapStats] = useState<VCCStats | null>(null);
  const [realtime, setRealtime] = useState<VCCRealtime | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [todayLoading, setTodayLoading] = useState(true);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [, setRealtimeLoading] = useState(false);

  // Camera filter state
  const [cameras, setCameras] = useState<CameraOption[]>([]);

  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from URL params on first render to avoid all-camera flash on hard reload
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>(() => {
    const cameraParam = searchParams.get('cameras');
    if (cameraParam) return cameraParam.split(',');
    const legacyCamera = searchParams.get('camera');
    if (legacyCamera) return [legacyCamera];
    return [];
  });

  // Sync state with URL params on navigation
  useEffect(() => {
    const cameraParam = searchParams.get('cameras');
    const next = cameraParam
      ? cameraParam.split(',')
      : searchParams.get('camera')
        ? [searchParams.get('camera')!]
        : [];
    setSelectedCameraIds(prev =>
      prev.join(',') === next.join(',') ? prev : next
    );
  }, [searchParams]);

  const updateSelectedCameraIds = (ids: string[]) => {
    // Avoid redundant updates
    if (JSON.stringify(ids) === JSON.stringify(selectedCameraIds)) return;

    // Clear legacy "camera" param if present, set "cameras"
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (ids.length > 0) {
        newParams.set('cameras', ids.join(','));
        newParams.delete('camera');
      } else {
        newParams.delete('cameras');
        newParams.delete('camera');
      }
      return newParams;
    }, { replace: true }); // Usage replace to avoid polluting history and causing jitter

    setSelectedCameraIds(ids);
  };

  const selectedLocation = searchParams.get('location');

  // Filter cameras by location (for selector)
  const filteredCameras = useMemo(() => {
    if (!selectedLocation) return cameras;
    return cameras.filter(c => c.metadata?.location === selectedLocation);
  }, [cameras, selectedLocation]);

  // Determine effective camera list for stats (if location selected but no specific cameras, it applies to location)
  // But our API supports location filter directly.
  // If specific cameras selected, they override location filter in logic?
  // Usually if I select "Location A" and then "Cam 1 (in Loc A)", I just want Cam 1.
  // MultiCameraSelector handles filtering options.

  // Initialize with last 24 hours (reset on every mount, no persistence)
  const [dateRange, setDateRange] = useState<DateTimeRange>(() => {
    const end = new Date();
    const start = new Date();
    start.setTime(end.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
    return { startDate: start, endDate: end };
  });

  const [groupBy, setGroupBy] = useState<'minute' | 'hour' | 'day'>('day');
  const selectedCameraKey = selectedCameraIds.join(',');

  // Single-camera 24h line chart (30-min IST buckets)
  const [singleCamera24h, setSingleCamera24h] = useState<{ label: string; count: number }[]>([]);
  const [singleCamera24hLoading, setSingleCamera24hLoading] = useState(false);

  const fetchSingleCamera24h = async (cameraId: string) => {
    setSingleCamera24hLoading(true);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const data = await apiClient.getVCCByDevice(cameraId, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        groupBy: 'minute',
      });
      // Aggregate minute-level UTC data into 48 × 30-min IST buckets
      const buckets = new Array(48).fill(0);
      (data.byTime || []).forEach((item: any) => {
        const ts = (item.minute || item.hour || item.time_period || '').toString().trim().replace(' ', 'T');
        const safeTs = ts.endsWith('Z') ? ts : ts + 'Z';
        const d = new Date(safeTs);
        if (isNaN(d.getTime())) return;
        const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
        const istDate = new Date(istMs);
        const slot = istDate.getUTCHours() * 2 + Math.floor(istDate.getUTCMinutes() / 30);
        if (slot >= 0 && slot < 48) buckets[slot] += Number(item.count) || 0;
      });
      setSingleCamera24h(Array.from({ length: 48 }, (_, i) => ({
        label: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`,
        count: buckets[i],
      })));
    } catch (err) {
      console.error('Failed to fetch single-camera 24h stats:', err);
    } finally {
      setSingleCamera24hLoading(false);
    }
  };

  // Modals state
  const [showDevicesModal, setShowDevicesModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Fetch available cameras (data-driven from actual detections)
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        // Derive camera list from existing stats endpoint (byDevice)
        const data = await apiClient.getVCCStats({ groupBy: 'day' });
        if (data.byDevice) {
          setCameras(data.byDevice.map((d: any) => ({
            id: d.deviceId,
            name: (d.deviceName || d.deviceId || '').replace(/^Camera\s+/i, ''),
            metadata: {}
          })));
        }
      } catch (err) {
        console.error('Failed to fetch VCC cameras:', err);
      }
    };
    fetchCameras();
    const cameraRefresh = setInterval(fetchCameras, 60000);
    return () => clearInterval(cameraRefresh);
  }, []);

  // Aggregation Logic
  const aggregateStats = (deviceStatsList: VCCDeviceStats[]): VCCStats => {
    if (deviceStatsList.length === 0) return {
      totalDetections: 0, uniqueVehicles: 0, byVehicleType: {}, byTime: [], byDevice: [], byHour: {}, byDayOfWeek: {},
      peakHour: 0, peakDay: 'N/A', averagePerHour: 0, classification: { withPlates: 0, withoutPlates: 0, withMakeModel: 0, plateOnly: 0, fullClassification: 0 }
    };

    const result: VCCStats = {
      totalDetections: 0,
      uniqueVehicles: 0,
      byVehicleType: {},
      byTime: [],
      byDevice: [],
      byHour: {},
      byDayOfWeek: {},
      peakHour: 0,
      peakDay: 'N/A',
      averagePerHour: 0,
      classification: { withPlates: 0, withoutPlates: 0, withMakeModel: 0, plateOnly: 0, fullClassification: 0 }
    };

    // Aggregate totals
    deviceStatsList.forEach(ds => {
      result.totalDetections += ds.totalDetections;
      result.uniqueVehicles += ds.uniqueVehicles;
      result.averagePerHour += ds.averagePerHour; // Sum of averages? No, avg of sum?
      // Average per hour = Total / Hours.
      // Sum up totals, divide by hours coverage. 
      // For now, simple sum of 'avgPerHour' is strictly wrong but summing throughput is okay.

      Object.entries(ds.byVehicleType).forEach(([type, count]) => {
        result.byVehicleType[type] = (result.byVehicleType[type] || 0) + count;
      });

      // Initialize 0-23 hours to ensure "Quiet Hours" works correctly (detects 0s)
      for (let i = 0; i < 24; i++) {
        result.byHour[i.toString()] = 0;
      }

      // Re-aggregate byHour and byDayOfWeek from granular byTime data and convert UTC to IST
      (ds.byTime || []).forEach((entry: any) => {
        // Handle various backend response formats (postgres to_char vs native)
        let ts = entry.hour || entry.time_period || entry.date || entry.day;
        if (!ts) return;

        // Handle Postgres TO_CHAR "YYYY-MM-DD HH" format explicitly
        if (/^\d{4}-\d{2}-\d{2}\s\d{1,2}$/.test(ts.toString())) {
          const parts = ts.toString().split(' ');
          ts = `${parts[0]}T${parts[1].padStart(2, '0')}:00:00`;
        }

        // Backend returns UTC time (PostgreSQL timezone is UTC). Parse as UTC.
        // "2026-02-06 00:00" -> "2026-02-06T00:00Z"
        let safeTs = ts.toString().trim().replace(' ', 'T');
        if (!safeTs.endsWith('Z')) safeTs += 'Z'; // Ensure UTC parsing

        const date = new Date(safeTs);
        if (isNaN(date.getTime())) return;

        // 1. byHour (0-23 IST) - Convert UTC to IST for correct hourly distribution
        // If entry has 'hour' or 'time_period' (usually hourly), we map it.
        // If entry is just 'day', we shouldn't map it to a specific hour.
        if (entry.hour || entry.time_period) {
          const utcHour = date.getUTCHours();
          const istHour = utcHourToIST(utcHour).toString();
          result.byHour[istHour] = (result.byHour[istHour] || 0) + (Number(entry.count) || 0);
        }

        // 2. byDayOfWeek (in IST) — for all groupBy, derive from timestamp
        const istDate = toIST(date);
        const dayName = istDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
        result.byDayOfWeek[dayName] = (result.byDayOfWeek[dayName] || 0) + (Number(entry.count) || 0);
      });

      // Merge byDayOfWeek from device stats directly (covers cases where byTime is empty)
      if (Object.keys(result.byDayOfWeek).length === 0 && ds.byDayOfWeek) {
        Object.entries(ds.byDayOfWeek).forEach(([day, count]) => {
          result.byDayOfWeek[day] = (result.byDayOfWeek[day] || 0) + Number(count);
        });
      }

      // Classification
      result.classification.withPlates += ds.classification.withPlates;
      result.classification.withoutPlates += ds.classification.withoutPlates;
      result.classification.withMakeModel += ds.classification.withMakeModel;
      result.classification.plateOnly += ds.classification.plateOnly;
      result.classification.fullClassification += ds.classification.fullClassification;

      // Add to byDevice list
      result.byDevice.push({
        deviceId: ds.deviceId,
        deviceName: ds.deviceName,
        count: ds.totalDetections,
        totalDetections: ds.totalDetections,
        byType: ds.byVehicleType
      });
    });

    // Avg per hour correction (approx)
    // If concurrent devices, system throughput IS the sum. So sum is correct.

    // Merge Timelines
    // Map time -> entry
    const timeMap: Record<string, any> = {};
    deviceStatsList.forEach(ds => {
      (ds.byTime || []).forEach(entry => {
        const key = entry.hour || entry.day || entry.week || entry.month || 'unknown';
        if (!timeMap[key]) {
          timeMap[key] = { ...entry, count: 0, "2W": 0, "4W": 0, "AUTO": 0, "BUS": 0, "TRUCK": 0 };
        }
        timeMap[key].count += entry.count;
        timeMap[key]["2W"] = (timeMap[key]["2W"] || 0) + (entry["2W"] || 0);
        timeMap[key]["4W"] = (timeMap[key]["4W"] || 0) + (entry["4W"] || 0);
        timeMap[key]["AUTO"] = (timeMap[key]["AUTO"] || 0) + (entry["AUTO"] || 0);
        timeMap[key]["BUS"] = (timeMap[key]["BUS"] || 0) + (entry["BUS"] || 0);
        timeMap[key]["TRUCK"] = (timeMap[key]["TRUCK"] || 0) + (entry["TRUCK"] || 0);
      });
    });
    result.byTime = Object.values(timeMap).sort((a, b) => {
      const ka = a.hour || a.day || a.week || a.month || '';
      const kb = b.hour || b.day || b.week || b.month || '';
      return ka.localeCompare(kb);
    });

    // Recalc Peak Hour
    let maxH = 0;
    let peakH = 0;
    Object.entries(result.byHour).forEach(([h, c]) => {
      if (c > maxH) { maxH = c; peakH = Number(h); }
    });
    result.peakHour = peakH;

    // Recalc Peak Day from byDayOfWeek
    let maxD = 0;
    let peakD = '';
    Object.entries(result.byDayOfWeek).forEach(([d, c]) => {
      if (c > maxD) { maxD = c; peakD = d; }
    });
    if (peakD) result.peakDay = peakD;

    return result;
  };

  // Normalize byDevice items: backend returns {count} but ATCC components expect {totalDetections}
  const normalizeStats = (data: VCCStats): VCCStats => {
    if (data.byDevice) {
      data.byDevice = data.byDevice.map((d: any) => ({
        ...d,
        totalDetections: d.totalDetections ?? d.count ?? 0,
        count: d.count ?? d.totalDetections ?? 0,
      }));
    }
    return data;
  };

  const fetchStats = async (silent = false) => {
    try {
      if (!silent) setStatsLoading(true);

      // If the selected end date is today in IST, use the current time for live updates
      const nowIST = toIST(new Date());
      const todayISTDateStr = nowIST.toISOString().split('T')[0];
      const endIST = toIST(dateRange.endDate);
      const endDateStr = endIST.toISOString().split('T')[0];
      const isToday = endDateStr === todayISTDateStr;
      const effectiveEndTime = isToday ? new Date().toISOString() : dateRange.endDate.toISOString();

      if (selectedCameraIds.length > 0) {
        // Fetch per-camera stats and aggregate
        const requests = selectedCameraIds.map(id => apiClient.getVCCByDevice(id, {
          startTime: dateRange.startDate.toISOString(),
          endTime: effectiveEndTime,
          groupBy: groupBy,
        }));
        const results = await Promise.all(requests);
        const aggregated = aggregateStats(results);
        setStats(normalizeStats(aggregated));
      } else {
        // Fetch all cameras stats (Global)
        const data = await apiClient.getVCCStats({
          startTime: dateRange.startDate.toISOString(),
          endTime: effectiveEndTime,
          groupBy: groupBy,
          location: selectedLocation || undefined,
        });
        setStats(normalizeStats(data));
      }
    } catch (err) {
      console.error('Failed to fetch VCC stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchHeatmapStats = async (silent = false) => {
    try {
      if (!silent) setHeatmapLoading(true);
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

      if (selectedCameraIds.length > 0) {
        const requests = selectedCameraIds.map(id => apiClient.getVCCByDevice(id, {
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          groupBy: 'hour',
        }));
        const results = await Promise.all(requests);
        const aggregated = aggregateStats(results);
        setHeatmapStats(normalizeStats(aggregated));
      } else {
        const data = await apiClient.getVCCStats({
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          groupBy: 'hour',
        });
        setHeatmapStats(normalizeStats(data));
      }
    } catch (err) {
      console.error("Failed to fetch heatmap stats:", err);
    } finally {
      setHeatmapLoading(false);
    }
  };

  const fetchTodayStats = async (silent = false) => {
    try {
      if (!silent) setTodayLoading(true);
      // Get today at 00:00 IST (converted to UTC for API call)
      const start = getTodayStartIST();
      const end = new Date();

      const params = {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        groupBy: 'hour' as const,
      };

      if (selectedCameraIds.length > 0) {
        const requests = selectedCameraIds.map(id => apiClient.getVCCByDevice(id, params));
        const results = await Promise.all(requests);
        const aggregated = aggregateStats(results);
        setTodayStats(normalizeStats(aggregated));
      } else {
        const data = await apiClient.getVCCStats({
          ...params,
          location: selectedLocation || undefined,
        });
        setTodayStats(normalizeStats(data));
      }
    } catch (err) {
      console.error("Failed to fetch today's stats:", err);
    } finally {
      setTodayLoading(false);
    }
  };

  const fetchRealtime = async () => {
    try {
      setRealtimeLoading(true);
      const data = await apiClient.getVCCRealtime();
      // Filter realtime if cameras selected
      if (selectedCameraIds.length > 0 && data.byDevice) {
        const filteredDevices = data.byDevice.filter(d => selectedCameraIds.includes(d.deviceId));
        const total = filteredDevices.reduce((sum, d) => sum + d.count, 0);
        // Recalc byVehicleType impossible without raw events? 
        // Realtime stats only gives totals. 
        // Just update total and byDevice list.
        setRealtime({
          ...data,
          totalDetections: total,
          byDevice: filteredDevices,
          // perMinute estimate? linear scale?
          perMinute: (data.perMinute / data.totalDetections) * total || 0 // Very rough approx
        });
      } else {
        setRealtime(data);
      }
    } catch (err) {
      console.error('Failed to fetch realtime data:', err);
    } finally {
      setRealtimeLoading(false);
    }
  };

  // Dedicated 7-day fetch for the "Detections Over Time" chart
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  const fetchChartData = async (silent = false) => {
    try {
      if (!silent) setChartLoading(true);
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

      if (selectedCameraIds.length > 0) {
        const requests = selectedCameraIds.map(id => apiClient.getVCCByDevice(id, {
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          groupBy: 'day',
        }));
        const results = await Promise.all(requests);
        const aggregated = aggregateStats(results);
        setChartData(aggregated.byTime || []);
      } else {
        const data = await apiClient.getVCCStats({
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          groupBy: 'day',
          location: selectedLocation || undefined,
        });
        setChartData(data.byTime || []);
      }
    } catch (err) {
      console.error('Failed to fetch chart data:', err);
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchTodayStats();
    fetchHeatmapStats();
    fetchRealtime();
    fetchChartData();

    const interval = setInterval(() => {
      fetchRealtime();
      fetchTodayStats(true);
    }, 30000); // 30s

    const slowInterval = setInterval(() => {
      fetchStats(true);
      fetchChartData(true);
    }, 120000); // 2 min

    return () => {
      clearInterval(interval);
      clearInterval(slowInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.startDate.getTime(), dateRange.endDate.getTime(), groupBy, selectedCameraKey, selectedLocation]);

  // Fetch 24h 30-min chart when exactly one camera is selected; refresh every 5 min (moving window)
  useEffect(() => {
    if (selectedCameraIds.length !== 1) return;
    const id = selectedCameraIds[0];
    fetchSingleCamera24h(id);
    const interval = setInterval(() => fetchSingleCamera24h(id), 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCameraKey]);

  // Auto-adjust groupBy
  useEffect(() => {
    const diffMs = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes <= 30) {
      setGroupBy('minute');
    } else if (diffHours <= 24) {
      setGroupBy('hour');
    } else {
      setGroupBy('day');
    }
  }, [dateRange]);

  const getVehicleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      '2W': '2 Wheeler',
      '4W': '4 Wheeler',
      'AUTO': 'Auto',
      'BUS': 'Bus',
      'TRUCK': 'Truck',
      'UNKNOWN': 'Unknown',
    };
    return labels[type] || type;
  };

  const getVehicleTypeIcon = (type: string) => {
    const icons: Record<string, React.ReactNode> = {
      '2W': <FaMotorcycle className="w-6 h-6" />,
      '4W': <FaCar className="w-6 h-6" />,
      'AUTO': (
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-6 h-6">
          {/* Main auto rickshaw body without the lightning bolt (omitted "M7 20h4v-2l6 3h-4v2z") */}
          <path d="M21 11.18V9.72c0-.47-.16-.92-.46-1.28L16.6 3.72c-.38-.46-.94-.72-1.54-.72H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h.18C3.6 16.16 4.7 17 6 17s2.4-.84 2.82-2h8.37a2.996 2.996 0 0 0 5.82-1c-.01-1.3-.85-2.4-2.01-2.82zM6 15c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm1-3.83A3.014 3.014 0 0 0 3.17 13H3v-3h4v1.17zM7 8H3V5h4v3zm7 5H9v-3h3V8H9V5h5v8zm2-6.88L18.4 9H16V6.12zM17.17 13H16v-2h3v.17c-.85.3-1.53.98-1.83 1.83zM20 15c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
        </svg>
      ),
      'BUS': <FaBus className="w-6 h-6" />,
      'TRUCK': <FaTruck className="w-6 h-6" />,
    };
    return icons[type] || null;
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3 bg-background/50">
      {/* Header Container */}
      <div className={cn(
        "px-4 py-3 rounded-xl mb-4 relative overflow-hidden border shadow-lg",
        isLight ? "bg-white border-gray-200" : "bg-zinc-900/30 border-white/5"
      )}>

        {/* Row 1: Title + action buttons */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2">
            {selectedCameraIds.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7 transition-colors", isLight ? "text-gray-700 hover:bg-gray-100" : "hover:bg-black/10 dark:hover:bg-white/10")}
                onClick={() => updateSelectedCameraIds([])}
                title="Clear Selection"
              >
                <ArrowLeft className={cn("w-4 h-4", isLight ? "text-gray-700" : "text-gray-300")} />
              </Button>
            )}
            <div>
              <h1 className={cn(
                "text-xl font-bold tracking-tight leading-none",
                isLight ? "text-gray-900" : "dark:bg-clip-text dark:text-transparent dark:bg-gradient-to-r dark:from-amber-100 dark:to-white"
              )}>
                Vehicle Classification & Counting
              </h1>
              {selectedCameraIds.length === 1 && (() => {
                const cam = cameras.find(c => c.id === selectedCameraIds[0]);
                return cam ? (
                  <p className={cn("text-sm font-medium mt-0.5 truncate max-w-[500px]", isLight ? "text-gray-500" : "text-amber-200/80")}>
                    {cam.name.replace(/^Camera\s+/i, "")}
                  </p>
                ) : null;
              })()}
              {selectedCameraIds.length > 1 && (
                <p className={cn("text-sm font-medium mt-0.5", isLight ? "text-gray-500" : "text-amber-200/80")}>
                  {selectedCameraIds.length} cameras selected
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedCameraIds.length !== 1 && (
              <MultiCameraSelector
                cameras={filteredCameras}
                selectedCameraIds={selectedCameraIds}
                className="w-[180px]"
                onSelectionChange={updateSelectedCameraIds}
                loading={false}
              />
            )}
            <DateTimeRangePicker
              value={dateRange}
              onChange={setDateRange}
            />
            <div className={cn("p-0.5 rounded-lg border flex items-center", isLight ? "bg-gray-50 border-gray-200" : "bg-black/5 dark:bg-black/20 border-black/10 dark:border-white/5")}>
              <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as 'minute' | 'hour' | 'day')}>
                <TabsList className="h-6 bg-transparent">
                  <TabsTrigger value="minute" className="text-xs px-2 !text-slate-600 hover:!text-slate-900 data-[state=active]:bg-white data-[state=active]:!text-slate-900 dark:data-[state=active]:bg-white/10 dark:data-[state=active]:!text-white data-[state=active]:shadow-sm dark:!text-gray-300 dark:hover:!text-white">Min</TabsTrigger>
                  <TabsTrigger value="hour" className="text-xs px-2 !text-slate-600 hover:!text-slate-900 data-[state=active]:bg-white data-[state=active]:!text-slate-900 dark:data-[state=active]:bg-white/10 dark:data-[state=active]:!text-white data-[state=active]:shadow-sm dark:!text-gray-300 dark:hover:!text-white">Hour</TabsTrigger>
                  <TabsTrigger value="day" className="text-xs px-2 !text-slate-600 hover:!text-slate-900 data-[state=active]:bg-white data-[state=active]:!text-slate-900 dark:data-[state=active]:bg-white/10 dark:data-[state=active]:!text-white data-[state=active]:shadow-sm dark:!text-gray-300 dark:hover:!text-white">Day</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className={cn("w-px h-5", isLight ? "bg-gray-200" : "bg-white/10")} />
            {stats && (
              <Button
                variant="outline"
                size="sm"
                className={cn("h-7 px-3 gap-1.5 transition-colors", isLight ? "bg-white border-gray-200 text-gray-700 hover:bg-gray-50" : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10")}
                onClick={() => setShowReportModal(true)}
              >
                <BarChart3 className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span className={cn("text-xs font-medium", isLight ? "text-gray-700" : "text-gray-200")}>Report</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats()}
              className={cn("h-7 w-7 p-0 transition-colors", isLight ? "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-amber-600" : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 hover:text-amber-600 dark:hover:text-amber-400")}
              title="Refresh Data"
            >
              <RefreshCw className={cn("w-3 h-3", isLight ? "text-gray-700" : "text-gray-300")} />
            </Button>
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <VCCInsights
        stats={todayStats || stats}
        overallStats={stats}
        loading={todayLoading}
        cameras={cameras}
        isSingleCamera={selectedCameraIds.length > 0}
        variant="vcc"
      />

      {/* New KPI Stats Row */}
      <div className="mb-4">
        <KPIStats stats={stats} realtime={realtime} loading={statsLoading} totalCameras={cameras.length} isSingleCamera={selectedCameraIds.length === 1} />
      </div>

      {/* Main Stats Cards (Vehicle Type Distribution & Charts) */}
      {(() => {
        // Use todayStats if the selected range is strictly "Today" in IST
        const nowIST = toIST(new Date());
        const todayISTDateStr = nowIST.toISOString().split('T')[0]; // YYYY-MM-DD in IST

        // Convert dateRange dates to IST and check if they match today
        const startIST = toIST(dateRange.startDate);
        const endIST = toIST(dateRange.endDate);
        const startDateStr = startIST.toISOString().split('T')[0];
        const endDateStr = endIST.toISOString().split('T')[0];

        const isStrictlyToday = startDateStr === todayISTDateStr && endDateStr === todayISTDateStr;

        const effectiveStats = (isStrictlyToday && todayStats && todayStats.byTime && todayStats.byTime.length > 0) ? todayStats : stats;

        // Keep vehicle-type cards tied to the live "today" dataset when the selected range is today,
        // so the interval refresh visibly updates the counts in place.
        const distributionStats = effectiveStats ?? stats;
        const distributionLoading = isStrictlyToday ? todayLoading : statsLoading;
        const totalDetections = distributionStats?.totalDetections ?? 0;
        const byVehicleType = distributionStats?.byVehicleType ?? {};
        const byTime = chartData.length > 0 ? chartData : (effectiveStats?.byTime ?? []);
        const byDevice = stats?.byDevice ?? effectiveStats?.byDevice ?? [];

        return (
          <>
            {/* Vehicle Type Distribution */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold tracking-tight">Vehicle Type Distribution</h3>
              <div className="grid grid-cols-5 gap-3">
                {(() => {
                  const displayTypes = ['2W', '4W', 'AUTO', 'BUS', 'TRUCK'];
                  const iconBgColors: Record<string, string> = {
                    '2W': 'bg-amber-400/15 text-amber-400 dark:bg-amber-400/20',
                    '4W': 'bg-amber-500/15 text-amber-500 dark:bg-amber-500/20',
                    'AUTO': 'bg-amber-500/15 text-amber-400 dark:bg-amber-500/20',
                    'BUS': 'bg-amber-600/15 text-amber-300 dark:bg-amber-700/20',
                    'TRUCK': 'bg-amber-800/15 text-amber-200 dark:bg-amber-900/30',
                  };
                  return displayTypes.map((type) => {
                    const count = Number(byVehicleType?.[type]) || 0;
                    const pct = totalDetections > 0 ? (count / totalDetections) * 100 : 0;
                    const pctStr = pct.toFixed(1);
                    return (
                      <Card key={type} className="bg-zinc-900/30 border border-white/5 rounded-lg p-3 flex flex-row items-center justify-between relative overflow-hidden group hover:bg-zinc-900/50 transition-all duration-200">
                        {/* Subtle glow */}
                        {/* Left: label + count + pct */}
                        <div className="flex flex-col gap-0.5 z-10">
                          <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                            {getVehicleTypeLabel(type)}
                          </span>
                          {distributionLoading ? (
                            <div className="h-6 w-20 bg-white/10 rounded animate-pulse mt-1" />
                          ) : (
                            <div className="text-xl font-bold tabular-nums tracking-tight">
                              <CountUp end={count} />
                            </div>
                          )}
                          {distributionLoading ? (
                            <span className="inline-block h-3 w-10 bg-white/10 rounded animate-pulse mt-1" />
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">{pctStr}%</span>
                          )}
                        </div>
                        {/* Right: icon */}
                        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center relative z-10 shrink-0", iconBgColors[type] || 'bg-gray-500/15 text-gray-400')}>
                          <div className="[&>svg]:w-5 [&>svg]:h-5">{getVehicleTypeIcon(type)}</div>
                        </div>
                      </Card>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Charts and Devices */}
            <div className={selectedCameraIds.length > 0 ? "space-y-4" : "grid grid-cols-3 gap-4"}>
              {/* Left Column - Charts */}
              <div className={selectedCameraIds.length > 0 ? "space-y-4" : "col-span-2 space-y-4"}>
                {/* Today's Activity */}
                <Card className="bg-zinc-900/30 border border-white/5 rounded-lg p-4 relative overflow-hidden hover:bg-zinc-900/50 transition-all duration-300">
                  <h2 className="text-lg font-semibold tracking-tight mb-4 relative z-10">Today's Activity (IST)</h2>
                  {(() => {
                    const byTime = todayStats?.byTime || [];
                    const hourlyData: Record<string, number> = {};
                    byTime.forEach((item: any) => {
                      const dateStr = (item.hour || item.time_period);
                      // Backend returns UTC time - parse and convert to IST
                      const safeTs = dateStr.toString().trim().replace(' ', 'T') + 'Z'; // Add Z for UTC
                      const d = new Date(safeTs);
                      if (!isNaN(d.getTime())) {
                        const utcHour = d.getUTCHours();
                        const istHour = utcHourToIST(utcHour).toString();
                        hourlyData[istHour] = (hourlyData[istHour] || 0) + (Number(item.count) || 0);
                      }
                    });
                    // Get current IST hour
                    const now = new Date();
                    const currentISTHour = utcHourToIST(now.getUTCHours());
                    const skeletonHeights = [30, 45, 35, 55, 40, 60, 50, 70, 65, 80, 75, 85, 70, 65, 60, 55, 75, 80, 70, 60, 50, 40, 35, 25];
                    return todayLoading ? (
                      <div className="h-80 flex gap-1">
                        {Array.from({ length: 24 }, (_, i) => (
                          <div key={i} className="flex-1 h-full flex flex-col justify-end items-center min-w-[20px]">
                            <div className="w-full bg-white/10 rounded-t animate-pulse" style={{ height: `${skeletonHeights[i]}%` }} />
                            <div className="text-xs text-transparent mt-1">0</div>
                          </div>
                        ))}
                      </div>
                    ) : byTime.length > 0 ? (
                      <div className="h-80 flex gap-1">
                        {Array.from({ length: 24 }, (_, istHour) => {
                          const isFuture = istHour > currentISTHour;
                          const count = isFuture ? 0 : (Number(hourlyData[istHour.toString()]) || 0);
                          const maxCount = Math.max(...Object.values(hourlyData).map(v => Number(v) || 0), 1);
                          const height = (count / maxCount) * 100;
                          const visibleHeight = Math.max(height, 5);
                          return (
                            <div key={istHour} className={cn("flex-1 h-full flex flex-col justify-end items-center min-w-[20px] relative group pointer-events-auto", isFuture && "opacity-30")}>
                              <div
                                className={cn(
                                  "w-full rounded-t transition-all relative",
                                  isFuture ? "bg-gray-700/20" : "bg-amber-500 hover:bg-amber-400 cursor-pointer"
                                )}
                                style={{ height: isFuture ? '5%' : `${visibleHeight}%` }}
                              >
                                {/* Tooltip */}
                                {!isFuture && (
                                  <div className={cn("absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none",
                                    istHour < 2 ? "left-0" : istHour > 21 ? "right-0" : "left-1/2 -translate-x-1/2"
                                  )}>
                                    <div className="bg-black/90 text-white text-xs p-2 rounded shadow-lg">
                                      <div className="font-bold">{count.toLocaleString()} vehicles</div>
                                      <div className="text-gray-400">{istHour.toString().padStart(2, '0')}:00 - {((istHour + 1) % 24).toString().padStart(2, '0')}:00 IST</div>
                                    </div>
                                    <div className={cn("w-2 h-2 bg-black/90 rotate-45 -mt-1",
                                      istHour < 2 ? "ml-1.5" : istHour > 21 ? "mr-1.5 ml-auto" : "mx-auto"
                                    )}></div>
                                  </div>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {istHour % 4 === 0 ? istHour : ''}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-80 flex items-center justify-center text-gray-500 dark:text-gray-400">
                        No activity recorded today
                      </div>
                    );
                  })()}
                </Card>

                {/* Time Series Chart */}
                <Card className="bg-zinc-900/30 border border-white/5 rounded-lg p-4 relative overflow-hidden hover:bg-zinc-900/50 transition-all duration-300">
                  <h2 className="text-lg font-semibold tracking-tight mb-4 flex items-center gap-2 relative z-10">
                    Detections Over Time
                    {(chartLoading || singleCamera24hLoading) && <Loader2 className="w-4 h-4 animate-spin text-amber-400" />}
                    {selectedCameraIds.length === 1 && !singleCamera24hLoading && (
                      <span className="text-xs text-muted-foreground font-normal ml-1">Last 24h · 30-min intervals (IST)</span>
                    )}
                  </h2>
                  {chartLoading || (selectedCameraIds.length === 1 && singleCamera24hLoading) ? (
                    <div className="h-80 flex items-end gap-2 px-4 pb-4">
                      {[65, 40, 55, 70, 45, 80, 60, 75, 50, 85, 65, 40, 70, 55].map((h, i) => (
                        <div key={i} className="flex-1 bg-white/10 rounded-t animate-pulse" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  ) : selectedCameraIds.length === 1 ? (
                    singleCamera24h.length > 0 ? (() => {
                      const counts = singleCamera24h.map(d => d.count);
                      const maxCount = Math.max(...counts, 1);
                      const points = singleCamera24h.map((d, i) => ({
                        x: (i / (singleCamera24h.length - 1)) * 100,
                        y: 3 + (1 - d.count / maxCount) * 79,
                        ...d,
                      }));
                      const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
                      const areaD = `${pathD} L 100,82 L 0,82 Z`;
                      const showTick = (i: number) => i % 4 === 0;
                      return (
                        <div className="h-[420px] w-full relative flex flex-col">
                          {/* Chart area */}
                          <div className="relative flex-1">
                            <svg viewBox="0 0 100 82" preserveAspectRatio="none" className="absolute inset-0 w-full h-full z-0">
                              <defs>
                                <linearGradient id="sc24hGradientTvcc" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                                </linearGradient>
                              </defs>
                              <path d={areaD} fill="url(#sc24hGradientTvcc)" vectorEffect="non-scaling-stroke" />
                              <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {/* Dots */}
                            <div className="absolute inset-0 pointer-events-none z-10">
                              {points.map((p, i) => (
                                <div
                                  key={i}
                                  className="absolute transform -translate-x-1/2 -translate-y-1/2 group pointer-events-auto hover:z-50"
                                  style={{ left: `${p.x}%`, top: `${(p.y / 82) * 100}%` }}
                                >
                                  <div className="w-2 h-2 bg-amber-500 rounded-full border-2 border-background shadow-sm transition-all group-hover:w-3 group-hover:h-3 group-hover:bg-amber-400" />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                                    <div className="bg-black/90 text-white text-xs p-2 rounded shadow-lg">
                                      <div className="font-bold">{p.count.toLocaleString()} vehicles</div>
                                      <div className="text-gray-400">{p.label} IST</div>
                                    </div>
                                    <div className="w-2 h-2 bg-black/90 rotate-45 mx-auto -mt-1" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* X-axis */}
                          <div className="relative border-t border-border/40 pt-2 pb-1 h-7">
                            {points.map((p, i) => showTick(i) && (
                              <div key={i} className="absolute flex flex-col items-center -translate-x-1/2" style={{ left: `${p.x}%` }}>
                                <div className="w-px h-1.5 bg-border/60 mb-0.5" />
                                <span className="text-[10px] text-muted-foreground leading-none">{p.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">No data for last 24 hours</div>
                    )
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
                                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                                </linearGradient>
                              </defs>
                              <path d={areaD} fill="url(#trendGradient)" vectorEffect="non-scaling-stroke" />
                              {isSinglePoint && <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5,5" opacity={0.5} />}
                              <path d={pathD} fill="none" stroke={isSinglePoint ? "transparent" : "#f59e0b"} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="absolute inset-0 w-full h-full z-10 pointer-events-none">
                              {points.map((p, index) => {
                                const rawLabel = p.item.hour || p.item.day || p.item.week || p.item.month || '';
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
                                        <div className="text-gray-400">{rawLabel}</div>
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
                    <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">No data for selected range</div>
                  )}
                </Card>
              </div>

              {/* Right Column - Top Devices Table (1/3) */}
              {selectedCameraIds.length === 0 && (
                <div className="col-span-1 border-l border-white/5 pl-4">
                  <Card className="bg-zinc-900/30 border border-white/5 rounded-lg p-4 h-full relative overflow-hidden hover:bg-zinc-900/50 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4 relative z-10">
                      <h2 className="text-lg font-semibold tracking-tight">Top Devices</h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setShowDevicesModal(true)}
                      >
                        View All
                      </Button>
                    </div>
                    <div className="overflow-y-auto max-h-[735px] pr-2 flex flex-col gap-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
                      <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-white/10 text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
                        <span>Device</span>
                        <span>Count</span>
                      </div>
                      {statsLoading ? Array.from({ length: 8 }, (_, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 animate-pulse">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 bg-white/10 rounded-lg shrink-0" />
                            <div className="flex flex-col gap-2 mt-0.5">
                              <div className="h-3 w-36 bg-white/10 rounded" />
                              <div className="h-2 w-24 bg-white/10 rounded" />
                            </div>
                          </div>
                          <div className="h-4 w-14 bg-white/10 rounded" />
                        </div>
                      )) : byDevice.slice(0, 15).map((device) => {
                        const cam = cameras.find(c => c.id === device.deviceId);
                        const location = cam?.metadata?.location;
                        const name = (device.deviceName || device.deviceId).replace(/^Camera\s+/i, "");
                        const totalDetections = device.totalDetections ?? device.count ?? 0;
                        return (
                          <div
                            key={device.deviceId}
                            className="flex items-center justify-between p-3 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/[0.04] hover:shadow-lg transition-all duration-300 group cursor-pointer"
                            onClick={() => updateSelectedCameraIds([device.deviceId])}
                          >
                            <div className="flex items-center gap-3 relative z-10 min-w-0 pr-4">
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 group-hover:text-amber-300 transition-colors">
                                <Camera className="w-[18px] h-[18px]" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[13px] font-bold tracking-wide text-foreground group-hover:text-amber-800 dark:group-hover:text-amber-50 transition-colors truncate">
                                  {name}
                                </span>
                                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors truncate mt-0.5">
                                  {location}
                                </span>
                              </div>
                            </div>
                            <div className="text-[15px] font-black tabular-nums tracking-tight text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-100 transition-colors shrink-0 relative z-10">
                              {totalDetections.toLocaleString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              )}

              {/* Heatmap Section */}
              <div className="col-span-3">
                <VCCHeatmap stats={heatmapStats} loading={heatmapLoading} />
              </div>
            </div>
          </>
        );
      })()}

      {/* Modals */}
      {stats && (
        <VCCDevicesView
          open={showDevicesModal}
          onOpenChange={setShowDevicesModal}
          devices={stats.byDevice || []}
          totalDetections={stats.totalDetections}
          onSelectCamera={(id) => updateSelectedCameraIds(id ? [id] : [])}
          cameras={cameras}
        />
      )}

      <VCCReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        cameras={cameras}
        initialDateRange={dateRange}
        selectedCameraIds={selectedCameraIds}
      />

    </div>
  );
}
