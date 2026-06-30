import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvent } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import Hls from 'hls.js'
import { apiClient, type Device } from '@irisdrone/lib/api'
import { Search, Map as MapIcon, Satellite, X, Maximize2 } from 'lucide-react'

// Fix default marker assets for bundlers
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Belagavi center
const BELAGAVI_CENTER: [number, number] = [15.8497, 74.4977]
const DEFAULT_ZOOM = 13

function hasRealCoords(device: Device): boolean {
  const lat = Number(device.lat)
  const lng = Number(device.lng)
  return Boolean(lat && lng && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001)
}

// Vivid palette tuned for legibility on the light Google Roads tile.
const AREA_COLORS = [
  '#d97706', '#dc2626', '#16a34a', '#d97706', '#d97706',
  '#db2777', '#0d9488', '#ea580c', '#d97706', '#65a30d',
  '#9333ea', '#e11d48', '#0369a1', '#b45309',
]

function colorFromName(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AREA_COLORS[Math.abs(h) % AREA_COLORS.length]
}

// Color a device by its police station so all boxes in the same station
// share the same hue (e.g. all 4 Athani boxes end up the same color).
// Falls back to colorFromName(device.name) if station isn't seeded.
function colorForDevice(device: Device): string {
  const station = (device.metadata?.station as string | undefined)?.trim()
  return colorFromName(station || device.name || '')
}

// Friendly label for the always-visible map tooltip.
function deviceTooltipLabel(device: Device): string {
  const station = (device.metadata?.station as string | undefined)?.trim()
  const location = (device.metadata?.location as string | undefined)?.trim()
  if (station && location) return `${station} · ${location}`
  if (location) return location
  if (station) return station
  return device.name
}

function markerSize(zoom: number, selected = false) {
  const base = Math.max(22, Math.min(54, (zoom - 8) * 4))
  return selected ? Math.round(base * 1.35) : base
}

function createPinIcon(color: string, selected = false, isOnline = false, zoom = 12) {
  const s = markerSize(zoom, selected)
  const bg = isOnline ? color : '#475569'
  const ring = isOnline ? color : '#475569'
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${s}px;height:${s}px;
      background:${bg};
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 0 0 3px ${ring}, 0 4px 10px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      color:white;
    ">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:${Math.round(s * 0.45)}px;height:${Math.round(s * 0.45)}px">
        <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z"/>
      </svg>
    </div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    popupAnchor: [0, -(s / 2 + 8)],
  })
}

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvent('zoomend', (e) => onZoom(e.target.getZoom()))
  return null
}

function MapSizeFix() {
  const map = useMap()
  useEffect(() => {
    const invalidate = () => map.invalidateSize()
    invalidate()
    const t1 = setTimeout(invalidate, 100)
    const t2 = setTimeout(invalidate, 500)
    const ro = new ResizeObserver(invalidate)
    ro.observe(map.getContainer())
    window.addEventListener('resize', invalidate)
    return () => {
      clearTimeout(t1); clearTimeout(t2)
      ro.disconnect()
      window.removeEventListener('resize', invalidate)
    }
  }, [map])
  return null
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, 15, { duration: 1.3 })
  }, [target, map])
  return null
}

interface DeviceCameras {
  deviceId: string
  cameras: { id: string; name: string }[]
}

// HLS URL for a camera at a given edge host. Same pattern as mg-src LiveView:
//   {MEDIAMTX_HOST}/camera_{cameraId}/index.m3u8
// Hub-proxied through /api/stream/p/<base64url-encoded-base>/index.m3u8 so the
// browser never talks directly to the edge.
function buildCameraHlsUrl(host: string, cameraId: string): string {
  const base = `http://${host}:8888/camera_${cameraId}/`
  const encoded = btoa(base).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `/api/stream/p/${encoded}/index.m3u8`
}

interface ActiveCamera {
  deviceId: string
  deviceName: string
  cameraId: string
  cameraName: string
  host: string
}

function LiveCameraPreview({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError(true) })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.play().catch(() => {})
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [src])

  if (error) {
    return (
      <div className="aspect-video bg-zinc-900 rounded-lg flex items-center justify-center">
        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Stream unavailable</span>
      </div>
    )
  }

  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
      <video ref={videoRef} className="w-full h-full object-contain" muted playsInline />
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[9px] text-white font-bold uppercase tracking-widest">Live</span>
      </div>
    </div>
  )
}

const ESRI_SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const GOOGLE_ROADS = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'

type TileLayerId = 'standard' | 'satellite'

const MAP_LAYERS: Array<{
  id: TileLayerId
  label: string
  url: string
  attribution: string
  overlayLabels?: boolean
  icon: typeof MapIcon
}> = [
  { id: 'standard', label: 'Standard', url: GOOGLE_ROADS, attribution: '&copy; Google Maps', icon: MapIcon },
  { id: 'satellite', label: 'Satellite', url: ESRI_SATELLITE, attribution: '&copy; Esri', overlayLabels: true, icon: Satellite },
]

export function VmsMapView() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [search, setSearch] = useState('')
  const [tileLayer, setTileLayer] = useState<TileLayerId>('standard')
  const [deviceCameras, setDeviceCameras] = useState<DeviceCameras[]>([])
  const [activeCamera, setActiveCamera] = useState<ActiveCamera | null>(null)

  useEffect(() => {
    apiClient.getDevices().then((devs) => {
      const d = (devs as Device[]).filter((dev) => dev.type === 'MAGICBOX' && hasRealCoords(dev))
      setDevices(d)
    }).catch(() => {})
  }, [])

  const handleMarkerClick = async (device: Device) => {
    setSelectedDeviceId(device.id)
    setFlyTarget([device.lat, device.lng])

    // Load cameras for this device if not cached
    if (!deviceCameras.find((dc) => dc.deviceId === device.id)) {
      const host = device.metadata?.wireguardIp || device.metadata?.host
      if (host) {
        try {
          const res = await fetch(`/api/edge/${host}/api/cameras`)
          const data = await res.json()
          setDeviceCameras((prev) => [...prev, { deviceId: device.id, cameras: data.map((c: any) => ({ id: c.id, name: c.name })) }])
        } catch {}
      }
    }
  }

  const filteredDevices = devices.filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  )

  const activeLayer = MAP_LAYERS.find((l) => l.id === tileLayer) || MAP_LAYERS[0]

  return (
    <div className="relative" style={{ height: '100%', width: '100%' }}>
      <MapContainer
        center={BELAGAVI_CENTER}
        zoom={DEFAULT_ZOOM}
        className={`map-layer-${tileLayer}`}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={false}
      >
        <TileLayer key={tileLayer} url={activeLayer.url} attribution={activeLayer.attribution} />
        {activeLayer.overlayLabels && (
          <TileLayer key="esri-labels" url={ESRI_LABELS} zIndex={10} />
        )}
        <MapSizeFix />
        <ZoomTracker onZoom={setZoom} />
        <FlyTo target={flyTarget} />

        {filteredDevices.map((device) => {
          const isOnline = device.status === 'ACTIVE' || device.status === 'active'
          const isSelected = selectedDeviceId === device.id
          const color = colorForDevice(device)
          const icon = createPinIcon(color, isSelected, isOnline, zoom)
          const host = device.metadata?.wireguardIp || device.metadata?.host
          const cams = deviceCameras.find((dc) => dc.deviceId === device.id)?.cameras || []
          const tooltipLabel = deviceTooltipLabel(device)

          return (
            <Marker
              key={device.id}
              position={[device.lat, device.lng]}
              icon={icon}
              eventHandlers={{ click: () => handleMarkerClick(device) }}
            >
              {zoom >= 11 && (
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -markerSize(zoom, isSelected) / 2 - 2]}
                  className="map-station-label"
                >
                  {tooltipLabel}
                </Tooltip>
              )}
              <Popup minWidth={420} maxWidth={460}>
                <div className="map-popup">
                  <div className="map-popup-header">
                    <div className="map-popup-status">
                      <span className={`map-popup-dot ${isOnline ? 'is-online' : 'is-offline'}`} />
                      <span className={`map-popup-status-text ${isOnline ? 'is-online' : 'is-offline'}`}>
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <h3 className="map-popup-title">{device.name}</h3>
                    <div className="map-popup-meta">
                      <div className="map-popup-meta-row">
                        <span className="map-popup-meta-label">IP</span>
                        <span className="map-popup-meta-value">{host || '—'}</span>
                      </div>
                      <div className="map-popup-meta-row">
                        <span className="map-popup-meta-label">GPS</span>
                        <span className="map-popup-meta-value">
                          {device.lat.toFixed(6)}, {device.lng.toFixed(6)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {cams.length > 0 && host && (
                    <div className="map-popup-cams">
                      <div className="map-popup-cams-label">
                        {cams.length} {cams.length === 1 ? 'Camera' : 'Cameras'}
                      </div>
                      <div className="map-popup-cams-grid">
                        {cams.map((cam) => (
                          <button
                            key={cam.id}
                            type="button"
                            onClick={() => setActiveCamera({ deviceId: device.id, deviceName: device.name, cameraId: cam.id, cameraName: cam.name, host })}
                            className="map-popup-cam-card"
                            title="Click to view full live feed"
                          >
                            <div className="map-popup-cam-preview">
                              <LiveCameraPreview src={buildCameraHlsUrl(host, cam.id)} />
                            </div>
                            <div className="map-popup-cam-name">
                              <span>{cam.name}</span>
                              <Maximize2 size={11} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Active camera live-feed side panel */}
      {activeCamera && (
        <div className="absolute top-4 right-4 z-[1000] w-[480px] max-w-[calc(100vw-2rem)] bg-zinc-900/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="min-w-0">
              <div className="text-xs text-zinc-500 uppercase tracking-wider">Live · {activeCamera.deviceName}</div>
              <div className="text-sm font-medium text-zinc-100 truncate">{activeCamera.cameraName}</div>
            </div>
            <button
              onClick={() => setActiveCamera(null)}
              className="text-zinc-500 hover:text-zinc-200 p-1 rounded transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-3">
            <LiveCameraPreview src={buildCameraHlsUrl(activeCamera.host, activeCamera.cameraId)} />
            <div className="mt-2 text-[10px] font-mono text-zinc-600 truncate">
              {activeCamera.host}:8888/camera_{activeCamera.cameraId}
            </div>
          </div>
        </div>
      )}

      {/* Search overlay */}
      <div className="absolute top-4 left-4 z-[1000]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search devices..."
            className="w-64 bg-zinc-900/90 backdrop-blur border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-500/50 shadow-lg"
          />
        </div>
      </div>

      {/* Layer toggle (segmented control) */}
      <div className="absolute bottom-4 left-4 z-[1000] flex gap-1 bg-zinc-900/90 backdrop-blur border border-white/10 rounded-xl shadow-lg p-1">
        {MAP_LAYERS.map((layer) => {
          const active = tileLayer === layer.id
          const Icon = layer.icon
          return (
            <button
              key={layer.id}
              onClick={() => setTileLayer(layer.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                active ? 'bg-amber-600 text-white shadow-sm' : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {layer.label}
            </button>
          )
        })}
      </div>

      {/* Device count */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-zinc-900/90 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-400 shadow-lg">
        {filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''} on map
      </div>
    </div>
  )
}
