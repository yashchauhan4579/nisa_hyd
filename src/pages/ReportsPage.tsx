import { useEffect, useMemo, useState } from 'react';
import {
  FileText, Activity, FileSpreadsheet, TrendingUp, Loader2, Trash2, Search as SearchIcon,
  Car, ScanFace, Users, BrainCircuit, ScanSearch, ArrowRight, Filter,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pdf } from '@react-pdf/renderer';
import { VCCReportModal } from '@/components/tvcc/VCCReportModal';
import { HealthReportModal } from '@/components/tvcc/HealthReportModal';
import { useDataCache } from '@/contexts/DataCacheContext';
import type { CameraOption } from '@/components/tvcc/CameraSelector';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api';
import { useSidecarStatus } from '@/components/analytics/SidecarSummary';
// PDF generators + helpers stay vendored in the sringeri namespace (already amber-styled).
import { FRSReportPDF } from '@sringeri/components/crowd/FRSReportPDF';
import { ANPRReportPDF } from '@sringeri/components/reports/ANPRReportPDF';
import { CrowdReportPDF } from '@sringeri/components/reports/CrowdReportPDF';
import { preloadPdfImages } from '@sringeri/lib/pdf-images';
import {
  clearReportHistory, getReportHistory, recordReportEvent, type ReportHistoryEntry,
} from '@sringeri/lib/reportHistory';

// Reports — one card per IRIS module. ANPR/FRS/Crowd generate in-browser PDFs
// (ported from the iris-sringeri Reports Manager, wired to the shell apiClient);
// Traffic/Health open the existing modals; Forensics + IRIS Search show live
// sidecar status (report generation for those is a follow-up).

type ReportKey = 'frs' | 'anpr' | 'crowd';

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (t.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) if (t[i] === q[qi]) qi += 1;
  return qi === q.length;
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

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ReportsPage() {
  const navigate = useNavigate();
  const { getCameras } = useDataCache();
  const { search: searchStatus, forensics: forensicsStatus } = useSidecarStatus();
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [vccReportOpen, setVccReportOpen] = useState(false);
  const [healthReportOpen, setHealthReportOpen] = useState(false);
  const [generating, setGenerating] = useState<ReportKey | null>(null);
  const [history, setHistory] = useState<ReportHistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  // Date range — defaults to the last 24 h.
  const [fromDate, setFromDate] = useState<Date | undefined>(() => new Date(Date.now() - 24 * 3_600_000));
  const [toDate, setToDate] = useState<Date | undefined>(undefined);

  const reloadHistory = () => setHistory(getReportHistory());
  useEffect(() => { reloadHistory(); }, []);

  useEffect(() => {
    getCameras().then(devices => setCameras(devices.map(d => ({ id: d.id, name: d.name, metadata: d.metadata }))))
      .catch(err => console.error('Failed to load cameras:', err));
  }, [getCameras]);

  const getInitialDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end };
  };

  // End-of-day normalization (ported from the sringeri Reports Manager): if the
  // To-time is exactly midnight, auto-extend to 23:59:59.999; a From with no To
  // bounds to the end of that day.
  const startIso = fromDate?.toISOString();
  const toIsAtMidnight = !!toDate && toDate.getHours() === 0 && toDate.getMinutes() === 0 && toDate.getSeconds() === 0 && toDate.getMilliseconds() === 0;
  const endIso = (() => {
    if (!toDate) {
      if (fromDate) {
        // From in the past with no To → up to now (live ranges are the common
        // case here; single-past-day reports can set both ends explicitly).
        return undefined;
      }
      return undefined;
    }
    const t = new Date(toDate);
    if (toIsAtMidnight) t.setHours(23, 59, 59, 999);
    return t.toISOString();
  })();
  const fmtLabel = (d?: Date) => d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : undefined;
  const fromLabel = fmtLabel(fromDate);
  const toLabel = toDate ? fmtLabel(toIsAtMidnight ? new Date(new Date(toDate).setHours(23, 59, 0, 0)) : toDate) : undefined;

  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      if (moduleFilter !== 'all' && h.module !== moduleFilter) return false;
      const haystack = `${h.title} ${h.module} ${h.route} ${h.format} ${h.status} ${h.query || ''} ${h.notes || ''}`;
      return fuzzyMatch(haystack, query);
    });
  }, [history, moduleFilter, query]);

  const handleGenerate = async (key: ReportKey, title: string, module: string, route: string) => {
    setGenerating(key);
    try {
      const generatedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const filename = `${module}-Report-${Date.now()}.pdf`;
      let blob: Blob;

      if (key === 'frs') {
        const [persons, detections] = await Promise.all([
          apiClient.getFRSPersons(),
          apiClient.getFRSDetections({ limit: 5000, startTime: startIso, endTime: endIso, unknown: false }),
        ]);
        const personIds = new Set(persons.map(p => String(p.id)));
        const filtered = (detections || []).filter(d => {
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
        const slicedPersons = persons.slice(0, 80);
        const slicedDetections = filtered.slice(0, 200);
        const reqs: { url: string; kind: 'face' | 'frame' }[] = [];
        slicedDetections.forEach((d: any) => {
          const imgs = d?.metadata?.images || {};
          const match = imgs['face_crop.jpg'] || imgs['face.jpg'] || d?.faceSnapshotUrl || d?.metadata?.face_snapshot_url;
          const frame = imgs['frame.jpg'] || d?.fullSnapshotUrl || d?.metadata?.full_snapshot_url || d?.metadata?.fullImageUrl;
          if (match) reqs.push({ url: match, kind: 'face' });
          else {
            const matched = d?.person?.faceImageUrl
              || slicedPersons.find(p => String(p.id) === String(d?.metadata?.person_id ?? d?.personId))?.faceImageUrl;
            if (matched) reqs.push({ url: matched, kind: 'face' });
          }
          if (frame) reqs.push({ url: frame, kind: 'frame' });
        });
        const imageMap = await preloadPdfImages(reqs);
        blob = await pdf(
          <FRSReportPDF
            persons={slicedPersons as any}
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
          apiClient.getVehicles({ startTime: startIso, endTime: endIso, limit: 500, orderBy: 'last_seen', orderDir: 'desc' }),
          apiClient.getVehicleStatsTimeline({ startTime: startIso, endTime: endIso }).catch(() => ({
            hourly: new Array(24).fill(0), byCamera: [], totalDetections: 0, uniquePlates: 0, watchlistHits: 0, start: '', end: '',
          })),
        ]);
        const slicedVehicles = (result.vehicles || []).slice(0, 120);
        const reqs: { url: string; kind: 'thumb' }[] = [];
        slicedVehicles.forEach((v: any) => {
          const u = v?.thumbnailUrl || v?.detections?.[0]?.vehicleImageUrl || v?.detections?.[0]?.fullImageUrl || v?.detections?.[0]?.plateImageUrl;
          if (u) reqs.push({ url: u, kind: 'thumb' });
        });
        const imageMap = await preloadPdfImages(reqs);
        blob = await pdf(
          <ANPRReportPDF
            vehicles={slicedVehicles as any}
            timeline={timeline as any}
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
        // crowd — chart granularity from the timeframe span.
        const startMs = startIso ? new Date(startIso).getTime() : 0;
        const endMs = endIso ? new Date(endIso).getTime() : Date.now();
        const spanH = (endMs - startMs) / 3_600_000;
        const granularity: '5min' | 'hour' | 'day' = spanH > 0 && spanH < 6 ? '5min' : spanH > 0 && spanH < 48 ? 'hour' : 'day';
        const trendStartIso = startIso || new Date(Date.now() - 24 * 3_600_000).toISOString();
        const [analyses, trend, footfall, alerts] = await Promise.all([
          apiClient.getCrowdAnalysis({ startTime: startIso, endTime: endIso, limit: 5000 }),
          apiClient.getCrowdTrend({ startTime: trendStartIso, endTime: endIso, granularity }).catch(() => []),
          apiClient.getCrowdFootfall({ startTime: startIso, endTime: endIso }).catch(() => ({ totalFootfall: 0, perCamera: [] })),
          apiClient.getCrowdAlerts({ startTime: startIso, endTime: endIso, limit: 200 }).catch(() => []),
        ]);
        const thresholds = await apiClient.getCrowdAlertThresholds().catch(() => null) as { yellow?: number; orange?: number; red?: number } | null;
        const alertImageRequests: { url: string; kind: 'frame' }[] = [];
        for (const a of alerts as any[]) {
          const u = a?.frameUrl || a?.frameSnapshot;
          if (u) alertImageRequests.push({ url: u, kind: 'frame' });
        }
        const crowdImageMap = alertImageRequests.length ? await preloadPdfImages(alertImageRequests) : new Map<string, string>();
        blob = await pdf(
          <CrowdReportPDF
            analyses={analyses as any}
            trend={trend as any}
            footfall={footfall as any}
            alerts={alerts as any}
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
      reloadHistory();
    } catch (err) {
      console.error('Report generation failed:', err);
      alert('Failed to generate report. Check console for details.');
    } finally {
      setGenerating(null);
    }
  };

  type CardDef = {
    id: string; title: string; description: string; icon: any; formats: string[];
    action: () => void; disabled?: boolean; busy?: boolean; status?: { label: string; ok: boolean; warn?: boolean }; cta?: string;
  };
  const cardDefs: CardDef[] = [
    { id: 'anpr', title: 'ANPR Vehicle Report', description: 'Vehicle records with plate, type, detection count, last seen and watchlist status — PDF with thumbnails.', icon: Car, formats: ['PDF'], action: () => handleGenerate('anpr', 'ANPR Vehicle Report', 'ANPR', '/itms/anpr'), busy: generating === 'anpr' },
    { id: 'frs', title: 'FRS Watchlist Report', description: 'Known-face sightings with face crops, camera frames, threat levels and match scores.', icon: ScanFace, formats: ['PDF'], action: () => handleGenerate('frs', 'FRS Watchlist Report', 'FRS', '/analytics/frs'), busy: generating === 'frs' },
    { id: 'crowd', title: 'Crowd Analytics Report', description: 'Density tiers, footfall per camera, trend chart, alert log with snapshots and thresholds.', icon: Users, formats: ['PDF'], action: () => handleGenerate('crowd', 'Crowd Analytics Report', 'Crowd', '/analytics/crowd'), busy: generating === 'crowd' },
    { id: 'vcc', title: 'Traffic (VCC) Report', description: 'Vehicle classification and counting analytics with breakdowns by type, time, and location.', icon: TrendingUp, formats: ['PDF', 'Excel'], action: () => setVccReportOpen(true) },
    { id: 'health', title: 'Camera Health Report', description: 'System uptime, connectivity status, and performance metrics for all cameras.', icon: Activity, formats: ['Excel'], action: () => setHealthReportOpen(true) },
    {
      id: 'forensics', title: 'Observer Report', description: 'Frame-by-frame crowd-AI findings: peak moments, risk levels, situation briefs.', icon: ScanSearch, formats: ['PDF'],
      action: () => navigate('/forensics'), disabled: true, cta: 'Open Observer',
      status: { label: forensicsStatus.state, ok: forensicsStatus.state === 'online', warn: forensicsStatus.state === 'degraded' },
    },
    {
      id: 'search', title: 'IRIS Search Report', description: 'CLIP semantic search index summary: cameras, index freshness, live coverage.', icon: BrainCircuit, formats: ['PDF'],
      action: () => navigate('/search'), disabled: true, cta: 'Open IRIS Search',
      status: { label: searchStatus.state, ok: searchStatus.state === 'online', warn: searchStatus.state === 'mock' },
    },
  ];

  const MODULE_FILTERS = ['all', 'ANPR', 'FRS', 'Crowd', 'ITMS'];

  return (
    <div className="h-full overflow-y-auto scroll-on-hover bg-zinc-950 text-zinc-100">
      <div className="p-5 space-y-5 max-w-[1500px] mx-auto">

        {/* Header */}
        <div className="rounded-2xl border border-white/10 relative bg-card">
          <div className="absolute inset-0 rounded-2xl overflow-hidden opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg,var(--brand-accent) 0 1px,transparent 1px 14px)' }} />
          <div className="relative px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-amber-300" /></div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-amber-300/80 uppercase tracking-[0.2em]">IRIS Command Center · Analytics</p>
                <h1 className="text-sm font-bold text-white tracking-tight truncate">Reports</h1>
              </div>
            </div>
            {/* Date range */}
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="text-zinc-500 uppercase tracking-wider text-[9px] font-semibold">Range</span>
              <input type="datetime-local" value={fromDate ? toLocalInput(fromDate) : ''}
                onChange={e => setFromDate(e.target.value ? new Date(e.target.value) : undefined)}
                className="h-8 rounded-lg bg-zinc-900 border border-white/10 px-2 text-zinc-200 text-[11px] focus:outline-none focus:border-amber-500/50 [color-scheme:dark]" />
              <span className="text-zinc-600">→</span>
              <input type="datetime-local" value={toDate ? toLocalInput(toDate) : ''}
                onChange={e => setToDate(e.target.value ? new Date(e.target.value) : undefined)}
                className="h-8 rounded-lg bg-zinc-900 border border-white/10 px-2 text-zinc-200 text-[11px] focus:outline-none focus:border-amber-500/50 [color-scheme:dark]" />
              {!toDate && <span className="text-zinc-600">(now)</span>}
            </div>
          </div>
        </div>

        {/* Module cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cardDefs.map(card => {
            const Icon = card.icon;
            return (
              <Card key={card.id} className="bg-zinc-900/60 border-white/8 hover:border-amber-500/30 transition-colors">
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/25 grid place-items-center"><Icon className="w-5 h-5 text-amber-300" /></div>
                    {card.status && (
                      <span className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${card.status.ok ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : card.status.warn ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${card.status.ok ? 'bg-emerald-500' : card.status.warn ? 'bg-amber-400' : 'bg-red-500'}`} />
                        {card.status.label}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{card.title}</h3>
                    <p className="text-[11px] text-zinc-500 leading-relaxed mt-1">{card.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {card.formats.map(f => <span key={f} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/5 text-zinc-400 border border-white/10">{f}</span>)}
                    {card.disabled && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-300/80 border border-amber-500/20">REPORT COMING SOON</span>}
                  </div>
                  {card.disabled ? (
                    <Button variant="outline" size="sm" className="w-full border-white/10 text-zinc-300 hover:border-amber-500/40" onClick={card.action}>
                      {card.cta} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  ) : (
                    <Button size="sm" disabled={!!card.busy || generating !== null} onClick={card.action}
                      className="w-full bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25">
                      {card.busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5" />}
                      {card.busy ? 'Generating…' : 'Generate Report'}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* History */}
        <div className="rounded-2xl border border-white/8 bg-zinc-900/60 overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 mr-auto">
              <div className="p-1.5 rounded-lg bg-amber-500/10"><FileText className="w-4 h-4 text-amber-300" /></div>
              <p className="text-sm font-semibold text-zinc-100">Generated Reports · {filteredHistory.length}</p>
            </div>
            <div className="relative">
              <SearchIcon className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search history…" className="h-8 pl-8 w-48 text-[11px]" />
            </div>
            <div className="flex items-center gap-1 bg-zinc-900 border border-white/10 rounded-lg p-0.5">
              <Filter className="w-3 h-3 text-zinc-600 ml-1.5" />
              {MODULE_FILTERS.map(m => (
                <button key={m} onClick={() => setModuleFilter(m)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${moduleFilter === m ? 'bg-amber-500/20 text-amber-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {m === 'all' ? 'All' : m}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] text-zinc-500 hover:text-red-400" onClick={() => { clearReportHistory(); reloadHistory(); }}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />Clear
            </Button>
          </div>
          {filteredHistory.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-600">No reports generated yet — pick a module card above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] uppercase tracking-widest text-zinc-600 border-b border-white/5">
                    <th className="px-5 py-2 font-semibold">Report</th>
                    <th className="px-3 py-2 font-semibold">Module</th>
                    <th className="px-3 py-2 font-semibold">Format</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredHistory.map((h, i) => (
                    <tr key={`${h.generatedAt}-${i}`} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-5 py-2.5 text-[12px] text-zinc-200 font-medium">{h.title}</td>
                      <td className="px-3 py-2.5"><span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">{h.module}</span></td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-500 uppercase">{h.format}</td>
                      <td className="px-3 py-2.5 text-[11px] text-emerald-400">{h.status}</td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-500 tabular-nums">{new Date(h.generatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Report Modals */}
      <VCCReportModal open={vccReportOpen} onOpenChange={setVccReportOpen} cameras={cameras} initialDateRange={getInitialDateRange()} />
      <HealthReportModal open={healthReportOpen} onOpenChange={setHealthReportOpen} />
    </div>
  );
}
