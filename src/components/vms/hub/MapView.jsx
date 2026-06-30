import React, { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvent } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import Hls from 'hls.js'
import { deviceAPI } from './utils/api'
import { resolvePosition, STATION_KEYS } from './utils/resolvePosition'
import { extractLatLngFromMapsUrl } from './utils/parseMapLink'
import { deviceCache, cacheDeviceList, cacheCamerasForDevice, getCamerasForDevice } from './utils/deviceCache'

// Fix default marker assets
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Saturated colors per station area
const AREA_COLORS = [
    '#f59e0b', '#dc2626', '#16a34a', '#d97706', '#f59e0b',
    '#db2777', '#0d9488', '#ea580c', '#0891b2', '#65a30d',
    '#b45309', '#e11d48', '#0369a1', '#b45309',
]

function colorFromKey(key = '') {
    let h = 0
    for (let i = 0; i < key.length; i++) h = key.charCodeAt(i) + ((h << 5) - h)
    return AREA_COLORS[Math.abs(h) % AREA_COLORS.length]
}

// Resolve the station key a device belongs to (for consistent area coloring)
function deviceAreaKey(device) {
    const normalized = (device.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    for (const key of STATION_KEYS) {
        if (normalized.includes(key)) return key
    }
    return device.name || 'unknown'
}

function markerSize(zoom, selected = false) {
    // Grows from ~14px at zoom 10 to ~40px at zoom 18
    const base = Math.max(22, Math.min(54, (zoom - 8) * 4))
    return selected ? Math.round(base * 1.35) : base
}

function createPinIcon(color, selected = false, isOnline = false, zoom = 12) {
    const s = markerSize(zoom, selected)
    const bg = isOnline ? '#f59e0b' : '#475569'
    const ring = isOnline ? '#f59e0b' : '#475569'
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

function createHQIcon() {
    return L.divIcon({
        className: '',
        html: `<div style="background:#b45309;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 0 0 3px #f59e0b, 0 4px 12px rgba(0,0,0,0.35);color:white">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px">
            <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z"/>
            <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z"/>
          </svg>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    })
}

function FlyTo({ target }) {
    const map = useMap()
    useEffect(() => {
        if (target) map.flyTo(target, 15, { duration: 1.3 })
    }, [target, map])
    return null
}

function ZoomTracker({ onZoom }) {
    useMapEvent('zoomend', (e) => onZoom(e.target.getZoom()))
    return null
}

function MapLayerClass({ layerId }) {
    const map = useMap()
    useEffect(() => {
        const el = map.getContainer()
        el.className = el.className.replace(/\bmap-layer-\S+/g, '')
        el.classList.add(`map-layer-${layerId}`)
    }, [layerId, map])
    return null
}

function LiveCameraCell({ camera, device }) {
    const videoRef = useRef(null)
    const hlsRef = useRef(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        const video = videoRef.current
        if (!video || !device?.host) {
            console.log('[MapView LiveCameraCell] Skipping — video:', !!video, 'device.host:', device?.host, 'camera:', camera?.name)
            return
        }
        console.log('[MapView LiveCameraCell] Starting stream for', camera.name, 'on device', device.host)

        const cameraPathId = camera.magicboxCameraId || camera.id
        const target = `http://${device.host}:8888/camera_${cameraPathId}/`
        const encoded = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
        const src = target + "index.m3u8"

        if (Hls.isSupported()) {
            // Only forward the bearer over TLS/loopback — edge MediaMTX is plaintext
            // http and ignores the IRIS token, so sending it there only leaks it.
            const token = localStorage.getItem('token')
            const authSafe = /^https:/i.test(src) || /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(src)
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                xhrSetup: (authSafe && token) ? (xhr) => { xhr.setRequestHeader('Authorization', `Bearer ${token}`) } : undefined,
            })
            hlsRef.current = hls
            hls.loadSource(src)
            hls.attachMedia(video)
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { }))
            hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError(true) })
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src
            video.play().catch(() => { })
        }

        return () => {
            hlsRef.current?.destroy()
            hlsRef.current = null
        }
    }, [camera.id, device?.host])

    return (
        <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden relative border border-slate-700">
            <video ref={videoRef} className="w-full h-full object-contain" muted playsInline />
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-slate-600">
                        <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                    </svg>
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Stream unavailable</span>
                </div>
            )}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded px-1.5 py-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] text-white font-black uppercase tracking-widest drop-shadow">{camera.name}</span>
            </div>
        </div>
    )
}

function DevicePopupContent({ device, color, onCameras, onCoordsUpdated }) {
    const [mapLink, setMapLink] = useState('')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [linkFocused, setLinkFocused] = useState(false)
    const isOnline = device.status === 'online'
    const ps = device.users?.length > 0 ? device.users[0].name : null
    const lat = parseFloat(device.latitude)
    const lng = parseFloat(device.longitude)
    const hasCoords = lat >= 12.5 && lat <= 13.5 && lng >= 77.3 && lng <= 77.9

    const handleMapLink = async (url) => {
        setMapLink(url)
        const extracted = await extractLatLngFromMapsUrl(url)
        if (!extracted) return
        setSaving(true)
        try {
            await deviceAPI.updateDevice(device.id, {
                name: device.name, host: device.host,
                latitude: parseFloat(extracted.lat), longitude: parseFloat(extracted.lng)
            })
            setSaved(true)
            setMapLink('')
            if (onCoordsUpdated) onCoordsUpdated(device.id, parseFloat(extracted.lat), parseFloat(extracted.lng))
            setTimeout(() => setSaved(false), 2000)
        } catch { }
        setSaving(false)
    }

    const s = {
        card: { minWidth: 240, fontFamily: 'DM Sans, system-ui, sans-serif', padding: 0 },
        header: {
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px 12px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            borderBottom: '1px solid #e2e8f0', borderRadius: '12px 12px 0 0',
        },
        colorDot: {
            width: 32, height: 32, borderRadius: 8, background: color, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 8px ${color}44`,
        },
        camIcon: { width: 14, height: 14, color: 'white', opacity: 0.9 },
        name: {
            fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3,
            color: '#0f172a', lineHeight: 1.2, marginBottom: 2,
        },
        ps: {
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
            color: '#f59e0b', background: '#eef2ff', padding: '2px 7px', borderRadius: 4,
        },
        body: { padding: '10px 16px 14px' },
        metaRow: {
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
        },
        metaIcon: { width: 12, height: 12, color: '#94a3b8', flexShrink: 0 },
        metaText: { fontSize: 10, fontFamily: 'ui-monospace, monospace', color: '#64748b', letterSpacing: 0.3 },
        statusPill: (online) => ({
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: 1,
            color: online ? '#059669' : '#dc2626',
            background: online ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${online ? '#a7f3d0' : '#fecaca'}`,
            padding: '3px 10px', borderRadius: 20, marginTop: 4, marginBottom: 12,
        }),
        statusDot: (online) => ({
            width: 6, height: 6, borderRadius: '50%',
            background: online ? '#10b981' : '#ef4444',
            boxShadow: online ? '0 0 6px #10b98188' : 'none',
        }),
        cameraBtn: {
            width: '100%', padding: '8px 0', background: '#b45309', color: 'white',
            border: 'none', borderRadius: 10, fontSize: 10, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: 1.2, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background 0.15s',
        },
        divider: { height: 1, background: '#f1f5f9', margin: '12px 0 10px' },
        linkSection: { },
        linkLabel: {
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5,
            color: '#94a3b8', marginBottom: 5,
        },
        linkInput: {
            width: '100%', padding: '7px 10px 7px 28px', fontSize: 10, fontFamily: 'ui-monospace, monospace',
            border: `1.5px solid ${linkFocused ? '#818cf8' : '#e2e8f0'}`,
            borderRadius: 8, outline: 'none', color: '#334155',
            background: linkFocused ? '#ffffff' : '#f8fafc', boxSizing: 'border-box',
            transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
            boxShadow: linkFocused ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
        },
        linkInputWrap: { position: 'relative' },
        linkInputIcon: {
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            width: 12, height: 12, color: '#94a3b8', pointerEvents: 'none',
        },
        feedback: (ok) => ({
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 9, fontWeight: 700, marginTop: 5,
            color: ok ? '#059669' : '#f59e0b',
        }),
    }

    return (
        <div style={s.card}>
            <div style={s.header}>
                <div style={s.colorDot}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={s.camIcon}>
                        <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                    </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.name}>{device.name}</div>
                    {ps && <div style={s.ps}>{ps}</div>}
                </div>
            </div>
            <div style={s.body}>
                {/* IP */}
                <div style={s.metaRow}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={s.metaIcon}>
                        <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Z" clipRule="evenodd" />
                    </svg>
                    <span style={s.metaText}>{device.host}</span>
                </div>
                {/* Coordinates */}
                {hasCoords && (
                    <div style={s.metaRow}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={s.metaIcon}>
                            <path fillRule="evenodd" d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.274 1.765 11.842 11.842 0 0 0 .976.544l.062.029.018.008.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd" />
                        </svg>
                        <span style={s.metaText}>{lat.toFixed(6)}, {lng.toFixed(6)}</span>
                    </div>
                )}
                {/* Status */}
                <div style={s.statusPill(isOnline)}>
                    <div style={s.statusDot(isOnline)} />
                    {isOnline ? 'Online' : 'Offline'}
                </div>
                {/* View Cameras */}
                <button
                    onClick={() => onCameras(device)}
                    style={s.cameraBtn}
                    onMouseEnter={e => e.currentTarget.style.background = '#1e3a8a'}
                    onMouseLeave={e => e.currentTarget.style.background = '#b45309'}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 13, height: 13 }}>
                        <path d="M1 8.25a1.25 1.25 0 1 1 2.5 0v7.5a1.25 1.25 0 1 1-2.5 0v-7.5ZM7.25 3a1.25 1.25 0 0 0-1.25 1.25v11.5a1.25 1.25 0 0 0 2.5 0V4.25A1.25 1.25 0 0 0 7.25 3Zm6 4a1.25 1.25 0 0 0-1.25 1.25v7.5a1.25 1.25 0 1 0 2.5 0v-7.5A1.25 1.25 0 0 0 13.25 7Zm6-3a1.25 1.25 0 0 0-1.25 1.25v10.5a1.25 1.25 0 1 0 2.5 0V5.25A1.25 1.25 0 0 0 19.25 4Z" />
                    </svg>
                    View Cameras
                </button>
                {/* Map Link */}
                <div style={s.divider} />
                <div style={s.linkSection}>
                    <div style={s.linkLabel}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style={{ width: 10, height: 10 }}>
                            <path fillRule="evenodd" d="m7.539 14.841.003.003.002.002a.755.755 0 0 0 .912 0l.002-.002.003-.003.012-.009a5.57 5.57 0 0 0 .19-.153 15.588 15.588 0 0 0 2.046-2.082c1.101-1.362 2.291-3.342 2.291-5.597A5 5 0 0 0 3 7c0 2.255 1.19 4.235 2.292 5.597a15.591 15.591 0 0 0 2.046 2.082 8.916 8.916 0 0 0 .189.153l.012.01ZM8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" clipRule="evenodd" />
                        </svg>
                        Fix location
                    </div>
                    <div style={s.linkInputWrap}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style={s.linkInputIcon}>
                            <path d="M8.914 6.025a.75.75 0 0 1 1.06 0 3.5 3.5 0 0 1 0 4.95l-2 2a3.5 3.5 0 0 1-5.396-4.402.75.75 0 0 1 1.251.827 2 2 0 0 0 3.085 2.514l2-2a2 2 0 0 0 0-2.828.75.75 0 0 1 0-1.06Z" />
                            <path d="M7.086 9.975a.75.75 0 0 1-1.06 0 3.5 3.5 0 0 1 0-4.95l2-2a3.5 3.5 0 0 1 5.396 4.402.75.75 0 0 1-1.251-.827 2 2 0 0 0-3.085-2.514l-2 2a2 2 0 0 0 0 2.828.75.75 0 0 1 0 1.06Z" />
                        </svg>
                        <input
                            type="text"
                            value={mapLink}
                            onChange={e => handleMapLink(e.target.value)}
                            onFocus={() => setLinkFocused(true)}
                            onBlur={() => setLinkFocused(false)}
                            placeholder="Paste Google Maps link..."
                            style={s.linkInput}
                            disabled={saving}
                        />
                    </div>
                    {saving && (
                        <div style={s.feedback(false)}>
                            <div style={{ width: 10, height: 10, border: '2px solid #818cf8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                            Updating...
                        </div>
                    )}
                    {saved && (
                        <div style={s.feedback(true)}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style={{ width: 12, height: 12 }}>
                                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                            </svg>
                            Location updated
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// Fit the map to the actual device positions once they load (so the view frames
// the real cameras — Guntur — instead of a hardcoded Bangalore center).
function FitToDevices({ devices }) {
    const map = useMap()
    const doneRef = useRef(false)
    useEffect(() => {
        if (doneRef.current || !devices || devices.length === 0) return
        const pts = devices.map((d, i) => resolvePosition(d, i)).filter((p) => Array.isArray(p))
        if (!pts.length) return
        try { map.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 15 }) } catch { /* noop */ }
        doneRef.current = true
    }, [devices, map])
    return null
}

export default function MapView() {
    const HQ = [16.4, 80.55] // Guntur/Vijayawada region (deployment area)
    const ESRI_SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
    const MAP_LAYERS = [
        { id: 'standard', label: 'Standard', url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}' },
        { id: 'traffic', label: 'Traffic', url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', traffic: true },
        { id: 'satellite', label: 'Satellite', url: ESRI_SATELLITE, labels: true },
    ]
    const TRAFFIC_TILE_URL = 'https://mt1.google.com/vt/lyrs=h,traffic&x={x}&y={y}&z={z}'
    const [devices, setDevices] = useState(() => deviceCache.devices ?? [])
    const [selected, setSelected] = useState(null)
    const [flyTarget, setFlyTarget] = useState(null)
    const [cameras, setCameras] = useState([])
    const [cameraLoading, setCameraLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [zoom, setZoom] = useState(12)
    const [mapSearch, setMapSearch] = useState('')
    const [searchOpen, setSearchOpen] = useState(false)
    const [mapLayer, setMapLayer] = useState('standard')
    const searchRef = useRef(null)

    useEffect(() => {
        const handler = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    useEffect(() => {
        setTimeout(() => window.dispatchEvent(new Event('resize')), 300)
        if (deviceCache.devices !== null) return
        deviceAPI.getDevices()
            .then(res => {
                const arr = Array.isArray(res.data) ? res.data : []
                cacheDeviceList(arr)
                setDevices(arr)
            })
            .catch(console.error)
    }, [])

    const pickDevice = (device) => {
        setSelected(device)
        const idx = devices.findIndex(d => d.id === device.id)
        setFlyTarget(resolvePosition(device, idx))
    }

    const handleCoordsUpdated = (deviceId, lat, lng) => {
        setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, latitude: lat, longitude: lng } : d))
        if (deviceCache.devices) {
            const idx = deviceCache.devices.findIndex(d => d.id === deviceId)
            if (idx >= 0) { deviceCache.devices[idx].latitude = lat; deviceCache.devices[idx].longitude = lng }
        }
    }

    const openCameras = async (device) => {
        setSelected(device)
        setShowModal(true)
        if (deviceCache.loadedIds.has(device.id)) {
            setCameras(getCamerasForDevice(device.id))
            return
        }
        setCameraLoading(true)
        try {
            const res = await deviceAPI.getCameras(device.id)
            const arr = Array.isArray(res.data) ? res.data : []
            cacheCamerasForDevice(device.id, device.name, arr)
            setCameras(arr)
        } catch {
            setCameras([])
        } finally {
            setCameraLoading(false)
        }
    }

    const activeLayer = MAP_LAYERS.find(l => l.id === mapLayer)

    return (
        <div className="h-full w-full relative">
            <MapContainer
                center={HQ}
                zoom={12}
                className={`map-layer-${mapLayer}`}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
                zoomControl={false}
            >
                <TileLayer
                    key={mapLayer}
                    attribution={activeLayer?.labels ? '&copy; Esri' : '&copy; Google Maps'}
                    url={activeLayer.url}
                />
                {activeLayer?.labels && (
                    <TileLayer
                        key="esri-labels"
                        url={ESRI_LABELS}
                        zIndex={10}
                    />
                )}
                {activeLayer?.traffic && (
                    <TileLayer
                        key="traffic-overlay"
                        url={TRAFFIC_TILE_URL}
                        opacity={0.7}
                        zIndex={10}
                    />
                )}
                <MapLayerClass layerId={mapLayer} />
                <FlyTo target={flyTarget} />
                <ZoomTracker onZoom={setZoom} />
                <FitToDevices devices={devices} />

                {/* HQ marker */}
                <Marker position={HQ} icon={createHQIcon()}>
                    <Popup>
                        <div style={{ minWidth: 140 }}>
                            <div style={{ fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#0B1726' }}>🏛️ Command Center</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Primary Hub Node</div>
                        </div>
                    </Popup>
                </Marker>

                {/* Device markers */}
                {devices.map((device, idx) => {
                    const pos = resolvePosition(device, idx)
                    const color = colorFromKey(deviceAreaKey(device))
                    const isOnline = device.status === 'online'
                    const isSelected = selected?.id === device.id
                    return (
                        <Marker
                            key={`${device.id}-${zoom}`}
                            position={pos}
                            icon={createPinIcon(color, isSelected, isOnline, zoom)}
                            eventHandlers={{ click: () => pickDevice(device) }}
                        >
                            <Popup>
                                <DevicePopupContent
                                    device={device}
                                    color={color}
                                    onCameras={openCameras}
                                    onCoordsUpdated={handleCoordsUpdated}
                                />
                            </Popup>
                        </Marker>
                    )
                })}
            </MapContainer>

            {/* ── Device Search ── */}
            <div ref={searchRef} className="absolute top-3 left-3 z-[1000] w-72">
                <div className="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none">
                        <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
                    </svg>
                    <input
                        type="text"
                        value={mapSearch}
                        onChange={e => { setMapSearch(e.target.value); setSearchOpen(true) }}
                        onFocus={() => mapSearch && setSearchOpen(true)}
                        placeholder="Search device by name or IP..."
                        className="w-full bg-white dark:bg-ink-900 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-slate-200 text-xs pl-8 pr-8 py-2.5 outline-none focus:border-amber-400 dark:focus:border-amber-600 placeholder-slate-400 dark:placeholder-slate-500 shadow-lg transition-colors"
                    />
                    {mapSearch && (
                        <button onClick={() => { setMapSearch(''); setSearchOpen(false) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs">✕</button>
                    )}
                </div>
                {searchOpen && mapSearch.trim() && (() => {
                    const q = mapSearch.toLowerCase()
                    const results = devices.filter(d =>
                        (d.name || '').toLowerCase().includes(q) ||
                        (d.host || '').toLowerCase().includes(q) ||
                        (d.ip || '').toLowerCase().includes(q) ||
                        (d.vpnIp || '').toLowerCase().includes(q)
                    ).slice(0, 8)
                    return results.length > 0 ? (
                        <div className="mt-1 bg-white dark:bg-ink-900 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                            {results.map(d => {
                                const isOnline = d.status === 'online'
                                return (
                                    <button
                                        key={d.id}
                                        onClick={() => { pickDevice(d); setMapSearch(''); setSearchOpen(false) }}
                                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-ink-950/60 transition-colors border-b border-slate-100 dark:border-white/5 last:border-0"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-red-400'}`} />
                                            <span className="text-slate-800 dark:text-slate-200 text-xs font-bold truncate">{d.name}</span>
                                        </div>
                                        <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 pl-4">{d.host}</p>
                                    </button>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="mt-1 bg-white dark:bg-ink-900 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl px-3 py-2.5">
                            <p className="text-slate-400 dark:text-slate-500 text-[10px]">No devices match "{mapSearch}"</p>
                        </div>
                    )
                })()}
            </div>

            {/* ── Map Layer Toggle ── */}
            <div className="absolute bottom-5 left-3 z-[1000] flex gap-1 bg-white dark:bg-ink-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-1">
                {MAP_LAYERS.map(layer => {
                    const active = mapLayer === layer.id
                    const icons = {
                        standard: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.157 2.175a1.5 1.5 0 0 0-1.147 0l-4.084 1.69A1.5 1.5 0 0 0 2 5.251v10.877a.75.75 0 0 0 1.028.696l3.47-1.388 3.825 1.596a1.5 1.5 0 0 0 1.147-.001l4.084-1.69A1.5 1.5 0 0 0 16.5 13.92V3.044a.75.75 0 0 0-1.028-.696l-3.47 1.388-3.845-1.56Z" clipRule="evenodd" /></svg>,
                        traffic: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M2.5 3A1.5 1.5 0 0 0 1 4.5v4A1.5 1.5 0 0 0 2.5 10h6A1.5 1.5 0 0 0 10 8.5v-4A1.5 1.5 0 0 0 8.5 3h-6Zm11 2A1.5 1.5 0 0 0 12 6.5v7a1.5 1.5 0 0 0 1.5 1.5h4a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 17.5 5h-4Zm-10 7A1.5 1.5 0 0 0 2 13.5v2A1.5 1.5 0 0 0 3.5 17h5A1.5 1.5 0 0 0 10 15.5v-2A1.5 1.5 0 0 0 8.5 12h-5Z" clipRule="evenodd" /></svg>,
                        satellite: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M16.5 8.5a4.5 4.5 0 0 1-1.32 3.18l1.06 1.06A6 6 0 0 0 18 8.5a6 6 0 0 0-1.76-4.24l-1.06 1.06A4.5 4.5 0 0 1 16.5 8.5ZM3.5 8.5a4.5 4.5 0 0 1 1.32-3.18L3.76 4.26A6 6 0 0 0 2 8.5c0 1.59.62 3.03 1.63 4.1l1.06-1.06A4.5 4.5 0 0 1 3.5 8.5ZM10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/></svg>,
                    }
                    return (
                        <button
                            key={layer.id}
                            onClick={() => setMapLayer(layer.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                                active
                                    ? 'bg-amber-600 text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-950/60'
                            }`}
                        >
                            {icons[layer.id]}
                            {layer.label}
                        </button>
                    )
                })}
            </div>

            {/* ── Camera Modal ── */}
            {showModal && selected && (
                <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className={`bg-white dark:bg-ink-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-white/5 w-full transition-all duration-300 ${cameras.length <= 1 ? 'max-w-4xl max-h-[80vh]' :
                            cameras.length <= 2 ? 'max-w-6xl max-h-[88vh]' :
                                cameras.length <= 4 ? 'max-w-7xl max-h-[92vh]' :
                                    'max-w-[96vw] max-h-[95vh]'
                        }`}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: colorFromKey(deviceAreaKey(selected)) }} />
                                <div>
                                    <h2 className="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-tight">{selected.name}</h2>
                                    <p className="text-[9px] text-slate-400 font-mono uppercase tracking-widest mt-0.5">{selected.host}</p>
                                </div>
                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ml-2 ${selected.status === 'online' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${selected.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
                                    {selected.status === 'online' ? 'Online' : 'Offline'}
                                </div>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 dark:bg-ink-950 text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 transition-all border border-slate-100 dark:border-white/5"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {cameraLoading ? (
                                <div className="flex items-center justify-center py-16 gap-3">
                                    <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">Loading cameras...</span>
                                </div>
                            ) : cameras.length === 0 ? (
                                <div className="text-center py-16 text-xs font-black text-slate-300 uppercase tracking-widest">No cameras on this device</div>
                            ) : (
                                <div className={`grid gap-4 ${cameras.length === 1 ? 'grid-cols-1' :
                                        cameras.length <= 4 ? 'grid-cols-2' :
                                            cameras.length <= 9 ? 'grid-cols-3' :
                                                'grid-cols-4'
                                    }`}>
                                    {cameras.map(cam => (
                                        <LiveCameraCell key={cam.id} camera={cam} device={selected} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
