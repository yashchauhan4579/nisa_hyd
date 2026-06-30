import { useEffect, useState, useCallback } from 'react';
import { Search, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, Video } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/contexts/ThemeContext';
import { apiClient, type SearchCamera } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Manage which cameras/sources the CLIP search sidecar (:8200) runs inference on.
 * Lists configured cameras with live index status, and lets you add/remove them.
 * Added cameras persist (cameras.json) and re-index in the background.
 */
export function SearchCameraManager() {
  const { theme } = useTheme();
  const [cameras, setCameras] = useState<SearchCamera[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reachable, setReachable] = useState(true);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiClient.getSearchCameras();
      setCameras(res.cameras || []);
      setReachable(true);
    } catch {
      setReachable(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    // Poll so "indexing" → "ready" transitions show without a manual refresh.
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const add = async () => {
    if (!source.trim()) { setError('Stream URL or file path is required'); return; }
    setBusy(true); setError('');
    try {
      await apiClient.addSearchCamera({ name: name.trim() || source.trim(), source: source.trim() });
      setName(''); setSource('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add camera');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true); setError('');
    try {
      await apiClient.removeSearchCamera(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove camera');
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (c: SearchCamera) => {
    if (c.status === 'ready') return <Badge className="bg-green-500/15 text-green-500 border-green-500/30">Ready{c.frames ? ` · ${c.frames}f` : ''}</Badge>;
    if (c.status === 'error') return <Badge className="bg-red-500/15 text-red-500 border-red-500/30">Error</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">Indexing…</Badge>;
  };

  const statusIcon = (c: SearchCamera) => {
    if (c.status === 'ready') return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
    if (c.status === 'error') return <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />;
    return <Loader2 className="w-4 h-4 text-amber-500 shrink-0 animate-spin" />;
  };

  const sub = theme === 'light' ? 'text-gray-600' : 'text-gray-400';
  const rowBg = theme === 'light' ? 'bg-gray-50' : 'bg-white/5';

  return (
    <Card className={cn('p-6', theme === 'light' ? 'bg-white' : 'glass')}>
      <div className="flex items-center gap-2 mb-1">
        <Search className="w-5 h-5 text-amber-500" />
        <h3 className={cn('text-lg font-semibold', theme === 'light' ? 'text-gray-900' : 'text-white')}>
          Video Search — Inference Cameras
        </h3>
      </div>
      <p className={cn('text-sm mb-4', sub)}>
        Cameras the CLIP search engine indexes for natural-language video search. Add a MediaMTX
        stream (e.g. <code>http://10.10.0.219:8888/cam/index.m3u8</code>) or a recorded file path.
      </p>

      {!reachable && loaded && (
        <div className="mb-4 text-sm rounded-lg p-3 bg-red-500/10 text-red-500 border border-red-500/20">
          Search service not reachable (:8200). It may be starting up or offline.
        </div>
      )}

      {/* Added cameras */}
      <div className="space-y-2 mb-4">
        {loaded && cameras.length === 0 && (
          <div className={cn('flex items-center gap-2 text-sm rounded-lg p-4 border border-dashed',
            theme === 'light' ? 'border-gray-300 text-gray-500' : 'border-white/10 text-gray-400')}>
            <Video className="w-4 h-4" /> No cameras configured yet — add one below.
          </div>
        )}
        {cameras.map((c) => (
          <div key={c.id} className={cn('flex items-center gap-3 rounded-lg p-3', rowBg)}>
            {statusIcon(c)}
            <div className="flex-1 min-w-0">
              <div className={cn('text-sm font-medium truncate', theme === 'light' ? 'text-gray-900' : 'text-white')}>
                {c.name}
              </div>
              <div className={cn('text-xs font-mono truncate', sub)}>{c.source}</div>
              {c.status === 'error' && c.error && (
                <div className="text-xs text-red-500 truncate">{c.error}</div>
              )}
            </div>
            {statusBadge(c)}
            <Button
              variant="ghost"
              size="icon"
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10 shrink-0"
              disabled={busy}
              onClick={() => remove(c.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add form */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch">
        <Input
          placeholder="Name (e.g. Edge 219 Cam1)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="sm:w-56"
        />
        <Input
          placeholder="Stream URL or file path"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          className="flex-1"
        />
        <Button onClick={add} disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Add Camera
        </Button>
      </div>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </Card>
  );
}
