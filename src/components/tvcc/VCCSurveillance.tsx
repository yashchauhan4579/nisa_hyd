import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient, type VCCStats, type VCCRealtime } from '@/lib/api';
import { Clock, TrendingUp, Gauge, Radio, Car, ChevronDown } from 'lucide-react';
import { FaCar, FaMotorcycle, FaTruck, FaBus, FaTaxi } from 'react-icons/fa';
import { getTodayStartIST } from '@/lib/dateUtils';

// Vehicle-classification dashboard for our deployment (Channel1), styled to match the
// rest of the modules. Driven only by the endpoints that work here (/api/vcc/stats +
// /api/vcc/realtime) — the product page's /api/vcc/cameras + /api/vcc/heatmap 404.

type ClassMeta = { icon: any; color: string; label: string };
const CLASS_META: Record<string, ClassMeta> = {
  AUTO:  { icon: FaTaxi,       color: '#f59e0b', label: 'Auto' },
  '2W':  { icon: FaMotorcycle, color: '#22c55e', label: '2-Wheeler' },
  '4W':  { icon: FaCar,        color: '#3b82f6', label: '4-Wheeler' },
  TRUCK: { icon: FaTruck,      color: '#f87171', label: 'Truck' },
  BUS:   { icon: FaBus,        color: '#a855f7', label: 'Bus' },
};
const metaFor = (t: string): ClassMeta => CLASS_META[t] || { icon: FaCar, color: '#64748b', label: t };
const ORDER = ['AUTO', '2W', '4W', 'TRUCK', 'BUS'];
const istHourLabel = (utcHour: number) => `${String((utcHour + 5) % 24).padStart(2, '0')}:30`;

type TimeRange = '1H' | '24H' | '7D';
const RANGE_HOURS: Record<TimeRange, number> = { '1H': 1, '24H': 24, '7D': 168 };

export function VCCDashboard() {
  const [stats, setStats] = useState<VCCStats | null>(null);
  const [rt, setRt] = useState<VCCRealtime | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>('24H');
  const [selectedCam, setSelectedCam] = useState<string>('ALL'); // 'ALL' = every camera (global aggregate)
  const [camList, setCamList] = useState<string[]>([]);          // discovered from the global byDevice
  const [camOpen, setCamOpen] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const start = range === '24H'
        ? getTodayStartIST().toISOString()
        : new Date(Date.now() - RANGE_HOURS[range] * 3_600_000).toISOString();
      const s = await apiClient.getVCCStats({
        startTime: start, endTime: new Date().toISOString(),
        groupBy: range === '7D' ? 'day' : 'hour',
        ...(selectedCam !== 'ALL' ? { deviceIds: selectedCam } : {}),
      });
      setStats(s);
      // Populate the camera dropdown from the global (ALL) response's per-device breakdown.
      if (selectedCam === 'ALL' && Array.isArray(s.byDevice)) {
        const ids = s.byDevice.map((d: any) => d.deviceId).filter(Boolean);
        if (ids.length) setCamList(ids);
      }
    } catch { /* keep */ } finally { setLoading(false); }
  }, [range, selectedCam]);
  const loadRt = useCallback(async () => {
    try { setRt(await apiClient.getVCCRealtime(selectedCam !== 'ALL' ? { devicePrefix: selectedCam } : undefined)); } catch { /* */ }
  }, [selectedCam]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadRt(); const id = setInterval(loadRt, 5000); return () => clearInterval(id); }, [loadRt]);
  useEffect(() => { const id = setInterval(loadStats, 12000); return () => clearInterval(id); }, [loadStats]);

  // ── derived ───────────────────────────────────────────────────────────────
  const total = stats?.totalDetections ?? 0;
  const byType = stats?.byVehicleType ?? {};
  const sumTypes = Object.values(byType).reduce((s, n) => s + n, 0) || 1;
  const classes = useMemo(() => {
    const e = Object.entries(byType).filter(([, n]) => n > 0);
    e.sort((a, b) => { const ia = ORDER.indexOf(a[0]), ib = ORDER.indexOf(b[0]); return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || b[1] - a[1]; });
    const max = Math.max(1, ...e.map(([, n]) => n));
    return e.map(([type, n]) => ({ type, n, pct: Math.round((n / sumTypes) * 100), bar: (n / max) * 100, ...metaFor(type) }));
  }, [byType, sumTypes]);

  const conic = useMemo(() => {
    let acc = 0; const segs: string[] = [];
    classes.forEach(c => { const a = (c.n / sumTypes) * 100; segs.push(`${c.color} ${acc}% ${acc + a}%`); acc += a; });
    return segs.length ? `conic-gradient(${segs.join(',')})` : 'conic-gradient(#27272a 0% 100%)';
  }, [classes, sumTypes]);

  const trend = useMemo(() => {
    const bh = stats?.byHour ?? {};
    return Object.entries(bh).map(([h, n]) => ({ h: parseInt(h, 10), n: Number(n) || 0 }))
      .filter(d => !isNaN(d.h)).sort((a, b) => a.h - b.h);
  }, [stats]);
  const trendMax = Math.max(1, ...trend.map(d => d.n));

  const perMin = Math.round(rt?.perMinute ?? 0);
  const liveByType = rt?.byVehicleType ?? {};
  const liveClasses = ORDER.filter(t => (liveByType[t] ?? 0) > 0).map(t => ({ t, v: liveByType[t] ?? 0, ...metaFor(t) })).sort((a, b) => b.v - a.v);
  const liveMax = Math.max(1, ...liveClasses.map(c => c.v));
  const peakHourLabel = stats ? istHourLabel(stats.peakHour) : '—';
  const avgPerHour = Math.round(stats?.averagePerHour ?? 0);
  const topClass = classes[0];

  if (loading && !stats) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-amber-400">
          <Gauge className="w-12 h-12 animate-pulse" />
          <p className="text-sm text-zinc-400 tracking-wide">Loading traffic intelligence…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto scroll-on-hover">
        <div className="p-5 space-y-5">

          {/* Header — command center (amber / traffic). z-30 + overflow-visible so the camera
              dropdown escapes the card and isn't clipped/covered by the KPI row below. */}
          <div className="rounded-2xl border border-white/10 relative bg-card z-30">
            <div className="absolute inset-0 rounded-2xl overflow-hidden opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#f59e0b 0 1px,transparent 1px 14px)' }} />
            <div className="relative px-5 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <Car className="w-5 h-5 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold text-amber-300/80 uppercase tracking-[0.2em]">IRIS Command Center · {selectedCam === 'ALL' ? 'All Cameras' : selectedCam}</p>
                  <h1 className="text-sm font-bold text-white tracking-tight truncate">Vehicle Classification</h1>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300/90">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" /></span>
                  Live
                </div>
                {/* Camera selector — pick a single camera or All */}
                <div className="relative">
                  <button onClick={() => setCamOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-zinc-900/80 border border-amber-500/30 text-amber-200 hover:border-amber-500/60 transition-all">
                    <Car className="w-3 h-3" />
                    <span className="max-w-[120px] truncate">{selectedCam === 'ALL' ? 'All Cameras' : selectedCam}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${camOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {camOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setCamOpen(false)} />
                      <div className="absolute right-0 mt-1.5 z-50 min-w-[170px] rounded-lg bg-zinc-900 border border-amber-500/30 shadow-xl shadow-black/60 py-1 max-h-72 overflow-y-auto">
                        {['ALL', ...camList].map(cam => (
                          <button key={cam} onClick={() => { setSelectedCam(cam); setCamOpen(false); }}
                            className={`w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 transition-colors ${selectedCam === cam ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-300 hover:bg-zinc-800'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selectedCam === cam ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                            {cam === 'ALL' ? 'All Cameras' : cam}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-1 bg-zinc-900/80 border border-amber-500/20 rounded-lg p-0.5">
                  {(['1H', '24H', '7D'] as TimeRange[]).map(r => (
                    <button key={r} onClick={() => setRange(r)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${range === r ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Kpi label="Vehicles" value={total.toLocaleString()} sub={range === '24H' ? 'classified today' : `last ${range}`} icon={<Car className="w-5 h-5" />} gradient="from-amber-500/20 to-amber-500/5" border="border-amber-500/30" glow="rgba(245,158,11,0.18)" text="text-amber-200" />
            <Kpi label="Per Minute" value={perMin.toString()} sub="last 5 min · live" icon={<Radio className="w-5 h-5" />} gradient="from-emerald-500/20 to-emerald-500/5" border="border-emerald-500/30" glow="rgba(16,185,129,0.15)" text="text-emerald-300" />
            <Kpi label="Peak Hour" value={peakHourLabel} sub="busiest interval" icon={<Clock className="w-5 h-5" />} gradient="from-amber-500/20 to-amber-500/5" border="border-amber-500/30" glow="rgba(245,158,11,0.15)" text="text-amber-300" />
            <Kpi label="Avg / Hour" value={avgPerHour.toLocaleString()} sub="across the window" icon={<TrendingUp className="w-5 h-5" />} gradient="from-violet-500/20 to-violet-500/5" border="border-violet-500/30" glow="rgba(168,85,247,0.15)" text="text-violet-300" />
          </div>

          {/* Trend + Class split */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Traffic trend */}
            <div className="xl:col-span-2 rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10"><TrendingUp className="w-4 h-4 text-amber-300" /></div>
                  <div><p className="text-sm font-semibold text-zinc-100">Traffic Trend · {selectedCam === 'ALL' ? 'All Cameras' : selectedCam}</p><p className="text-[10px] text-zinc-500">Vehicles per {range === '7D' ? 'day' : 'hour'}</p></div>
                </div>
                <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded-full px-2.5 py-1 font-mono">{range}</span>
              </div>
              <div className="p-4">
                {trend.length > 0 ? (() => {
                  const n = trend.length;
                  const px = (i: number) => n <= 1 ? 50 : (i / (n - 1)) * 100;
                  const py = (v: number) => 2 + (1 - v / trendMax) * 96;
                  const pts = trend.map((d, i) => [px(i), py(d.n)] as [number, number]);
                  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
                  const area = `${line} L${pts[n - 1][0].toFixed(2)},100 L${pts[0][0].toFixed(2)},100 Z`;
                  const step = Math.max(1, Math.ceil(n / 7));
                  return (
                    <div className="relative" style={{ height: 200 }}>
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                        <defs><linearGradient id="vccGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient></defs>
                        {[0, 0.5, 1].map(f => <line key={f} x1="0" y1={2 + f * 96} x2="100" y2={2 + f * 96} stroke="rgba(255,255,255,0.05)" strokeWidth="0.3" />)}
                        <path d={area} fill="url(#vccGrad)" />
                        <path d={line} fill="none" stroke="#f59e0b" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                      <span className="absolute top-0 left-1 text-[9px] text-zinc-500 tabular-nums">{trendMax}</span>
                      <div className="absolute bottom-0 inset-x-0 flex justify-between px-1 text-[9px] text-zinc-600 tabular-nums">
                        {trend.map((d, i) => (i % step === 0 || i === n - 1) ? <span key={i}>{range === '7D' ? `D${d.h}` : istHourLabel(d.h)}</span> : null)}
                      </div>
                    </div>
                  );
                })() : <div className="h-[200px] flex items-center justify-center text-sm text-zinc-600">Collecting traffic…</div>}
              </div>
            </div>

            {/* Class split — donut + legend */}
            <div className="rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm overflow-hidden flex flex-col">
              <div className="px-4 pt-3 pb-2 border-b border-white/5 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10"><Gauge className="w-3.5 h-3.5 text-amber-300" /></div>
                <p className="text-xs font-semibold text-zinc-200">Class Split · {range}</p>
              </div>
              <div className="p-4 flex-1 flex flex-col items-center justify-center gap-4">
                <div className="relative w-32 h-32 rounded-full shrink-0" style={{ background: conic }}>
                  <div className="absolute inset-[16px] rounded-full bg-zinc-900 grid place-items-center">
                    <div className="text-center"><div className="text-lg font-black tabular-nums">{total.toLocaleString()}</div><div className="text-[9px] text-zinc-500 uppercase tracking-wider">vehicles</div></div>
                  </div>
                </div>
                <div className="w-full space-y-1.5">
                  {classes.map(c => (
                    <div key={c.type} className="flex items-center gap-2 text-[11px]">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
                      <span className="text-zinc-400 flex-1 truncate">{c.label}</span>
                      <span className="text-zinc-200 font-semibold tabular-nums">{c.n.toLocaleString()}</span>
                      <span className="text-zinc-600 tabular-nums w-8 text-right">{c.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle Mix — ranked bars */}
          <div className="rounded-2xl border border-amber-500/15 bg-zinc-900/60 backdrop-blur-sm overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10"><Car className="w-4 h-4 text-amber-300" /></div>
                <p className="text-sm font-semibold text-zinc-100">Vehicle Mix</p>
              </div>
              {topClass && <span className="text-[10px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1 font-bold">Top: {topClass.label} · {topClass.pct}%</span>}
            </div>
            <div className="p-5 space-y-3">
              {classes.map(c => {
                const Icon = c.icon;
                return (
                  <div key={c.type} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: `${c.color}1f`, color: c.color }}><Icon className="w-4 h-4" /></div>
                    <div className="w-24 shrink-0"><div className="text-sm font-semibold leading-tight">{c.label}</div><div className="text-[10px] text-zinc-500">{c.type}</div></div>
                    <div className="flex-1 h-3 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.bar}%`, background: c.color, boxShadow: `0 0 12px ${c.color}66` }} /></div>
                    <div className="w-24 text-right shrink-0"><span className="text-base font-black tabular-nums">{c.n.toLocaleString()}</span><span className="text-[11px] text-zinc-500 ml-1.5">{c.pct}%</span></div>
                  </div>
                );
              })}
              {classes.length === 0 && <div className="text-sm text-zinc-600 py-6 text-center">No vehicles classified yet.</div>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right sidebar: Live Traffic ──────────────────────────────────────── */}
      <div className="w-[280px] shrink-0 border-l border-white/5 bg-zinc-900/50 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/10"><Radio className="w-3.5 h-3.5 text-emerald-400" /></div>
            <div><p className="text-sm font-semibold text-zinc-100">Live Traffic</p><p className="text-[10px] text-zinc-500">Last 5 minutes</p></div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
            <div className="text-3xl font-black tabular-nums text-emerald-300">{perMin}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">vehicles / min</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scroll-on-hover p-3 space-y-2">
          {liveClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-700">
              <Car className="w-8 h-8 opacity-30" />
              <p className="text-sm text-zinc-500">No vehicles in the last 5 min</p>
            </div>
          ) : liveClasses.map(c => {
            const Icon = c.icon;
            return (
              <div key={c.t} className="rounded-xl border bg-zinc-800/30 p-2.5" style={{ borderColor: `${c.color}33` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="w-7 h-7 rounded-md grid place-items-center" style={{ background: `${c.color}1f`, color: c.color }}><Icon className="w-3.5 h-3.5" /></span>
                    {c.label}
                  </span>
                  <span className="text-lg font-black tabular-nums" style={{ color: c.color }}>{c.v}</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.v / liveMax) * 100}%`, background: c.color }} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon, gradient, border, glow, text }: { label: string; value: string; sub: string; icon: React.ReactNode; gradient: string; border: string; glow: string; text: string }) {
  return (
    <div className={`relative rounded-2xl border ${border} bg-gradient-to-b ${gradient} p-4 overflow-hidden`} style={{ boxShadow: `0 0 24px ${glow}` }}>
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 0,transparent 50%),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '24px 24px' }} />
      <div className="relative">
        <div className={`flex items-center gap-1.5 mb-3 ${text} opacity-80`}>{icon}<span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span></div>
        <p className={`text-3xl font-black tracking-tight tabular-nums ${text}`}>{value}</p>
        <p className="text-[10px] text-zinc-600 mt-1 font-medium">{sub}</p>
      </div>
    </div>
  );
}

export default VCCDashboard;
