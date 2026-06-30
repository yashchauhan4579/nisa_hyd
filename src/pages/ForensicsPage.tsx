import { useState, useEffect, useRef, useCallback } from 'react';
import { VideoList } from '../components/forensics/VideoList';
import { MainDisplay } from '../components/forensics/MainDisplay';
import { InsightsSidebar, type Insight } from '../components/forensics/InsightsSidebar';
import { Timeline } from '../components/forensics/Timeline';
import { StoryReel } from '../components/forensics/StoryReel';
import { SituationPanel } from '../components/forensics/SituationPanel';
import { FORENSICS_API, forensicsWsUrl } from '../components/forensics/api';
import { cacheGet, cacheSet } from '@/lib/persistentCache';

// Sentinel "video" that selects the merged, all-cameras Story Mode (newest-first reel + AI brief).
const STORY_SENTINEL = '★ Story Book';

// Persisted-cache keys — the sources list, source thumbnails and the merged
// story reel repaint INSTANTLY from the last session (localStorage), then
// revalidate in the background, so re-opening Observe is never a blank panel.
const CK_VIDEOS = 'observe:videos';
const CK_THUMBS = 'observe:camthumbs';
const CK_STORY = 'observe:story';

// IRIS Observer — frame-by-frame crowd AI analysis. Single-camera view (Timeline + insights)
// plus a merged Story Mode across all cameras (StoryReel + SituationPanel).
export function ForensicsPage() {
  const [videos, setVideos] = useState<string[]>(() => cacheGet<string[]>(CK_VIDEOS)?.data ?? []);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [status, setStatus] = useState('idle');
  const [streamImage, setStreamImage] = useState<string | null>(null);
  const [currentInsight, setCurrentInsight] = useState<Insight | null>(null);
  const [history, setHistory] = useState<Insight[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedHistoricalFrame, setSelectedHistoricalFrame] = useState<{ url: string; id: number } | null>(null);
  // Seed the reel from the last-saved story (localStorage) so re-opening paints
  // instantly, then the poll below revalidates in the background.
  const [storyItems, setStoryItems] = useState<Insight[]>(() => cacheGet<Insight[]>(CK_STORY)?.data ?? []);
  const [storyPage, setStoryPage] = useState(0);
  const [camThumbs, setCamThumbs] = useState<Record<string, string>>(() => cacheGet<Record<string, string>>(CK_THUMBS)?.data ?? {});
  // Severity filters — show only high-density and/or high-risk moments.
  const [fltDensity, setFltDensity] = useState(false);
  const [fltRisk, setFltRisk] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const histRef = useRef<{ url: string; id: number } | null>(null);
  histRef.current = selectedHistoricalFrame;

  const isStory = selectedVideo === STORY_SENTINEL;

  // Filtered views of the reel/timeline data.
  const HIGH_DENSITY = ['high', 'extreme', 'critical'];
  const HIGH_RISK = ['high', 'critical'];
  const passesFilters = (i: Insight) => {
    if (!fltDensity && !fltRisk) return true;
    const dens = (i.density || '').toLowerCase();
    const risk = (i.safety_risk || '').toLowerCase();
    return (fltDensity && HIGH_DENSITY.includes(dens)) || (fltRisk && HIGH_RISK.includes(risk));
  };
  const filteredStory = storyItems.filter(passesFilters);
  const filteredHistory = history.filter(passesFilters);

  const FilterBar = ({ total, shown }: { total: number; shown: number }) => (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60 bg-card/60 backdrop-blur-sm shrink-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filter</span>
      <button
        onClick={() => { setFltDensity(v => !v); setStoryPage(0); }}
        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${fltDensity ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'text-muted-foreground border-border hover:border-amber-500/40'}`}>
        High density
      </button>
      <button
        onClick={() => { setFltRisk(v => !v); setStoryPage(0); }}
        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${fltRisk ? 'bg-red-500/15 text-red-300 border-red-500/50' : 'text-muted-foreground border-border hover:border-red-500/40'}`}>
        High risk
      </button>
      {(fltDensity || fltRisk) && (
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{shown} of {total} moments</span>
      )}
    </div>
  );

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch(`${FORENSICS_API}/videos`);
      if (res.ok) { const v = (await res.json()).videos || []; setVideos(v); cacheSet(CK_VIDEOS, v); }
    } catch { /* sidecar offline — keep last cached sources */ }
  }, []);

  useEffect(() => {
    fetchVideos();
    return () => { wsRef.current?.close(); };
  }, [fetchVideos]);

  // Sources-panel thumbnails: latest analyzed frame per camera, refreshed every
  // 30 s. Uses the tiny /latest_frames endpoint (~400 B) instead of dragging the
  // whole merged feed (was ~7 MB) just to find each camera's newest frame id.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${FORENSICS_API}/latest_frames`);
        if (!r.ok || !alive) return;
        const d = await r.json();
        const t: Record<string, string> = {};
        for (const c of (d.cameras || []) as Array<{ camera: string; frame_id: number | null }>) {
          if (c.camera && typeof c.frame_id === 'number') {
            t[c.camera] = `${FORENSICS_API}/processed_frame/${encodeURIComponent(c.camera)}/${c.frame_id}`;
          }
        }
        if (alive) { setCamThumbs(t); cacheSet(CK_THUMBS, t); }
      } catch { /* sidecar offline — rows fall back to icon tiles */ }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Story Mode — poll the merged all-cameras feed for a live, newest-first reel.
  // Bounded to the newest 300 moments + slimmed fields (~150 KB, was ~7 MB and
  // growing all day); polled every 10 s and persisted so re-open is instant.
  useEffect(() => {
    if (!isStory) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${FORENSICS_API}/insights_all?limit=300&fields=summary`);
        if (r.ok && alive) {
          const d = await r.json();
          const items = (d.insights || []) as Insight[];
          setStoryItems(items);
          cacheSet(CK_STORY, items);
        }
      } catch { /* keep last cached story reel */ }
    };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [isStory]);

  useEffect(() => {
    if (selectedVideo && !isStory && status === 'idle') {
      fetch(`${FORENSICS_API}/insights/${encodeURIComponent(selectedVideo)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.status === 'success') setHistory(d.insights || []); })
        .catch(() => {});
    }
  }, [selectedVideo, status, isStory]);

  const handleSelectVideo = (video: string) => {
    if (isStreaming) { wsRef.current?.close(); setIsStreaming(false); }
    setSelectedVideo(video);
    setStatus('idle');
    setStreamImage(null);
    setCurrentInsight(null);
    setHistory([]);
    setSelectedHistoricalFrame(null);
    setStoryPage(0);
  };

  const handleFrameSelect = (frameId: number) => {
    if (!selectedVideo) return;
    setSelectedHistoricalFrame({ url: `${FORENSICS_API}/processed_frame/${encodeURIComponent(selectedVideo)}/${frameId}`, id: frameId });
    const fi = history.find((h) => h.frame_id === frameId);
    if (fi) setCurrentInsight(fi);
  };

  const startLiveAnalysis = () => {
    if (!selectedVideo || isStory) return;
    setIsStreaming(true);
    setStatus('processing');
    setSelectedHistoricalFrame(null);
    const ws = new WebSocket(forensicsWsUrl(selectedVideo));
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'frame') {
        if (!histRef.current) setStreamImage(data.image);
        if (data.insight && !data.insight.error) {
          setCurrentInsight(data.insight);
          setHistory((prev) => [...prev, data.insight]);
        }
      } else if (data.type === 'complete') {
        setIsStreaming(false); setStatus('completed'); ws.close();
      }
    };
    ws.onerror = () => { setIsStreaming(false); setStatus('failed'); };
    ws.onclose = () => setIsStreaming(false);
  };

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden">
      <div className="w-60 h-full shrink-0">
        <VideoList videos={[STORY_SENTINEL, ...videos]} onSelect={handleSelectVideo} selectedVideo={selectedVideo} thumbs={camThumbs} />
      </div>

      {isStory ? (
        <>
          <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0">
            <FilterBar total={storyItems.length} shown={filteredStory.length} />
            <div className="flex-1 overflow-y-auto min-w-0">
              <StoryReel items={filteredStory} page={storyPage} setPage={setStoryPage} />
            </div>
          </div>
          <div className="w-80 h-full shrink-0">
            <SituationPanel />
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0">
            {selectedVideo && <FilterBar total={history.length} shown={filteredHistory.length} />}
            <div className="flex-1 overflow-hidden flex">
              <MainDisplay
                selectedVideo={selectedVideo} status={status}
                onStartAnalysis={startLiveAnalysis} streamImage={streamImage}
                isStreaming={isStreaming} selectedHistoricalFrame={selectedHistoricalFrame}
                onCloseHistoricalFrame={() => setSelectedHistoricalFrame(null)}
              />
            </div>
            <div className="h-56 shrink-0">
              <Timeline data={filteredHistory} videoName={selectedVideo} onFrameSelect={handleFrameSelect} />
            </div>
          </div>
          <div className="w-80 h-full shrink-0">
            <InsightsSidebar currentInsight={currentInsight} history={history} />
          </div>
        </>
      )}
    </div>
  );
}

export default ForensicsPage;
