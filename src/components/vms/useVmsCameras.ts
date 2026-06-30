import { useCallback, useEffect, useState } from 'react';
import type { VmsCamera } from './VmsExplorerSidebar';

const token = () => localStorage.getItem('token') || localStorage.getItem('iris_token');

// Shared camera source for the VMS pages. Normalizes /api/camera-health (real
// backend: {deviceId,name,...}; mock: {id,cameraId,...}) into a flat shape.
export function useVmsCameras() {
  const [cameras, setCameras] = useState<VmsCamera[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/camera-health', {
        headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      });
      if (res.ok) {
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
  return { cameras, loading, reload: load };
}

// MediaMTX HLS endpoint (same convention across the VMS module).
export const hlsUrl = (id: string) => {
  const base = (import.meta.env.VITE_MEDIAMTX_HLS_URL as string) ||
    `http://${window.location.hostname}:8888`;
  return `${base}/camera_${id}/index.m3u8`;
};
