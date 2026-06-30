// JunctionMap — a light-mode Leaflet modal that pins a single junction (camera)
// location. Used by ANPR to show WHERE a detection happened. Self-contained;
// reuses the app's existing Leaflet + CartoDB tiles (light variant) — no deps.
import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, MapPin } from 'lucide-react';

interface JunctionMapProps {
  lat: number;
  lng: number;
  name: string;
  subtitle?: string;
  onClose: () => void;
}

// Plain boolean (NOT a type predicate) so callers keep the full device type in
// both branches — a narrowing guard would collapse the other fields to `never`.
export const hasGeo = (d?: { lat?: number; lng?: number } | null): boolean =>
  !!d && Number.isFinite(d.lat) && Number.isFinite(d.lng) && ((d.lat as number) !== 0 || (d.lng as number) !== 0);

function brandAccent(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim();
  return v || '#f59e0b';
}

// Drops a single amber pin and centers the map on it. A permanent tooltip labels
// the junction so the operator sees the name without hovering.
function Pin({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const map = useMap();
  useEffect(() => {
    const accent = brandAccent();
    const icon = L.divIcon({
      className: 'junction-pin',
      html: `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill="${accent}"/>
        <circle cx="17" cy="17" r="6" fill="#1a1a1a"/></svg>`,
      iconSize: [34, 44],
      iconAnchor: [17, 44],
    });
    const m = L.marker([lat, lng], { icon }).addTo(map);
    m.bindTooltip(name, { direction: 'top', offset: [0, -44], permanent: true, className: 'junction-tip' });
    map.setView([lat, lng], 16);
    return () => { map.removeLayer(m); };
  }, [lat, lng, name, map]);
  return null;
}

export function JunctionMap({ lat, lng, name, subtitle, onClose }: JunctionMapProps) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="junction-map relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <style>{`
          .junction-map .leaflet-container { background:#e8eaed; font-family:Inter,sans-serif; }
          .junction-map .junction-tip {
            background:#fff; color:#111827; border:1px solid #d4d4d8;
            box-shadow:0 4px 12px rgba(0,0,0,.18); font-size:11px; font-weight:700;
            padding:3px 8px; border-radius:6px;
          }
          .junction-map .junction-tip:before { border-top-color:#d4d4d8; }
        `}</style>

        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/15 text-amber-600"><MapPin className="h-4 w-4" /></div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <MapContainer center={[lat, lng]} zoom={16} style={{ height: 460, background: '#e8eaed' }} attributionControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <Pin lat={lat} lng={lng} name={name} />
        </MapContainer>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
          <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer"
            className="font-semibold text-amber-600 hover:underline">Open in Google Maps ↗</a>
        </div>
      </div>
    </div>
  );
}

export default JunctionMap;
