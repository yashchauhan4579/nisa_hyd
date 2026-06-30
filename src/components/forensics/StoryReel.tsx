import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SmoothImg } from '@/components/ui/smooth-img';
import { FORENSICS_API } from './api';
import { formatTs, tsMillis } from './format';
import type { Insight } from './InsightsSidebar';

const PAGE_SIZE = 50;

const densityColor = (d?: string) => ({
  low: 'text-emerald-500', medium: 'text-yellow-500', high: 'text-orange-500', extreme: 'text-red-600', critical: 'text-red-700',
} as Record<string, string>)[(d || '').toLowerCase()] || 'text-muted-foreground';

const riskColor = (r?: string) => ({
  none: 'text-emerald-500', low: 'text-emerald-500', medium: 'text-yellow-500', high: 'text-orange-500', extreme: 'text-red-600', critical: 'text-red-700',
} as Record<string, string>)[(r || '').toLowerCase()] || 'text-muted-foreground';

const camHue = (cam?: string) => {
  // stable-ish accent per camera name
  let h = 0; for (const c of cam || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

interface Props {
  items: Insight[];
  page: number;
  setPage: (p: number) => void;
}

// Vertical "Story Reel" — both cameras merged, newest first, 50 per page. Reads
// top-to-bottom as a continuing narration; each panel is one moment in the story.
export const StoryReel: React.FC<Props> = ({ items, page, setPage }) => {
  const sorted = useMemo(
    () => [...items].sort((a, b) => tsMillis(b.timestamp) - tsMillis(a.timestamp)),
    [items]
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages - 1);
  const start = curPage * PAGE_SIZE;
  const pageItems = sorted.slice(start, start + PAGE_SIZE);

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Gathering the story… frames will appear here as both cameras report in.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      {/* header / pager */}
      <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
        <div>
          <h2 className="text-lg font-semibold">All Cameras — Story</h2>
          <p className="text-xs text-muted-foreground">
            {sorted.length} moments · newest first · page {curPage + 1} of {totalPages}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled={curPage === 0} onClick={() => setPage(0)} title="Latest">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={curPage === 0} onClick={() => setPage(curPage - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Newer
          </Button>
          <span className="text-xs tabular-nums px-2 text-muted-foreground">{curPage + 1}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={curPage >= totalPages - 1} onClick={() => setPage(curPage + 1)}>
            Older <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* the reel */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl flex flex-col gap-6">
          {pageItems.map((it, idx) => {
            const hue = camHue(it.camera);
            const globalIdx = start + idx;
            const alerts = (it.alerts || []).filter((a) => a && a !== 'none');
            return (
              <article
                key={`${it.camera}-${it.frame_id}`}
                className="rounded-xl border bg-card overflow-hidden shadow-sm relative"
                style={{ borderLeft: `3px solid hsl(${hue} 70% 55%)` }}
              >
                {/* timeline node + index */}
                <div className="flex items-center justify-between px-4 pt-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `hsl(${hue} 70% 55% / 0.15)`, color: `hsl(${hue} 70% 45%)` }}
                    >
                      {it.camera || 'cam'}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatTs(it.timestamp)}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums">#{globalIdx + 1}</span>
                </div>

                <div className="px-4 pt-2">
                  <SmoothImg
                    src={`${FORENSICS_API}/processed_frame/${encodeURIComponent(it.camera || '')}/${it.frame_id}`}
                    alt={`${it.camera} ${formatTs(it.timestamp)}`}
                    containerClassName="w-full rounded-lg bg-black/30 min-h-[140px]"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Frame not on disk (e.g. transient rollover / pruned) — show a
                      // neutral tile instead of the browser's broken-image icon.
                      const el = e.currentTarget;
                      el.onerror = null;
                      el.src =
                        "data:image/svg+xml;utf8," +
                        encodeURIComponent(
                          '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#0b0f14"/><g fill="none" stroke="#3a4654" stroke-width="2"><circle cx="160" cy="82" r="22"/><path d="M150 82h20M160 72v20"/></g><text x="160" y="140" fill="#566372" font-family="sans-serif" font-size="12" text-anchor="middle">frame unavailable</text></svg>'
                        );
                    }}
                  />
                </div>

                {/* stat line */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 text-sm">
                  <span><b className="tabular-nums">{it.count}</b> <span className="text-muted-foreground">people</span></span>
                  <span className="text-muted-foreground">·</span>
                  <span className={densityColor(it.density)}>{it.density || 'low'} density</span>
                  <span className="text-muted-foreground">·</span>
                  <span className={it.movement === 'moving' ? 'text-amber-500' : 'text-muted-foreground'}>
                    {it.movement === 'moving' ? 'moving' : 'static'}
                  </span>
                  {it.safety_risk && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className={riskColor(it.safety_risk)}>{it.safety_risk} risk</span>
                    </>
                  )}
                  {it.crowd_mood && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{it.crowd_mood}</span>
                    </>
                  )}
                </div>

                {/* narration */}
                {(it.summary || it.behavior) && (
                  <p className="px-4 pt-2 pb-1 text-sm leading-relaxed text-foreground/90">
                    {it.summary || it.behavior}
                  </p>
                )}

                {/* alerts */}
                {alerts.length > 0 && (
                  <div className="px-4 pb-4 pt-1 flex flex-col gap-1.5">
                    {alerts.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-red-400 text-xs bg-red-900/20 border border-red-900/40 rounded px-2 py-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}
                {alerts.length === 0 && <div className="pb-4" />}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StoryReel;
