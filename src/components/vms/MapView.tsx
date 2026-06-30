import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RefreshCw, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const VJA: [number, number] = [16.5062, 80.648];
const token = () => localStorage.getItem('token') || localStorage.getItem('iris_token');

interface DeviceMarker { id: string; name: string; lat: number; lng: number; status: string; location?: string }

// amber (online) / zinc (offline) pin
const pinIcon = (online: boolean) =>
  L.divIcon({
    className: '',
    html: `<div style="position:relative;width:18px;height:18px">
      <span style="position:absolute;inset:0;border-radius:9999px;background:${online ? '#f59e0b' : '#52525b'};
        box-shadow:0 0 0 4px ${online ? 'rgba(245,158,11,0.25)' : 'rgba(82,82,91,0.25)'};border:2px solid #0a0a0a"></span>
      ${online ? '<span style="position:absolute;inset:0;border-radius:9999px;background:#f59e0b;opacity:.5;animation:vmsping 1.8s ease-out infinite"></span>' : ''}
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

function Markers({ devices }: { devices: DeviceMarker[] }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    devices.forEach((d) => {
      if (typeof d.lat !== 'number' || typeof d.lng !== 'number') return;
      const online = d.status === 'online' || d.status === 'active';
      L.marker([d.lat, d.lng], { icon: pinIcon(online) })
        .bindPopup(
          `<div style="font:600 13px Inter,sans-serif;color:#fafafa">${d.name}</div>
           <div style="font:12px Inter,sans-serif;color:#a1a1aa">${d.location || ''}</div>
           <div style="font:600 11px Inter,sans-serif;color:${online ? '#34d399' : '#a1a1aa'};margin-top:2px">${online ? '● ONLINE' : '● OFFLINE'}</div>`,
          { className: 'vms-popup' },
        )
        .addTo(layer);
    });
    const pts = devices.filter((d) => typeof d.lat === 'number').map((d) => [d.lat, d.lng] as [number, number]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.25));
    return () => { map.removeLayer(layer); };
  }, [devices, map]);
  return null;
}

export function VmsMapView() {
  const [devices, setDevices] = useState<DeviceMarker[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/devices?type=CAMERA&minimal=true', {
        headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : (data.devices ?? []);
        setDevices(list.map((d) => ({
          id: d.id, name: d.name ?? d.id, lat: d.lat, lng: d.lng,
          status: d.status, location: d.location ?? d.metadata?.location,
        })));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const online = useMemo(() => devices.filter((d) => d.status === 'online' || d.status === 'active').length, [devices]);

  return (
    <div className="relative h-full w-full">
      <style>{`@keyframes vmsping{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.4);opacity:0}}
        .vms-popup .leaflet-popup-content-wrapper{background:#18181b;border:1px solid rgba(255,255,255,.1);color:#fafafa;border-radius:10px}
        .vms-popup .leaflet-popup-tip{background:#18181b}`}</style>

      {/* header overlay */}
      <div className="absolute left-4 top-4 z-[1000] flex items-center gap-3 rounded-xl border border-border bg-card/90 px-4 py-2.5 backdrop-blur">
        <MapPin className="h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-semibold leading-tight">Camera Map</div>
          <div className="text-[11px] text-muted-foreground">
            {loading ? 'Loading…' : `${devices.length} cameras · ${online} online`}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={load} title="Refresh">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      <MapContainer center={VJA} zoom={12} className="h-full w-full" style={{ background: '#e8eaed' }} zoomControl={false}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
        />
        <Markers devices={devices} />
      </MapContainer>
    </div>
  );
}

export default VmsMapView;
