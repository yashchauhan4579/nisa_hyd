import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { apiClient, type Device } from '@irisdrone/lib/api';


// Belgaum (Belagavi) city center, Karnataka
const MAP_CENTER: [number, number] = [15.8497, 74.4977];

// Same tile source used by /vms/map — no API key, no "for development only" watermark
const GOOGLE_ROADS = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

// Fallback device locations across Belgaum if API hasn't loaded yet
const FALLBACK_LOCATIONS = [
  { id: 'fb-1', name: 'Fort Road', lat: 15.8557, lng: 74.5005 },
  { id: 'fb-2', name: 'Khade Bazar', lat: 15.8516, lng: 74.5025 },
  { id: 'fb-3', name: 'Tilakwadi', lat: 15.8410, lng: 74.4880 },
  { id: 'fb-4', name: 'Camp Area', lat: 15.8480, lng: 74.5180 },
  { id: 'fb-5', name: 'Hindwadi', lat: 15.8645, lng: 74.5050 },
  { id: 'fb-6', name: 'Shahpur', lat: 15.8460, lng: 74.4850 },
  { id: 'fb-7', name: 'Vadgaon', lat: 15.8200, lng: 74.4810 },
  { id: 'fb-8', name: 'Bhandari Galli', lat: 15.8530, lng: 74.5040 },
  { id: 'fb-9', name: 'Athani Road', lat: 15.8780, lng: 74.5110 },
  { id: 'fb-10', name: 'Udyambag', lat: 15.8730, lng: 74.5170 },
  { id: 'fb-11', name: 'Kakati Cross', lat: 15.8950, lng: 74.5300 },
  { id: 'fb-12', name: 'Sambra', lat: 15.8500, lng: 74.6200 },
  { id: 'fb-13', name: 'Mahantesh Nagar', lat: 15.8350, lng: 74.5050 },
  { id: 'fb-14', name: 'Anguol', lat: 15.8290, lng: 74.4970 },
  { id: 'fb-15', name: 'Goa Veres', lat: 15.8390, lng: 74.4720 },
];

interface OverlayDevice {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'online' | 'warning' | 'offline';
  online: boolean;
}

/**
 * HTML overlay layer over the map — projects each device's lat/lng into screen coordinates
 * and renders animated pulsing markers + SVG connection lines for the Hollywood feel.
 */
function ProjectedOverlay({ devices }: { devices: OverlayDevice[] }) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  const projectedRef = useRef<Array<{ x: number; y: number; device: OverlayDevice }>>([]);

  useEffect(() => {
    if (!map) return;
    let raf = 0;
    const tick = () => {
      if (containerRef.current) {
        projectedRef.current = devices.map((d) => {
          const pt = map.latLngToContainerPoint([d.lat, d.lng]);
          return { x: pt.x, y: pt.y, device: d };
        });
        force((n) => (n + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [map, devices]);

  const points = projectedRef.current;
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const dists: Array<{ idx: number; d: number }> = [];
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const b = points[j];
      dists.push({ idx: j, d: Math.hypot(a.x - b.x, a.y - b.y) });
    }
    dists.sort((u, v) => u.d - v.d);
    dists.slice(0, 2).forEach(({ idx, d }) => {
      if (d > 280) return;
      const k = `${Math.min(i, idx)}-${Math.max(i, idx)}`;
      if (segments.find((s) => s.key === k)) return;
      segments.push({ key: k, x1: a.x, y1: a.y, x2: points[idx].x, y2: points[idx].y });
    });
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 400,
        overflow: 'hidden',
      }}
    >
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          mixBlendMode: 'screen',
        }}
      >
        <defs>
          <linearGradient id="conn" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(0, 240, 255, 0)" />
            <stop offset="50%" stopColor="rgba(0, 240, 255, 0.45)" />
            <stop offset="100%" stopColor="rgba(0, 240, 255, 0)" />
          </linearGradient>
        </defs>
        {segments.map((s, i) => (
          <line
            key={s.key}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="url(#conn)"
            strokeWidth={1}
            strokeDasharray="3 6"
            style={{
              animation: `nx-line-flow 3.5s linear infinite`,
              animationDelay: `${i * 0.15}s`,
              opacity: 0.55,
            }}
          />
        ))}
      </svg>

      {points.map((p, i) => (
        <div
          key={p.device.id}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            transform: 'translate(-50%, -50%)',
            width: 18,
            height: 18,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `1px solid ${
                p.device.status === 'online' ? 'rgba(0, 240, 255, 0.7)'
                : p.device.status === 'warning' ? 'rgba(255, 183, 0, 0.7)'
                : 'rgba(255, 42, 42, 0.7)'
              }`,
              animation: `nx-marker-ripple 2.6s cubic-bezier(0.2, 0.7, 0.2, 1) infinite`,
              animationDelay: `${(i * 137) % 2000}ms`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 5,
              height: 5,
              marginTop: -2.5,
              marginLeft: -2.5,
              borderRadius: '50%',
              background: p.device.status === 'online' ? '#00F0FF'
                : p.device.status === 'warning' ? '#FFB700'
                : '#FF2A2A',
              boxShadow: `0 0 10px ${
                p.device.status === 'online' ? '#00F0FF'
                : p.device.status === 'warning' ? '#FFB700'
                : '#FF2A2A'
              }`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

interface MapBackgroundProps {
  color?: string;
}

export function MapBackground({ color: _color = '#00F0FF' }: MapBackgroundProps) {
  const [devices, setDevices] = useState<OverlayDevice[]>(
    FALLBACK_LOCATIONS.map((d) => ({ ...d, status: 'online' as const, online: true }))
  );

  useEffect(() => {
    let cancelled = false;
    const fetchDevices = async () => {
      try {
        const result = await apiClient.getDevices();
        if (cancelled) return;
        const list = (result || []) as Device[];
        const realLocs: OverlayDevice[] = list
          .filter((d) => typeof d.lat === 'number' && typeof d.lng === 'number' && Math.abs(d.lat) > 0.0001)
          .map((d) => ({
            id: d.id,
            name: d.name || d.id,
            lat: d.lat,
            lng: d.lng,
            status: d.status === 'ACTIVE' || d.status === 'active' ? 'online'
              : d.status === 'MAINTENANCE' || d.status === 'maintenance' ? 'warning'
              : 'offline',
            online: d.status === 'ACTIVE' || d.status === 'active',
          }));
        if (realLocs.length > 0) setDevices(realLocs);
      } catch {
        // keep fallback
      }
    };
    fetchDevices();
    const id = setInterval(fetchDevices, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <div className="nx-map-tactical" style={{ position: 'absolute', inset: 0 }}>
        <MapContainer
          center={MAP_CENTER}
          zoom={13}
          minZoom={12}
          maxZoom={15}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          boxZoom={false}
          keyboard={false}
          touchZoom={false}
          style={{ width: '100%', height: '100%', background: '#020408' }}
        >
          <TileLayer url={GOOGLE_ROADS} />
          <ProjectedOverlay devices={devices} />
        </MapContainer>
      </div>

      {/* Radar sweep — slow rotating cone of light */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '180vmax',
          height: '180vmax',
          marginTop: '-90vmax',
          marginLeft: '-90vmax',
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(0, 240, 255, 0.025) 30deg, transparent 60deg)',
          animation: 'nx-radar-sweep 18s linear infinite',
          pointerEvents: 'none',
          zIndex: 2,
          mixBlendMode: 'screen',
        }}
      />

      {/* Vignette — edge fade so map stays visible at the corners */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse 74% 64% at 50% 50%, transparent 32%, #020408 100%)',
        zIndex: 3,
      }} />

      {/* Center scrim — darkens middle so the module selector reads clearly */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse 45% 45% at 50% 55%, rgba(2, 4, 8, 0.55) 0%, rgba(2, 4, 8, 0.32) 45%, transparent 85%)',
        zIndex: 3,
      }} />

      {/* Top gradient */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '120px',
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, #020408 0%, transparent 100%)',
        zIndex: 3,
      }} />

      {/* Bottom gradient */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: '100px',
        pointerEvents: 'none',
        background: 'linear-gradient(0deg, #020408 0%, transparent 100%)',
        zIndex: 3,
      }} />

      {/* CRT Scanlines — < 5% opacity */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 240, 255, 0.012) 2px, rgba(0, 240, 255, 0.012) 4px)',
        zIndex: 4,
      }} />

      <style>{`
        .nx-map-tactical .leaflet-container {
          background: #020408;
        }
        .nx-map-tactical .leaflet-tile-pane {
          filter: invert(0.92) hue-rotate(180deg) saturate(0.6) brightness(0.98) contrast(1.08);
        }
        @keyframes nx-marker-ripple {
          0%   { transform: scale(0.5); opacity: 0.85; }
          80%  { transform: scale(2.6); opacity: 0; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        @keyframes nx-line-flow {
          0%   { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -36; }
        }
        @keyframes nx-radar-sweep {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
