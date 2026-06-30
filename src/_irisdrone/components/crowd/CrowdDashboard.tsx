import { useState, useEffect, useMemo } from 'react';
import { apiClient, type CrowdAnalysis } from '@irisdrone/lib/api';
import { Users, AlertTriangle, Radio } from 'lucide-react';
import { useCrowdDashboard } from '@irisdrone/contexts/CrowdDashboardContext';
import { cn } from '@irisdrone/lib/utils';

/* ── Condition helpers ── */
const COND = {
  Clear:    { bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/20', dim: 'bg-emerald-500/10' },
  Low:      { bg: 'bg-lime-500',    text: 'text-lime-400',    border: 'border-lime-500/20',    dim: 'bg-lime-500/10' },
  Medium:   { bg: 'bg-yellow-500',  text: 'text-yellow-400',  border: 'border-yellow-500/20',  dim: 'bg-yellow-500/10' },
  High:     { bg: 'bg-orange-500',  text: 'text-orange-400',  border: 'border-orange-500/20',  dim: 'bg-orange-500/10' },
  Critical: { bg: 'bg-red-500',     text: 'text-red-400',     border: 'border-red-500/20',     dim: 'bg-red-500/10' },
};
function condStyle(level: number) {
  if (level >= 80) return COND.Critical;
  if (level >= 60) return COND.High;
  if (level >= 40) return COND.Medium;
  if (level >= 20) return COND.Low;
  return COND.Clear;
}
function condLabel(level: number) {
  if (level >= 80) return 'Critical';
  if (level >= 60) return 'High';
  if (level >= 40) return 'Medium';
  if (level >= 20) return 'Low';
  return 'Clear';
}

export function CrowdDashboard() {
  const [analyses, setAnalyses] = useState<CrowdAnalysis[]>([]);
  const [, setLoading] = useState(true);
  const [activeCamId, setActiveCamId] = useState<string | null>(null);
  const { autoRefresh } = useCrowdDashboard();

  const fetchAnalyses = async () => {
    try {
      const data = await apiClient.getLatestCrowdAnalysis();
      setAnalyses(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalyses(); }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchAnalyses, 5000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  // Derived
  const hasData = analyses.length > 0;
  const activeAnalysis = useMemo(
    () => analyses.find(a => a.deviceId === activeCamId) || analyses[0] || null,
    [analyses, activeCamId]
  );
  const totalPeople = analyses.reduce((s, a) => s + (a.peopleCount ?? 0), 0);
  const avgLevel = hasData ? Math.round(analyses.reduce((s, a) => s + (a.crowdLevel ?? 0), 0) / analyses.length) : 0;
  const highAlerts = analyses.filter(a => (a.crowdLevel ?? 0) >= 60).length;
  const sortedByLevel = useMemo(
    () => [...analyses].sort((a, b) => (b.crowdLevel ?? 0) - (a.crowdLevel ?? 0)),
    [analyses]
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#0a0a0a]">
      {/* ── TOP HEADER BAR ── */}
      <div className="flex-shrink-0 h-11 bg-[#0e0e0e] border-b border-white/[0.06] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-2 h-2 rounded-full", hasData ? "bg-red-500 animate-pulse" : "bg-zinc-600")} />
          <span className="text-[10px] text-amber-400 font-black uppercase tracking-widest">Crowd Analysis</span>
          {hasData && (
            <div className="flex items-center gap-1.5 bg-white/[0.04] rounded-full px-2.5 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-[9px] text-zinc-400 tabular-nums">{analyses.length} <span className="text-zinc-600">live</span></span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium border",
            hasData
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-zinc-800 text-zinc-500 border-zinc-700"
          )}>
            <Radio className="w-3 h-3" />
            {hasData ? 'Monitoring' : 'Standby'}
          </span>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT SIDEBAR — camera thumbnails */}
        <div className="w-52 flex-shrink-0 bg-[#0b0b0b] border-r border-white/[0.06] overflow-y-auto hidden md:block">
          <div className="p-2 space-y-1.5">
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Cameras</span>
              <span className="text-[8px] text-zinc-700 tabular-nums">{hasData ? analyses.length : 0}</span>
            </div>
            {hasData ? analyses.map(a => {
              const isActive = a.deviceId === (activeAnalysis?.deviceId);
              const cond = condStyle(a.crowdLevel ?? 0);
              return (
                <button
                  key={a.id}
                  onClick={() => setActiveCamId(a.deviceId)}
                  className={cn(
                    "w-full rounded-lg overflow-hidden transition-all",
                    isActive ? "ring-2 ring-amber-500 ring-offset-1 ring-offset-[#0b0b0b]" : "ring-1 ring-white/[0.06] hover:ring-white/15"
                  )}
                >
                  <div className="relative w-full aspect-video bg-zinc-900">
                    {a.heatmapImageUrl || a.frameUrl ? (
                      <img src={a.heatmapImageUrl || a.frameUrl || undefined} alt={a.device?.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-zinc-700" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
                    <div className="absolute top-1.5 right-1.5">
                      <div className={cn("w-2 h-2 rounded-full shadow-lg", cond.bg)} />
                    </div>
                    <div className="absolute bottom-0 inset-x-0 px-2 pb-1.5">
                      <div className={cn("text-[9px] font-bold uppercase tracking-wider truncate", isActive ? "text-amber-400" : "text-white/70")}>
                        {a.device?.name || a.deviceId}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-white/60 font-bold tabular-nums">{a.peopleCount ?? 0}</span>
                        <span className={cn("text-[7px] font-black uppercase tracking-wider px-1 rounded text-white/90", cond.bg)}>
                          {condLabel(a.crowdLevel ?? 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            }) : (
              /* Placeholder thumbnails */
              [1, 2, 3, 4].map(i => (
                <div key={i} className="w-full rounded-lg overflow-hidden ring-1 ring-white/[0.06]">
                  <div className="relative w-full aspect-video bg-zinc-900/50 flex items-center justify-center">
                    <Users className="w-5 h-5 text-zinc-800" />
                    <div className="absolute bottom-0 inset-x-0 px-2 pb-1.5">
                      <div className="text-[9px] text-zinc-700 font-bold uppercase tracking-wider">Camera {i}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
          <div className="flex flex-col xl:flex-row flex-1 min-h-0">

            {/* ── MAIN VIDEO / HERO AREA ── */}
            <div className="flex-1 min-w-0 p-3 md:p-4">
              <div className="relative w-full h-full min-h-[300px] rounded-2xl overflow-hidden" style={{
                boxShadow: '0 0 40px rgba(99,102,241,0.08), inset 0 0 60px rgba(0,0,0,0.5)',
                border: '2px solid rgba(255,255,255,0.04)',
              }}>
                {activeAnalysis && (activeAnalysis.heatmapImageUrl || activeAnalysis.frameUrl) ? (
                  <img
                    src={activeAnalysis.heatmapImageUrl || activeAnalysis.frameUrl || undefined}
                    alt="Crowd feed"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Users className="w-8 h-8 text-zinc-700" />
                    </div>
                    <p className="text-xs text-zinc-600">Awaiting camera feed</p>
                  </div>
                )}
                {/* Scanlines */}
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)' }} />
                {/* Vignette */}
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)' }} />
                {/* Camera label */}
                <div className="absolute top-3 left-3 z-20 bg-black/70 backdrop-blur-sm border border-amber-500/30 px-2.5 py-1 flex items-center gap-2 rounded">
                  <div className={cn("w-1.5 h-1.5 rounded-full", hasData ? "bg-red-500 animate-pulse" : "bg-zinc-600")} />
                  <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">
                    {activeAnalysis?.device?.name || 'No Camera Selected'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── RIGHT ANALYSIS PANEL ── */}
            <div className="w-full xl:w-[300px] 2xl:w-[320px] flex-shrink-0 bg-[#0b0b0b] border-t xl:border-t-0 xl:border-l border-white/[0.06] overflow-y-auto">
              <div className="p-3 xl:p-4 space-y-3">

                {/* Hero: condition + count */}
                <div className="rounded-xl overflow-hidden">
                  {activeAnalysis ? (() => {
                    const c = condStyle(activeAnalysis.crowdLevel ?? 0);
                    return (
                      <>
                        <div className={cn(c.bg, "px-4 py-3 text-center")}>
                          <div className="text-xl font-black text-white uppercase tracking-wider">{condLabel(activeAnalysis.crowdLevel ?? 0)}</div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.06] border-t-0 rounded-b-xl px-4 py-4 text-center">
                          <div className="text-4xl font-black text-amber-400 leading-none">{activeAnalysis.peopleCount ?? 0}</div>
                          <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Persons Detected</div>
                        </div>
                      </>
                    );
                  })() : (
                    <>
                      <div className="bg-zinc-800 px-4 py-3 text-center">
                        <div className="text-xl font-black text-zinc-500 uppercase tracking-wider">--</div>
                      </div>
                      <div className="bg-white/[0.03] border border-white/[0.06] border-t-0 rounded-b-xl px-4 py-4 text-center">
                        <div className="text-4xl font-black text-zinc-700 leading-none">--</div>
                        <div className="text-[9px] text-zinc-700 font-bold uppercase tracking-widest mt-1">Persons Detected</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Congestion bar */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Congestion</span>
                    <span className="text-xl font-black text-zinc-100 tabular-nums">
                      {activeAnalysis?.congestionLevel ?? '--'}<span className="text-sm text-zinc-600">/10</span>
                    </span>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500",
                        (activeAnalysis?.congestionLevel ?? 0) <= 3 ? 'bg-emerald-500' :
                        (activeAnalysis?.congestionLevel ?? 0) <= 5 ? 'bg-yellow-500' :
                        (activeAnalysis?.congestionLevel ?? 0) <= 7 ? 'bg-orange-500' : 'bg-red-500'
                      )}
                      style={{ width: `${((activeAnalysis?.congestionLevel ?? 0) / 10) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="Density" value={activeAnalysis?.densityLevel || '--'} />
                  <MiniStat label="Movement" value={activeAnalysis?.movementType || '--'} />
                  <MiniStat label="Free Space" value={activeAnalysis?.freeSpace != null ? `${activeAnalysis.freeSpace.toFixed(0)}%` : '--'} />
                  <MiniStat label="Crowd Level" value={activeAnalysis ? `${activeAnalysis.crowdLevel ?? 0}%` : '--'} />
                </div>

                {/* Alerts */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Alerts</div>
                  {highAlerts > 0 ? sortedByLevel.filter(a => (a.crowdLevel ?? 0) >= 60).slice(0, 3).map(a => (
                    <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
                      <AlertTriangle className="w-3 h-3 text-orange-400 flex-shrink-0" />
                      <span className="text-[10px] text-zinc-300 truncate flex-1">{a.device?.name}</span>
                      <span className={cn("text-[9px] font-bold", condStyle(a.crowdLevel ?? 0).text)}>{a.crowdLevel}%</span>
                    </div>
                  )) : (
                    <div className="text-[10px] text-zinc-600 py-2">No active alerts</div>
                  )}
                </div>

                {/* Hotspots */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Hotspot Zones</div>
                  {hasData ? sortedByLevel.slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                      <span className="text-[10px] text-zinc-300 truncate flex-1 mr-2">{a.device?.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-12 bg-zinc-800 rounded-full h-1">
                          <div className={cn("h-1 rounded-full", condStyle(a.crowdLevel ?? 0).bg)} style={{ width: `${a.crowdLevel ?? 0}%` }} />
                        </div>
                        <span className="text-[9px] text-zinc-400 tabular-nums w-7 text-right">{a.crowdLevel ?? 0}%</span>
                      </div>
                    </div>
                  )) : (
                    ['Main Gate', 'Market Area', 'Bus Stand', 'Temple Road'].map(name => (
                      <div key={name} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                        <span className="text-[10px] text-zinc-700 truncate flex-1">{name}</span>
                        <span className="text-[9px] text-zinc-700">--</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── BOTTOM STAT CARDS ROW ── */}
          <div className="flex-shrink-0 bg-[#0b0b0b] border-t border-white/[0.06] px-3 py-2.5">
            <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
              <BottomStat label="Total" value={hasData ? String(totalPeople) : '--'} color="text-amber-400" />
              <BottomStat label="Avg Level" value={hasData ? `${avgLevel}%` : '--'} color="text-amber-400" />
              <BottomStat label="Cameras" value={hasData ? String(analyses.length) : '0'} color="text-emerald-400" />
              <BottomStat label="Alerts" value={String(highAlerts)} color="text-orange-400" />
              <BottomStat label="Density" value={activeAnalysis?.densityLevel || '--'} color="text-zinc-300" className="hidden md:block" />
              <BottomStat label="Movement" value={activeAnalysis?.movementType || '--'} color="text-zinc-300" className="hidden md:block" />
              <BottomStat label="Trend" value={hasData ? (avgLevel >= 50 ? 'Rising' : 'Stable') : '--'} color="text-zinc-300" className="hidden md:block" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 text-center">
      <div className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">{label}</div>
      <div className="text-sm font-black text-zinc-200 truncate">{value}</div>
    </div>
  );
}

function BottomStat({ label, value, color, className }: { label: string; value: string; color: string; className?: string }) {
  return (
    <div className={cn("bg-white/[0.03] border border-white/[0.06] rounded-lg p-2 text-center", className)}>
      <div className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest mb-0.5">{label}</div>
      <div className={cn("text-base font-black tabular-nums truncate", color)}>{value}</div>
    </div>
  );
}
