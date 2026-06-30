import { memo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Sri Sringeri Sharada Peetham — temple complex center.
const MAP_CENTER: [number, number] = [13.4198, 75.2546];

// Cameras at the Sringeri complex.
type CameraStatus = 'active' | 'warning' | 'offline';
const DEVICE_LOCATIONS: { id: number; lat: number; lng: number; label: string; status: CameraStatus }[] = [
  { id: 1,  lat: 13.4198, lng: 75.2546, label: 'Temple Entrance',          status: 'active'  },
  { id: 2,  lat: 13.4202, lng: 75.2548, label: 'Gopura Entrance',          status: 'active'  },
  { id: 3,  lat: 13.4194, lng: 75.2542, label: 'Exit Gate',                status: 'active'  },
  { id: 4,  lat: 13.4180, lng: 75.2530, label: 'Bridge Entry Gate',        status: 'active'  },
  { id: 5,  lat: 13.4205, lng: 75.2555, label: 'BTK Entry',                status: 'active'  },
  { id: 6,  lat: 13.4207, lng: 75.2558, label: 'BTK Entry/Exit Gate',      status: 'active'  },
  { id: 7,  lat: 13.4210, lng: 75.2552, label: 'Dining Hall',              status: 'active'  },
  { id: 8,  lat: 13.4195, lng: 75.2552, label: 'Sharada Krupa',            status: 'active'  },
  { id: 9,  lat: 13.4192, lng: 75.2554, label: 'Shankara Krupa',           status: 'active'  },
  { id: 10, lat: 13.4214, lng: 75.2545, label: 'Yathri Nivas',             status: 'active'  },
  { id: 11, lat: 13.4200, lng: 75.2540, label: 'Gurunivasa Main Entrance', status: 'active'  },
];

// Slow tactical drift — keeps the map alive without burning CPU.
function CameraDrift() {
  const map = useMap();
  const stopRef = useRef(false);

  useEffect(() => {
    if (!map) return;
    let frame = 0;
    const id = setInterval(() => {
      if (stopRef.current) return;
      frame++;
      const center = map.getCenter();
      const lng = center.lng + 0.00005 * Math.cos(frame * 0.05);
      const lat = center.lat + 0.00003 * Math.sin(frame * 0.05);
      map.panTo([lat, lng], { animate: true, duration: 0.4, easeLinearity: 1 });
      if (frame > 720) clearInterval(id);
    }, 200);
    return () => {
      stopRef.current = true;
      clearInterval(id);
    };
  }, [map]);
  return null;
}

interface MapBackgroundProps {
  color?: string;
  lite?: boolean;
}

export const MapBackground = memo(function MapBackground({
  color: _color = '#00F0FF',
  lite = false,
}: MapBackgroundProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <MapContainer
        center={MAP_CENTER}
        zoom={17}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        dragging={false}
        keyboard={false}
        touchZoom={false}
        boxZoom={false}
        style={{ width: '100%', height: '100%', backgroundColor: '#020408' }}
      >
        {/* Standard OSM tiles — densest free label rendering (street
            names, temple names, building footprints, POIs). Free, no
            API key, no watermark. CSS filter below converts the
            light tileset into the iris2 cyan-on-near-black tactical
            look without the rainbow saturation that makes other
            inversion approaches look "kiddish". */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          className="iris-tactical-tiles"
        />

        {!lite && <CameraDrift />}

        {DEVICE_LOCATIONS.map((d) => {
          const c =
            d.status === 'active' ? '#00F0FF' :
            d.status === 'warning' ? '#FFB700' :
            '#005F73';
          return (
            <CircleMarker
              key={d.id}
              center={[d.lat, d.lng]}
              radius={5}
              pathOptions={{
                color: c,
                weight: 1,
                fillColor: c,
                fillOpacity: 0.9,
              }}
            />
          );
        })}
      </MapContainer>

      {/* Vignette — deep space fade (matches iris2 / Google-Dark vibe). */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 55% at 50% 50%, transparent 15%, #020408 100%)',
        zIndex: 1,
      }} />

      {/* Top gradient. */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '120px',
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, #020408 0%, transparent 100%)',
        zIndex: 1,
      }} />

      {/* Bottom gradient. */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: '100px',
        pointerEvents: 'none',
        background: 'linear-gradient(0deg, #020408 0%, transparent 100%)',
        zIndex: 1,
      }} />

      {/* CRT scanlines — < 1.5% opacity tactical texture. */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 240, 255, 0.012) 2px, rgba(0, 240, 255, 0.012) 4px)',
        zIndex: 2,
      }} />

      <style>{`
        .leaflet-container { background: #020408 !important; }
        .leaflet-control-attribution { display: none !important; }

        /* OSM light → iris2 cyan tactical, but with restored colour
           on labels + POI symbols (hospital H, highway shields, etc).
           Keeps dark bg via invert; lets POI hues come through with a
           healthy saturate; only a mild cyan wash so symbols stay
           recognisable in their natural colours. */
        .iris-tactical-tiles {
          filter:
            invert(1)
            hue-rotate(180deg)
            saturate(0.85)
            sepia(0.18)
            hue-rotate(165deg)
            brightness(0.96)
            contrast(1.12);
        }

        @keyframes marker-pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(2.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
});
