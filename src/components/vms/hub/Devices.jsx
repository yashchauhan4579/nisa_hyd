import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { deviceAPI, magicboxAPI, deploymentAPI, userAPI, analyticsAPI } from './utils/api'
import Playback from './Playback.jsx'
import ProvisionCameraModal from './ProvisionCameraModal'
import { resolvePosition } from './utils/resolvePosition'
import { deviceCache, cacheDeviceList, cacheCamerasForDevice, getCamerasForDevice, invalidateDevice } from './utils/deviceCache'

function LivePreviewModal({ camera, onClose }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!camera) return undefined

    const video = videoRef.current
    if (!video) return undefined

    const cameraPathId = camera.magicboxCameraId || camera.id
    const target = `http://${camera.deviceHost}:8888/camera_${cameraPathId}/`
    const encoded = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const streamUrl = target + "index.m3u8"

    setLoading(true)
    setError('')

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (video) {
        video.pause()
        video.removeAttribute('src')
        try { video.load() } catch (_) { }
      }
    }

    if (Hls.isSupported()) {
      // Only forward the session bearer over TLS or loopback. Edge MediaMTX is
      // served over plaintext http://<edge>:8888 and does NOT validate the IRIS
      // token, so injecting it there is useless and would leak it on the wire.
      const token = localStorage.getItem('token')
      const authSafe = /^https:/i.test(streamUrl) || /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(streamUrl)
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingMaxRetry: 8,
        manifestLoadingRetryDelay: 2000,
        manifestLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 2000,
        levelLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 2000,
        xhrSetup: (authSafe && token) ? (xhr) => { xhr.setRequestHeader('Authorization', `Bearer ${token}`) } : undefined,
      })

      hlsRef.current = hls
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false)
        video.play().catch(() => { })
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return
        setLoading(false)
        setError('Live stream unavailable for this camera.')
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        setLoading(false)
        video.play().catch(() => { })
      }, { once: true })
      video.addEventListener('error', () => {
        setLoading(false)
        setError('Live stream unavailable for this camera.')
      }, { once: true })
    } else {
      setLoading(false)
      setError('HLS is not supported in this browser.')
    }

    return cleanup
  }, [camera])

  if (!camera) return null

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl dark:border-[#1f1f1f]/60 dark:bg-black animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-[#1f1f1f]/60 dark:bg-[#0f0f0f]/70">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-600 dark:text-amber-400">Live Preview</p>
            <h3 className="truncate text-sm font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">{camera.name}</h3>
            <p className="truncate text-[10px] font-mono text-slate-500 dark:text-slate-400">{camera.host}{camera.brand ? ` • ${camera.brand.toUpperCase()}` : ''}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-all hover:bg-white hover:text-slate-900 dark:border-[#1f1f1f] dark:text-slate-400 dark:hover:bg-[#1a1a1a] dark:hover:text-slate-100"
            aria-label="Close live preview"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="bg-slate-950 p-4">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-800 bg-black">
            <video
              ref={videoRef}
              className="h-full w-full bg-black object-contain"
              controls
              autoPlay
              muted
              playsInline
            />

            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90">
                <div className="h-10 w-10 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Connecting Feed</p>
              </div>
            )}

            {!loading && error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/95 px-6 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-slate-600">
                  <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                </svg>
                <p className="text-xs font-black uppercase tracking-widest text-white">Feed not available</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{error}</p>
              </div>
            )}

            {!loading && !error && (
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white">Live</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import { extractLatLngFromMapsUrl } from './utils/parseMapLink'

export default function Devices({ user }) {
  const navigate = useNavigate()
  const [devices, setDevices] = useState(() => deviceCache.devices ?? [])
  const [selectedId, setSelectedId] = useState(null)
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(deviceCache.devices === null)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [editingDevice, setEditingDevice] = useState(null)
  const [editingCamera, setEditingCamera] = useState(null)
  const [showAddCamera, setShowAddCamera] = useState(false)
  const [showProvision, setShowProvision] = useState(false) // add camera directly onto the edge MagicBox
  const [deviceForm, setDeviceForm] = useState({ name: '', host: '', latitude: '', longitude: '' })
  const [cameraForm, setCameraForm] = useState({ name: '', brand: '', host: '', username: '', password: '', connectionType: 'direct', primaryStream: '', subStream: '', notes: '' })
  const [addCameraStep, setAddCameraStep] = useState(1) // 1: connection type, 2: nvr details, 3: channel selection
  const [nvrForm, setNvrForm] = useState({ brand: '', host: '', username: '', password: '' })
  const [discoveredChannels, setDiscoveredChannels] = useState([])
  const [selectedChannels, setSelectedChannels] = useState([])
  const [, setMagicboxCameras] = useState([])
  const [loadingMagicboxCameras, setLoadingMagicboxCameras] = useState(false)
  const [, setMagicboxError] = useState('')
  const [previewCamera, setPreviewCamera] = useState(null)
  // Per-camera analytics assignment: camera being configured + a lookup of
  // existing assignments keyed by `${host}|${streamId}` (vms_cameras rows).
  const [aiCam, setAiCam] = useState(null)
  const [assignedMap, setAssignedMap] = useState({})
  const refreshAssigned = async () => {
    try {
      const rows = await analyticsAPI.rows()
      const map = {}
      for (const r of rows) {
        const key = `${r.host}|${r.streamId || r.id}`
        map[key] = { vmsId: r.id, analytics: Array.isArray(r.analytics) ? r.analytics : [] }
      }
      setAssignedMap(map)
    } catch { /* offline */ }
  }
  useEffect(() => { refreshAssigned() }, [])
  const assignedFor = (c) => assignedMap[`${c.host}|${c.magicboxCameraId || c.id}`]?.analytics || []
  const [showPlayback, setShowPlayback] = useState(false)
  const [error, setError] = useState('')
  const [coordEdit, setCoordEdit] = useState({ lat: '', lng: '' })
  const [coordSaving, setCoordSaving] = useState(false)
  const [healthData, setHealthData] = useState([])
  const [healthLoading, setHealthLoading] = useState(false)
  const [, setHealthPage] = useState(20)
  const [healthDetailsOpen, setHealthDetailsOpen] = useState(false)
  const [healthChartMode, setHealthChartMode] = useState('area')
  const [deviceSearch, setDeviceSearch] = useState('')
  const [deployStations, setDeployStations] = useState([])
  const [selectedStationId, setSelectedStationId] = useState('')
  const [stationSearch, setStationSearch] = useState('')
  const [stationDropdownOpen, setStationDropdownOpen] = useState(false)

  const [allUsers, setAllUsers] = useState([])

  // Fetch deployment stations + users for the station picker & auto-assign
  useEffect(() => {
    deploymentAPI.getTree().then(res => {
      const stations = []
      for (const div of (res.data?.divisions || [])) {
        for (const st of (div.stations || [])) {
          stations.push({ id: st.id, name: st.name, division: div.name })
        }
      }
      stations.sort((a, b) => a.name.localeCompare(b.name))
      setDeployStations(stations)
    }).catch(() => {})
    userAPI.list().then(res => setAllUsers(res.data || [])).catch(() => {})
  }, [])

  const filteredStations = deployStations.filter(s => {
    if (!stationSearch.trim()) return true
    const q = stationSearch.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.division.toLowerCase().includes(q)
  })

  const filteredDevices = devices.filter(d => {
    if (!deviceSearch.trim()) return true
    const q = deviceSearch.toLowerCase()
    return (d.name || '').toLowerCase().includes(q) ||
           (d.host || '').toLowerCase().includes(q) ||
           (d.ip || '').toLowerCase().includes(q) ||
           (d.vpnIp || '').toLowerCase().includes(q)
  })

  const fetchDevices = async () => {
    setLoading(true)
    try {
      const response = await deviceAPI.getDevices()
      // Hide the stray "Channel 1" (space-variant duplicate of "Channel1") from
      // the VMS devices list — kept in the DB so its detections survive.
      const HIDDEN_DEVICE_IDS = new Set(['Channel 1'])
      const arr = (Array.isArray(response.data) ? response.data : []).filter((d) => !HIDDEN_DEVICE_IDS.has(d.id))
      cacheDeviceList(arr)
      setDevices(arr)
      if (arr.length && !selectedId) setSelectedId(arr[0].id)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchHealth = async (deviceId) => {
    if (!deviceId) return
    setHealthData([])
    setHealthPage(20)
    setHealthLoading(true)
    try {
      const res = await deviceAPI.getDeviceHealth(deviceId)
      setHealthData(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      setHealthData([])
    } finally {
      setHealthLoading(false)
    }
  }

  const fetchCameras = async (deviceId) => {
    if (!deviceId) return setCameras([])
    // Use cached cameras if available
    if (deviceCache.loadedIds.has(deviceId)) {
      setCameras(getCamerasForDevice(deviceId))
      return
    }
    try {
      const response = await deviceAPI.getCameras(deviceId)
      const arr = Array.isArray(response.data) ? response.data : []
      const device = devices.find(d => d.id === deviceId)
      cacheCamerasForDevice(deviceId, device?.name ?? '', arr)
      setCameras(arr)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }

  const fetchMagicboxCameras = async (deviceId) => {
    setLoadingMagicboxCameras(true)
    setMagicboxError('')
    try {
      // Sync cameras from Magicbox device
      const response = await magicboxAPI.syncCameras(deviceId)
      const syncResults = response.data

      console.log('Sync results:', syncResults)

      // Invalidate cache for this device then fetch fresh cameras
      invalidateDevice(deviceId)
      await fetchCameras(deviceId)

      setMagicboxCameras([]) // Clear magicbox cameras since they're now in local database
    } catch (e) {
      console.error('Failed to sync Magicbox cameras:', e)
      if (e.response?.status === 404) {
        setMagicboxError('Magicbox API not found. Make sure the device is running.')
      } else if (e.response?.status === 500) {
        setMagicboxError('Magicbox device error. Check device status.')
      } else {
        setMagicboxError(e.response?.data?.error || e.message)
      }
      setMagicboxCameras([])
    } finally {
      setLoadingMagicboxCameras(false)
    }
  }

  useEffect(() => {
    if (deviceCache.devices !== null) {
      // Hydrate from cache — pick first device if nothing selected
      if (!selectedId && deviceCache.devices.length) setSelectedId(deviceCache.devices[0].id)
      setLoading(false)
    } else {
      fetchDevices()
    }
  }, [])
  useEffect(() => {
    if (selectedId) {
      fetchCameras(selectedId)
      fetchHealth(selectedId)
      setShowPlayback(false)
    }
  }, [selectedId])

  useEffect(() => {
    const idx = devices.findIndex(x => x.id === selectedId)
    if (idx === -1) return
    const d = devices[idx]
    const hasStored = d.latitude != null && d.longitude != null && String(d.latitude) !== '' && String(d.longitude) !== ''
    if (hasStored) {
      setCoordEdit({ lat: String(d.latitude), lng: String(d.longitude) })
    } else {
      const [lat, lng] = resolvePosition(d, idx)
      setCoordEdit({ lat: lat.toFixed(6), lng: lng.toFixed(6) })
    }
  }, [selectedId])
  useEffect(() => { if (selectedId) fetchMagicboxCameras(selectedId) }, [selectedId])

  const saveCoords = async (overrideCoords) => {
    if (!selectedId) return
    const coords = overrideCoords || coordEdit
    setCoordSaving(true)
    try {
      const device = devices.find(d => d.id === selectedId)
      await deviceAPI.updateDevice(selectedId, {
        name: device.name, host: device.host,
        latitude: parseFloat(coords.lat), longitude: parseFloat(coords.lng)
      })
      await fetchDevices()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setCoordSaving(false)
    }
  }

  const onDeviceChange = (e) => setDeviceForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  const onCameraChange = (e) => setCameraForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  const onNvrChange = (e) => setNvrForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const addDevice = async (e) => {
    e.preventDefault(); setError('')
    try {
      const payload = { ...deviceForm }
      if (payload.latitude !== '') payload.latitude = parseFloat(payload.latitude)
      if (payload.longitude !== '') payload.longitude = parseFloat(payload.longitude)
      const res = await deviceAPI.createDevice(payload)
      const newDeviceId = res.data?.id
      // Create deployment device entry
      deploymentAPI.createDevice({ stationId: parseInt(selectedStationId), serial: '', ip: deviceForm.host, location: deviceForm.name, status: 'UP', reason: '' }).catch(() => {})
      // Auto-assign to user matching the station name
      if (newDeviceId) {
        const station = deployStations.find(s => s.id === parseInt(selectedStationId))
        if (station) {
          const stName = station.name.toLowerCase().replace(/\s*(ps|police\s*station|station)\s*$/i, '').trim()
          const matchedUser = allUsers.find(u => u.role === 'user' && stName && u.name.toLowerCase().trim().includes(stName))
          if (matchedUser) {
            userAPI.getAssignedDevices(matchedUser.id).then(existing => {
              const currentIds = (existing.data || []).map(d => d.id)
              if (!currentIds.includes(newDeviceId)) {
                userAPI.setAssignedDevices(matchedUser.id, [...currentIds, newDeviceId]).catch(() => {})
              }
            }).catch(() => {})
          }
        }
      }
      setShowAddDevice(false)
      setDeviceForm({ name: '', host: '', latitude: '', longitude: '' })
      setSelectedStationId('')
      setStationSearch('')
      fetchDevices()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }


  const openEditDevice = (device) => {
    setEditingDevice(device)
    setDeviceForm({
      name: device.name,
      host: device.host,
      latitude: device.latitude || '',
      longitude: device.longitude || ''
    })
  }

  const updateDevice = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const payload = { ...deviceForm }
      if (payload.latitude !== '') payload.latitude = parseFloat(payload.latitude)
      if (payload.longitude !== '') payload.longitude = parseFloat(payload.longitude)
      await deviceAPI.updateDevice(editingDevice.id, payload)
      setEditingDevice(null)
      setDeviceForm({ name: '', host: '', latitude: '', longitude: '' })
      fetchDevices()
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }

  const addCamera = async (e) => {
    e.preventDefault(); setError('')
    try {
      await deviceAPI.addCamera(selectedId, cameraForm)
      setShowAddCamera(false)
      setCameraForm({ name: '', brand: '', host: '', username: '', password: '', connectionType: 'direct', primaryStream: '', subStream: '', notes: '' })
      fetchCameras(selectedId)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }

  const canDelete = (user?.email === 'admin@example.com')

  const removeDevice = async (deviceId) => {
    if (!canDelete) return setError('Only admin@example.com can delete devices')
    if (!confirm('Are you sure you want to delete this device?')) return

    setError('')
    try {
      await deviceAPI.deleteDevice(deviceId)
      // If the deleted device was selected, clear or switch selection
      setSelectedId(prev => (String(prev) === String(deviceId) ? null : prev))
      await fetchDevices()
      setCameras([])
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }

  const openEditCamera = (camera) => {
    setEditingCamera(camera)
    setCameraForm({
      ...camera,
      notes: camera.notes || '',
      username: camera.username || '',
      password: '',
      primaryStream: camera.primaryStream || '',
      subStream: camera.subStream || ''
    })
  }

  const updateCamera = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await deviceAPI.updateCamera(selectedId, editingCamera.id, cameraForm)
      setEditingCamera(null)
      // Reset form properly
      setCameraForm({ name: '', brand: '', host: '', username: '', password: '', connectionType: 'direct', primaryStream: '', subStream: '', notes: '' })
      fetchCameras(selectedId)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }

  const deleteCamera = async (cameraId) => {
    if (!confirm('Remove camera source?')) return
    try { await deviceAPI.deleteCamera(selectedId, cameraId); fetchCameras(selectedId) } catch (e) { setError(e.message) }
  }


  const discoverNvrChannels = async () => {
    setError('')
    try {
      // Mock channel discovery - in real implementation, this would call NVR API
      const mockChannels = [
        { id: 1, name: 'Channel 1', status: 'online', resolution: '1920x1080' },
        { id: 2, name: 'Channel 2', status: 'online', resolution: '1920x1080' },
        { id: 3, name: 'Channel 3', status: 'offline', resolution: '1280x720' },
        { id: 4, name: 'Channel 4', status: 'online', resolution: '1920x1080' },
        { id: 5, name: 'Channel 5', status: 'online', resolution: '1280x720' },
      ]
      setDiscoveredChannels(mockChannels)
      setAddCameraStep(3)
    } catch (e) { setError(e.message) }
  }

  const toggleChannel = (channelId) => {
    setSelectedChannels(prev =>
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    )
  }

  const generateRtspUrls = (brand, host, username, password, channelId) => {
    const auth = username && password ? `${username}:${password}@` : ''

    switch (brand.toLowerCase()) {
      case 'hikvision':
        return {
          primary: `rtsp://${auth}${host}:554/Streaming/Channels/${channelId}01`,
          sub: `rtsp://${auth}${host}:554/Streaming/Channels/${channelId}02`
        }

      case 'dahua':
        return {
          primary: `rtsp://${auth}${host}:554/cam/realmonitor?channel=${channelId}&subtype=0`,
          sub: `rtsp://${auth}${host}:554/cam/realmonitor?channel=${channelId}&subtype=1`
        }

      case 'cp_plus':
      case 'cpplus':
        // CP Plus uses Dahua protocol
        return {
          primary: `rtsp://${auth}${host}:554/cam/realmonitor?channel=${channelId}&subtype=0`,
          sub: `rtsp://${auth}${host}:554/cam/realmonitor?channel=${channelId}&subtype=1`
        }

      case 'uniview':
        return {
          primary: `rtsp://${auth}${host}:554/unicast/c${channelId}/s0/live`,
          sub: `rtsp://${auth}${host}:554/unicast/c${channelId}/s1/live`
        }

      case 'ezviz':
        return {
          primary: `rtsp://${auth}${host}:554/h264/ch${channelId}/main/av_stream`,
          sub: `rtsp://${auth}${host}:554/h264/ch${channelId}/sub/av_stream`
        }

      case 'axis':
        return {
          primary: `rtsp://${auth}${host}/axis-media/media.amp?videocodec=h264&streamprofile=Quality`,
          sub: `rtsp://${auth}${host}/axis-media/media.amp?videocodec=h264&streamprofile=Balanced`
        }

      case 'bosch':
        return {
          primary: `rtsp://${auth}${host}/rtsp_tunnel?h26x=4&line=${channelId}&inst=1`,
          sub: `rtsp://${auth}${host}/rtsp_tunnel?h26x=4&line=${channelId}&inst=2`
        }

      case 'samsung':
        return {
          primary: `rtsp://${auth}${host}/profile${channelId}/media.smp`,
          sub: `rtsp://${auth}${host}/profile${channelId + 100}/media.smp`
        }

      case 'honeywell':
        // Honeywell uses Hikvision protocol
        return {
          primary: `rtsp://${auth}${host}:554/Streaming/Channels/${channelId}01`,
          sub: `rtsp://${auth}${host}:554/Streaming/Channels/${channelId}02`
        }

      case 'matrix':
        return {
          primary: `rtsp://${auth}${host}:554/cam${channelId}/mpeg4`,
          sub: `rtsp://${auth}${host}:554/cam${channelId}/mjpeg`
        }

      case 'godrej':
        // Godrej often uses Dahua protocol
        return {
          primary: `rtsp://${auth}${host}:554/cam/realmonitor?channel=${channelId}&subtype=0`,
          sub: `rtsp://${auth}${host}:554/cam/realmonitor?channel=${channelId}&subtype=1`
        }

      case 'zicom':
        return {
          primary: `rtsp://${auth}${host}:554/ch${channelId}/0`,
          sub: `rtsp://${auth}${host}:554/ch${channelId}/1`
        }

      case 'tvt':
        // TVT uses similar to Hikvision
        return {
          primary: `rtsp://${auth}${host}:554/Streaming/Channels/${channelId}01`,
          sub: `rtsp://${auth}${host}:554/Streaming/Channels/${channelId}02`
        }

      case 'hdview':
        return {
          primary: `rtsp://${auth}${host}:554/ch${channelId}/0`,
          sub: `rtsp://${auth}${host}:554/ch${channelId}/1`
        }

      case 'provision_isr':
      case 'provision':
        // Provision ISR uses Hikvision protocol
        return {
          primary: `rtsp://${auth}${host}:554/Streaming/Channels/${channelId}01`,
          sub: `rtsp://${auth}${host}:554/Streaming/Channels/${channelId}02`
        }

      case 'securus':
        return {
          primary: `rtsp://${auth}${host}:554/stream${channelId}`,
          sub: `rtsp://${auth}${host}:554/stream${channelId}_sub`
        }

      case 'panasonic':
        return {
          primary: `rtsp://${auth}${host}:554/MediaInput/h264/stream_${channelId}`,
          sub: `rtsp://${auth}${host}:554/MediaInput/h264/stream_${channelId}_sub`
        }

      default:
        // Default to Dahua format (most compatible)
        return {
          primary: `rtsp://${auth}${host}:554/cam/realmonitor?channel=${channelId}&subtype=0`,
          sub: `rtsp://${auth}${host}:554/cam/realmonitor?channel=${channelId}&subtype=1`
        }
    }
  }

  const addSelectedChannels = async () => {
    setError('')
    try {
      const selectedChannelsData = discoveredChannels.filter(c => selectedChannels.includes(c.id))
      for (const channel of selectedChannelsData) {
        const rtspUrls = generateRtspUrls(nvrForm.brand, nvrForm.host, nvrForm.username, nvrForm.password, channel.id)

        const cameraData = {
          name: channel.name,
          brand: nvrForm.brand,
          host: nvrForm.host,
          username: nvrForm.username,
          password: nvrForm.password,
          channel: channel.id,
          connectionType: 'nvr',
          primaryStream: rtspUrls.primary,
          subStream: rtspUrls.sub,
          notes: `NVR Channel ${channel.id} - ${channel.resolution}`
        }
        await deviceAPI.addCamera(selectedId, cameraData)
      }
      setShowAddCamera(false)
      setAddCameraStep(1)
      setNvrForm({ brand: '', host: '', username: '', password: '' })
      setDiscoveredChannels([])
      setSelectedChannels([])
      fetchCameras(selectedId)
    } catch (e) { setError(e.message) }
  }

  const resetAddCamera = () => {
    setShowAddCamera(false)
    setAddCameraStep(1)
    setCameraForm({ name: '', brand: '', host: '', username: '', password: '', connectionType: 'direct', primaryStream: '', subStream: '', notes: '' })
    setNvrForm({ brand: '', host: '', username: '', password: '' })
    setDiscoveredChannels([])
    setSelectedChannels([])
    setError('')
  }

  return (
    <div className="h-full grid grid-cols-[280px_1fr] gap-3">
      {/* ── Sidebar: MagicBox Selection ── */}
      <aside className="rounded-md border border-slate-200/60 dark:border-white/5 bg-white dark:bg-ink-900 flex flex-col overflow-hidden shadow-sm">
        <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-ink-950">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 leading-none">Infrastructure</span>
            <span className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter leading-none">MagicBoxes</span>
          </div>
          <button
            onClick={() => setShowAddDevice(true)}
            className="w-8 h-8 rounded-lg bg-[#0B1726] text-white flex items-center justify-center hover:bg-black transition-all shadow-xl shadow-black/5 active:scale-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
          </button>
        </div>

        <div className="px-2 pt-2 shrink-0">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-slate-500 pointer-events-none">
              <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              value={deviceSearch}
              onChange={e => setDeviceSearch(e.target.value)}
              placeholder="Search name or IP..."
              className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/5 rounded-lg text-slate-700 dark:text-slate-200 text-[11px] pl-7 pr-7 py-1.5 outline-none focus:border-amber-400 dark:focus:border-amber-600 placeholder-slate-400 dark:placeholder-slate-600 transition-colors"
            />
            {deviceSearch && (
              <button onClick={() => setDeviceSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 text-xs">✕</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 custom-scrollbar">
          {loading && <div className="text-center py-6 animate-pulse text-[10px] font-black text-slate-400 uppercase tracking-widest">Scanning...</div>}
          {!loading && filteredDevices.length === 0 && deviceSearch.trim() && (
            <div className="text-center py-6 text-[10px] text-slate-400 dark:text-slate-500">No devices match "{deviceSearch}"</div>
          )}
          {filteredDevices.map(d => (
            <div
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`relative group p-2 rounded-lg border cursor-pointer transition-all duration-200 ${selectedId === d.id
                ? 'bg-slate-50 dark:bg-ink-950/80 border-slate-300 dark:border-white/10 shadow-sm'
                : 'bg-white dark:bg-ink-900 border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10 hover:bg-slate-50/50 dark:hover:bg-ink-950/50'
                }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${selectedId === d.id ? 'bg-white dark:bg-ink-950 shadow-sm border border-slate-200 dark:border-white/10' : 'bg-slate-50 dark:bg-ink-950/80 border border-slate-100 dark:border-white/5'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 ${selectedId === d.id ? 'text-slate-700' : 'text-slate-400'}`}>
                    <path fillRule="evenodd" d="M2.25 5.25A3 3 0 015.25 2.25h13.5a3 3 0 013 3v13.5a3 3 0 01-3 3H5.25a3 3 0 01-3-3V5.25zm5.25 3a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM7.5 12a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 12zm.75 3a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${d.status === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                    <span className={`w-1 h-1 rounded-full ${d.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {d.status}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditDevice(d) }}
                    className={`p-1 rounded border transition-all ${selectedId === d.id ? 'bg-white dark:bg-ink-950 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-amber-600' : 'bg-white dark:bg-ink-950 border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-400 hover:text-amber-600 hover:border-amber-200 dark:hover:border-amber-500'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="text-[10px] font-black tracking-tight uppercase truncate leading-snug text-slate-900 dark:text-slate-100">{d.name}</h3>
                {d.users?.length > 0 && <p className="text-[8px] font-bold uppercase tracking-widest mt-0.5 truncate text-amber-500 dark:text-amber-400">{d.users[0].name}</p>}
                <p className="text-[9px] font-mono mt-0.5 truncate opacity-60 text-slate-500 dark:text-slate-400">{d.host}</p>
              </div>

            </div>
          ))}
        </div>
      </aside>

      {/* ── Main Panel ── */}
      <section className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-ink-900 shadow-sm overflow-hidden flex flex-col">
        {showPlayback ? (
          <Playback deviceId={selectedId} cameras={cameras} onClose={() => setShowPlayback(false)} />
        ) : !showAddCamera ? (
          <div className="flex-1 flex flex-col min-h-0">
            {selectedId ? (() => {
              const selDevice = devices.find(x => x.id === selectedId)
              return (
                <>
                  {/* ── Device Header ── */}
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/40 dark:bg-ink-950/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${selDevice?.status === 'online' ? 'bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50' : 'bg-red-500/10 border border-red-200 dark:border-red-800/50'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${selDevice?.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                            <path fillRule="evenodd" d="M2.25 5.25A3 3 0 015.25 2.25h13.5a3 3 0 013 3v13.5a3 3 0 01-3 3H5.25a3 3 0 01-3-3V5.25zm5.25 3a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM7.5 12a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 12zm.75 3a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{selDevice?.name}</h2>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{selDevice?.host}</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${selDevice?.status === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${selDevice?.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              {selDevice?.status || 'unknown'}
                            </span>
                            {cameras.length > 0 && <span className="text-[10px] text-slate-400 font-medium">{cameras.length} camera{cameras.length !== 1 ? 's' : ''}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => navigate('/dashboard/recordings?deviceId=' + selectedId)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                          Recordings
                        </button>
                        <button
                          onClick={() => fetchMagicboxCameras(selectedId)}
                          disabled={loadingMagicboxCameras}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 transition-colors disabled:opacity-40"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 ${loadingMagicboxCameras ? 'animate-spin' : ''}`}>
                            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.45a.75.75 0 0 0 0-1.5H4.141a.75.75 0 0 0-.75.75v4.109a.75.75 0 0 0 1.5 0v-2.197l.311.312a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.602-.501ZM4.688 8.576a5.5 5.5 0 0 1 9.201-2.466l.312.311h-2.45a.75.75 0 0 0 0-1.5h4.109a.75.75 0 0 0 .75-.75V3.062a.75.75 0 0 0-1.5 0v2.197l-.311-.312a7 7 0 0 0-11.712 3.138.75.75 0 0 0 1.602.501Z" clipRule="evenodd" />
                          </svg>
                          Sync
                        </button>
                        <button
                          onClick={() => setShowAddCamera(true)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 transition-colors"
                        >
                          Add Manually
                        </button>
                        <button
                          onClick={() => setShowProvision(true)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-sm transition-colors"
                          title="Configure a camera directly on this MagicBox"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                          </svg>
                          Add Camera
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ── Scrollable Content ── */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    <div className="p-5 space-y-5">

                      {/* ── Cameras Section ── */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-amber-500 flex-shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                          </svg>
                          <h3 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Cameras</h3>
                          <span className="text-[10px] text-slate-400 font-medium">{cameras.length}</span>
                        </div>

                        {cameras.length === 0 ? (
                          <div className="flex items-center gap-4 py-6 px-5 border border-dashed border-slate-200 dark:border-white/5 rounded-xl bg-slate-50/50 dark:bg-ink-950/30">
                            <div className="w-10 h-10 bg-white dark:bg-ink-950 rounded-xl shadow-sm border border-slate-100 dark:border-white/5 flex items-center justify-center text-slate-300 dark:text-slate-600 flex-shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                              </svg>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-500 block">No cameras found</span>
                              <p className="text-[10px] text-slate-400 mt-0.5">Sync from device or add manually</p>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                            {cameras.map(c => (
                              <div key={c.id} className="group flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-ink-900 hover:border-amber-300 dark:hover:border-amber-500/30 hover:shadow-md dark:hover:shadow-black/20 transition-all duration-200">
                                <div className="w-10 h-10 bg-slate-900 dark:bg-slate-800 rounded-xl border border-slate-700 shadow-sm flex items-center justify-center flex-shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-300">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{c.name}</h4>
                                    <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide border flex-shrink-0 ${c.connectionType === 'direct' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50'}`}>
                                      {c.connectionType}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                                    <span className="font-mono font-medium">{c.host}</span>
                                    {c.brand ? (
                                      <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-ink-950 rounded-md border border-slate-200 dark:border-white/5 text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400 flex-shrink-0">{c.brand}</span>
                                    ) : c.channel ? (
                                      <span className="text-[9px] font-medium text-slate-400">Ch {c.channel}</span>
                                    ) : null}
                                    {assignedFor(c).map(a => (
                                      <span key={a} className="px-1.5 py-0.5 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800/50 text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300 flex-shrink-0">{a}</span>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button type="button" onClick={() => setAiCam(c)}
                                    className="flex h-8 px-2 items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-600 shadow-sm transition-all hover:bg-violet-100 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-300 text-[9px] font-bold uppercase tracking-wide" title="Assign analytics (max 2)">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path d="M10 1a.75.75 0 0 1 .728.568l.258 1.036a6.52 6.52 0 0 0 4.41 4.41l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258a6.52 6.52 0 0 0-4.41 4.41l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a6.52 6.52 0 0 0-4.41-4.41L3.568 8.728a.75.75 0 0 1 0-1.456l1.036-.258a6.52 6.52 0 0 0 4.41-4.41l.258-1.036A.75.75 0 0 1 10 1Z" />
                                    </svg>
                                    AI
                                  </button>
                                  <button type="button" onClick={() => setPreviewCamera({ ...c, deviceHost: devices.find(d => d.id === c.deviceId)?.host })}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 shadow-sm transition-all hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300" title="Preview">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M1.943 10.57A1.957 1.957 0 011.5 9.5c0-.33.08-.652.243-.97C2.85 6.32 5.917 4 10 4c4.083 0 7.15 2.32 8.257 4.53.162.318.243.64.243.97 0 .33-.08.652-.243.97C17.15 12.68 14.083 15 10 15c-4.083 0-7.15-2.32-8.257-4.43ZM10 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5Z" />
                                    </svg>
                                  </button>
                                  <button onClick={() => openEditCamera(c)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-ink-950 text-slate-400 hover:text-amber-600 border border-slate-200 dark:border-white/5 transition-all hover:border-amber-200" title="Edit">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                                    </svg>
                                  </button>
                                  {!c.magicboxCameraId && (
                                    <button onClick={() => deleteCamera(c.id)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-ink-950 text-slate-400 hover:text-red-600 border border-slate-200 dark:border-white/5 transition-all hover:border-red-200" title="Delete">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ── Location / Coordinates ── */}
                      {(() => {
                        const d = devices.find(x => x.id === selectedId)
                        const hasStored = d?.latitude != null && d?.longitude != null && String(d.latitude) !== '' && String(d.longitude) !== ''
                        return (
                          <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-ink-950/30 p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-rose-500 flex-shrink-0">
                                <path fillRule="evenodd" d="m9.69 18.933.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 1 0 3 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 0 0 2.274 1.765 11.842 11.842 0 0 0 .976.544l.062.029.018.008.006.003ZM10 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" clipRule="evenodd" />
                              </svg>
                              <h3 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Location</h3>
                              {hasStored && (
                                <span className="ml-auto text-[10px] font-bold text-emerald-500 font-mono tabular-nums">{parseFloat(d.latitude).toFixed(5)}, {parseFloat(d.longitude).toFixed(5)}</span>
                              )}
                            </div>
                            <div className="space-y-2">
                              <input type="text" placeholder="Paste Google Maps link to auto-fill…"
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-ink-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 dark:focus:border-amber-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                onChange={async e => { const extracted = await extractLatLngFromMapsUrl(e.target.value); if (extracted) { const coords = { lat: extracted.lat, lng: extracted.lng }; setCoordEdit(coords); saveCoords(coords) } }}
                              />
                              <div className="flex gap-2">
                                <div className="flex-1 min-w-0">
                                  <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Latitude</label>
                                  <input type="text" placeholder="28.6139" value={coordEdit.lat} onChange={e => setCoordEdit(p => ({ ...p, lat: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-ink-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 dark:focus:border-amber-500/50 transition-all" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Longitude</label>
                                  <input type="text" placeholder="77.2090" value={coordEdit.lng} onChange={e => setCoordEdit(p => ({ ...p, lng: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-ink-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 dark:focus:border-amber-500/50 transition-all" />
                                </div>
                                <div className="flex-shrink-0 flex items-end">
                                  <button onClick={saveCoords} disabled={coordSaving}
                                    className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wide hover:bg-emerald-600 transition-colors disabled:opacity-50">{coordSaving ? '...' : 'Save'}</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}

                      {/* ── Health History ── */}
                      {(() => {
                        const total = healthData.length
                        const onlineCount = healthData.filter(c => c.status === 'online').length
                        const uptimePct = total > 0 ? Math.round((onlineCount / total) * 100) : null
                        const avgMs = (() => {
                          const valid = healthData.filter(c => c.responseMs != null)
                          if (!valid.length) return null
                          return Math.round(valid.reduce((s, c) => s + c.responseMs, 0) / valid.length)
                        })()
                        const chartEntries = healthData.slice().reverse().slice(-60)
                        const onlineEntries = chartEntries.filter(c => c.status === 'online' && c.responseMs != null)
                        const maxMs = onlineEntries.length > 0 ? Math.max(...onlineEntries.map(c => c.responseMs)) : 100
                        const yDomainMax = Math.max(maxMs * 1.4, 50) // pad top by 40%, min 50ms so small values show height
                        const chartData = chartEntries.map(c => ({
                          time: new Date(c.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          response: c.status === 'online' ? (c.responseMs ?? 1) : null,
                          offline: c.status !== 'online' ? yDomainMax : null, // full-height red bar for offline
                          status: c.status,
                          responseMs: c.responseMs,
                          cameraCount: c.cameraCount,
                          onlineCameraCount: c.onlineCameraCount,
                        }))
                        const ChartTooltip = ({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload
                          const isOffline = d?.status !== 'online'
                          return (
                            <div className="bg-white/95 dark:bg-ink-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-white/10 rounded-xl px-3.5 py-2.5 shadow-2xl min-w-[140px]">
                              <p className="text-[10px] font-bold text-slate-800 dark:text-slate-100 mb-1.5">{label}</p>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                <span className={`text-[10px] font-bold uppercase ${isOffline ? 'text-red-500' : 'text-emerald-500'}`}>{d?.status}</span>
                              </div>
                              {isOffline ? (
                                <p className="text-[9px] font-medium text-red-400">Device unreachable</p>
                              ) : (
                                <>
                                  <p className="text-[10px] font-mono text-slate-500">Response: <span className="font-bold text-slate-700 dark:text-slate-200">{d?.responseMs}ms</span></p>
                                  {d?.cameraCount > 0 && <p className="text-[10px] font-mono text-slate-500">Cameras: <span className="font-bold text-slate-700 dark:text-slate-200">{d.onlineCameraCount}/{d.cameraCount}</span></p>}
                                </>
                              )}
                            </div>
                          )
                        }
                        return (
                          <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-ink-900 p-4">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500 flex-shrink-0">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
                                </svg>
                                <h3 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Health</h3>
                              </div>
                              {total > 0 && (
                                <div className="flex items-center gap-4">
                                  {uptimePct !== null && (
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-sm font-bold tabular-nums ${uptimePct >= 90 ? 'text-emerald-500' : uptimePct >= 70 ? 'text-amber-500' : 'text-red-500'}`}>{uptimePct}%</span>
                                      <span className="text-[9px] font-medium text-slate-400 uppercase">uptime</span>
                                    </div>
                                  )}
                                  {avgMs != null && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-bold tabular-nums text-amber-500">{avgMs}ms</span>
                                      <span className="text-[9px] font-medium text-slate-400 uppercase">avg</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">{total}</span>
                                    <span className="text-[9px] font-medium text-slate-400 uppercase">checks</span>
                                  </div>
                                  <button onClick={() => setHealthDetailsOpen(true)}
                                    className="text-[10px] font-bold text-amber-500 hover:text-amber-600 hover:underline transition-colors">View all</button>
                                </div>
                              )}
                            </div>

                            {healthLoading ? (
                              <div className="flex flex-col items-center justify-center py-10 gap-3">
                                <div className="relative w-9 h-9">
                                  <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
                                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-500 animate-spin" />
                                  <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-amber-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.7s' }} />
                                </div>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 animate-pulse">Loading health data</p>
                              </div>
                            ) : total === 0 ? (
                              <p className="text-center text-[10px] font-medium text-slate-400 py-8">No health records yet — checks run every 30s</p>
                            ) : (
                              <>
                                {/* Chart controls */}
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /><span className="text-[10px] font-medium text-slate-500">Online</span></div>
                                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /><span className="text-[10px] font-medium text-slate-500">Offline</span></div>
                                  </div>
                                  <div className="flex bg-slate-100 dark:bg-white/5 rounded-lg p-0.5">
                                    <button onClick={() => setHealthChartMode('area')}
                                      className={`px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wide transition-all ${healthChartMode === 'area' ? 'bg-white dark:bg-ink-800 text-slate-700 dark:text-slate-200 shadow-sm' : 'text-slate-400'}`}
                                    >Area</button>
                                    <button onClick={() => setHealthChartMode('bar')}
                                      className={`px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wide transition-all ${healthChartMode === 'bar' ? 'bg-white dark:bg-ink-800 text-slate-700 dark:text-slate-200 shadow-sm' : 'text-slate-400'}`}
                                    >Bar</button>
                                  </div>
                                </div>

                                {/* Chart */}
                                <div className="rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] p-3">
                                  <ResponsiveContainer width="100%" height={240}>
                                    {healthChartMode === 'area' ? (
                                      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                                        <defs>
                                          <linearGradient id="healthAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                                          </linearGradient>
                                          <linearGradient id="healthOfflineGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.12} />
                                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.04} />
                                          </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.06)" vertical={false} />
                                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} interval="preserveStartEnd" axisLine={false} tickLine={false} dy={4} />
                                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="ms" width={44} domain={[0, yDomainMax]} />
                                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(100,116,139,0.15)' }} />
                                        <Area type="monotone" dataKey="offline" stroke="none" fill="url(#healthOfflineGrad)" strokeWidth={0}
                                          dot={false} activeDot={false} connectNulls={false}
                                          animationDuration={400} isAnimationActive={false}
                                        />
                                        <Area type="monotone" dataKey="response" stroke="#10b981" fill="url(#healthAreaGrad)" strokeWidth={2.5}
                                          dot={false} connectNulls={false}
                                          activeDot={{ r: 5, fill: '#10b981', strokeWidth: 2.5, stroke: 'white' }}
                                          animationDuration={800} animationEasing="ease-out"
                                        />
                                      </AreaChart>
                                    ) : (
                                      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.06)" vertical={false} />
                                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} interval="preserveStartEnd" axisLine={false} tickLine={false} dy={4} />
                                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="ms" width={44} domain={[0, yDomainMax]} />
                                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(100,116,139,0.04)' }} />
                                        <Bar dataKey="offline" animationDuration={400} isAnimationActive={false}
                                          shape={({ x, y, width, height }) => height > 0 ? <rect x={x} y={y} width={width} height={height} rx={3} ry={3} fill="#ef4444" fillOpacity={0.15} /> : null}
                                        />
                                        <Bar dataKey="response" animationDuration={600} animationEasing="ease-out"
                                          shape={({ x, y, width, height }) => height > 0 ? <rect x={x + width * 0.1} y={y} width={width * 0.8} height={height} rx={3} ry={3} fill="#10b981" fillOpacity={0.85} /> : null}
                                        />
                                      </BarChart>
                                    )}
                                  </ResponsiveContainer>
                                </div>

                                {/* Status timeline */}
                                <div className="mt-2 px-1">
                                  <div className="flex gap-px rounded-md overflow-hidden h-2.5" title="Status timeline">
                                    {chartData.map((d, i) => (
                                      <div key={i}
                                        className={`flex-1 transition-colors ${d.status === 'online' ? 'bg-emerald-400/70 dark:bg-emerald-500/50' : 'bg-red-400/70 dark:bg-red-500/50'}`}
                                        style={{ minWidth: 2 }}
                                      />
                                    ))}
                                  </div>
                                  <div className="flex justify-between mt-1">
                                    <span className="text-[8px] font-medium text-slate-400">Oldest</span>
                                    <span className="text-[8px] font-medium text-slate-400">Latest</span>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Health Details Modal */}
                            {healthDetailsOpen && (
                              <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 animate-in fade-in duration-200">
                                <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={() => setHealthDetailsOpen(false)} />
                                <div className="relative w-full max-w-2xl bg-white dark:bg-ink-900 rounded-xl shadow-2xl border border-white/20 dark:border-white/5 animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh] overflow-hidden">
                                  <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-ink-950/80">
                                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Health Check Details</h3>
                                    <button onClick={() => setHealthDetailsOpen(false)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400">
                                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22Z" />
                                      </svg>
                                    </button>
                                  </div>
                                  <div className="flex-1 overflow-y-auto p-4">
                                    <div className="rounded-lg border border-slate-100 dark:border-white/5 overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5">
                                            <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-slate-400 text-[9px]">Time</th>
                                            <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-slate-400 text-[9px]">Status</th>
                                            <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-slate-400 text-[9px]">Cameras</th>
                                            <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-slate-400 text-[9px]">Response</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {healthData.map((c, i) => (
                                            <tr key={c.id} className={`border-b border-slate-50 dark:border-white/5 ${i % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-white/5'}`}>
                                              <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap text-[10px]">{new Date(c.checkedAt).toLocaleTimeString()}</td>
                                              <td className="px-3 py-2">
                                                <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase ${c.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                  {c.status}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400 text-[10px]">
                                                {c.cameraCount > 0 ? `${c.onlineCameraCount}/${c.cameraCount}` : '—'}
                                              </td>
                                              <td className="px-3 py-2 font-mono text-slate-400 text-[10px]">
                                                {c.responseMs != null ? `${c.responseMs}ms` : '—'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                  <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-ink-950/80 flex justify-end">
                                    <button onClick={() => setHealthDetailsOpen(false)} className="px-5 py-2 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-black transition-all">Close</button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}

                    </div>
                  </div>
                </>
              )
            })() : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-ink-950 rounded-2xl flex items-center justify-center mb-5 border border-slate-200 dark:border-white/5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-8 h-8 text-slate-300 dark:text-slate-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">Select a Device</h3>
                <p className="text-xs text-slate-400 max-w-[240px]">Choose a MagicBox from the sidebar to view cameras, health, and location</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter">Add Camera</h2>

              <button
                onClick={resetAddCamera}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-ink-950 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>

            <div className="max-w-3xl mx-auto">
              {addCameraStep === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Select Connection Type</div>
                  <div className="grid grid-cols-2 gap-6">
                    <button
                      onClick={() => { setCameraForm(prev => ({ ...prev, connectionType: 'direct' })); setAddCameraStep(2) }}
                      className="group p-6 rounded-xl border-2 border-slate-100 dark:border-white/5 bg-white dark:bg-ink-950 hover:border-amber-500 hover:shadow-md text-left transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-slate-100 text-lg mb-1">Direct Camera</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Connect an individual IP camera directly using its RTSP stream URL</div>
                    </button>
                    <button
                      onClick={() => { setCameraForm(prev => ({ ...prev, connectionType: 'nvr' })); setAddCameraStep(2) }}
                      className="group p-6 rounded-xl border-2 border-slate-100 dark:border-white/5 bg-white dark:bg-ink-950 hover:border-amber-500 hover:shadow-md text-left transition-all"
                    >
                      <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                        </svg>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-slate-100 text-lg mb-1">NVR System</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Connect to a Network Video Recorder to discover and add multiple channels</div>
                    </button>
                  </div>
                </div>
              )}

              {addCameraStep === 2 && cameraForm.connectionType === 'nvr' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">NVR Connection Details</div>
                  {error && <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm font-medium">{error}</div>}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">NVR Brand *</label>
                      <select name="brand" value={nvrForm.brand} onChange={onNvrChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" required>
                        <option value="">Select Brand</option>
                        <optgroup label="International Brands">
                          <option value="hikvision">Hikvision</option>
                          <option value="dahua">Dahua</option>
                          <option value="axis">Axis</option>
                          <option value="bosch">Bosch</option>
                          <option value="samsung">Samsung</option>
                          <option value="panasonic">Panasonic</option>
                          <option value="honeywell">Honeywell</option>
                          <option value="uniview">Uniview</option>
                          <option value="ezviz">EZVIZ</option>
                        </optgroup>
                        <optgroup label="Indian Brands">
                          <option value="cp_plus">CP Plus</option>
                          <option value="matrix">Matrix</option>
                          <option value="godrej">Godrej Security Solutions</option>
                          <option value="zicom">Zicom</option>
                          <option value="tvt">TVT</option>
                          <option value="hdview">HDView</option>
                          <option value="provision_isr">Provision ISR</option>
                          <option value="securus">Securus</option>
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">NVR IP Address *</label>
                      <input name="host" value={nvrForm.host} onChange={onNvrChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" placeholder="192.168.1.100" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Username *</label>
                      <input name="username" value={nvrForm.username} onChange={onNvrChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password *</label>
                      <input name="password" type="password" value={nvrForm.password} onChange={onNvrChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" required />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button onClick={() => setAddCameraStep(1)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Back</button>
                    <button onClick={discoverNvrChannels} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors shadow-sm">Discover Channels</button>
                  </div>
                </div>
              )}

              {addCameraStep === 2 && cameraForm.connectionType === 'direct' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Direct Camera Details</div>
                  {error && <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm font-medium">{error}</div>}
                  <form onSubmit={addCamera} className="grid grid-cols-2 gap-6">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Camera Name *</label>
                      <input name="name" value={cameraForm.name} onChange={onCameraChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" placeholder="e.g., Front Entrance" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Brand</label>
                      <input name="brand" value={cameraForm.brand} onChange={onCameraChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" placeholder="Optional" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">IP Address *</label>
                      <input name="host" value={cameraForm.host} onChange={onCameraChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" placeholder="192.168.1.10" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Username</label>
                      <input name="username" value={cameraForm.username} onChange={onCameraChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
                      <input name="password" type="password" value={cameraForm.password} onChange={onCameraChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Primary Stream RTSP URL</label>
                      <input name="primaryStream" value={cameraForm.primaryStream} onChange={onCameraChange} placeholder="rtsp://username:password@ip:554/..." className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Sub Stream RTSP URL</label>
                      <input name="subStream" value={cameraForm.subStream} onChange={onCameraChange} placeholder="rtsp://username:password@ip:554/..." className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Notes</label>
                      <textarea name="notes" value={cameraForm.notes} onChange={onCameraChange} className="w-full bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all" rows={3} placeholder="Additional details..." />
                    </div>
                    <div className="col-span-2 flex gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                      <button type="button" onClick={() => setAddCameraStep(1)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Back</button>
                      <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors shadow-sm ml-auto">Add Camera</button>
                    </div>
                  </form>
                </div>
              )}

              {addCameraStep === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Select Channels to Add</div>
                  {error && <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm font-medium">{error}</div>}
                  <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-2">
                    {discoveredChannels.map(channel => (
                      <div
                        key={channel.id}
                        className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${selectedChannels.includes(channel.id)
                          ? 'border-amber-500 bg-amber-50 shadow-sm'
                          : 'border-slate-200 dark:border-white/5 bg-white dark:bg-ink-950/80 hover:border-amber-300 dark:hover:border-amber-500 hover:shadow-sm'
                          }`}
                        onClick={() => toggleChannel(channel.id)}
                      >
                        <div>
                          <div className={`font-semibold ${selectedChannels.includes(channel.id) ? 'text-amber-900 dark:text-amber-200' : 'text-slate-800 dark:text-slate-100'}`}>{channel.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono bg-slate-100 dark:bg-ink-950 inline-block px-1.5 py-0.5 rounded">{channel.resolution}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${channel.status === 'online'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-red-100 text-red-700 border-red-200'
                            }`}>
                            {channel.status}
                          </span>
                          <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${selectedChannels.includes(channel.id)
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'border-slate-300 text-transparent group-hover:border-amber-400'
                            }`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                    <button onClick={() => setAddCameraStep(2)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Back</button>
                    <button
                      onClick={addSelectedChannels}
                      disabled={selectedChannels.length === 0}
                      className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm ml-auto"
                    >
                      Add {selectedChannels.length} Channel{selectedChannels.length !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
        }
      </section>

      {/* ── Modals: Redesigned ── */}
      {
        showAddDevice && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={() => setShowAddDevice(false)} />
            <div className="relative w-full max-w-lg bg-white dark:bg-ink-900 rounded-2xl p-10 shadow-2xl border border-white/20 dark:border-white/5/30 animate-in zoom-in-95 duration-300">
              <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-8 uppercase tracking-tighter text-center">Add MagicBox</h2>
              {error && <div className="p-4 mb-6 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-[10px] font-black uppercase tracking-tight">{error}</div>}
              <form onSubmit={addDevice} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Device Designation</label>
                  <input name="name" value={deviceForm.name} onChange={onDeviceChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold uppercase" placeholder="Star Bakery, Rajajinagar" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Host Identity (IP)</label>
                  <input name="host" value={deviceForm.host} onChange={onDeviceChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-mono font-black" placeholder="10.100.0.1" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Latitude</label>
                    <input name="latitude" type="number" step="any" value={deviceForm.latitude} onChange={onDeviceChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Longitude</label>
                    <input name="longitude" type="number" step="any" value={deviceForm.longitude} onChange={onDeviceChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold" />
                  </div>
                </div>
                <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-slate-100 dark:border-white/5">
                  <button type="button" onClick={() => setShowAddDevice(false)} className="px-8 py-4 rounded-2xl text-[10px] font-black text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-widest transition-colors">Cancel</button>
                  <button type="submit" disabled={!deviceForm.name || !deviceForm.host}
                    className="px-10 py-4 rounded-2xl bg-amber-600 text-white text-[10px] font-black hover:bg-black shadow-xl shadow-amber-500/20 uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-600">Add Device</button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {
        editingDevice && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={() => setEditingDevice(null)} />
            <div className="relative w-full max-w-lg bg-white dark:bg-ink-900 rounded-[2.5rem] p-10 shadow-2xl border border-white/20 dark:border-white/5/30 animate-in zoom-in-95 duration-300">
              <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-8 uppercase tracking-tighter text-center">Modify Infrastructure</h2>
              {error && <div className="p-4 mb-6 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-[10px] font-black uppercase tracking-tight">{error}</div>}
              <form onSubmit={updateDevice} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Designation</label>
                  <input name="name" value={deviceForm.name} onChange={onDeviceChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold uppercase" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Host Protocol (IP)</label>
                  <input name="host" value={deviceForm.host} onChange={onDeviceChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-mono font-black" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Google Maps Link <span className="normal-case font-normal tracking-normal text-slate-400">(auto-fills coordinates)</span></label>
                  <input
                    type="text"
                    placeholder="https://maps.google.com/..."
                    className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all"
                    onChange={async e => {
                      const extracted = await extractLatLngFromMapsUrl(e.target.value)
                      if (extracted) setDeviceForm(p => ({ ...p, latitude: extracted.lat, longitude: extracted.lng }))
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Latitude</label>
                    <input name="latitude" type="number" step="any" value={deviceForm.latitude} onChange={onDeviceChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Longitude</label>
                    <input name="longitude" type="number" step="any" value={deviceForm.longitude} onChange={onDeviceChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-2xl px-5 py-4 text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold" />
                  </div>
                </div>
                <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-slate-100 dark:border-white/5">
                  <button type="button" onClick={() => setEditingDevice(null)} className="px-8 py-4 rounded-2xl text-[10px] font-black text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-widest transition-colors">Discard</button>
                  <div className="flex gap-2">
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => removeDevice(editingDevice.id)}
                        className="px-6 py-4 rounded-2xl bg-red-50 text-red-600 text-[10px] font-black hover:bg-red-100 uppercase tracking-widest transition-all"
                      >
                        Delete
                      </button>
                    )}
                    <button type="submit" className="px-10 py-4 rounded-2xl bg-[#0B1726] text-white text-[10px] font-black hover:bg-black shadow-xl shadow-black/10 uppercase tracking-widest transition-all active:scale-95">Update Device</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {
        editingCamera && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingCamera(null)} />
            <div className="relative w-full max-w-md bg-white dark:bg-ink-900 rounded-3xl p-8 shadow-2xl border border-white/20 dark:border-white/5/30 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-6 uppercase tracking-tighter text-center">Refine Node Protocol</h2>
              {error && <div className="p-3 mb-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-tight">{error}</div>}
              <form onSubmit={updateCamera} className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Node Designation</label>
                  <input name="name" value={cameraForm.name} onChange={onCameraChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-xs focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold uppercase" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Manufacturer</label>
                  <input name="brand" value={cameraForm.brand} onChange={onCameraChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-xs focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold uppercase" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Network Host</label>
                  <input name="host" value={cameraForm.host} onChange={onCameraChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-xs focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-mono font-black" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Command Stream (Primary)</label>
                  <input name="primaryStream" value={cameraForm.primaryStream} onChange={onCameraChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2 text-[10px] focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-mono" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Observation Stream (Sub)</label>
                  <input name="subStream" value={cameraForm.subStream} onChange={onCameraChange} className="w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2 text-[10px] focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-mono" />
                </div>
                <div className="col-span-2 flex items-center justify-center gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-white/5">
                  <button type="button" onClick={() => { setEditingCamera(null); setCameraForm({}) }} className="px-6 py-2.5 rounded-xl text-[10px] font-black text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-widest transition-colors">Discard</button>
                  <button type="submit" className="px-8 py-2.5 rounded-xl bg-amber-600 text-white text-[10px] font-black hover:bg-black shadow-lg shadow-amber-500/20 uppercase tracking-widest transition-all active:scale-95">Verify & Sync</button>
                </div>
              </form>
            </div>
          </div>
        )
      }
      <ProvisionCameraModal
        open={showProvision}
        device={devices.find((d) => d.id === selectedId)}
        onClose={() => setShowProvision(false)}
        onAdded={() => { invalidateDevice(selectedId); fetchCameras(selectedId) }}
      />
      {previewCamera && <LivePreviewModal camera={previewCamera} onClose={() => setPreviewCamera(null)} />}
      {aiCam && <AnalyticsModal camera={aiCam} onClose={() => setAiCam(null)} onSaved={() => { refreshAssigned() }} />}

    </div >
  )
}

// ── Per-camera analytics assignment modal (max 2) ──
// Capability-aware: edge modules come from the camera host's iris-edge-agent
// (crowd/vcc/frs on 219/221, anpr/violations on 220); search + forensics run
// centrally and are assignable to any camera. Viewing keeps the low-quality
// stream; analysis uses the camera MAINSTREAM via an on-demand MediaMTX path.
const ANALYTIC_LABELS = {
  crowd: 'Crowd', vcc: 'VCC', frs: 'FRS',
  anpr: 'ANPR', violations: 'Violations',
  search: 'IRIS Search', forensics: 'IRIS Observer',
}

function AnalyticsModal({ camera, onClose, onSaved }) {
  const [row, setRow] = useState(null)            // vms_cameras row (null until resolved/created)
  const [caps, setCaps] = useState(null)          // edge capabilities (null = loading)
  const [selected, setSelected] = useState([])
  const [rtspMain, setRtspMain] = useState('')
  const [rtspSub, setRtspSub] = useState('')
  const [status, setStatus] = useState(null)      // per-module dispatch results
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await analyticsAPI.rows()
        const hit = analyticsAPI.findRow(rows, camera) || rows.find(r => String(r.host) === String(camera.host)) || null
        const mine = analyticsAPI.findRow(rows, camera)
        if (!alive) return
        setRow(mine)
        if (mine) {
          setSelected(Array.isArray(mine.analytics) ? mine.analytics : [])
          setRtspMain(mine.metadata?.rtspMain || '')
          setRtspSub(mine.metadata?.rtspSub || '')
          setStatus(mine.metadata?.analyticsStatus || null)
        }
        // capabilities via any row on the same host (agent /health proxied by backend)
        if (hit) {
          const info = await analyticsAPI.get(hit.id)
          if (!alive) return
          const edgeCaps = info?.edge?.capabilities
          setCaps(Array.isArray(edgeCaps) ? [...new Set([...edgeCaps, 'search', 'forensics'])] : ['search', 'forensics'])
          if (mine && info?.status) setStatus(info.status)
        } else {
          setCaps(['search', 'forensics'])
        }
      } catch (e) {
        if (alive) { setCaps(['search', 'forensics']); setErr(e.message || 'failed to load') }
      }
    })()
    return () => { alive = false }
  }, [camera])

  const toggle = (m) => {
    setSelected(s => s.includes(m) ? s.filter(x => x !== m) : (s.length >= 2 ? s : [...s, m]))
  }

  const needsMain = selected.some(m => ['crowd', 'vcc', 'frs'].includes(m))

  const apply = async () => {
    setErr(''); setBusy(true); setStatus(null)
    try {
      if (needsMain && !rtspMain.trim()) {
        setErr('Mainstream RTSP is required for edge analytics (crowd/VCC/FRS) — analysis runs on the mainstream.')
        setBusy(false); return
      }
      const target = row || await analyticsAPI.ensureRow(camera)
      setRow(target)
      const res = await analyticsAPI.set(target.id, {
        analytics: selected,
        rtspMain: rtspMain.trim() || undefined,
        rtspSub: rtspSub.trim() || undefined,
      })
      setStatus(res?.status || {})
      onSaved?.()
    } catch (e) {
      setErr(e.message || 'Failed to apply')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white dark:bg-ink-900 rounded-2xl p-8 shadow-2xl border border-white/20 dark:border-white/5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Camera Analytics</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">×</button>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-5">
          <span className="font-bold">{camera.name}</span> · {camera.host} — pick up to <span className="font-bold">2</span>.
          Viewing stays on the low-quality stream; analysis uses the mainstream via MediaMTX.
        </p>

        {/* module chips */}
        <div className="mb-5">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Analytics {caps === null && '(loading capabilities…)'}</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(ANALYTIC_LABELS).map(m => {
              const allowed = caps === null ? false : caps.includes(m)
              const on = selected.includes(m)
              const full = !on && selected.length >= 2
              return (
                <button key={m} type="button" disabled={!allowed || full} onClick={() => toggle(m)}
                  title={!allowed ? 'Not available on this edge' : full ? 'Max 2 analytics' : ''}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wide transition-all ${
                    on ? 'border-amber-500 bg-amber-500 text-black'
                      : allowed && !full ? 'border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-amber-400'
                      : 'border-slate-200 dark:border-white/5 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  }`}>
                  {ANALYTIC_LABELS[m]}
                </button>
              )
            })}
          </div>
        </div>

        {/* streams */}
        <div className="space-y-3 mb-5">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mainstream RTSP (analysis){needsMain && <span className="text-amber-500"> — required</span>}</label>
            <input value={rtspMain} onChange={e => setRtspMain(e.target.value)}
              placeholder="rtsp://user:pass@<camera-ip>:554/...subtype=0"
              className="mt-1 w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2.5 text-xs font-mono focus:border-amber-500 outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Substream RTSP (viewing, optional)</label>
            <input value={rtspSub} onChange={e => setRtspSub(e.target.value)}
              placeholder="rtsp://user:pass@<camera-ip>:554/...subtype=1"
              className="mt-1 w-full bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2.5 text-xs font-mono focus:border-amber-500 outline-none" />
          </div>
        </div>

        {/* per-module dispatch status */}
        {status && Object.keys(status).length > 0 && (
          <div className="mb-5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-ink-950/40 p-3 space-y-1.5">
            {Object.entries(status).map(([m, s]) => (
              <div key={m} className="flex items-start gap-2 text-[11px]">
                <span className={s.ok ? 'text-emerald-500' : 'text-red-500'}>{s.ok ? '✓' : '✗'}</span>
                <span className="font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 w-20 shrink-0">{ANALYTIC_LABELS[m] || m}</span>
                <span className="text-slate-500 dark:text-slate-400 break-all">{s.detail}</span>
              </div>
            ))}
          </div>
        )}
        {err && <p className="mb-4 text-[11px] font-bold text-red-500">{err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-slate-300">Close</button>
          <button onClick={apply} disabled={busy || caps === null}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wide disabled:opacity-40">
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
