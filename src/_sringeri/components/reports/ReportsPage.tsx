import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, Calendar, FileText, Download, Filter, Trash2, ExternalLink, X, Loader2 } from 'lucide-react';
import { Button } from '@sringeri/components/ui/button';
import { Card } from '@sringeri/components/ui/card';
import { HudBadge } from '@sringeri/components/ui/hud-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@sringeri/components/ui/popover';
import { Calendar as CalendarPicker } from '@sringeri/components/ui/calendar';
import { pdf } from '@react-pdf/renderer';
import { apiClient } from '@sringeri/lib/api';
import { FRSReportPDF } from '@sringeri/components/crowd/FRSReportPDF';
import { ANPRReportPDF } from './ANPRReportPDF';
import { CrowdReportPDF } from './CrowdReportPDF';
import { preloadPdfImages } from '@sringeri/lib/pdf-images';
import {
  clearReportHistory,
  getReportHistory,
  recordReportEvent,
  type ReportHistoryEntry,
} from '@sringeri/lib/reportHistory';

type ReportKey = 'frs' | 'anpr' | 'crowd';

type ReportRoute = {
  title: string;
  module: string;
  route: string;
  description: string;
  reportKey?: ReportKey;
};

const REPORT_ROUTES: ReportRoute[] = [
  { title: 'FRS Watchlist Report', module: 'FRS', route: '/frs', description: 'Face recognition watchlist and detections — PDF with images, threat levels and metadata.', reportKey: 'frs' },
  { title: 'ANPR Vehicle Report', module: 'ANPR', route: '/itms/anpr', description: 'Vehicle records with plate, type, detection count, last seen and watchlist status.', reportKey: 'anpr' },
  { title: 'Crowd Analytics Report', module: 'Crowd', route: '/crowd-analytics', description: 'Crowd density, hotspot severity, people count and congestion per camera.', reportKey: 'crowd' },
  { title: 'VCC Dashboard', module: 'ITMS', route: '/itms/vcc', description: 'Vehicle class/count charts and period insights.', reportKey: undefined },
];

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (t.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) qi += 1;
  }
  return qi === q.length;
}

function DatePickerButton({
  value,
  onChange,
  placeholder,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  const hours = value ? value.getHours() : 0;
  const minutes = value ? value.getMinutes() : 0;
  const seconds = value ? value.getSeconds() : 0;

  const updateTime = (h: number, m: number, s: number) => {
    const d = new Date(value || new Date());
    d.setHours(h, m, s, 0);
    onChange(d);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 flex items-center gap-2 text-sm text-left hover:bg-white/5 transition-colors">
          <Calendar className="h-4 w-4 text-zinc-500 shrink-0" />
          <span className={value ? 'text-zinc-200' : 'text-zinc-500'}>
            {value ? format(value, 'dd MMM yyyy  HH:mm:ss') : placeholder}
          </span>
          {value && (
            <X
              className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 ml-auto shrink-0"
              onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <CalendarPicker
          mode="single"
          selected={value}
          onSelect={(d) => {
            if (d) {
              const next = new Date(d);
              next.setHours(hours, minutes, seconds, 0);
              onChange(next);
            } else {
              onChange(undefined);
            }
          }}
          autoFocus
        />
        {/* Time picker */}
        <div className="border-t border-white/10 px-3 py-3 space-y-2">
          <input
            type="time"
            step="1"
            value={`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
            onChange={(e) => {
              const [h, m, s] = e.target.value.split(':').map(Number);
              updateTime(h || 0, m || 0, s || 0);
            }}
            className="w-full h-8 rounded-md border border-white/10 bg-zinc-800 text-zinc-200 text-sm px-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            onClick={() => setOpen(false)}
            className="w-full h-8 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [history, setHistory] = useState<ReportHistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  // Initial dates may come from URL params (?from=ISO&to=ISO).
  // The nightly cron uses these to pin the window to 06:00 → 22:00 IST
  // exactly, instead of clicking the date picker (which only sets day).
  const initialFrom = (() => {
    const v = searchParams.get('from');
    if (!v) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  })();
  const initialTo = (() => {
    const v = searchParams.get('to');
    if (!v) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  })();
  const [fromDate, setFromDate] = useState<Date | undefined>(initialFrom);
  const [toDate, setToDate] = useState<Date | undefined>(initialTo);
  const [generating, setGenerating] = useState<ReportKey | null>(null);

  // Optional ?cameras=ID1,ID2 — restricts crowd report data to these
  // device IDs. Used by the daily-report cron to send a per-camera
  // subset to the four temple inboxes.
  const cameraIdFilter: string[] = (() => {
    const v = searchParams.get('cameras');
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  })();

  // Which single camera the footfall TREND GRAPH reflects. The report can
  // cover several cameras (cameraIdFilter) while the graph still shows one
  // camera's entrance count to match the dashboard footfall tile (Gopura).
  // ?trendDevice=ID sets it; absent → the graph sums all report cameras.
  const trendDeviceId: string | undefined = searchParams.get('trendDevice') || undefined;

  const reload = () => setHistory(getReportHistory());

  useEffect(() => { reload(); }, []);

  const modules = useMemo(() => {
    const set = new Set<string>(['all']);
    REPORT_ROUTES.forEach((r) => set.add(r.module));
    history.forEach((h) => {
      if (h.module !== 'System' && h.module !== 'Analytics') set.add(h.module);
    });
    return Array.from(set);
  }, [history]);

  const filteredRoutes = useMemo(() => {
    return REPORT_ROUTES.filter((r) => {
      if (moduleFilter !== 'all' && r.module !== moduleFilter) return false;
      const haystack = `${r.title} ${r.module} ${r.route} ${r.description}`;
      return fuzzyMatch(haystack, query);
    });
  }, [moduleFilter, query]);

  const filteredHistory = useMemo(() => {
    const fromTs = fromDate ? fromDate.getTime() : 0;
    const toTs = toDate ? toDate.getTime() : Number.MAX_SAFE_INTEGER;
    return history.filter((h) => {
      if (h.module === 'System' || h.module === 'Analytics') return false;
      if (moduleFilter !== 'all' && h.module !== moduleFilter) return false;
      const ts = new Date(h.generatedAt).getTime();
      if (!Number.isFinite(ts) || ts < fromTs || ts > toTs) return false;
      const haystack = `${h.title} ${h.module} ${h.route} ${h.format} ${h.status} ${h.query || ''} ${h.notes || ''}`;
      return fuzzyMatch(haystack, query);
    });
  }, [history, moduleFilter, fromDate, toDate, query]);

  // The day-picker hands back midnight of the selected day for both ends.
  // Picking "May 7" for both From and To therefore yields a zero-width
  // range. Only when the To-time is exactly midnight do we auto-extend
  // it to end-of-day (23:59:59.999). If the user explicitly picked a
  // time (e.g. 18:00), respect their choice and don't override.
  const startIso = fromDate?.toISOString();
  const toIsAtMidnight = !!toDate
    && toDate.getHours() === 0
    && toDate.getMinutes() === 0
    && toDate.getSeconds() === 0
    && toDate.getMilliseconds() === 0;
  const endIso = (() => {
    if (!toDate) {
      // No explicit end date. If a start date was chosen, bound the
      // window to the END of that day so picking a single past date
      // yields THAT day report, not "from that day until now" (which
      // would bleed today data into a previous-date report).
      if (fromDate) {
        const t = new Date(fromDate);
        t.setHours(23, 59, 59, 999);
        return t.toISOString();
      }
      return undefined;
    }
    const t = new Date(toDate);
    if (toIsAtMidnight) t.setHours(23, 59, 59, 999);
    return t.toISOString();
  })();
  const fromLabel = fromDate ? format(fromDate, 'dd MMM yyyy HH:mm') : undefined;
  // The displayed end label must match what we actually queried — show
  // 23:59 only when we auto-extended, otherwise show the user's chosen time.
  const toLabel = toDate
    ? format(toDate, toIsAtMidnight ? 'dd MMM yyyy 23:59' : 'dd MMM yyyy HH:mm')
    : undefined;

  const handleGenerate = async (key: ReportKey, title: string, module: string, route: string) => {
    setGenerating(key);
    try {
      const generatedAt = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      const filename = `${module}-Report-${Date.now()}.pdf`;

      let blob: Blob;

      if (key === 'frs') {
        const [persons, detections] = await Promise.all([
          apiClient.getPersons(),
          apiClient.getFRSDetections({
            limit: 5000,
            // Push the date range AND known-only filter to the backend.
            // unknowns vastly outnumber knowns (~99% on a typical day), so
            // server-side filtering is essential — without it the 5000-row
            // cap fills up with unknowns and we never see the matches.
            startTime: startIso,
            endTime: endIso,
            unknown: false,
          }),
        ]);
        // Filter detections by time range client-side, then keep only
        // matched (known-person) detections. A detection is "known" if it
        // has any of: top-level personId, hydrated person relation, or
        // metadata.person_id pointing into the loaded watchlist.
        const personIds = new Set(persons.map((p) => String(p.id)));
        const filtered = detections.filter((d) => {
          const ts = new Date(d.timestamp).getTime();
          if (startIso && ts < new Date(startIso).getTime()) return false;
          if (endIso && ts > new Date(endIso).getTime()) return false;
          const dAny = d as any;
          if (dAny?.personId && String(dAny.personId).length) return true;
          if (dAny?.person?.id) return true;
          const pid = dAny?.metadata?.person_id;
          if (pid != null && personIds.has(String(pid))) return true;
          if (dAny?.metadata?.person_name) return true;
          return false;
        });

        // The detection log is now the focus of the report, so allow many
        // more rows. Each row resizes to ~30 KB so 200 sightings ≈ 12 MB
        // embedded — still well under the 10-15 sec wall-time budget.
        const MAX_PERSONS = 80;
        const MAX_DETECTIONS = 200;
        const slicedPersons = persons.slice(0, MAX_PERSONS);
        const slicedDetections = filtered.slice(0, MAX_DETECTIONS);

        // Per-row images: camera frame + detected face crop. Watchlist
        // reference photos are heavy (~8 MB DSLR JPEGs) and aren't needed
        // since the report is a sighting log, not a roster.
        const reqs: { url: string; kind: 'face' | 'frame' }[] = [];
        slicedDetections.forEach((d: any) => {
          const imgs = d?.metadata?.images || {};
          const match =
            imgs['face_crop.jpg'] ||
            imgs['face.jpg'] ||
            d?.faceSnapshotUrl ||
            d?.metadata?.face_snapshot_url;
          const frame =
            imgs['frame.jpg'] ||
            d?.fullSnapshotUrl ||
            d?.metadata?.full_snapshot_url ||
            d?.metadata?.fullImageUrl;
          if (match) {
            reqs.push({ url: match, kind: 'face' });
          } else {
            const matched =
              d?.person?.faceImageUrl ||
              slicedPersons.find((p) => String(p.id) === String(d?.metadata?.person_id ?? d?.personId))?.faceImageUrl;
            if (matched) reqs.push({ url: matched, kind: 'face' });
          }
          if (frame) reqs.push({ url: frame, kind: 'frame' });
        });
        const imageMap = await preloadPdfImages(reqs);

        blob = await pdf(
          <FRSReportPDF
            persons={slicedPersons}
            detections={slicedDetections as any}
            reportTitle={title}
            generatedAt={generatedAt}
            filters={{ watchlistFilter: 'all' }}
            imageMap={imageMap}
            totalPersons={persons.length}
            totalDetections={filtered.length}
            timeRange={{ from: fromLabel, to: toLabel }}
          />
        ).toBlob();

      } else if (key === 'anpr') {
        const [result, timeline] = await Promise.all([
          apiClient.getVehicles({
            startTime: startIso,
            endTime: endIso,
            limit: 500,
            orderBy: 'last_seen',
            orderDir: 'desc',
          }),
          apiClient.getVehicleStatsTimeline({
            startTime: startIso,
            endTime: endIso,
          }).catch(() => ({
            hourly: new Array(24).fill(0),
            byCamera: [],
            totalDetections: 0,
            uniquePlates: 0,
            watchlistHits: 0,
            start: '', end: '',
          })),
        ]);
        // Pre-fetch + resize the per-row vehicle thumbnails so a 120-row
        // report doesn't have to embed 120 full-resolution JPEGs serially.
        const slicedVehicles = result.vehicles.slice(0, 120);
        const reqs: { url: string; kind: 'thumb' }[] = [];
        slicedVehicles.forEach((v: any) => {
          const u =
            v?.thumbnailUrl ||
            v?.detections?.[0]?.vehicleImageUrl ||
            v?.detections?.[0]?.fullImageUrl ||
            v?.detections?.[0]?.plateImageUrl;
          if (u) reqs.push({ url: u, kind: 'thumb' });
        });
        const imageMap = await preloadPdfImages(reqs);

        blob = await pdf(
          <ANPRReportPDF
            vehicles={slicedVehicles}
            timeline={timeline}
            reportTitle={title}
            generatedAt={generatedAt}
            fromDate={fromLabel}
            toDate={toLabel}
            startIso={startIso}
            endIso={endIso}
            imageMap={imageMap}
          />
        ).toBlob();

      } else {
        // crowd — pick a chart granularity based on the timeframe span:
        //   < 6h    → 5-minute bars
        //   < 48h   → hourly bars
        //   ≥ 48h   → daily bars
        const startMs = startIso ? new Date(startIso).getTime() : 0;
        const endMs = endIso ? new Date(endIso).getTime() : Date.now();
        const spanH = (endMs - startMs) / 3_600_000;
        const granularity: '5min' | 'hour' | 'day' =
          spanH > 0 && spanH < 6  ? '5min' :
          spanH > 0 && spanH < 48 ? 'hour' :
                                    'day';
        const trendStartIso = startIso || new Date(Date.now() - 24 * 3_600_000).toISOString();
        // Always fetch a DAILY trend in addition to the chart trend.
        // The daily trend uses the line-crossing pipeline only and runs
        // a previous-day-MAX delta — that's the same number the
        // dashboard's "Footfall" tile shows. The chart-granularity
        // trend gives the time series for plotting; the daily trend
        // gives the headline KPI numbers.
        let [analyses, trend, footfall, alerts] = await Promise.all([
          apiClient.getCrowdAnalysis({
            startTime: startIso,
            endTime: endIso,
            limit: 5000,
          }),
          apiClient.getCrowdTrend({
            startTime: trendStartIso,
            endTime: endIso,
            granularity,
            // Pin the trend graph to a single camera (Gopura) so it matches
            // the dashboard footfall tile, even though the report itself
            // covers all of cameraIdFilter. ?trendDevice=ID sets it; absent
            // → graph sums every camera in the report.
            ...(trendDeviceId ? { deviceId: trendDeviceId } : {}),
          }).catch(() => []),
          apiClient.getCrowdFootfall({
            startTime: startIso,
            endTime: endIso,
          }).catch(() => ({ totalFootfall: 0, perCamera: [] })),
          apiClient.getCrowdAlerts({
            startTime: startIso,
            endTime: endIso,
            limit: 200,
          }).catch(() => [] as any[]),
        ]);

        // Apply optional camera filter (?cameras=ID,ID URL param).
        // The cron uses this to send a per-camera subset to the four
        // temple inboxes (Main Gate / Temple Entrance / Dining Hall /
        // Gurunivasa) while another mail goes to IT support with no
        // filter.
        if (cameraIdFilter.length > 0) {
          const wanted = new Set(cameraIdFilter);
          analyses = analyses.filter((a: any) => wanted.has(a.deviceId));
          alerts   = (alerts as any[]).filter((a) => wanted.has(a.deviceId));
          footfall = {
            ...footfall,
            perCamera: footfall.perCamera.filter((c: any) => wanted.has(c.deviceId)),
          };
          // Recompute total footfall from the kept cameras.
          footfall.totalFootfall = footfall.perCamera.reduce(
            (s: number, c: any) => s + (c.footfall || 0), 0,
          );
        }

        // People-count thresholds (Yellow/Orange/Red) — what the
        // dashboard uses to fire alerts. We surface them in the
        // report so the severity strip is self-explanatory.
        const thresholds = await fetch('/api/crowd/alert-thresholds', { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null) as { yellow?: number; orange?: number; red?: number } | null;

        // Pre-fetch the alert snapshot frames + downscale so the PDF
        // embeds small JPEGs instead of full-resolution camera frames.
        const alertImageRequests: { url: string; kind: 'frame' }[] = [];
        for (const a of alerts as any[]) {
          const u = a?.frameUrl || a?.frameSnapshot;
          if (u) alertImageRequests.push({ url: u, kind: 'frame' });
        }
        const crowdImageMap = alertImageRequests.length
          ? await preloadPdfImages(alertImageRequests)
          : new Map<string, string>();
        blob = await pdf(
          <CrowdReportPDF
            analyses={analyses}
            trend={trend}
            footfall={footfall}
            alerts={alerts}
            thresholds={thresholds || undefined}
            imageMap={crowdImageMap}
            granularity={granularity}
            reportTitle={title}
            generatedAt={generatedAt}
            fromDate={fromLabel}
            toDate={toLabel}
            startIso={startIso || trendStartIso}
            endIso={endIso || new Date().toISOString()}
          />
        ).toBlob();
      }

      await downloadBlob(blob, filename);
      recordReportEvent({ title, module, route, format: 'pdf', status: 'downloaded' });
      reload();
    } catch (err) {
      console.error('Report generation failed:', err);
      alert('Failed to generate report. Check console for details.');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="h-full overflow-hidden relative iris-dashboard-root">
      <div className="h-full p-4 md:p-6 lg:p-8 space-y-6 iris-scroll-area">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-amber-400" />
            <h1 className="text-xl font-mono font-bold text-zinc-100">Reports Manager</h1>
            <HudBadge variant="default" size="sm">Central</HudBadge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => navigate('/dashboard')}>
              Open Analytics
            </Button>
            <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => { clearReportHistory(); reload(); }}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Log
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="border border-white/10 bg-zinc-900/30 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Filter className="h-4 w-4 text-zinc-400" />
            Filters &amp; Date Range
            <span className="text-zinc-500 text-xs font-normal ml-1">— applied to generated reports</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 flex items-center gap-2 focus-within:ring-2 focus-within:ring-amber-500/40">
              <Search className="h-4 w-4 text-zinc-500 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reports..."
                className="w-full bg-transparent border-0 p-0 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
              />
            </div>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-200 focus:outline-none"
            >
              {modules.map((m) => (
                <option key={m} value={m} className="bg-[#0a0a0a] text-zinc-100">{m === 'all' ? 'All Modules' : m}</option>
              ))}
            </select>
            <DatePickerButton value={fromDate} onChange={setFromDate} placeholder="From date" />
            <DatePickerButton value={toDate} onChange={setToDate} placeholder="To date" />
          </div>
        </Card>

        {/* Catalog */}
        <Card className="border border-white/10 bg-zinc-900/30 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-300" />
              Reports Catalog
            </h2>
            <HudBadge variant="info" size="sm">{filteredRoutes.length} entries</HudBadge>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredRoutes.map((r) => {
              const isGenerating = generating === r.reportKey;
              const canGenerate = Boolean(r.reportKey);
              return (
                <div key={r.route} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">{r.title}</p>
                      <p className="text-xs text-zinc-400 mt-1">{r.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <HudBadge variant="secondary" size="sm">{r.module}</HudBadge>
                        {canGenerate && <HudBadge variant="default" size="sm">pdf</HudBadge>}
                        {fromDate && toDate && (
                          <span className="text-[10px] text-amber-400 font-mono">
                            {format(fromDate, 'dd MMM HH:mm')} → {format(toDate, 'dd MMM HH:mm')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => navigate(r.route)}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open
                      </Button>
                      {canGenerate ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isGenerating || Boolean(generating)}
                          onClick={() => handleGenerate(r.reportKey!, r.title, r.module, r.route)}
                          className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                        >
                          {isGenerating
                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
                            : <><Download className="h-4 w-4 mr-2" />Generate PDF</>
                          }
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => navigate(r.route)}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredRoutes.length === 0 && (
              <div className="text-sm text-zinc-500 col-span-full py-6 text-center">No reports match current filters.</div>
            )}
          </div>
        </Card>

        {/* History log */}
        <Card className="border border-white/10 bg-zinc-900/30 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-300" />
              Generated Reports Log
            </h2>
            <HudBadge variant="default" size="sm">{filteredHistory.length} items</HudBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500 text-[11px] font-mono">
                  <th className="text-left py-2 pr-3">Generated At</th>
                  <th className="text-left py-2 pr-3">Title</th>
                  <th className="text-left py-2 pr-3">Module</th>
                  <th className="text-left py-2 pr-3">Format</th>
                  <th className="text-left py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr key={h.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 pr-3 text-zinc-400 font-mono text-xs">{new Date(h.generatedAt).toLocaleString()}</td>
                    <td className="py-2 pr-3 text-zinc-100">{h.title}</td>
                    <td className="py-2 pr-3"><HudBadge variant="secondary" size="sm">{h.module}</HudBadge></td>
                    <td className="py-2 pr-3 uppercase text-zinc-300 text-xs font-mono">{h.format}</td>
                    <td className="py-2 pr-3">
                      <HudBadge variant={h.status === 'downloaded' ? 'success' : 'info'} size="sm">{h.status}</HudBadge>
                    </td>
                  </tr>
                ))}
                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">No report activity found for selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
