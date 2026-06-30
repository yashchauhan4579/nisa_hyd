import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Circle, Dot, Download, Play, Square, Video } from 'lucide-react';
import { VmsExplorerSidebar } from './VmsExplorerSidebar';
import { useVmsCameras, hlsUrl } from './useVmsCameras';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const localISO = (offsetMs = 0) => {
  const d = new Date(Date.now() - offsetMs);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// MagicBox-style Recordings / Playback. Camera selector + time window + HLS
// player, with a client-side record-to-file (the server recording API isn't
// part of this deployment, so playback uses the camera's available stream).
export function VmsPlayback() {
  const { cameras, loading } = useVmsCameras();
  const [selectedGroup, setSelectedGroup] = useState('All cameras');
  const [cameraId, setCameraId] = useState('');
  const [start, setStart] = useState(() => localISO(3600_000));
  const [end, setEnd] = useState(() => localISO(0));
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const camera = cameras.find((c) => c.id === cameraId);

  useEffect(() => {
    if (!cameras.length || cameraId) return;
    setCameraId(cameras[0].id);
  }, [cameras, cameraId]);

  // attach HLS when a camera is loaded for playback
  const load = () => {
    const video = videoRef.current;
    if (!video || !cameraId) return;
    setPlaying(true);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    const src = hlsUrl(cameraId);
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src; video.play().catch(() => {});
    }
  };

  useEffect(() => () => { hlsRef.current?.destroy(); if (recTimer.current) clearInterval(recTimer.current); }, []);

  const startRec = () => {
    const video = videoRef.current as (HTMLVideoElement & { captureStream?: () => MediaStream }) | null;
    if (!video?.captureStream) return;
    const stream = video.captureStream();
    const mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${camera?.name || 'clip'}-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };
    mr.start();
    recRef.current = mr;
    setRecording(true);
    setRecSecs(0);
    recTimer.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
  };
  const stopRec = () => {
    recRef.current?.stop();
    if (recTimer.current) clearInterval(recTimer.current);
    setRecording(false);
  };

  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="flex h-full w-full flex-1 flex-col gap-4 p-4 text-foreground lg:flex-row">
      <VmsExplorerSidebar
        title="Recordings"
        description="Pick a camera to play back"
        cameras={cameras}
        selectedGroup={selectedGroup}
        onSelectedGroupChange={setSelectedGroup}
        onCameraClick={(id) => { setCameraId(id); setPlaying(false); }}
      />

      <section className="flex flex-1 flex-col">
        <Card className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm">
          {/* controls */}
          <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Camera</label>
              <div className="mt-1 text-sm font-semibold">{camera?.name || (loading ? 'Loading…' : 'Select a camera')}</div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">From</label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                className="mt-1 block rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">To</label>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                className="mt-1 block rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary" />
            </div>
            <Button onClick={load} disabled={!cameraId} className="gap-2">
              <Play className="h-4 w-4" /> Load playback
            </Button>
            {playing && (
              recording ? (
                <Button variant="secondary" onClick={stopRec}
                  className="gap-2 border border-red-900/50 bg-red-950/40 text-red-400 hover:bg-red-950/60">
                  <Square className="h-4 w-4" /> Stop · {mmss(recSecs)}
                </Button>
              ) : (
                <Button variant="secondary" onClick={startRec} className="gap-2 border border-border">
                  <Download className="h-4 w-4" /> Record clip
                </Button>
              )
            )}
          </div>

          {/* player */}
          <div className="relative flex-1 p-3">
            <div className="relative flex h-full items-center justify-center overflow-hidden rounded-xl border border-border bg-black">
              <video ref={videoRef} className={cn('h-full w-full object-contain', !playing && 'hidden')} controls muted playsInline />
              {!playing && (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Video className="h-9 w-9 opacity-40" />
                  <span className="text-xs uppercase tracking-widest">Select a camera and load playback</span>
                </div>
              )}
              {playing && (
                <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur">
                  {recording
                    ? <><Circle className="h-2.5 w-2.5 animate-pulse fill-red-500 text-red-500" /> REC</>
                    : <><Dot className="h-4 w-4 text-emerald-400" /> {camera?.name}</>}
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Playback window {start.replace('T', ' ')} → {end.replace('T', ' ')}. Server-side recording isn’t enabled in this deployment, so playback streams the camera’s available feed; “Record clip” captures it to a local file.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}

export default VmsPlayback;
