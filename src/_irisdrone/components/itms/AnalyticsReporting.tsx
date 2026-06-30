import React, { useState, useEffect, useRef } from 'react';
import { apiClient, type ViolationStats, type VCCStats, type VCCDeviceStats, type Device } from '@irisdrone/lib/api';

interface LocationGroup {
  label: string;
  ids: string[];
}
import { Card } from '@irisdrone/components/ui/card';
import { Button } from '@irisdrone/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@irisdrone/components/ui/tabs';
import { TrendChart, PieChartWidget, StatsCard, formatNumber } from './widgets';
import { ITMSLayout } from './components/ITMSLayout';
import { Download, Loader2, Search, X } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { AnalyticsPDF } from './AnalyticsPDF';
import { cleanDeviceName } from '@irisdrone/lib/displayName';
import { DateTimePicker } from '@irisdrone/components/ui/datetime-picker';

function fuzzyMatch(str: string, query: string): boolean {
  const s = str.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  let si = 0;
  for (let qi = 0; qi < q.length; qi++) {
    si = s.indexOf(q[qi], si);
    if (si === -1) return false;
    si++;
  }
  return true;
}

function fuzzyScore(str: string, query: string): number {
  const s = str.toLowerCase();
  const q = query.toLowerCase().trim();
  // Exact substring = highest score
  if (s.includes(q)) return 2;
  // Word boundary match
  if (s.split(/\s+/).some(w => w.startsWith(q))) return 1;
  return 0;
}

// Use the shared lib helper so analytics labels match every other surface
// (challan PDF, WhatsApp caption, backend reports).
const displayName = (name: string) => cleanDeviceName(name);

// Format Date to datetime-local value (local time, not UTC)
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return toLocalInput(d);
}

function defaultEnd(): string {
  return toLocalInput(new Date());
}

// datetime-local string → ISO string (browser treats bare datetime as local)
function toISO(dateLocal: string): string {
  return new Date(dateLocal).toISOString();
}

export function AnalyticsReporting() {
  const [violationStats, setViolationStats] = useState<ViolationStats | null>(null);
  const [vccStats, setVccStats] = useState<VCCStats | null>(null);
  const [vccDeviceStats, setVccDeviceStats] = useState<VCCDeviceStats | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('trends');

  const [deviceSearch, setDeviceSearch] = useState('');
  // selectedLocation lifts the dropdown out of single-device land: each
  // entry now represents a *location* (e.g. "Katkol Salhalli") that
  // bundles every camera at that intersection. Stats queries pass the
  // bundle's ids comma-separated; the backend accepts a list and emits
  // aggregated counts.
  const [selectedLocation, setSelectedLocation] = useState<LocationGroup | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(defaultEnd());

  // De-dupe the camera list into one row per cleaned location label and
  // show ALL locations — including ones with zero violations so far —
  // so the operator can pick any site, not just sites that already fired.
  const locationGroups = React.useMemo<LocationGroup[]>(() => {
    const map = new Map<string, LocationGroup>();
    for (const d of devices) {
      const label = displayName(d.name) || d.id;
      const ex = map.get(label);
      if (ex) {
        ex.ids.push(d.id);
      } else {
        map.set(label, { label, ids: [d.id] });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [devices]);

  const filteredLocations = deviceSearch.trim()
    ? locationGroups
        .filter(g => fuzzyMatch(g.label, deviceSearch))
        .sort((a, b) => fuzzyScore(b.label, deviceSearch) - fuzzyScore(a.label, deviceSearch))
    : locationGroups;

  useEffect(() => {
    apiClient.getDevices().then(d => setDevices(d as Device[])).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const startTime = toISO(startDate);
      const endTime = toISO(endDate);
      const diffDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
      const groupBy: 'hour' | 'day' = diffDays <= 2 ? 'hour' : 'day';

      // Pass the location's full bundle of device IDs comma-joined; the
      // backend WHERE clause uses IN(...) so the request still resolves
      // to a single SQL filter, just covering every camera at that site.
      const deviceIdParam = selectedLocation ? selectedLocation.ids.join(',') : undefined;

      const violations = await apiClient.getViolationStats({
        startTime,
        endTime,
        deviceId: deviceIdParam,
      });
      setViolationStats(violations);

      if (selectedLocation) {
        // VCC's per-device endpoint takes one id — fetch each camera in
        // the location bundle and sum so the chart matches the violation
        // numbers for the same coverage scope.
        const perCam = await Promise.all(
          selectedLocation.ids.map(id => apiClient.getVCCByDevice(id, { startTime, endTime }).catch(() => null))
        );
        const merged: VCCDeviceStats | null = perCam.reduce<VCCDeviceStats | null>((acc, cur) => {
          if (!cur) return acc;
          if (!acc) return { ...cur };
          return {
            ...acc,
            totalDetections: (acc.totalDetections ?? 0) + (cur.totalDetections ?? 0),
            uniqueVehicles:  (acc.uniqueVehicles  ?? 0) + (cur.uniqueVehicles  ?? 0),
            averagePerHour:  (acc.averagePerHour  ?? 0) + (cur.averagePerHour  ?? 0),
            byVehicleType: Object.entries(cur.byVehicleType ?? {}).reduce((m, [k, v]) => {
              m[k] = (m[k] ?? 0) + (v as number);
              return m;
            }, { ...(acc.byVehicleType ?? {}) } as Record<string, number>),
            classification: acc.classification, // first camera's classification breakdown is fine for now
          };
        }, null);
        setVccDeviceStats(merged);
        setVccStats(null);
      } else {
        const vcc = await apiClient.getVCCStats({ startTime, endTime, groupBy });
        setVccStats(vcc);
        setVccDeviceStats(null);
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [startDate, endDate, selectedLocation]);

  const activeVcc: VCCStats | VCCDeviceStats | null = selectedLocation ? vccDeviceStats : vccStats;
  // True period length in days (un-clamped). At 24h or less we report
  // avg/hour because avg/day = total in that window and adds no
  // information. Daily averaging only kicks in when the range exceeds
  // a single day.
  const rawDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
  const total = violationStats?.total || 0;
  const useHourly = rawDays <= 1;
  const avgPerDay = useHourly
    ? Math.round(total / Math.max(1, rawDays * 24))
    : Math.round(total / rawDays);
  const avgPerDayLabel = useHourly ? 'per hour' : 'across period';

  // Trend data
  const trendData: Array<{ time: string; vehicles: number; violations: number }> = [];
  if (selectedLocation && vccDeviceStats) {
    for (let h = 0; h < 24; h++) {
      trendData.push({
        time: `${String(h).padStart(2, '0')}:00`,
        vehicles: Number((vccDeviceStats.byHour as any)?.[h] ?? 0),
        violations: Number((violationStats?.byHour as any)?.[h] ?? 0),
      });
    }
  } else if (vccStats?.byTime) {
    vccStats.byTime.forEach((item: any, index: number) => {
      trendData.push({
        time: item.hour || item.day || String(index),
        vehicles: Number(item.count) || 0,
        violations: Number((violationStats?.byHour as any)?.[index]) || 0,
      });
    });
  }

  const violationTypeData = violationStats?.byType
    ? Object.entries(violationStats.byType)
        .map(([type, count]) => ({ name: type.replace(/_/g, ' '), value: Number(count) }))
        .sort((a, b) => b.value - a.value)
    : [];

  const vehicleTypeData = activeVcc?.byVehicleType
    ? Object.entries(activeVcc.byVehicleType)
        .map(([type, count]) => ({
          name: type === '2W' ? '2 Wheeler' : type === '4W' ? '4 Wheeler' : type,
          value: Number(count),
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const applyPreset = (preset: '24h' | '7d' | '30d') => {
    const end = new Date();
    const start = new Date();
    if (preset === '24h') start.setHours(start.getHours() - 24);
    else if (preset === '7d') start.setDate(start.getDate() - 7);
    else start.setDate(start.getDate() - 30);
    setStartDate(toLocalInput(start));
    setEndDate(toLocalInput(end));
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const fmt = (d: string) => new Date(d).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const generatedAt = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const deviceNames = devices.reduce<Record<string, string>>((acc, d) => {
        acc[d.id] = d.name || d.id;
        return acc;
      }, {});
      const blob = await pdf(
        <AnalyticsPDF
          cameraName={selectedLocation ? selectedLocation.label : 'All Cameras'}
          dateFrom={fmt(startDate)}
          dateTo={fmt(endDate)}
          generatedAt={generatedAt}
          violationStats={violationStats}
          vccStats={activeVcc}
          avgPerDay={avgPerDay}
          avgPerDayLabel={avgPerDayLabel}
          deviceNames={deviceNames}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Analytics-Report-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF error:', err);
      alert('Failed to generate PDF');
    } finally {
      setExporting(false);
    }
  };

  if (loading && !violationStats) {
    return (
      <div className="flex items-center justify-center h-full relative">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-2" />
          <p className="text-zinc-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <ITMSLayout>
      <div className="h-full w-full p-4 md:p-6 space-y-4">

        {/* ── Single-line header bar ── */}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-zinc-100 whitespace-nowrap">Analytics & Reporting</h2>

          <div className="flex flex-wrap items-center gap-2 ml-auto">

          {/* Camera search */}
          <div className="relative" ref={searchRef}>
            {selectedLocation ? (
              <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-white/10 bg-zinc-900/60 text-xs text-zinc-200 max-w-[200px]">
                <span className="truncate flex-1">{selectedLocation.label}</span>
                <button onClick={() => setSelectedLocation(null)} className="text-zinc-500 hover:text-zinc-200 flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                <input
                  className="h-8 pl-7 pr-3 rounded-lg border border-white/10 bg-zinc-900/60 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 w-44"
                  placeholder="Search location..."
                  value={deviceSearch}
                  onChange={e => { setDeviceSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                />
                {showDropdown && filteredLocations.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 w-72 max-h-56 overflow-y-auto bg-zinc-900 border border-white/10 rounded-lg shadow-xl z-50">
                    {filteredLocations.slice(0, 50).map(g => (
                      <button
                        key={g.label}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
                        onClick={() => { setSelectedLocation(g); setDeviceSearch(''); setShowDropdown(false); }}
                      >
                        <span className="flex-1 truncate">{g.label}</span>
                        <span className="text-[10px] text-zinc-500 flex-shrink-0">{g.ids.length} cam{g.ids.length === 1 ? '' : 's'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Presets */}
          {(['24h', '7d', '30d'] as const).map(p => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className="h-8 px-2.5 rounded-lg border border-white/10 bg-zinc-900/60 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
            >
              {p.toUpperCase()}
            </button>
          ))}

          {/* Custom datetime range — calendar popover for both ends. */}
          <div className="flex items-center gap-1.5">
            <DateTimePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="Start date"
              ariaLabel="Start date and time"
            />
            <span className="text-zinc-500 text-xs">→</span>
            <DateTimePicker
              value={endDate}
              onChange={setEndDate}
              placeholder="End date"
              ariaLabel="End date and time"
            />
          </div>

          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />}

          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedLocation(null); setDeviceSearch(''); applyPreset('7d'); }}
            className="h-8 text-xs text-zinc-400 hover:text-zinc-100"
          >
            Clear
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="h-8 text-xs"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            Export PDF
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total Violations"
            value={violationStats?.total || 0}
            subtitle={`${violationStats?.pending || 0} pending`}
            color="magenta"
            size="large"
          />
          <StatsCard
            title="Total Vehicles"
            value={activeVcc?.uniqueVehicles || 0}
            subtitle="Unique vehicles"
            color="cyan"
            size="large"
          />
          <StatsCard
            title="Detections"
            value={activeVcc?.totalDetections || 0}
            subtitle="Total count"
            color="green"
            size="large"
          />
          <StatsCard
            title={useHourly ? 'Avg Per Hour' : 'Avg Per Day'}
            value={avgPerDay}
            subtitle="Violations"
            color="yellow"
            size="large"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 bg-zinc-900/50 border border-white/5">
            <TabsTrigger value="trends" className="text-xs">Trends</TabsTrigger>
            <TabsTrigger value="violations" className="text-xs">Violations</TabsTrigger>
            <TabsTrigger value="vehicles" className="text-xs">Vehicles</TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="space-y-4 mt-4">
            <TrendChart
              data={trendData}
              dataKeys={[
                { key: 'vehicles', color: '#f59e0b', gradientId: 'colorVehicles' },
                { key: 'violations', color: '#f43f5e', gradientId: 'colorViolations' },
              ]}
              height={400}
              title={selectedLocation ? `Trends — ${selectedLocation.label}` : 'Violation & Vehicle Trends'}
              xAxisKey="time"
            />
          </TabsContent>

          <TabsContent value="violations" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PieChartWidget data={violationTypeData} height={400} title="Violation Type Distribution" />
              <Card className="bg-zinc-900/30 border border-white/5 p-4">
                <h3 className="text-base font-bold text-zinc-100 mb-3">Top Violation Types</h3>
                <div className="space-y-1.5">
                  {violationTypeData.slice(0, 8).map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-2 py-1.5 bg-zinc-900/50 rounded-lg">
                      <span className="text-sm text-zinc-300">{item.name}</span>
                      <span className="text-sm font-bold text-zinc-100">{formatNumber(item.value)}</span>
                    </div>
                  ))}
                  {violationTypeData.length === 0 && (
                    <p className="text-sm text-zinc-500 text-center py-8">No violations in selected range</p>
                  )}
                </div>
              </Card>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Pending', value: violationStats?.pending ?? 0, color: 'text-amber-400' },
                { label: 'Approved', value: violationStats?.approved ?? 0, color: 'text-emerald-400' },
                { label: 'Rejected', value: violationStats?.rejected ?? 0, color: 'text-red-400' },
                { label: 'Fined', value: violationStats?.fined ?? 0, color: 'text-amber-400' },
              ].map(s => (
                <Card key={s.label} className="bg-zinc-900/30 border border-white/5 p-4">
                  <p className="text-xs text-zinc-500 tracking-wider mb-1">{s.label}</p>
                  <p className={`text-2xl font-mono font-bold ${s.color}`}>{formatNumber(s.value)}</p>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-4 mt-4">
            <PieChartWidget data={vehicleTypeData} height={400} title="Vehicle Type Distribution" />
            {activeVcc && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Detections', value: activeVcc.totalDetections },
                  { label: 'Unique Vehicles', value: activeVcc.uniqueVehicles },
                  { label: 'With Plates', value: (activeVcc.classification as any)?.withPlates ?? 0 },
                  { label: 'Avg / Hour', value: Math.round(activeVcc.averagePerHour) },
                ].map(s => (
                  <Card key={s.label} className="bg-zinc-900/30 border border-white/5 p-4">
                    <p className="text-xs text-zinc-500 tracking-wider mb-1">{s.label}</p>
                    <p className="text-2xl font-mono font-bold text-zinc-100">{formatNumber(s.value)}</p>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </ITMSLayout>
  );
}
