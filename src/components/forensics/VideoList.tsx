import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SmoothImg } from '@/components/ui/smooth-img';
import { PlayCircle, Sparkles, Star, Film } from 'lucide-react';

// Forensics video source list (ported from irisv3, themed by IRIS tokens).
// Each camera renders as a card with its latest analyzed frame so the operator
// can see WHICH camera they're selecting.
interface VideoListProps {
  videos: string[];
  onSelect: (video: string) => void;
  selectedVideo: string | null;
  /** camera name → latest processed_frame URL (optional; rows degrade to icon tiles) */
  thumbs?: Record<string, string>;
}

// Neutral tile when a frame was pruned/rolled over (same pattern as StoryReel).
const FRAME_UNAVAILABLE_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#0b0f14"/><g fill="none" stroke="#3a4654" stroke-width="2"><circle cx="160" cy="82" r="22"/><path d="M150 82h20M160 72v20"/></g><text x="160" y="140" fill="#566372" font-family="sans-serif" font-size="12" text-anchor="middle">frame unavailable</text></svg>'
);

export const VideoList: React.FC<VideoListProps> = ({ videos, onSelect, selectedVideo, thumbs }) => {
  const camCount = videos.filter((v) => !v.startsWith('★')).length;
  return (
    <Card className="h-full border-r rounded-none bg-card flex flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 flex-1 overflow-y-auto">
        {videos.map((video) => {
          const isSentinel = video.startsWith('★');
          const active = selectedVideo === video;
          const thumb = !isSentinel ? thumbs?.[video] : undefined;
          return (
            <button
              key={video}
              onClick={() => onSelect(video)}
              className={`w-full text-left rounded-xl overflow-hidden border transition-all ${
                active
                  ? 'border-amber-500/70 ring-2 ring-amber-500/25 bg-amber-500/10'
                  : 'border-border/60 hover:border-amber-500/40 bg-background/40'
              }`}
            >
              <div className="aspect-video bg-zinc-950 relative grid place-items-center">
                {isSentinel ? (
                  <>
                    <Film className="w-7 h-7 text-amber-400/70" />
                    <Star className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-amber-400" />
                  </>
                ) : thumb ? (
                  <SmoothImg
                    src={thumb}
                    alt={video}
                    containerClassName="absolute inset-0 w-full h-full"
                    className="w-full h-full object-cover"
                    onError={(e) => { const el = e.currentTarget; el.onerror = null; el.src = FRAME_UNAVAILABLE_SVG; }}
                  />
                ) : (
                  <PlayCircle className="w-6 h-6 text-zinc-700" />
                )}
                {!isSentinel && (
                  <span className="absolute bottom-1 right-1.5 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-black/60 text-amber-300/90">live</span>
                )}
              </div>
              <div className={`px-2.5 py-1.5 text-xs font-medium truncate ${active ? 'text-amber-300' : 'text-foreground/80'}`}>
                {video}
              </div>
            </button>
          );
        })}
        {videos.length === 0 && <div className="text-sm text-muted-foreground px-2">No videos found</div>}
      </CardContent>

      {/* Footer — fills the empty space with what this view does + a legend. */}
      <div className="shrink-0 border-t border-border/60 p-4 space-y-3">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-300">AI Frame Analysis</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Per-frame crowd, motion, mood and safety-risk read by the vision model — continuous,
            never &ldquo;complete&rdquo;.
          </p>
        </div>
        <div className="space-y-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <Star className="h-3 w-3 shrink-0 text-amber-400/80" />
            <span><span className="text-foreground/80 font-medium">Story Book</span> — merged timeline across all cameras</span>
          </div>
          <div className="flex items-center gap-2">
            <Film className="h-3 w-3 shrink-0" />
            <span><span className="text-foreground/80 font-medium tabular-nums">{camCount}</span> camera{camCount === 1 ? '' : 's'} analyzing live</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
