import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Camera, Maximize2, Minimize2, Play, Pause,
  Grid3X3, Grid2X2, Square, Trash2, RefreshCw,
} from 'lucide-react';
import { VmsExplorerSidebar, type VmsCamera } from './VmsExplorerSidebar';
import { HlsPlayer } from '@irisdrone/components/vms/HlsPlayer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// MediaMTX HLS endpoint (same convention as the rest of the platform).
const hlsUrl = (id: string) => {
  const base = (import.meta.env.VITE_MEDIAMTX_HLS_URL as string) ||
    `http://${window.location.hostname}:8888`;
  return `${base}/camera_${id}/index.m3u8`;
};

type GridLayout = '1x1' | '2x2' | '3x3' | '4x4';
const GRID_SIZE: Record<GridLayout, number> = { '1x1': 1, '2x2': 4, '3x3': 9, '4x4': 16 };
const GRID_CLASS: Record<GridLayout, string> = {
  '1x1': 'grid-cols-1 grid-rows-1',
  '2x2': 'grid-cols-2 grid-rows-2',
  '3x3': 'grid-cols-3 grid-rows-3',
  '4x4': 'grid-cols-4 grid-rows-4',
};

const token = () => localStorage.getItem('token') || localStorage.getItem('iris_token');

export function VmsLiveView() {
  const [cameras, setCameras] = useState<VmsCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [gridLayout, setGridLayout] = useState<GridLayout>('2x2');
  const [gridCells, setGridCells] = useState<string[]>(Array(4).fill(''));
  const [fullscreenCamera, setFullscreenCamera] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('All cameras');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/camera-health', {
        headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      });
      if (res.ok) {
        // Real backend returns {deviceId,name,...}; mock returns {id,cameraId,...} — normalize both.
        const data: Array<Record<string, string>> = await res.json();
        setCameras(data.map((c) => ({
          id: c.deviceId ?? c.id ?? c.cameraId ?? '',
          name: c.name ?? c.cameraId ?? c.deviceId ?? c.id ?? 'Camera',
          location: c.location ?? '',
          status: c.status ?? 'offline',
        })));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const gridSize = GRID_SIZE[gridLayout];

  const visibleSidebarCameras = useMemo(() => {
    if (selectedGroup === 'All cameras') return cameras;
    return cameras.filter((c) => (c.location?.trim() || 'Unassigned') === selectedGroup);
  }, [cameras, selectedGroup]);

  const handleLayoutChange = (layout: GridLayout) => {
    setGridLayout(layout);
    const size = GRID_SIZE[layout];
    setGridCells((prev) => {
      const next = prev.slice(0, size);
      while (next.length < size) next.push('');
      return next;
    });
  };

  const onDragStart = (e: React.DragEvent, id: string) => e.dataTransfer.setData('text/plain', id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDropToCell = (e: React.DragEvent, cell: number) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    setGridCells((prev) => {
      const next = [...prev];
      const existing = next.findIndex((c) => c === id);
      if (existing !== -1) next[existing] = '';
      next[cell] = id;
      return next;
    });
  };
  const onClickCamera = (id: string) => {
    const empty = gridCells.findIndex((c) => c === '');
    if (empty === -1) return;
    setGridCells((prev) => { const next = [...prev]; next[empty] = id; return next; });
  };
  const clearCell = (i: number) => setGridCells((prev) => { const next = [...prev]; next[i] = ''; return next; });
  const clearAll = () => setGridCells(Array(gridSize).fill(''));
  const hasActiveStreams = gridCells.some((c) => c !== '');

  // auto-fill the wall once cameras load and nothing is placed yet
  useEffect(() => {
    if (!loading && cameras.length && gridCells.every((c) => c === '')) {
      setGridCells((prev) => prev.map((_, i) => cameras[i]?.id ?? ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, cameras]);

  const renderCell = (cameraId: string, index: number) => {
    const camera = cameras.find((c) => c.id === cameraId);
    const isFs = fullscreenCamera === camera?.id;
    return (
      <div key={index} onDrop={(e) => onDropToCell(e, index)} onDragOver={onDragOver}
        className="group relative flex h-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
        {camera ? (
          <>
            {isPlaying ? (
              <HlsPlayer src={hlsUrl(camera.id)} className={cn('h-full w-full object-cover', isFs && 'fixed inset-0 z-50')} />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground"><Pause className="h-8 w-8 opacity-40" /></div>
            )}
            <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button variant="secondary" size="icon"
                className="h-8 w-8 rounded-lg border border-border bg-background/80 backdrop-blur"
                onClick={() => setFullscreenCamera(isFs ? null : camera.id)}>
                {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button variant="secondary" size="icon"
                className="h-8 w-8 rounded-lg border border-border bg-background/80 backdrop-blur"
                onClick={() => clearCell(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2 py-1 text-xs font-medium text-foreground backdrop-blur">
              <span className={cn('h-1.5 w-1.5 rounded-full', camera.status === 'online' ? 'bg-emerald-400' : 'bg-zinc-500')} />
              {camera.name}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8 opacity-40" />
            <span className="text-xs uppercase tracking-widest">Drag a camera here</span>
          </div>
        )}
      </div>
    );
  };

  const layoutBtn = (layout: GridLayout, icon: React.ReactNode, title: string) => (
    <Button variant={gridLayout === layout ? 'default' : 'ghost'} size="icon"
      className={cn('h-9 w-9', gridLayout !== layout && 'text-muted-foreground')}
      onClick={() => handleLayoutChange(layout)} title={title}>
      {icon}
    </Button>
  );

  return (
    <div className="flex h-full w-full flex-1 flex-col gap-4 p-4 text-foreground lg:flex-row">
      <VmsExplorerSidebar
        title="Live View Explorer"
        description="Drag cameras into the videowall"
        cameras={visibleSidebarCameras.length || selectedGroup !== 'All cameras' ? visibleSidebarCameras : cameras}
        selectedGroup={selectedGroup}
        onSelectedGroupChange={setSelectedGroup}
        onCameraClick={onClickCamera}
        onCameraDragStart={onDragStart}
        draggableCameras
      />

      <section className="flex flex-1 flex-col">
        <Card className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex-1 p-3">
            <div className={cn('grid h-full w-full gap-3', GRID_CLASS[gridLayout])}>
              {Array.from({ length: gridSize }).map((_, i) => renderCell(gridCells[i] || '', i))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2">
            <div>
              <h1 className="text-base font-semibold">Live videowall</h1>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {loading ? 'Loading…' : `${selectedGroup} · ${cameras.length} cameras`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={load} title="Refresh">
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
              {hasActiveStreams && (
                <Button variant="secondary" onClick={clearAll}
                  className="gap-2 border border-red-900/50 bg-red-950/40 text-red-400 hover:bg-red-950/60">
                  <Trash2 className="h-4 w-4" /> Clear all
                </Button>
              )}
              <Button variant="secondary" onClick={() => setIsPlaying(!isPlaying)} className="gap-2 border border-border">
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? 'Pause all' : 'Resume all'}
              </Button>
              <div className="flex items-center gap-1 rounded-xl border border-border bg-muted p-1">
                {layoutBtn('1x1', <Square className="h-4 w-4" />, '1 x 1')}
                {layoutBtn('2x2', <Grid2X2 className="h-4 w-4" />, '2 x 2')}
                {layoutBtn('3x3', <Grid3X3 className="h-4 w-4" />, '3 x 3')}
                <Button variant={gridLayout === '4x4' ? 'default' : 'ghost'}
                  className={cn('h-9 px-3 text-xs font-medium', gridLayout !== '4x4' && 'text-muted-foreground')}
                  onClick={() => handleLayoutChange('4x4')} title="4 x 4">4x4</Button>
              </div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

export default VmsLiveView;
