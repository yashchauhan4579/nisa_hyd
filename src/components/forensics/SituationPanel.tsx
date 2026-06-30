import React, { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, TrendingUp, Users, Activity } from 'lucide-react';
import { FORENSICS_API } from './api';
import { formatClock } from './format';
import { Sparkline } from './Sparkline';

// Aggregate, VLM-powered "Situation Overview" — shown on the right in Story Mode.
// Deliberately shows NEW info vs the per-frame story reel: an AI brief, live totals,
// trend, per-camera comparison, risk mix, and deduped alerts.

interface CamAgg { count: number; density: string; risk: string; mood: string; movement: string; ts: string; frames: number; last_id: number; summary: string }
interface Overview {
  total_moments: number; live_total: number; per_cam: Record<string, CamAgg>;
  peak: { count: number; ts: string | null; camera: string | null };
  trend: { ts: string; count: number; camera: string }[];
  risk_dist: Record<string, number>; mood_dist: Record<string, number>;
  recent_alerts: { ts: string; camera: string; text: string }[]; total_alerts: number;
  busiest: string | null; cameras: string[];
}

const RISK_COLOR: Record<string, string> = { none: 'bg-zinc-600', low: 'bg-emerald-500', medium: 'bg-yellow-500', high: 'bg-orange-500', critical: 'bg-red-600' };
const riskText = (r?: string) => ({ none: 'text-zinc-400', low: 'text-emerald-500', medium: 'text-yellow-500', high: 'text-orange-500', extreme: 'text-red-600', critical: 'text-red-700' } as Record<string, string>)[(r || '').toLowerCase()] || 'text-muted-foreground';
const densText = (d?: string) => ({ low: 'text-emerald-500', medium: 'text-yellow-500', high: 'text-orange-500', extreme: 'text-red-600', critical: 'text-red-700' } as Record<string, string>)[(d || '').toLowerCase()] || 'text-muted-foreground';

const cleanBrief = (t: string) => t.replace(/^\s*\*\*[^*]+\*\*\s*/, '').trim();

export const SituationPanel: React.FC = () => {
  const [ov, setOv] = useState<Overview | null>(null);
  const [brief, setBrief] = useState<string>('');
  const [briefAge, setBriefAge] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const loadOv = async () => {
      try { const r = await fetch(`${FORENSICS_API}/overview`); if (r.ok && alive) setOv(await r.json()); } catch { /* */ }
    };
    const loadBrief = async () => {
      try { const r = await fetch(`${FORENSICS_API}/brief`); if (r.ok && alive) { const d = await r.json(); setBrief(d.brief || ''); setBriefAge(d.age || 0); } } catch { /* */ }
    };
    loadOv(); loadBrief();
    const a = setInterval(loadOv, 6000);
    const b = setInterval(loadBrief, 30000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, []);

  const cams = ov ? Object.entries(ov.per_cam) : [];
  const maxCamCount = Math.max(1, ...cams.map(([, c]) => c.count));
  const riskTotal = ov ? Object.values(ov.risk_dist).reduce((a, b) => a + b, 0) || 1 : 1;
  const riskOrder = ['none', 'low', 'medium', 'high', 'critical'];
  const topMood = ov ? (Object.entries(ov.mood_dist).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral') : 'neutral';

  return (
    <div className="h-full border-l rounded-none bg-card flex flex-col">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-[0.18em] text-muted-foreground font-medium">Situation Overview</h2>
        <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-5 space-y-4">
        {/* AI Situation Brief — the star */}
        <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">AI Situation Brief</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{brief ? `updated ${briefAge}s ago` : '…'}</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">{brief ? cleanBrief(brief) : 'Synthesizing the scene across both cameras…'}</p>
          <div className="mt-2 text-[10px] text-muted-foreground/60">Qwen2.5-VL · synthesized from the last 16 moments</div>
        </div>

        {/* Live people + peak */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><Users className="h-3 w-3" /> People now</div>
            <div className="text-3xl font-bold tabular-nums mt-1">{ov?.live_total ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground">across {ov?.cameras.length ?? 0} cameras</div>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><TrendingUp className="h-3 w-3" /> Peak today</div>
            <div className="text-3xl font-bold tabular-nums mt-1">{ov?.peak.count ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground">{ov?.peak.ts ? `${ov.peak.camera} · ${formatClock(ov.peak.ts)}` : ''}</div>
          </div>
        </div>

        {/* Crowd trend */}
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Crowd trend</span>
            <span className="text-[10px] text-muted-foreground">last {ov?.trend.length ?? 0} moments</span>
          </div>
          <div className="text-amber-500"><Sparkline data={(ov?.trend || []).map((t) => t.count)} height={44} /></div>
        </div>

        {/* Per-camera comparison */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">Per-camera now</div>
          {cams.map(([cam, c]) => (
            <div key={cam} className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{cam}</span>
                <span className="tabular-nums"><b>{c.count}</b> <span className="text-[10px] text-muted-foreground">ppl</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${(c.count / maxCamCount) * 100}%` }} />
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                <span className={densText(c.density)}>{c.density} density</span>
                <span className="text-muted-foreground">·</span>
                <span className={riskText(c.risk)}>{c.risk} risk</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground capitalize">{c.movement}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Risk mix */}
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Risk mix today</span>
            <span className="text-[10px] text-muted-foreground capitalize">mood: {topMood}</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex">
            {riskOrder.map((r) => {
              const v = ov?.risk_dist[r] || 0; if (!v) return null;
              return <div key={r} className={RISK_COLOR[r]} style={{ width: `${(v / riskTotal) * 100}%` }} title={`${r}: ${v}`} />;
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground">
            {riskOrder.filter((r) => ov?.risk_dist[r]).map((r) => (
              <span key={r} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${RISK_COLOR[r]}`} />{r} {ov?.risk_dist[r]}</span>
            ))}
          </div>
        </div>

        {/* Active alerts (deduped) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Active alerts</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{ov?.total_alerts ?? 0} today</span>
          </div>
          {ov && ov.recent_alerts.length > 0 ? (
            ov.recent_alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-2 bg-red-900/20 border border-red-900/40 rounded-lg px-2.5 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs text-red-300 leading-snug">{a.text}</div>
                  <div className="text-[10px] text-muted-foreground/70">{a.camera} · {formatClock(a.ts)}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-900/40 text-emerald-400 rounded-lg px-2.5 py-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" /> All clear — no recent anomalies
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SituationPanel;
