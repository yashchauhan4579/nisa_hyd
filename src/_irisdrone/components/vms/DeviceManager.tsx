import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import {
  Server, Camera, Plus, Trash2, Search,
  ChevronRight, RefreshCw, Wifi, WifiOff, X,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { apiClient, type Device, type DeviceHeartbeatPoint } from '@irisdrone/lib/api'
import { Button } from '@irisdrone/components/ui/button'
import { cn } from '@irisdrone/lib/utils'

// Device IP (no port). Used for HLS (port 8888 is always MediaMTX).
function deviceIp(d: Device | undefined | null): string {
  if (!d) return ''
  return d.metadata?.wireguardIp
    || (d as any).runtimeInfo?.wg_interface_ip
    || d.metadata?.wg_interface_ip
    || d.metadata?.host
    || ''
}
// "ip:port" for the USSCore REST API proxy.
function edgeHost(d: Device | undefined | null): string {
  const ip = deviceIp(d)
  if (!ip) return ''
  const port = d?.metadata?.usscorePort || 8001
  return `${ip}:${port}`
}

// NVR brand RTSP URL templates
const NVR_BRANDS: Record<string, (host: string, user: string, pass: string, ch: number, sub: boolean) => string> = {
  Hikvision: (h, u, p, ch, sub) => `rtsp://${u}:${p}@${h}:554/Streaming/Channels/${ch * 100 + (sub ? 2 : 1)}`,
  Dahua: (h, u, p, ch, sub) => `rtsp://${u}:${p}@${h}/cam/realmonitor?channel=${ch}&subtype=${sub ? 1 : 0}`,
  'CP Plus': (h, u, p, ch, sub) => `rtsp://${u}:${p}@${h}:554/cam/realmonitor?channel=${ch}&subtype=${sub ? 1 : 0}`,
  Uniview: (h, u, p, ch, _sub) => `rtsp://${u}:${p}@${h}:554/media/video${ch}`,
  Axis: (h, u, p, ch, _sub) => `rtsp://${u}:${p}@${h}/axis-media/media.amp?camera=${ch}`,
  Bosch: (h, u, p, ch, _sub) => `rtsp://${u}:${p}@${h}/video${ch}`,
  Custom: (_h, _u, _p, _ch, _sub) => '',
}

interface VmsCamera {
  id: string
  name: string
  address: string
  brand: string
  status: string
}

export function VmsDeviceManager() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cameras, setCameras] = useState<VmsCamera[]>([])
  const [heartbeats, setHeartbeats] = useState<DeviceHeartbeatPoint[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [cameraLoading, setCameraLoading] = useState(false)

  // Add device form
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [addDeviceForm, setAddDeviceForm] = useState({ name: '', ip: '', lat: '', lng: '', station: '', location: '' })
  const [addDeviceLoading, setAddDeviceLoading] = useState(false)

  // Add camera form
  const [showAddCamera, setShowAddCamera] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '', brand: 'Hikvision', host: '', username: 'admin', password: '', channel: 1, subStream: false,
  })

  // Selected camera detail view
  const [selectedCam, setSelectedCam] = useState<VmsCamera | null>(null)

  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const loadDevices = async () => {
    setLoading(true)
    try {
      const devs = (await apiClient.getDevices()) as Device[]
      setDevices(devs.filter((d) => d.type === 'MAGICBOX' && d.metadata?.hasUssCore === true))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadDevices() }, [])

  const handleAddDevice = async () => {
    if (!addDeviceForm.ip.trim()) return
    setAddDeviceLoading(true)
    try {
      const name = addDeviceForm.name.trim() || `MagicBox ${addDeviceForm.ip}`
      const lat = parseFloat(addDeviceForm.lat)
      const lng = parseFloat(addDeviceForm.lng)
      const metadata: Record<string, unknown> = { wireguardIp: addDeviceForm.ip.trim() }
      if (addDeviceForm.station.trim()) metadata.station = addDeviceForm.station.trim()
      if (addDeviceForm.location.trim()) metadata.location = addDeviceForm.location.trim()
      const body: Record<string, unknown> = {
        id: `magicbox_${addDeviceForm.ip.replace(/\./g, '_')}`,
        name,
        type: 'MAGICBOX',
        status: 'active',
        metadata,
      }
      if (Number.isFinite(lat)) body.lat = lat
      if (Number.isFinite(lng)) body.lng = lng
      await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('iris_token')}` },
        body: JSON.stringify(body),
      })
      setShowAddDevice(false)
      setAddDeviceForm({ name: '', ip: '', lat: '', lng: '', station: '', location: '' })
      await loadDevices()
    } catch (e: any) {
      alert(e?.message || 'Failed to add device')
    }
    setAddDeviceLoading(false)
  }

  const selectedDevice = devices.find((d) => d.id === selectedId)

  // Load cameras & heartbeats when device selected
  useEffect(() => {
    if (!selectedId) { setCameras([]); setHeartbeats([]); return }

    setCameraLoading(true)
    const host = edgeHost(selectedDevice) || ''

    // Fetch cameras from edge device directly
    if (host) {
      fetch(`/api/edge/${host}/api/cameras`)
        .then((r) => r.json())
        .then((data: any[]) => {
          setCameras(data.map((c) => ({
            id: c.id,
            name: c.name,
            address: c.address || '',
            brand: c.brand?.String || c.brand || 'Unknown',
            status: c.status || 'unknown',
          })))
        })
        .catch(() => setCameras([]))
        .finally(() => setCameraLoading(false))
    } else {
      setCameraLoading(false)
    }

    // Fetch heartbeats
    apiClient.getDeviceHeartbeats(selectedId, { last: '24h' })
      .then(setHeartbeats)
      .catch(() => setHeartbeats([]))
  }, [selectedId, selectedDevice])

  const handleAddCamera = async () => {
    const host = edgeHost(selectedDevice)
    if (!host) return

    const brandFn = NVR_BRANDS[addForm.brand]
    const address = addForm.brand === 'Custom'
      ? addForm.host
      : brandFn(addForm.host, addForm.username, addForm.password, addForm.channel, addForm.subStream)

    try {
      await fetch(`/api/edge/${host}/api/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name,
          ip: addForm.host,
          address,
          brand: addForm.brand,
          username: addForm.username,
          password: addForm.password,
          channel: addForm.channel,
        }),
      })
      setShowAddCamera(false)
      setAddForm({ name: '', brand: 'Hikvision', host: '', username: 'admin', password: '', channel: 1, subStream: false })
      // Refresh cameras
      setSelectedId((id) => { const tmp = id; setSelectedId(null); setTimeout(() => setSelectedId(tmp), 100); return id })
    } catch {}
  }

  const handleDeleteCamera = async (camId: string) => {
    const host = edgeHost(selectedDevice)
    if (!host) return
    try {
      await fetch(`/api/edge/${host}/api/cameras/${camId}`, { method: 'DELETE' })
      setCameras((prev) => prev.filter((c) => c.id !== camId))
    } catch {}
  }

  const filtered = devices.filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.id.includes(search)
  )

  return (
    <div className="flex h-full text-zinc-100">
      {/* Device sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-white/10 bg-zinc-900/50 flex flex-col">
        <div className="p-3 border-b border-white/10">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">Edge Devices</h2>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-white/10 hover:bg-zinc-800" onClick={() => setShowAddDevice(true)}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search devices..."
              className="w-full bg-zinc-800 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-zinc-600 text-xs py-8">No devices found</p>
          ) : (
            filtered.map((dev) => {
              const isOnline = dev.status === 'ACTIVE' || dev.status === 'active'
              return (
                <button
                  key={dev.id}
                  onClick={() => setSelectedId(dev.id)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                    selectedId === dev.id ? 'bg-zinc-700/60 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  )}
                >
                  <div className="relative">
                    <Server className="h-5 w-5" />
                    <div className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900', isOnline ? 'bg-emerald-500' : 'bg-zinc-600')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{dev.name}</div>
                    <div className="truncate text-[11px] text-zinc-500">{dev.metadata?.wireguardIp || (dev as any).runtimeInfo?.wg_interface_ip || dev.metadata?.host || dev.id.slice(0, 12)}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600" />
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {!selectedDevice ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Server className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500">Select a device to manage</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Device header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">{selectedDevice.name}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    {(selectedDevice.status === 'ACTIVE' || selectedDevice.status === 'active')
                      ? <><Wifi className="h-3.5 w-3.5 text-emerald-500" /> Online</>
                      : <><WifiOff className="h-3.5 w-3.5 text-zinc-500" /> Offline</>
                    }
                  </span>
                  <span>{selectedDevice.metadata?.wireguardIp || (selectedDevice as any).runtimeInfo?.wg_interface_ip || selectedDevice.metadata?.host || '-'}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setSelectedId(null); setTimeout(() => setSelectedId(selectedDevice.id), 50) }} className="gap-2 border-white/10 text-zinc-300">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>

            {/* Health chart */}
            {heartbeats.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
                <h3 className="text-sm font-medium text-zinc-300 mb-3">Health (24h)</h3>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={heartbeats.map((h) => ({ time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: h.cameraStatus === 'online' ? 1 : 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 10 }} />
                    <YAxis tick={false} domain={[0, 1]} />
                    <Tooltip contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e4e4e7' }} />
                    <Area type="stepAfter" dataKey="status" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Cameras */}
            <div className="rounded-xl border border-white/10 bg-zinc-900/50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h3 className="text-sm font-medium text-zinc-300">Cameras ({cameras.length})</h3>
                <Button variant="outline" size="sm" onClick={() => setShowAddCamera(true)} className="gap-1.5 border-white/10 text-zinc-300">
                  <Plus className="h-3.5 w-3.5" /> Add Camera
                </Button>
              </div>

              {cameraLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
                </div>
              ) : cameras.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 text-sm">No cameras configured</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {cameras.map((cam) => (
                    <div
                      key={cam.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 cursor-pointer transition",
                        selectedCam?.id === cam.id ? "bg-amber-600/10 border-l-2 border-amber-500" : "hover:bg-zinc-800/50 border-l-2 border-transparent"
                      )}
                      onClick={() => setSelectedCam(selectedCam?.id === cam.id ? null : cam)}
                    >
                      <Camera className="h-5 w-5 text-zinc-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate">{cam.name}</div>
                        <div className="text-[11px] text-zinc-500 truncate">{cam.brand} &middot; {cam.address.replace(/\/\/.*@irisdrone/, '//***@')}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-red-400" onClick={(e) => { e.stopPropagation(); handleDeleteCamera(cam.id) }} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Camera Detail View */}
            {selectedCam && (() => {
              const ip = deviceIp(selectedDevice)
              const host = ip
              const target = `http://${ip}:8888/camera_${selectedCam.id}/`
              const encoded = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
              const streamUrl = `/api/stream/p/${encoded}/index.m3u8`
              const rtspParts = selectedCam.address.match(/\/\/(?:.*@)?([^:/]+)/)
              const camIp = rtspParts ? rtspParts[1] : '-'

              return (
                <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <h3 className="text-sm font-medium text-zinc-200">{selectedCam.name}</h3>
                    <button onClick={() => setSelectedCam(null)} className="text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-col lg:flex-row">
                    {/* Stream preview */}
                    <div className="flex-1 aspect-video bg-black">
                      <PreviewPlayer src={streamUrl} />
                    </div>
                    {/* Properties sidebar */}
                    <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-white/10 p-4 space-y-4">
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Properties</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Camera IP</span>
                            <span className="text-zinc-200 font-mono text-xs">{camIp}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Brand</span>
                            <span className="text-zinc-200">{selectedCam.brand}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Status</span>
                            <span className={selectedCam.status === 'online' ? 'text-emerald-400' : 'text-zinc-400'}>{selectedCam.status}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Device</span>
                            <span className="text-zinc-200 text-xs truncate max-w-[140px]">{selectedDevice.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Device IP</span>
                            <span className="text-zinc-200 font-mono text-xs">{host}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">RTSP URL</h4>
                        <div className="bg-zinc-800 rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-400 break-all">
                          {selectedCam.address.replace(/\/\/.*@irisdrone/, '//***@')}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Location</h4>
                        <div className="text-sm text-zinc-300">
                          {selectedDevice.metadata?.station || '-'}, {selectedDevice.metadata?.location || '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Add Camera Form */}
            {showAddCamera && (
              <div className="rounded-xl border border-emerald-800/50 bg-zinc-900/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-zinc-200">Add Camera</h3>
                  <button onClick={() => setShowAddCamera(false)} className="text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-500">Name</label>
                    <input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" placeholder="Camera 1" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Brand</label>
                    <select value={addForm.brand} onChange={(e) => setAddForm({ ...addForm, brand: e.target.value })} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none cursor-pointer">
                      {Object.keys(NVR_BRANDS).map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">NVR/Camera IP</label>
                    <input value={addForm.host} onChange={(e) => setAddForm({ ...addForm, host: e.target.value })} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" placeholder="192.168.1.100" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Channel</label>
                    <input type="number" min={1} value={addForm.channel} onChange={(e) => setAddForm({ ...addForm, channel: parseInt(e.target.value) || 1 })} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Username</label>
                    <input value={addForm.username} onChange={(e) => setAddForm({ ...addForm, username: e.target.value })} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Password</label>
                    <input type="password" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={addForm.subStream} onChange={(e) => setAddForm({ ...addForm, subStream: e.target.checked })} className="rounded" />
                    Sub-stream
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAddCamera(false)} className="border-white/10 text-zinc-400">Cancel</Button>
                  <Button size="sm" onClick={handleAddCamera} disabled={!addForm.name || !addForm.host} className="bg-emerald-600 hover:bg-emerald-700 text-white">Add Camera</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Device modal */}
      {showAddDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowAddDevice(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Edge Device</h3>
              <button onClick={() => setShowAddDevice(false)} className="text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Device IP (WireGuard)</label>
                <input
                  value={addDeviceForm.ip}
                  onChange={(e) => setAddDeviceForm(f => ({ ...f, ip: e.target.value }))}
                  placeholder="e.g. 10.10.0.6"
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Device Name (optional)</label>
                <input
                  value={addDeviceForm.name}
                  onChange={(e) => setAddDeviceForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Khanapur Jamboti"
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Police Station</label>
                  <input
                    value={addDeviceForm.station}
                    onChange={(e) => setAddDeviceForm(f => ({ ...f, station: e.target.value }))}
                    placeholder="e.g. Khanapur"
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Location Name</label>
                  <input
                    value={addDeviceForm.location}
                    onChange={(e) => setAddDeviceForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. Jamboti cross"
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Latitude</label>
                  <input
                    value={addDeviceForm.lat}
                    onChange={(e) => setAddDeviceForm(f => ({ ...f, lat: e.target.value }))}
                    placeholder="e.g. 15.644490"
                    inputMode="decimal"
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Longitude</label>
                  <input
                    value={addDeviceForm.lng}
                    onChange={(e) => setAddDeviceForm(f => ({ ...f, lng: e.target.value }))}
                    placeholder="e.g. 74.503800"
                    inputMode="decimal"
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-500/50 font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAddDevice(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddDevice} disabled={addDeviceLoading || !addDeviceForm.ip.trim()}>
                  {addDeviceLoading ? 'Adding...' : 'Add Device'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setPreviewUrl(null)}>
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-medium text-zinc-200">Live Preview</h3>
              <button onClick={() => setPreviewUrl(null)} className="text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="aspect-video bg-black">
              <PreviewPlayer src={previewUrl} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.play().catch(() => {})
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [src])

  return <video ref={videoRef} className="w-full h-full object-contain" muted playsInline />
}
