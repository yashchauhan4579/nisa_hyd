// CameraMapPicker — a lightweight, theme-aware map for picking cameras. Click a
// marker to toggle it; or use "Select area" to drag a rectangle and bulk-select
// every camera inside the box. Generic over {id,name,lat,lng,status} so the same
// component serves the alert camera-picker, the IRIS Search filter, and the VMS
// map. Uses Leaflet + CartoDB light tiles (already in the app); no extra deps.
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SquarePen } from 'lucide-react';

export interface MapCamera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status?: string;
}

interface CameraMapPickerProps {
  cameras: MapCamera[];
  selected: string[];
  onChange: (ids: string[]) => void;
  height?: number;
}

const VJA: [number, number] = [16.5062, 80.648]; // Vijayawada/Guntur fallback center

function brandAccent(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim();
  return v || '#f59e0b';
}
const isLoc = (c: MapCamera) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && (c.lat !== 0 || c.lng !== 0);

function styleFor(c: MapCamera, isSel: boolean, accent: string): L.CircleMarkerOptions {
  const online = c.status === 'online' || c.status === 'active' || c.status === 'ready';
  const base = online ? accent : '#71717a';
  return {
    radius: isSel ? 9 : 6,
    color: isSel ? accent : base,
    weight: isSel ? 3 : 2,
    opacity: 1,
    fillColor: isSel ? accent : base,
    fillOpacity: isSel ? 0.9 : 0.45,
  };
}

function MarkerLayer({ cameras, selected, onChange, areaMode }: {
  cameras: MapCamera[]; selected: string[]; onChange: (ids: string[]) => void; areaMode: boolean;
}) {
  const map = useMap();
  const selRef = useRef(selected);
  selRef.current = selected;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  // Build markers once per camera-set; fit to their bounds.
  useEffect(() => {
    const accent = brandAccent();
    const layer = L.layerGroup().addTo(map);
    const markers = new Map<string, L.CircleMarker>();
    cameras.forEach((c) => {
      if (!isLoc(c)) return;
      const m = L.circleMarker([c.lat, c.lng], styleFor(c, selRef.current.includes(c.id), accent));
      m.bindTooltip(c.name, { direction: 'top', offset: [0, -4] });
      m.on('click', () => {
        const sel = selRef.current;
        onChangeRef.current(sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id]);
      });
      m.addTo(layer);
      markers.set(c.id, m);
    });
    markersRef.current = markers;
    const pts = cameras.filter(isLoc).map((c) => [c.lat, c.lng] as [number, number]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 15 });
    return () => { map.removeLayer(layer); };
  }, [cameras, map]);

  // Restyle in place when the selection changes (no rebuild/flicker).
  useEffect(() => {
    const accent = brandAccent();
    markersRef.current.forEach((m, id) => {
      const c = cameras.find((x) => x.id === id);
      if (c) m.setStyle(styleFor(c, selected.includes(id), accent));
    });
  }, [selected, cameras]);

  // Rectangle area-select. While active, the map stops dragging so the gesture
  // draws a box; on mouseup, every camera inside is unioned into the selection.
  useEffect(() => {
    if (!areaMode) return;
    map.dragging.disable();
    const accent = brandAccent();
    let start: L.LatLng | null = null;
    let rect: L.Rectangle | null = null;

    const down = (e: L.LeafletMouseEvent) => { start = e.latlng; };
    const move = (e: L.LeafletMouseEvent) => {
      if (!start) return;
      const b = L.latLngBounds(start, e.latlng);
      if (rect) rect.setBounds(b);
      else rect = L.rectangle(b, { color: accent, weight: 1, fillColor: accent, fillOpacity: 0.12 }).addTo(map);
    };
    const up = (e: L.LeafletMouseEvent) => {
      if (start) {
        const b = L.latLngBounds(start, e.latlng);
        const inside = cameras.filter((c) => isLoc(c) && b.contains([c.lat, c.lng])).map((c) => c.id);
        if (inside.length) {
          const set = new Set(selRef.current);
          inside.forEach((id) => set.add(id));
          onChangeRef.current([...set]);
        }
      }
      start = null;
      if (rect) { map.removeLayer(rect); rect = null; }
    };

    map.on('mousedown', down);
    map.on('mousemove', move);
    map.on('mouseup', up);
    return () => {
      map.off('mousedown', down);
      map.off('mousemove', move);
      map.off('mouseup', up);
      map.dragging.enable();
      if (rect) map.removeLayer(rect);
    };
  }, [areaMode, cameras, map]);

  return null;
}

export function CameraMapPicker({ cameras, selected, onChange, height = 320 }: CameraMapPickerProps) {
  const [areaMode, setAreaMode] = useState(false);
  const located = cameras.filter(isLoc);
  const center: [number, number] = located.length ? [located[0].lat, located[0].lng] : VJA;

  return (
    <div className="camera-map relative overflow-hidden rounded-lg border border-border" style={{ height }}>
      <style>{`
        .camera-map .leaflet-container { background:#e8eaed; font-family:Inter,sans-serif; }
        .camera-map .leaflet-tooltip {
          background: hsl(var(--card)); color: hsl(var(--foreground));
          border: 1px solid hsl(var(--border)); box-shadow: 0 4px 12px rgba(0,0,0,.4);
          font-size: 11px; font-weight: 600;
        }
        .camera-map .leaflet-tooltip-top:before { border-top-color: hsl(var(--border)); }
      `}</style>

      {located.length === 0 ? (
        <div className="grid h-full place-items-center p-4 text-center text-xs text-muted-foreground">
          No cameras have map locations yet — use the List tab, or set camera coordinates on the VMS map.
        </div>
      ) : (
        <>
          <MapContainer
            center={center}
            zoom={13}
            className="h-full w-full"
            style={{ background: '#e8eaed' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
            <MarkerLayer cameras={located} selected={selected} onChange={onChange} areaMode={areaMode} />
          </MapContainer>

          {/* overlay controls */}
          <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] flex items-start justify-between gap-2">
            {areaMode ? (
              <span className="pointer-events-auto rounded-md border border-border bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur">
                Drag a box to select cameras inside it
              </span>
            ) : <span />}
            <div className="pointer-events-auto flex gap-1.5">
              <button
                type="button"
                onClick={() => setAreaMode((a) => !a)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold backdrop-blur transition ${
                  areaMode ? 'border-amber-500 bg-amber-500 text-black' : 'border-border bg-card/90 text-foreground hover:bg-accent'
                }`}
                title="Drag a rectangle to bulk-select cameras"
              >
                <SquarePen className="h-3 w-3" /> Select area
              </button>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="rounded-md border border-border bg-card/90 px-2 py-1 text-[11px] font-semibold text-muted-foreground backdrop-blur transition hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
