import React, { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import Hls from 'hls.js'
import api, { deviceAPI, deploymentAPI } from './utils/api'
import Modal from './components/Modal'
import Button from './components/Button'
import Input from './components/Input'
import { deviceCache as _sc, cacheDeviceList, cacheCamerasForDevice, invalidateAll, invalidateDevice } from './utils/deviceCache'

function FullscreenEscButton({ onClick }) {
  const [visible, setVisible] = useState(true)
  const timerRef = useRef(null)

  useEffect(() => {
    const hide = () => {
      clearTimeout(timerRef.current)
      setVisible(true)
      timerRef.current = setTimeout(() => setVisible(false), 2000)
    }
    hide()
    window.addEventListener('mousemove', hide)
    return () => {
      window.removeEventListener('mousemove', hide)
      clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <button
      onClick={onClick}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-black/70 hover:bg-black/90 text-white rounded-lg font-bold text-sm shadow-lg backdrop-blur-sm transition-all duration-300 flex items-center gap-2 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      title="Exit fullscreen (ESC)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
      </svg>
      <span>ESC</span>
    </button>
  )
}

function _startBgRetry() {
  if (_sc.bgTimer) return
  _sc.bgTimer = setInterval(async () => {
    if (_sc.failedIds.size === 0 || !_sc.devices) return
    const toRetry = _sc.devices.filter(d => _sc.failedIds.has(d.id))
    if (toRetry.length === 0) return
    await Promise.allSettled(
      toRetry.map(device =>
        api.get(`/devices/${device.id}/cameras`, { timeout: 8000 })
          .then(resp => {
            const data = Array.isArray(resp.data) ? resp.data : []
            cacheCamerasForDevice(device.id, device.name, data)
            _sc.onUpdate?.()
          })
          .catch(() => { }) // still failing — keep in failedIds, retry next cycle
      )
    )
  }, 30000) // retry every 30 s
}

export default function HlsGrid({ user }) {
  const [cells, setCells] = useState(4)
  const [devices, setDevices] = useState(() => _sc.devices ?? [])
  const [cameras, setCameras] = useState(() => [..._sc.cameras])
  const [expandedDevices, setExpandedDevices] = useState(new Set())
  const [gridStreams, setGridStreams] = useState({}) // { cellIndex: { deviceId, cameraId, stream } }
  const [loading, setLoading] = useState(_sc.devices === null)
  const [error, setError] = useState('')
  const [loadingCameras, setLoadingCameras] = useState(new Set()) // Track which devices are loading cameras
  const [loadedDeviceCameras, setLoadedDeviceCameras] = useState(() => new Set(_sc.loadedIds)) // Track which devices have loaded cameras
  const [failedDevices, setFailedDevices] = useState(() => new Set(_sc.failedIds)) // Track which devices failed to load cameras
  const [batchLoading, setBatchLoading] = useState(false) // Track if batch loading is in progress

  // Device Groups State
  const [sidebarOpen, setSidebarOpen] = useState(true) // Toggle device panel visibility
  const [deviceGroups, setDeviceGroups] = useState([]) // [{ id, name, deviceIds: [], cameraIds: [] }]
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [groupName, setGroupName] = useState('')
  const [groupNameError, setGroupNameError] = useState('')
  const [selectedDevicesForGroup, setSelectedDevicesForGroup] = useState(new Set())
  const [selectedCamerasForGroup, setSelectedCamerasForGroup] = useState(new Set())
  const [expandedDevicesInModal, setExpandedDevicesInModal] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // Videowall Presets State
  const [videowallPresets, setVideowallPresets] = useState([]) // [{ id, name, gridSize, streams: {} }]
  const [activeVideowall, setActiveVideowall] = useState(null)
  const [showVideowallModal, setShowVideowallModal] = useState(false)
  const [videowallName, setVideowallName] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)

  const [activeGroupForPagination, setActiveGroupForPagination] = useState(null)
  const [viewMode, setViewMode] = useState('all') // 'all', 'groups', 'presets'
  const [loadingStreams, setLoadingStreams] = useState({}) // { cellIndex: boolean }
  const [reloadingDevices, setReloadingDevices] = useState(new Set()) // devices triggered by retry button
  const [reloadedDevices, setReloadedDevices] = useState(new Set())  // briefly shows ✓ after success
  const [streamErrors, setStreamErrors] = useState({})   // { cellIndex: string }
  const [stationByIP, setStationByIP] = useState({}) // { '10.100.0.42': 'Ashoknagar PS', ... }
  const [helperAvailable, setHelperAvailable] = useState(false)
  const helperAvailableRef = useRef(false)
  const helperStreams = useRef({}) // { cellIndex: helperId }
  const [showHevcPopup, setShowHevcPopup] = useState(false)
  const [hevcCells, setHevcCells] = useState(new Set()) // cells with H.265 the browser can't decode

  const browserSupportsHevc = useMemo(() => {
    if (typeof MediaSource === 'undefined') return true
    return (
      MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"') ||
      MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.B0"')
    )
  }, [])

  // Admin View State
  const [expandedUserGroups, setExpandedUserGroups] = useState(new Set())
  const isAdmin = useMemo(() => user?.role === 'admin', [user])

  // Stable string that changes only when the actual set of device IDs changes
  const deviceIds = useMemo(() => devices.map(d => d.id).sort().join(','), [devices])

  const filteredDevices = useMemo(() => {
    if (!searchTerm.trim()) return devices

    const fuse = new Fuse(devices, {
      keys: ['name', 'host'],
      threshold: 0.3,
      distance: 100
    })

    return fuse.search(searchTerm).map(result => result.item)
  }, [devices, searchTerm])

  // Group devices by user (Police Station) for admins
  const groupedDevices = useMemo(() => {
    if (!isAdmin) return null

    const groups = {}
    const unassigned = []

    devices.forEach(device => {
      // If backend provides users array (from include: ['users'])
      if (device.users && device.users.length > 0) {
        device.users.forEach(u => {
          if (!groups[u.name]) {
            groups[u.name] = { id: u.id, name: u.name, devices: [] }
          }
          groups[u.name].devices.push(device)
        })
      } else {
        unassigned.push(device)
      }
    })

    // Convert to array and sort by name
    const sortedGroups = Object.values(groups).sort((a, b) => a.name.localeCompare(b.name))

    if (unassigned.length > 0) {
      sortedGroups.push({ id: 'unassigned', name: 'Unassigned', devices: unassigned })
    }

    return sortedGroups
  }, [devices, isAdmin])

  const toggleUserGroup = (groupName) => {
    setExpandedUserGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupName)) newSet.delete(groupName)
      else newSet.add(groupName)
      return newSet
    })
  }

  const playersRef = useRef([]) // [{ video, hls }]
  const hlsRefs = useRef({})       // { cellIndex: Hls instance }
  const videoRefs = useRef([])     // video DOM elements by cell index
  const streamUrlRefs = useRef({}) // { cellIndex: current hlsUrl being played }
  const retryTimersRef = useRef({}) // { cellIndex: setTimeout id for auto-retry }
  const retryStreamRef = useRef(null) // always points to latest retryStream closure
  const batchLoadingRef = useRef(false) // ref-based lock — immune to stale closure
  const isInitialMount = useRef(true)
  const hasLoadedDefaultView = useRef(false)
  const gridSectionRef = useRef(null)

  const gridStyle = useMemo(() => {
    const size = Math.sqrt(cells)
    return {
      gridTemplateColumns: `repeat(${size}, 1fr)`,
      gridTemplateRows: `repeat(${size}, 1fr)`,
      aspectRatio: '16 / 9'
    }
  }, [cells])

  // Load data from localStorage on mount
  useEffect(() => {
    // Register callback so background retries update React state while this component is mounted
    _sc.onUpdate = () => {
      setCameras([..._sc.cameras])
      setLoadedDeviceCameras(new Set(_sc.loadedIds))
      setFailedDevices(new Set(_sc.failedIds))
    }

    if (_sc.devices !== null) {
      // useState lazy initializers already read from _sc on mount — nothing to set
      setLoading(false)
    } else {
      fetchDevices()
    }

    loadDeviceGroups()
    loadVideowallPresets()

    // Build IP → station name lookup from deployment tree
    deploymentAPI.getTree().then(resp => {
      const map = {}
      const divisions = resp.data?.divisions || []
      for (const div of divisions) {
        for (const st of (div.stations || [])) {
          for (const dev of (st.devices || [])) {
            if (dev.ip) map[dev.ip] = st.name
          }
        }
      }
      setStationByIP(map)
    }).catch(() => {})

    // Load default view state after a brief delay to ensure state is ready
    const timer = setTimeout(() => {
      loadDefaultViewState()
      hasLoadedDefaultView.current = true
    }, 500)

    return () => {
      clearTimeout(timer)
      _sc.onUpdate = null // deregister — bg timer keeps running but won't push to unmounted state
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh devices + cameras every 5 minutes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Refresh device list (status changes)
        const resp = await deviceAPI.getDevices()
        const arr = Array.isArray(resp.data) ? resp.data : []
        cacheDeviceList(arr)
        setDevices(arr)

        // Refresh all cameras (status changes)
        const camResp = await api.get('/cameras', { timeout: 15000 })
        const camArr = Array.isArray(camResp.data) ? camResp.data : []
        const deviceNameMap = {}
        arr.forEach(d => { deviceNameMap[d.id] = d.name })

        // Reset cache and rebuild
        invalidateAll()
        const byDevice = {}
        camArr.forEach(cam => {
          if (!byDevice[cam.deviceId]) byDevice[cam.deviceId] = []
          byDevice[cam.deviceId].push(cam)
        })
        arr.forEach(d => {
          const cams = byDevice[d.id] || []
          if (cams.length === 0 && d.status === 'offline') {
            _sc.failedIds.add(d.id)
          } else {
            cacheCamerasForDevice(d.id, d.name, cams)
          }
        })
        setCameras([..._sc.cameras])
        setLoadedDeviceCameras(new Set(_sc.loadedIds))
        setFailedDevices(new Set(_sc.failedIds))
      } catch (e) {
        console.error('Auto-refresh failed:', e)
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist grid streams whenever they change (for default view)
  useEffect(() => {
    // Skip saving on initial mount until we've loaded the default view
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // Skip saving until we've loaded the default view
    if (!hasLoadedDefaultView.current) {
      return
    }

    if (activeVideowall === null) {
      // Only persist if we're on the default view
      // Debounce saving to avoid frequent writes
      const timeoutId = setTimeout(() => {
        saveDefaultViewState()
      }, 1000)
      return () => clearTimeout(timeoutId)
    }
  }, [gridStreams, cells, activeVideowall])

  useEffect(() => {
    // Listen for fullscreen changes
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    // Listen for arrow key pagination and ESC for fullscreen
    const handleKeyDown = (e) => {
      // ESC key to exit fullscreen
      if (e.key === 'Escape' && document.fullscreenElement) {
        e.preventDefault()
        document.exitFullscreen()
        return
      }

      if (!activeGroupForPagination) return

      const group = deviceGroups.find(g => g.id === activeGroupForPagination)
      if (!group) return

      const groupCameras = getCamerasForGroup(group)
      const totalPages = Math.ceil(groupCameras.length / cells)

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentPage(prev => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('keydown', handleKeyDown)
      // Stop all streams when component unmounts
      const videos = document.querySelectorAll('[data-grid-video]')
      videos.forEach(video => {
        const player = { video, hls: null }
        stopHls(player)
      })
    }
  }, [activeGroupForPagination, cells, deviceGroups])


  // Trigger batch load whenever the actual set of device IDs changes (not just the count)
  useEffect(() => {
    if (devices.length > 0) {
      batchLoadAllCameras(devices)
    }
  }, [deviceIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shared HLS setup — used by both the stream useEffect and retryStream
  const setupCellHls = (cellIndex, url, video) => {
    if (Hls.isSupported()) {
      const token = localStorage.getItem('token')
      const isLocal = url.startsWith('http://localhost')
      // Only attach the session bearer on TLS or loopback. The direct-edge case
      // (plaintext http://<edge>:8888) is unauthenticated MediaMTX — forwarding the
      // IRIS token there does nothing and would leak it cross-origin on the wire.
      const authSafe = /^https:/i.test(url) || isLocal || url.startsWith('http://127.0.0.1')
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        startPosition: -1,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
        maxBufferLength: 8,
        maxMaxBufferLength: 16,
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
      hlsRefs.current[cellIndex] = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Auto-detect H.265: if browser can't decode it, route through helper or show popup
        if (!isLocal) {
          const videoCodec = hls.levels?.[0]?.videoCodec || ''
          const isHevc = videoCodec.includes('hvc1') || videoCodec.includes('hev1')
          if (isHevc && !browserSupportsHevc) {
            hls.destroy()
            delete hlsRefs.current[cellIndex]
            setHevcCells(prev => new Set([...prev, cellIndex]))
            if (helperAvailableRef.current) {
              // Route silently through local transcoder
              fetch('http://localhost:7788/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // No session token: the edge MediaMTX URL is unauthenticated, so the
                // transcode helper doesn't need it — don't hand our bearer to a local
                // process that re-fetches cross-origin over plaintext.
                body: JSON.stringify({ url }),
              })
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data) {
                    helperStreams.current[cellIndex] = data.id
                    setupCellHls(cellIndex, data.hlsUrl, video)
                  } else {
                    setShowHevcPopup(true)
                  }
                })
                .catch(() => setShowHevcPopup(true))
            } else {
              setShowHevcPopup(true)
            }
            return
          }
        }
        video.play().catch(() => { })
      })
      video.addEventListener('playing', () => {
        setLoadingStreams(prev => ({ ...prev, [cellIndex]: false }))
        setStreamErrors(prev => { const n = { ...prev }; delete n[cellIndex]; return n })
      }, { once: true })
      let mediaRecovered = false
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return

        const d = data.details.toLowerCase()

        // Media/buffer errors: try HLS built-in recovery silently first
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
          mediaRecovered = true
          hls.recoverMediaError()
          return
        }

        // All fatal errors: keep spinner, retry silently.
        // Manifest errors (stream not ready yet) use a longer delay to avoid hammering.
        // Never show "Stream not found" automatically — only show it when the stream
        // is confirmed absent, i.e. the user is informed via device status, not HLS errors.
        const retryDelay = d.includes('manifest') || d.includes('level') ? 5000 : 2000
        setLoadingStreams(prev => ({ ...prev, [cellIndex]: true }))
        clearTimeout(retryTimersRef.current[cellIndex])
        retryTimersRef.current[cellIndex] = setTimeout(
          () => retryStreamRef.current?.(cellIndex),
          retryDelay
        )
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.play().catch(() => { })
      video.addEventListener('playing', () => {
        setLoadingStreams(prev => ({ ...prev, [cellIndex]: false }))
        setStreamErrors(prev => { const n = { ...prev }; delete n[cellIndex]; return n })
      }, { once: true })
    }
  }

  // Manage HLS streams: only restart cells whose URL actually changed
  useEffect(() => {
    const currentUrls = {}
    Object.entries(gridStreams).forEach(([idx, streamInfo]) => {
      const cellIndex = Number(idx)
      currentUrls[cellIndex] = streamInfo.hlsUrl || (streamInfo.streamUrl + 'index.m3u8')
    })

    const allCells = new Set([
      ...Object.keys(hlsRefs.current).map(Number),
      ...Object.keys(currentUrls).map(Number),
    ])

    const loadingUpdates = {}
    allCells.forEach(cellIndex => {
      const prevUrl = streamUrlRefs.current[cellIndex]
      const newUrl = currentUrls[cellIndex]
      if (prevUrl === newUrl) return // same stream — keep it running

      hlsRefs.current[cellIndex]?.destroy()
      delete hlsRefs.current[cellIndex]

      // Stop any existing helper stream for this cell
      const oldHid = helperStreams.current[cellIndex]
      if (oldHid) {
        fetch(`http://localhost:7788/stop/${oldHid}`, { method: 'DELETE' }).catch(() => {})
        delete helperStreams.current[cellIndex]
      }

      // Clear any H.265 detection flag for this cell
      setHevcCells(prev => { const n = new Set(prev); n.delete(cellIndex); return n })

      const video = videoRefs.current[cellIndex]
      if (!newUrl || !video) {
        if (video) { video.pause(); video.removeAttribute('src'); try { video.load() } catch (_) { } }
        loadingUpdates[cellIndex] = false
        return
      }

      loadingUpdates[cellIndex] = true
      // Pre-warm the HLS muxer: fire a fetch so MediaMTX starts buffering segments
      // before HLS.js requests them, reducing cold-start delay. Only attach the
      // bearer over TLS/loopback — the plaintext edge stream is unauthenticated.
      const token = localStorage.getItem('token')
      const prewarmAuthSafe = /^https:/i.test(newUrl) || newUrl.startsWith('http://localhost') || newUrl.startsWith('http://127.0.0.1')
      fetch(newUrl, { headers: (prewarmAuthSafe && token) ? { Authorization: `Bearer ${token}` } : {} }).catch(() => {})
      setupCellHls(cellIndex, newUrl, video)
    })
    if (Object.keys(loadingUpdates).length > 0) {
      setLoadingStreams(prev => ({ ...prev, ...loadingUpdates }))
    }

    streamUrlRefs.current = currentUrls
  }, [gridStreams, cells]) // eslint-disable-line react-hooks/exhaustive-deps

  // Destroy all HLS instances, cancel retry timers, and stop helper streams on unmount
  useEffect(() => () => {
    Object.values(hlsRefs.current).forEach(hls => hls?.destroy())
    hlsRefs.current = {}
    Object.values(retryTimersRef.current).forEach(clearTimeout)
    retryTimersRef.current = {}
    Object.entries(helperStreams.current).forEach(([, hid]) => {
      fetch(`http://localhost:7788/stop/${hid}`, { method: 'DELETE' }).catch(() => {})
    })
    helperStreams.current = {}
  }, [])

  // Detect local H.265 transcode helper on mount — opt-in only. Most machines
  // don't run it, so probing unconditionally spams the console with
  // ERR_CONNECTION_REFUSED (the browser logs the failed request even when
  // caught). Enable by setting localStorage.iris_hevc_helper = '1'.
  useEffect(() => {
    let on = false
    try { on = localStorage.getItem('iris_hevc_helper') === '1' } catch { /* ignore */ }
    if (!on) return
    fetch('http://localhost:7788/health', { signal: AbortSignal.timeout(1500) })
      .then(r => {
        if (r.ok) {
          helperAvailableRef.current = true
          setHelperAvailable(true)
        }
      })
      .catch(() => {})
  }, [])

  const fetchDevices = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await deviceAPI.getDevices()
      const arr = Array.isArray(response.data) ? response.data : []
      cacheDeviceList(arr)
      setDevices(arr)
    } catch (e) {
      console.error('Failed to fetch devices:', e)
      setError(e.response?.data?.error || 'Failed to load devices. Make sure the server is running.')
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  // Load all cameras in a single request, then distribute into per-device cache buckets.
  // Falls back to per-device requests only when retrying specific failed devices.
  const batchLoadAllCameras = async (deviceList) => {
    if (batchLoadingRef.current) return
    const devList = Array.isArray(deviceList) ? deviceList : devices
    if (devList.length === 0) return

    const devicesToLoad = devList.filter(d => !_sc.loadedIds.has(d.id))
    if (devicesToLoad.length === 0) return

    batchLoadingRef.current = true
    setBatchLoading(true)

    setFailedDevices(prev => {
      const next = new Set(prev); devicesToLoad.forEach(d => next.delete(d.id)); return next
    })
    setLoadingCameras(prev => {
      const next = new Set(prev); devicesToLoad.forEach(d => next.add(d.id)); return next
    })

    // Build a deviceId → name lookup from the devices we already have
    const deviceNameMap = {}
    devList.forEach(d => { deviceNameMap[d.id] = d.name })

    try {
      const resp = await api.get('/cameras', { timeout: 15000 })
      const allCameras = Array.isArray(resp.data) ? resp.data : []

      // Group by deviceId
      const byDevice = {}
      allCameras.forEach(cam => {
        if (!byDevice[cam.deviceId]) byDevice[cam.deviceId] = []
        byDevice[cam.deviceId].push(cam)
      })

      // Populate cache and state for every device we tried to load
      const loadedDeviceIds = new Set()
      const failedDeviceIds = new Set()
      devicesToLoad.forEach(device => {
        const cams = byDevice[device.id] || []
        // Offline device with no cached cameras → flag as failed so the reload button shows
        if (cams.length === 0 && device.status === 'offline') {
          _sc.failedIds.add(device.id)
          failedDeviceIds.add(device.id)
        } else {
          const withMeta = cacheCamerasForDevice(device.id, device.name, cams)
          setCameras(prev => [...prev.filter(c => c.deviceId !== device.id), ...withMeta])
          loadedDeviceIds.add(device.id)
        }
      })
      setLoadedDeviceCameras(prev => { const next = new Set(prev); loadedDeviceIds.forEach(id => next.add(id)); return next })
      setFailedDevices(prev => { const next = new Set(prev); failedDeviceIds.forEach(id => next.add(id)); return next })
      setLoadingCameras(prev => { const next = new Set(prev); devicesToLoad.forEach(d => next.delete(d.id)); return next })
    } catch (err) {
      console.warn('Bulk camera load failed, falling back to per-device:', err?.message)
      // Fallback: per-device requests with concurrency limit
      const CONCURRENCY = 30
      const TIMEOUT = 8000
      const fetchOne = (device) =>
        api.get(`/devices/${device.id}/cameras`, { timeout: TIMEOUT })
          .then(resp => ({ ok: true, device, data: Array.isArray(resp.data) ? resp.data : [] }))
          .catch(e => { console.warn(`Camera load failed for "${device.name}":`, e?.message); return { ok: false, device, data: [] } })

      const queue = [...devicesToLoad]
      const inFlight = new Set()
      await new Promise(resolve => {
        const tryNext = () => {
          while (inFlight.size < CONCURRENCY && queue.length > 0) {
            const device = queue.shift()
            const p = fetchOne(device).then(result => {
              inFlight.delete(p)
              if (result.ok) {
                const withMeta = cacheCamerasForDevice(device.id, device.name, result.data)
                setCameras(prev => [...prev.filter(c => c.deviceId !== device.id), ...withMeta])
                setLoadedDeviceCameras(prev => { const next = new Set(prev); next.add(device.id); return next })
              } else {
                _sc.failedIds.add(device.id)
                setFailedDevices(prev => { const next = new Set(prev); next.add(device.id); return next })
              }
              setLoadingCameras(prev => { const next = new Set(prev); next.delete(device.id); return next })
              if (queue.length > 0) tryNext()
              else if (inFlight.size === 0) resolve()
            })
            inFlight.add(p)
          }
          if (inFlight.size === 0 && queue.length === 0) resolve()
        }
        tryNext()
      })
    }

    batchLoadingRef.current = false
    setBatchLoading(false)
    _startBgRetry()
  }

  // Retry only the devices that failed — callable from the UI
  const reloadFailedCameras = () => {
    const toRetry = devices.filter(d => failedDevices.has(d.id))
    if (toRetry.length === 0) return
    toRetry.forEach(d => invalidateDevice(d.id))
    setLoadedDeviceCameras(prev => {
      const next = new Set(prev)
      toRetry.forEach(d => next.delete(d.id))
      return next
    })
    setFailedDevices(prev => {
      const next = new Set(prev)
      toRetry.forEach(d => next.delete(d.id))
      return next
    })
    setTimeout(() => batchLoadAllCameras(toRetry), 0)
  }

  // Reload ALL cameras from scratch (e.g., after a sync)
  const reloadAllCameras = () => {
    invalidateAll()
    setLoadedDeviceCameras(new Set())
    setFailedDevices(new Set())
    setCameras([])
    setTimeout(() => batchLoadAllCameras(devices), 0)
  }

  // Force-reload cameras for a single device, bypassing the loaded-cache guard
  const reloadDeviceCameras = async (deviceId) => {
    if (loadingCameras.has(deviceId) || reloadingDevices.has(deviceId)) return
    setReloadingDevices(prev => new Set(prev).add(deviceId))
    setReloadedDevices(prev => { const n = new Set(prev); n.delete(deviceId); return n })
    invalidateDevice(deviceId)
    setLoadedDeviceCameras(prev => { const n = new Set(prev); n.delete(deviceId); return n })
    setFailedDevices(prev => { const n = new Set(prev); n.delete(deviceId); return n })
    setCameras(prev => prev.filter(c => c.deviceId !== deviceId))
    await fetchDeviceCameras(deviceId)
    setReloadingDevices(prev => { const n = new Set(prev); n.delete(deviceId); return n })
    // Flash a ✓ for 2s then clear
    setReloadedDevices(prev => new Set(prev).add(deviceId))
    setTimeout(() => setReloadedDevices(prev => { const n = new Set(prev); n.delete(deviceId); return n }), 2000)
  }

  // Fetch cameras for a specific device (lazy loading - for immediate user interaction)
  const fetchDeviceCameras = async (deviceId) => {
    // Skip if already loaded or currently loading
    if (loadedDeviceCameras.has(deviceId) || loadingCameras.has(deviceId)) {
      return
    }

    const device = devices.find(d => d.id === deviceId)
    if (!device) return

    setLoadingCameras(prev => new Set(prev).add(deviceId))

    try {
      const response = await api.get(`/devices/${deviceId}/cameras`, { timeout: 8000 })
      const deviceCameras = Array.isArray(response.data) ? response.data : []

      const camerasWithDeviceInfo = deviceCameras.map(c => ({
        ...c,
        deviceId: device.id,
        deviceName: device.name
      }))

      // Offline device with no cached cameras → keep failed state so reload button stays
      if (deviceCameras.length === 0 && device.status === 'offline') {
        _sc.failedIds.add(deviceId)
        setFailedDevices(prev => new Set(prev).add(deviceId))
        return
      }

      cacheCamerasForDevice(deviceId, device.name, deviceCameras)

      setCameras(prev => {
        const filtered = prev.filter(c => c.deviceId !== deviceId)
        return [...filtered, ...camerasWithDeviceInfo]
      })

      setLoadedDeviceCameras(prev => new Set(prev).add(deviceId))
      setFailedDevices(prev => { const n = new Set(prev); n.delete(deviceId); return n })
    } catch (e) {
      console.warn(`Failed to fetch cameras for device ${deviceId}:`, e?.message)
      _sc.failedIds.add(deviceId)
      setFailedDevices(prev => new Set(prev).add(deviceId))

      // Do NOT mark as loaded — the user can retry by clicking the device again
    } finally {
      setLoadingCameras(prev => {
        const next = new Set(prev)
        next.delete(deviceId)
        return next
      })
    }
  }

  const toggleDevice = (deviceId) => {
    setExpandedDevices(prev => {
      const newSet = new Set(prev)
      const isExpanding = !newSet.has(deviceId)

      if (isExpanding) {
        newSet.add(deviceId)
        // If cameras weren't loaded yet or failed previously, fetch now
        if (!loadedDeviceCameras.has(deviceId) || failedDevices.has(deviceId)) {
          // Allow re-fetch for failed devices
          if (failedDevices.has(deviceId)) {
            setLoadedDeviceCameras(prev2 => { const n = new Set(prev2); n.delete(deviceId); return n })
          }
          fetchDeviceCameras(deviceId)
        }
      } else {
        newSet.delete(deviceId)
      }

      return newSet
    })
  }

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }

  const handlePlayAll = (device) => {
    const deviceCameras = cameras.filter(c => c.deviceId === device.id)
    if (deviceCameras.length === 0) return

    // Find currently empty cells
    const emptyCells = []
    for (let i = 0; i < cells; i++) {
      if (!gridStreams[i]) emptyCells.push(i)
    }

    // If not enough empty cells, expand the grid to fit
    if (emptyCells.length < deviceCameras.length) {
      const occupied = cells - emptyCells.length
      const totalNeeded = occupied + deviceCameras.length
      let newCells = cells
      if (totalNeeded <= 4) newCells = 4
      else if (totalNeeded <= 9) newCells = 9
      else newCells = 16
      if (newCells > cells) {
        setCells(newCells)
        for (let i = cells; i < newCells; i++) emptyCells.push(i)
      }
    }

    // Fill empty cells with device cameras (don't touch occupied cells, hard cap at 16)
    const newStreams = { ...gridStreams }
    deviceCameras.forEach((camera, index) => {
      if (index >= emptyCells.length) return
      const cellIdx = emptyCells[index]
      if (cellIdx >= 16) return
      const cameraPathId = camera.magicboxCameraId || camera.id
      const target = `http://${device.host}:8888/camera_${cameraPathId}/`
      const encoded = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
      const streamUrl = target
      newStreams[cellIdx] = {
        deviceId: camera.deviceId,
        cameraId: camera.id,
        streamUrl,
        hlsUrl: streamUrl + 'index.m3u8',
        cameraName: camera.name,
        deviceName: device.name,
        stationName: stationByIP[device.host],
      }
    })
    setGridStreams(newStreams)
  }

  const handleCameraClick = (camera) => {
    const device = devices.find(d => d.id === camera.deviceId)
    if (!device) return

    // Find first empty cell
    let targetCell = -1
    for (let i = 0; i < cells; i++) {
      if (!gridStreams[i]) { targetCell = i; break }
    }
    if (targetCell === -1) targetCell = 0 // Grid full — replace first cell

    const cameraPathId = camera.magicboxCameraId || camera.id
    const target = `http://${device.host}:8888/camera_${cameraPathId}/`
    const encoded = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const streamUrl = target

    setGridStreams(prev => ({
      ...prev,
      [targetCell]: {
        deviceId: camera.deviceId,
        cameraId: camera.id,
        streamUrl,
        hlsUrl: streamUrl + 'index.m3u8',
        cameraName: camera.name,
        deviceName: device.name,
        stationName: stationByIP[device.host],
      }
    }))
  }

  // ============ Device Groups Management ============
  const loadDeviceGroups = () => {
    try {
      const saved = localStorage.getItem('deviceGroups')
      if (saved) {
        setDeviceGroups(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load device groups:', e)
    }
  }

  const saveDeviceGroups = (groups) => {
    try {
      localStorage.setItem('deviceGroups', JSON.stringify(groups))
      setDeviceGroups(groups)
    } catch (e) {
      console.error('Failed to save device groups:', e)
    }
  }

  const openCreateGroupModal = () => {
    setEditingGroup(null)
    setGroupName('')
    setGroupNameError('')
    setSelectedDevicesForGroup(new Set())
    setSelectedCamerasForGroup(new Set())
    setExpandedDevicesInModal(new Set())
    setSearchQuery('')
    setShowGroupModal(true)
  }

  const openEditGroupModal = (group) => {
    setEditingGroup(group)
    setGroupName(group.name)
    setGroupNameError('')
    setSelectedDevicesForGroup(new Set(group.deviceIds || []))
    setSelectedCamerasForGroup(new Set(group.cameraIds || []))
    setExpandedDevicesInModal(new Set())
    setSearchQuery('')
    setShowGroupModal(true)
  }

  const toggleDeviceInModal = (deviceId) => {
    setExpandedDevicesInModal(prev => {
      const newSet = new Set(prev)
      const isExpanding = !newSet.has(deviceId)

      if (isExpanding) {
        newSet.add(deviceId)
        // Fetch cameras when expanding in modal (lazy loading)
        fetchDeviceCameras(deviceId)
      } else {
        newSet.delete(deviceId)
      }

      return newSet
    })
  }

  const handleDeviceCheckboxChange = (deviceId, isChecked) => {
    const newSelectedDevices = new Set(selectedDevicesForGroup)
    const newSelectedCameras = new Set(selectedCamerasForGroup)

    if (isChecked) {
      // Add device
      newSelectedDevices.add(deviceId)
      // Remove individual cameras from this device since the whole device is selected
      const deviceCameras = cameras.filter(c => c.deviceId === deviceId)
      deviceCameras.forEach(cam => newSelectedCameras.delete(cam.id))
    } else {
      // Remove device
      newSelectedDevices.delete(deviceId)
    }

    setSelectedDevicesForGroup(newSelectedDevices)
    setSelectedCamerasForGroup(newSelectedCameras)
  }

  const handleCameraCheckboxChange = (camera, isChecked) => {
    const newSelectedCameras = new Set(selectedCamerasForGroup)

    if (isChecked) {
      // Add camera only if its parent device is not selected
      if (!selectedDevicesForGroup.has(camera.deviceId)) {
        newSelectedCameras.add(camera.id)
      }
    } else {
      newSelectedCameras.delete(camera.id)
    }

    setSelectedCamerasForGroup(newSelectedCameras)
  }

  const isDeviceFullySelected = (deviceId) => {
    return selectedDevicesForGroup.has(deviceId)
  }

  const isCameraSelected = (camera) => {
    // Camera is selected if either its parent device is selected OR it's individually selected
    return selectedDevicesForGroup.has(camera.deviceId) || selectedCamerasForGroup.has(camera.id)
  }

  const filterDevicesAndCameras = () => {
    if (!searchQuery.trim()) {
      return devices
    }

    const query = searchQuery.toLowerCase()
    return devices.filter(device => {
      // Check if device name or host matches
      const deviceMatches = device.name.toLowerCase().includes(query) ||
        device.host.toLowerCase().includes(query)

      // Check if any camera in this device matches
      const deviceCameras = cameras.filter(c => c.deviceId === device.id)
      const cameraMatches = deviceCameras.some(cam =>
        cam.name.toLowerCase().includes(query) ||
        (cam.brand && cam.brand.toLowerCase().includes(query))
      )

      return deviceMatches || cameraMatches
    })
  }

  const saveGroup = () => {
    if (!groupName.trim()) {
      setGroupNameError('Group name is required')
      document.getElementById('group-name-input')?.focus()
      document.getElementById('group-name-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setGroupNameError('')

    const newGroup = {
      id: editingGroup?.id || Date.now().toString(),
      name: groupName.trim(),
      deviceIds: Array.from(selectedDevicesForGroup),
      cameraIds: Array.from(selectedCamerasForGroup)
    }

    let updatedGroups
    if (editingGroup) {
      updatedGroups = deviceGroups.map(g => g.id === editingGroup.id ? newGroup : g)
    } else {
      updatedGroups = [...deviceGroups, newGroup]
    }

    saveDeviceGroups(updatedGroups)
    setShowGroupModal(false)
  }

  const deleteGroup = (groupId) => {
    if (!confirm('Delete this group?')) return
    const updatedGroups = deviceGroups.filter(g => g.id !== groupId)
    saveDeviceGroups(updatedGroups)
  }

  const toggleDeviceInGroup = (deviceId) => {
    setSelectedDevicesForGroup(prev => {
      const newSet = new Set(prev)
      if (newSet.has(deviceId)) {
        newSet.delete(deviceId)
      } else {
        newSet.add(deviceId)
      }
      return newSet
    })
  }

  const toggleCameraInGroup = (cameraId) => {
    setSelectedCamerasForGroup(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cameraId)) {
        newSet.delete(cameraId)
      } else {
        newSet.add(cameraId)
      }
      return newSet
    })
  }

  // ============ Videowall Presets Management ============
  const loadVideowallPresets = () => {
    try {
      const saved = localStorage.getItem('videowallPresets')
      if (saved) {
        setVideowallPresets(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load videowall presets:', e)
    }
  }

  const saveVideowallPresets = (presets) => {
    try {
      localStorage.setItem('videowallPresets', JSON.stringify(presets))
      setVideowallPresets(presets)
    } catch (e) {
      console.error('Failed to save videowall presets:', e)
    }
  }

  const saveCurrentVideowall = () => {
    if (!videowallName.trim()) return

    const newPreset = {
      id: Date.now().toString(),
      name: videowallName.trim(),
      gridSize: cells,
      streams: gridStreams,
      // Save pagination context if active
      pagination: activeGroupForPagination ? {
        groupId: activeGroupForPagination,
        page: currentPage
      } : null
    }

    const updatedPresets = [...videowallPresets, newPreset]
    saveVideowallPresets(updatedPresets)
    setShowVideowallModal(false)
    setVideowallName('')
  }

  const loadVideowall = (preset) => {
    setCells(preset.gridSize)
    setGridStreams(preset.streams || {})
    setActiveVideowall(preset.id)

    // Restore pagination context if it was saved
    if (preset.pagination) {
      setActiveGroupForPagination(preset.pagination.groupId)
      setCurrentPage(preset.pagination.page)
    } else {
      clearPagination()
    }
  }

  const updateActiveVideowallState = () => {
    if (activeVideowall === null) return

    // Update the active videowall preset with current state
    const updatedPresets = videowallPresets.map(preset => {
      if (preset.id === activeVideowall) {
        return {
          ...preset,
          gridSize: cells,
          streams: gridStreams,
          // Update pagination context
          pagination: activeGroupForPagination ? {
            groupId: activeGroupForPagination,
            page: currentPage
          } : null
        }
      }
      return preset
    })

    saveVideowallPresets(updatedPresets)
  }

  // Persist videowall changes when on an active videowall
  useEffect(() => {
    // Skip saving on initial mount
    if (isInitialMount.current || !hasLoadedDefaultView.current) {
      return
    }

    if (activeVideowall !== null) {
      updateActiveVideowallState()
    }
  }, [gridStreams, cells])

  const deleteVideowall = (presetId) => {
    if (!confirm('Delete this videowall preset?')) return
    const updatedPresets = videowallPresets.filter(p => p.id !== presetId)
    saveVideowallPresets(updatedPresets)
    if (activeVideowall === presetId) {
      setActiveVideowall(null)
      loadDefaultViewState()
    }
  }

  const clearVideowall = () => {
    setActiveVideowall(null)
    clearPagination()
    loadDefaultViewState()
  }

  // ============ Default View Persistence ============
  const saveDefaultViewState = () => {
    try {
      const state = {
        gridSize: cells,
        streams: gridStreams
      }
      localStorage.setItem('defaultViewState', JSON.stringify(state))
    } catch (e) {
      console.error('Failed to save default view state:', e)
    }
  }

  const loadDefaultViewState = () => {
    try {
      const saved = localStorage.getItem('defaultViewState')
      if (saved) {
        const state = JSON.parse(saved)
        setCells(state.gridSize || 4)
        setGridStreams(state.streams || {})
      }
    } catch (e) {
      console.error('Failed to load default view state:', e)
    }
  }

  // Get cameras for a specific group
  const getCamerasForGroup = (group) => {
    const groupCameras = []

    // Add cameras from selected devices
    if (group.deviceIds && group.deviceIds.length > 0) {
      const deviceCameras = cameras.filter(c => group.deviceIds.includes(c.deviceId))
      groupCameras.push(...deviceCameras)
    }

    // Add specific cameras
    if (group.cameraIds && group.cameraIds.length > 0) {
      const specificCameras = cameras.filter(c => group.cameraIds.includes(c.id))
      groupCameras.push(...specificCameras)
    }

    // Remove duplicates
    const uniqueCameras = groupCameras.filter((cam, index, self) =>
      index === self.findIndex(c => c.id === cam.id && c.deviceId === cam.deviceId)
    )

    return uniqueCameras
  }

  const handleDragStart = (e, camera) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'camera', data: camera }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleGroupDragStart = (e, group) => {
    const groupCameras = getCamerasForGroup(group)
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'group', data: { group, cameras: groupCameras } }))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const loadGroupWithPagination = (group, page = 0) => {
    const groupCameras = getCamerasForGroup(group)
    const totalPages = Math.ceil(groupCameras.length / cells)
    const validPage = Math.min(page, totalPages - 1)

    setCurrentPage(validPage)
    setActiveGroupForPagination(group.id)

    const startIndex = validPage * cells
    const endIndex = startIndex + cells
    const camerasForPage = groupCameras.slice(startIndex, endIndex)

    const newStreams = {}
    camerasForPage.forEach((camera, index) => {
      const device = devices.find(d => String(d.id) === String(camera.deviceId))
      if (!device || !device.host) {
        console.warn('Device host not found for camera:', camera)
        return
      }

      const cameraPathId = camera.magicboxCameraId || camera.id
      const target = `http://${device.host}:8888/camera_${cameraPathId}/`
      const encoded = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
      const streamUrl = target

      newStreams[index] = {
        deviceId: camera.deviceId,
        cameraId: camera.id,
        streamUrl,
        hlsUrl: streamUrl + 'index.m3u8',
        cameraName: camera.name,
        deviceName: device?.name,
        stationName: stationByIP[device?.host],
      }
    })

    setGridStreams(newStreams)
  }

  const nextPage = () => {
    if (!activeGroupForPagination) return
    const group = deviceGroups.find(g => g.id === activeGroupForPagination)
    if (!group) return

    const groupCameras = getCamerasForGroup(group)
    const totalPages = Math.ceil(groupCameras.length / cells)

    if (currentPage < totalPages - 1) {
      loadGroupWithPagination(group, currentPage + 1)
    }
  }

  const prevPage = () => {
    if (!activeGroupForPagination) return
    const group = deviceGroups.find(g => g.id === activeGroupForPagination)
    if (!group) return

    if (currentPage > 0) {
      loadGroupWithPagination(group, currentPage - 1)
    }
  }

  const clearPagination = () => {
    setActiveGroupForPagination(null)
    setCurrentPage(0)
    setGridStreams({})
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e, cellIndex) => {
    e.preventDefault()
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('application/json'))

      if (dragData.type === 'camera') {
        // Single camera drop
        const camera = dragData.data

        // Build URL to load camera from Magicbox device directly
        // Find the device host from the loaded devices list
        const device = devices.find(d => String(d.id) === String(camera.deviceId))
        if (!device || !device.host) {
          console.error('Device host not found for camera drop:', camera)
          return
        }
        const cameraPathId = camera.magicboxCameraId || camera.id
        const target = `http://${device.host}:8888/camera_${cameraPathId}/`
        const encoded = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
        const streamUrl = target

        setGridStreams(prev => ({
          ...prev,
          [cellIndex]: {
            deviceId: camera.deviceId,
            cameraId: camera.id,
            streamUrl,
            hlsUrl: streamUrl + 'index.m3u8',
            cameraName: camera.name,
            deviceName: device?.name,
            stationName: stationByIP[device?.host],
            codec: camera.codec,
          }
        }))
      } else if (dragData.type === 'group') {
        // Group drop - fill multiple cells starting from the drop position
        const { cameras: groupCameras } = dragData.data

        if (groupCameras.length === 0) {
          console.warn('No cameras in group')
          return
        }

        const newStreams = { ...gridStreams }
        let currentCell = cellIndex

        for (const camera of groupCameras) {
          // Stop if we've filled all available cells
          if (currentCell >= cells) break

          // Find the device host
          const device = devices.find(d => String(d.id) === String(camera.deviceId))
          if (!device || !device.host) {
            console.warn('Device host not found for camera:', camera)
            continue
          }

          const cameraPathId = camera.magicboxCameraId || camera.id
          const target = `http://${device.host}:8888/camera_${cameraPathId}/`
          const encoded = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
          const streamUrl = target

          newStreams[currentCell] = {
            deviceId: camera.deviceId,
            cameraId: camera.id,
            streamUrl,
            hlsUrl: streamUrl + 'index.m3u8',
            cameraName: camera.name,
            deviceName: device?.name,
            stationName: stationByIP[device?.host],
            codec: camera.codec,
          }

          currentCell++
        }

        setGridStreams(newStreams)
      }

    } catch (e) {
      console.error('Failed to parse dropped data:', e)
    }
  }

  const friendlyStreamError = (code) => {
    if (!code) return 'Stream unavailable'
    const c = code.toLowerCase()
    if (c.includes('timeout')) return 'Camera not responding'
    if (c.includes('manifestload')) return 'Stream not found'
    if (c.includes('levelload')) return 'Stream not found'
    if (c.includes('fragload')) return 'Stream interrupted'
    if (c.includes('network')) return 'Network error'
    if (c.includes('media')) return 'Unsupported stream'
    if (c.includes('buffer')) return 'Stream interrupted'
    if (c.includes('internal')) return 'Stream interrupted'
    return 'Stream unavailable'
  }

  const retryStream = (cellIndex) => {
    clearTimeout(retryTimersRef.current[cellIndex])
    delete retryTimersRef.current[cellIndex]

    const streamInfo = gridStreams[cellIndex]
    if (!streamInfo) return
    const url = streamInfo.hlsUrl || (streamInfo.streamUrl + 'index.m3u8')
    const video = videoRefs.current[cellIndex]
    if (!video) return

    hlsRefs.current[cellIndex]?.destroy()
    delete hlsRefs.current[cellIndex]
    streamUrlRefs.current[cellIndex] = url // keep ref in sync so useEffect skips this cell

    setStreamErrors(prev => { const n = { ...prev }; delete n[cellIndex]; return n })
    setLoadingStreams(prev => ({ ...prev, [cellIndex]: true }))
    setupCellHls(cellIndex, url, video)
  }
  retryStreamRef.current = retryStream // always point to latest closure

  const clearCell = (cellIndex) => {
    clearTimeout(retryTimersRef.current[cellIndex])
    delete retryTimersRef.current[cellIndex]
    hlsRefs.current[cellIndex]?.destroy()
    delete hlsRefs.current[cellIndex]
    delete streamUrlRefs.current[cellIndex]
    const hid = helperStreams.current[cellIndex]
    if (hid) {
      fetch(`http://localhost:7788/stop/${hid}`, { method: 'DELETE' }).catch(() => {})
      delete helperStreams.current[cellIndex]
    }
    const video = videoRefs.current[cellIndex]
    if (video) { video.pause(); video.removeAttribute('src'); try { video.load() } catch (_) { } }

    setGridStreams(prev => { const n = { ...prev }; delete n[cellIndex]; return n })
    setLoadingStreams(prev => { const n = { ...prev }; delete n[cellIndex]; return n })
    setStreamErrors(prev => { const n = { ...prev }; delete n[cellIndex]; return n })
    setHevcCells(prev => { const n = new Set(prev); n.delete(cellIndex); return n })
  }

  const ensurePlayers = () => {
    const videos = Array.from(document.querySelectorAll('[data-grid-video]')).slice(0, cells)
    playersRef.current = videos.map(v => ({ video: v, hls: null }))
  }


  const startHls = (player, src, cellIndex) => {
    const video = player.video
    if (Hls.isSupported()) {
      const token = localStorage.getItem('token')
      // Bearer only over TLS/loopback — plaintext edge MediaMTX is unauthenticated.
      const authSafe = /^https:/i.test(src) || src.startsWith('http://localhost') || src.startsWith('http://127.0.0.1')
      player.hls = new Hls({ enableWorker: true, lowLatencyMode: true, startPosition: -1, liveSyncDurationCount: 2, liveMaxLatencyDurationCount: 4, maxBufferLength: 8, xhrSetup: (authSafe && token) ? (xhr) => { xhr.setRequestHeader('Authorization', `Bearer ${token}`) } : undefined })
      player.hls.loadSource(src)
      player.hls.attachMedia(video)
      player.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => { })
        // Clear loading state when stream starts playing
        setLoadingStreams(prev => ({ ...prev, [cellIndex]: false }))
      })
      player.hls.on(Hls.Events.ERROR, (_, data) => {
        console.error('HLS error:', data?.details)
        // Clear loading state on error
        setLoadingStreams(prev => ({ ...prev, [cellIndex]: false }))
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => { })
        // Clear loading state when stream starts playing
        setLoadingStreams(prev => ({ ...prev, [cellIndex]: false }))
      }, { once: true })
    } else {
      console.error('HLS not supported')
      // Clear loading state if not supported
      setLoadingStreams(prev => ({ ...prev, [cellIndex]: false }))
    }
  }

  const stopHls = (player) => {
    try { player.hls?.destroy() } catch { }
    player.hls = null
    const video = player.video
    try { video.pause() } catch { }
    video.removeAttribute('src')
    try { video.load() } catch { }
  }

  const toggleFullscreen = async () => {
    if (!gridSectionRef.current) return

    try {
      if (!document.fullscreenElement) {
        await gridSectionRef.current.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (e) {
      console.error('Fullscreen error:', e)
    }
  }

  // Render helper for single device item
  const renderDeviceItem = (device) => {
    const devCamCount = cameras.filter(c => c.deviceId === device.id).length
    const isLoading = loadingCameras.has(device.id)
    const isReloading = reloadingDevices.has(device.id)
    const justReloaded = reloadedDevices.has(device.id)
    const isFailed = failedDevices.has(device.id)
    const isLoaded = loadedDeviceCameras.has(device.id)

    return (
      <div key={device.id} className="border-b border-slate-100 dark:border-white/5 last:border-b-0">
        <div className="flex items-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group active:bg-slate-100 dark:active:bg-slate-800/80">
          <button
            onClick={() => toggleDevice(device.id)}
            className="flex-1 p-3 text-left flex items-center gap-3 overflow-hidden cursor-pointer"
          >
            <div className={`p-1 rounded-md bg-slate-100 text-slate-400 transition-all flex-shrink-0 ${expandedDevices.has(device.id) ? 'bg-amber-50 text-amber-500 rotate-90' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-black text-slate-900 dark:text-slate-100 text-sm truncate">{device.name}</div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono tracking-tight truncate">{device.host}</span>
                {(isLoading || isReloading) && devCamCount === 0 && (
                  <span className="text-[9px] text-amber-500 font-bold animate-pulse">
                    {isReloading ? 'retrying…' : 'loading…'}
                  </span>
                )}
                {device.status === 'offline' || (!isLoading && !isReloading && isFailed) ? (
                  <button
                    onClick={e => { e.stopPropagation(); reloadDeviceCameras(device.id) }}
                    className="text-[9px] text-red-500 hover:text-red-600 font-bold underline underline-offset-2"
                    title="Retry loading cameras"
                  >retry ↻</button>
                ) : (
                  <>
                    {devCamCount > 0 && (
                      <>
                        <span className="text-[9px] bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 font-bold px-1 rounded border border-emerald-100 dark:border-emerald-800">
                          {devCamCount} cam{devCamCount !== 1 ? 's' : ''}
                        </span>
                        {justReloaded && (
                          <span className="text-[9px] text-emerald-500 font-bold animate-pulse">✓</span>
                        )}
                      </>
                    )}
                    {!isLoading && !isReloading && isLoaded && devCamCount === 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); reloadDeviceCameras(device.id) }}
                        className="text-[9px] text-red-500 hover:text-red-600 font-bold underline underline-offset-2"
                        title="Reload cameras for this device"
                      >retry ↻</button>
                    )}
                  </>
                )}
              </div>
            </div>
          </button>
          <button
            onClick={() => handlePlayAll(device)}
            className="p-3 text-slate-300 hover:text-amber-600 active:text-amber-700 transition-all"
            title="Play all cameras"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </button>
        </div>
        {expandedDevices.has(device.id) && (
          <div className="bg-slate-50 dark:bg-ink-950/80 border-t border-slate-100 dark:border-white/5 shadow-inner">
            {loadingCameras.has(device.id) ? (
              <div className="p-4 flex items-center gap-2 text-xs text-slate-500 animate-pulse">
                <div className="w-3 h-3 rounded-full bg-slate-200 dark:bg-white/5"></div>
                Loading cameras...
              </div>
            ) : (
              <>
                <div className="p-2 space-y-1">
                  {cameras.filter(c => c.deviceId === device.id).map(camera => (
                    <div
                      key={camera.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, camera)}
                      onClick={() => handleCameraClick(camera)}
                      className="p-2 rounded-lg bg-white dark:bg-ink-950 border border-slate-200 dark:border-white/5 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-900/20 hover:shadow-md cursor-pointer active:cursor-grabbing transition-all flex items-center justify-between group/cam select-none"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-1.5 h-1.5 rounded-full ${camera.status === 'online' ? 'bg-emerald-500' : 'bg-red-400'}`}></div>
                        <div className="min-w-0">
                          <div className="text-xs text-slate-900 dark:text-slate-300 font-bold truncate">{camera.name}</div>
                          <div className="text-[9px] text-slate-400 dark:text-slate-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 inline-block"><path d="M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h7.5A2.25 2.25 0 0013 13.75v-7.5A2.25 2.25 0 0010.75 4h-7.5zM19 4.75a.75.75 0 00-1.28-.53l-3 3a.75.75 0 00-.22.53v4.5c0 .199.079.39.22.53l3 3A.75.75 0 0019 15.25v-10.5z"/></svg></div>
                        </div>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-slate-300 group-hover/cam:text-amber-400 transition-colors flex-shrink-0">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </div>
                  ))}
                </div>
                {cameras.filter(c => c.deviceId === device.id).length === 0 && (
                  <div className="p-4 text-center text-xs text-slate-500 font-bold">No cameras found</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )
  }


  return (
    <div className="h-full flex flex-col gap-3">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between py-1 bg-white dark:bg-ink-900/95 px-2 rounded-md border border-slate-200/60 dark:border-white/5 shadow-sm sticky top-0 z-[100]">
        {/* Left: View Selection & Groups */}
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-ink-950 p-1 rounded-lg border border-slate-200 dark:border-white/5">
            <button
              onClick={() => setViewMode('all')}
              className={`px-4 py-1.5 rounded-md text-[11px] font-black transition-all flex items-center gap-2 ${viewMode === 'all' ? 'bg-white dark:bg-white/5 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 ${viewMode === 'all' ? 'text-emerald-500' : 'text-slate-400'}`}>
                <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
              ALL
            </button>
            <button
              onClick={() => setViewMode('groups')}
              className={`px-4 py-1.5 rounded-md text-[11px] font-black transition-all flex items-center gap-2 ${viewMode === 'groups' ? 'bg-white dark:bg-white/5 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 ${viewMode === 'groups' ? 'text-amber-500' : 'text-slate-400'}`}>
                <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
              </svg>
              GROUPS
            </button>
          </div>

        </div>

        {/* Right: Grid Size & Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-ink-950 p-1 rounded-lg border border-slate-200 dark:border-white/5">
            {[1, 4, 9, 16].map(n => (
              <button key={n} onClick={() => setCells(n)}
                className={`w-8 h-8 flex items-center justify-center rounded-md text-xs font-black transition-all ${cells === n ? 'bg-white dark:bg-white/5 text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-black/5' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                {n}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-slate-200 dark:bg-white/5" />

          <div className="flex items-center gap-2">
            <button onClick={clearPagination} title="Clear Grid"
              className="h-9 w-9 flex items-center justify-center rounded-lg bg-red-50 text-red-500 border border-red-100/50 hover:bg-red-100 transition-all shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
              </svg>
            </button>

            <button onClick={toggleFullscreen} title="Full Screen"
              className="h-9 w-9 flex items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100/50 hover:bg-amber-100 transition-all shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M13.28 7.78l3.22-3.22v2.69a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.69l-3.22 3.22a.75.75 0 001.06 1.06zM2 17.25v-4.5a.75.75 0 011.5 0v2.69l3.22-3.22a.75.75 0 011.06 1.06L4.56 16.5h2.69a.75.75 0 010 1.5h-4.5a.747.747 0 01-.75-.75zM12.22 13.28l3.22 3.22h-2.69a.75.75 0 000 1.5h4.5a.747.747 0 00.75-.75v-4.5a.75.75 0 00-1.5 0v2.69l-3.22-3.22a.75.75 0 10-1.06 1.06zM3.5 4.56l3.22 3.22a.75.75 0 001.06-1.06L4.56 3.5h2.69a.75.75 0 000-1.5h-4.5a.75.75 0 00-.75.75v4.5a.75.75 0 001.5 0V4.56z" />
              </svg>
            </button>

            <button onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle Sources"
              className={`h-9 px-3 rounded-lg flex items-center justify-center gap-2 font-black text-[11px] transition-all shadow-sm border ${sidebarOpen ? 'bg-[#0B1726] text-white border-[#0B1726]' : 'bg-white dark:bg-ink-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/5'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
              </svg>
              {sidebarOpen ? 'HIDE PANEL' : 'SHOW PANEL'}
            </button>
          </div>
        </div>
      </div>


      {/* Main Content */}
      <div className="flex-1 flex gap-1 overflow-hidden h-full">
        {/* Grid Area */}
        <section ref={gridSectionRef} className="flex-1 relative h-full flex flex-col justify-center">
          {/* Fullscreen ESC Button — centered, auto-hides after 2s */}
          {isFullscreen && <FullscreenEscButton onClick={toggleFullscreen} />}
          <div className="grid gap-0.5 w-full max-h-full aspect-video mx-auto" style={{
            ...gridStyle,
          }}>
            {Array.from({ length: cells }).map((_, i) => {
              const streamInfo = gridStreams[i]
              return (
                <div key={i}
                  className="bg-slate-100 dark:bg-ink-900 rounded-md overflow-hidden relative group ring-1 ring-inset ring-slate-300/50 dark:ring-slate-700/60 hover:ring-amber-400/60 transition-colors"
                  onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, i)}>
                  {/* Always keep video in DOM so HLS.js can attach; show only when playing */}
                  <video
                    ref={(el) => { videoRefs.current[i] = el }}
                    data-grid-video
                    className="absolute inset-0 w-full h-full object-cover bg-black"
                    autoPlay muted playsInline
                    style={{ display: streamInfo ? 'block' : 'none' }}
                  />
                  {/* Empty cell placeholder */}
                  {!streamInfo && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 text-slate-200 dark:text-slate-700">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                    </div>
                  )}
                  {/* Loading spinner while HLS stream buffers */}
                  {streamInfo && loadingStreams[i] && !streamErrors[i] && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-[1px]">
                      <div className="relative w-7 h-7">
                        <div className="absolute inset-0 border-2 border-slate-700 rounded-full" />
                        <div className="absolute inset-0 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest max-w-[90%] text-center truncate">
                        {streamInfo.cameraName || 'Loading…'}
                      </span>
                    </div>
                  )}
                  {/* Error state */}
                  {streamInfo && streamErrors[i] && !loadingStreams[i] && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 backdrop-blur-[1px] px-3">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-500 flex-shrink-0">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[9px] text-red-300 font-bold text-center truncate max-w-full">
                        {friendlyStreamError(streamErrors[i])}
                      </span>
                      <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest text-center truncate max-w-full">
                        {streamInfo.cameraName}
                      </span>
                      <button
                        onClick={() => retryStream(i)}
                        className="mt-1 px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[9px] text-slate-200 font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                          <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.43l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                        </svg>
                        Retry
                      </button>
                    </div>
                  )}
                  {streamInfo && (
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded backdrop-blur-sm font-bold">
                      {streamInfo.deviceName || streamInfo.cameraName || 'Unknown'}{streamInfo.stationName ? ` · ${streamInfo.stationName}` : ''}
                    </div>
                  )}
                  {hevcCells.has(i) && (
                    <div className={`absolute top-2 left-2 text-[8px] font-black uppercase px-1.5 py-0.5 rounded backdrop-blur-sm ${helperAvailable ? 'bg-green-600/80 text-white' : 'bg-amber-500/80 text-white'}`}
                      title={helperAvailable ? 'H.265 — routed via local helper' : 'H.265 — browser cannot decode, install helper'}>
                      H265
                    </div>
                  )}
                  <button onClick={() => clearCell(i)}
                    className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                    title="Clear cell">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {/* Right Device Panel (toggleable) */}
        {sidebarOpen && (
          <aside className="w-80 flex-shrink-0 rounded-md border border-slate-200 dark:border-white/5 bg-white dark:bg-ink-900 overflow-hidden flex flex-col shadow-sm">
            <div className="p-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-ink-900 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500">
                    <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm3.25-1.25a.75.75 0 00-.75.75v3.5h3v-3.5a.75.75 0 00-.75-.75h-1.5zm3.5 0v3.5l3.5.01V4h-3.5zM12 4v3.5h3.5A.75.75 0 0016.25 6.75v-2a.75.75 0 00-.75-.75H12zM3.5 9v5.75c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V9h-3zm4.5 6.5h3.5V9H8v6.5zm5-6.5v6.5h3.25a.75.75 0 00.75-.75v-5.75H13z" clipRule="evenodd" />
                  </svg>
                  <span className="font-black text-xs text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Sources</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  <span className="bg-white dark:bg-ink-950 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/5 font-bold text-slate-700 dark:text-slate-300">{devices.length} BOXES</span>
                  {batchLoading ? (
                    <span className="animate-pulse text-amber-500 font-bold">loading…</span>
                  ) : (
                    <span className="bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 font-bold text-emerald-700 dark:text-emerald-400">
                      {cameras.filter(c => devices.some(d => d.id === c.deviceId && d.status === 'online')).length} CAMS
                    </span>
                  )}
                  <button
                    onClick={reloadAllCameras}
                    disabled={batchLoading}
                    title="Reload all cameras"
                    className="p-0.5 text-slate-400 hover:text-amber-500 disabled:opacity-40 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 ${batchLoading ? 'animate-spin' : ''}`}>
                      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.43l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search sources..."
                  className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-ink-950 border border-slate-200 dark:border-white/5 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold"
                />
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {viewMode === 'groups' ? (
                /* ── Groups view ── */
                deviceGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-slate-200">
                      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
                    </svg>
                    <div>
                      <p className="text-xs font-bold text-slate-500">No groups yet</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Create a group to quickly load a set of cameras</p>
                    </div>
                    <button onClick={openCreateGroupModal} className="mt-1 px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-md hover:bg-amber-700 transition-colors">
                      + New Group
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {deviceGroups.map(group => {
                      const groupCameras = getCamerasForGroup(group)
                      const isExpanded = expandedGroups.has(group.id)
                      return (
                        <div key={group.id} className="border-b border-slate-100 dark:border-white/5 last:border-b-0">
                          <div className="flex items-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group active:bg-slate-100 dark:active:bg-slate-800/80">
                            <button
                              onClick={() => toggleGroup(group.id)}
                              className="flex-1 p-3 text-left flex items-center gap-3 overflow-hidden cursor-pointer"
                            >
                              <div className={`p-1 rounded-md bg-slate-100 text-slate-400 transition-all flex-shrink-0 ${isExpanded ? 'bg-amber-50 text-amber-500 rotate-90' : ''}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                </svg>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-black text-slate-900 dark:text-slate-100 text-sm truncate">{group.name}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {groupCameras.length > 0 ? (
                                    <span className="text-[9px] bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 font-bold px-1 rounded border border-emerald-100 dark:border-emerald-800">
                                      {groupCameras.length} cam{groupCameras.length !== 1 ? 's' : ''}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 font-bold">no cams</span>
                                  )}
                                </div>
                              </div>
                            </button>
                            <button
                              onClick={() => loadGroupWithPagination(group, 0)}
                              className="p-3 text-slate-300 hover:text-amber-600 active:text-amber-700 transition-all"
                              title="Play all cameras"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                              </svg>
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="bg-slate-50 dark:bg-ink-950/80 border-t border-slate-100 dark:border-white/5 shadow-inner">
                              <div className="p-2 space-y-1">
                                {groupCameras.map(camera => (
                                  <div
                                    key={`${camera.deviceId}-${camera.id}`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, camera)}
                                    className="p-2 rounded-lg bg-white dark:bg-ink-950 border border-slate-200 dark:border-white/5 hover:border-amber-400 hover:shadow-md cursor-grab active:cursor-grabbing transition-all flex items-center justify-between group/cam select-none"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${camera.status === 'online' ? 'bg-emerald-500' : 'bg-red-400'}`}></div>
                                      <div className="min-w-0">
                                        <div className="text-xs text-slate-900 dark:text-slate-300 font-bold truncate">{camera.name}</div>
                                        <div className="text-[9px] text-slate-500 truncate uppercase tracking-tighter font-black">{camera.brand || 'GENERIC'}</div>
                                      </div>
                                    </div>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-slate-300 flex-shrink-0">
                                      <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" clipRule="evenodd" />
                                    </svg>
                                  </div>
                                ))}
                                {groupCameras.length === 0 && (
                                  <div className="p-4 text-center text-xs text-slate-500 font-bold">No cameras in this group</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 px-3 pb-2">
                                <button onClick={() => openEditGroupModal(group)} className="text-[10px] text-amber-500 hover:text-amber-600 font-bold px-2 py-1 rounded hover:bg-amber-50 transition-colors">Edit</button>
                                <button onClick={() => deleteGroup(group.id)} className="text-[10px] text-red-500 hover:text-red-600 font-bold px-2 py-1 rounded hover:bg-red-50 transition-colors">Delete</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <button onClick={openCreateGroupModal} className="w-full p-3 text-xs text-amber-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 font-bold">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                      </svg>
                      New Group
                    </button>
                  </div>
                )
              ) : (
                /* ── All devices view ── */
                loading ? (
                  <div className="p-8 text-center text-slate-400 text-sm">Loading devices...</div>
                ) : error ? (
                  <div className="p-8 text-center text-red-500 text-sm">{error}</div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {searchTerm ? (
                      filteredDevices.map(renderDeviceItem)
                    ) : (
                      isAdmin && groupedDevices?.length > 0 ? (
                        groupedDevices.map(group => (
                          <div key={group.id} className="border-b border-slate-100 dark:border-white/5 last:border-b-0">
                            <button
                              onClick={() => toggleUserGroup(group.name)}
                              className="w-full px-4 py-2 bg-slate-50 dark:bg-ink-950/80 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between transition-colors sticky top-0 z-10"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {expandedUserGroups.has(group.name) ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500 shrink-0">
                                    <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L13.414 4H16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" />
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
                                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                  </svg>
                                )}
                                <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-tight truncate">{group.name}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 dark:bg-ink-800 dark:text-slate-300 dark:border-white/15">
                                  {group.devices.filter(d => d.status === 'online').length}/{group.devices.length}
                                </span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedUserGroups.has(group.name) ? 'rotate-180' : ''}`}>
                                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </button>
                            {expandedUserGroups.has(group.name) && (
                              <div className="bg-white dark:bg-ink-900">
                                {group.devices.map(renderDeviceItem)}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        devices.map(renderDeviceItem)
                      )
                    )}
                  </div>
                )
              )}
            </div>

            <div className="border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-ink-900 p-2">
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold px-2">
                <span>{cameras.filter(c => devices.some(d => d.id === c.deviceId && d.status === 'online')).length} CAMERAS ONLINE</span>
                {batchLoading && (
                  <span className="flex items-center gap-1 text-amber-500">
                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Device Group Modal */}
      <Modal
        isOpen={showGroupModal}
        onClose={() => { setShowGroupModal(false); setGroupNameError('') }}
        title={editingGroup ? 'Edit Group' : 'Create Device Group'}
      >
        <div className="space-y-4">
          <Input
            id="group-name-input"
            label="Group Name"
            value={groupName}
            onChange={(e) => { setGroupName(e.target.value); setGroupNameError('') }}
            placeholder="e.g., Outer Ring Road"
            error={groupNameError}
            className={groupNameError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}
          />

          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Select Devices & Cameras</div>

              {/* Search Box */}
              <div className="relative flex-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-ink-950 border border-slate-300 dark:border-white/10 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1726]/20 focus:border-[#0B1726]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-white/5 rounded-lg bg-slate-50 dark:bg-ink-900">
              {devices.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">No devices available</div>
              ) : filterDevicesAndCameras().length === 0 ? (
                <div className="p-3 text-sm text-slate-500">No results found for "{searchQuery}"</div>
              ) : (
                filterDevicesAndCameras().map(device => {
                  const deviceCameras = cameras.filter(c => c.deviceId === device.id)
                  const isDeviceSelected = isDeviceFullySelected(device.id)

                  return (
                    <div key={device.id} className="border-b border-slate-200 dark:border-white/5 last:border-b-0">
                      <div className="flex items-center p-2 hover:bg-white dark:hover:bg-slate-800">
                        <input
                          type="checkbox"
                          checked={isDeviceSelected}
                          onChange={(e) => handleDeviceCheckboxChange(device.id, e.target.checked)}
                          className="mr-2"
                        />
                        <button
                          onClick={() => toggleDeviceInModal(device.id)}
                          className="flex-1 flex items-center justify-between text-left"
                        >
                          <div>
                            <div className="text-sm text-slate-800 dark:text-slate-100 font-medium">{device.name}</div>
                            <div className="text-xs text-slate-500">{device.host} • {deviceCameras.length} camera(s)</div>
                          </div>
                          <span className={`text-slate-400 transition-transform text-xs ${expandedDevicesInModal.has(device.id) ? 'rotate-90' : ''}`}>▶</span>
                        </button>
                      </div>

                      {expandedDevicesInModal.has(device.id) && (
                        <div className="bg-white dark:bg-ink-900 pl-6">
                          {loadingCameras.has(device.id) ? (
                            <div className="p-2 text-xs text-slate-500">Loading cameras...</div>
                          ) : deviceCameras.length === 0 ? (
                            <div className="p-2 text-xs text-slate-400">No cameras</div>
                          ) : (
                            deviceCameras.map(camera => {
                              const isCamSelected = isCameraSelected(camera)
                              const isDisabled = isDeviceSelected

                              return (
                                <label
                                  key={camera.id}
                                  className={`flex items-center p-2 hover:bg-slate-50 dark:hover:bg-slate-800 ${isDisabled ? 'opacity-50' : 'cursor-pointer'}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isCamSelected}
                                    disabled={isDisabled}
                                    onChange={(e) => handleCameraCheckboxChange(camera, e.target.checked)}
                                    className="mr-2"
                                  />
                                  <div className="flex-1">
                                    <div className="text-sm text-slate-800">{camera.name}</div>
                                    <div className="text-xs text-slate-500">{camera.brand || 'Unknown'} • {camera.connectionType}</div>
                                  </div>
                                </label>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Select entire devices or expand to choose specific cameras
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowGroupModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveGroup}>
              {editingGroup ? 'Update' : 'Create'} Group
            </Button>
          </div>
        </div>
      </Modal >

      {/* Videowall Save Modal */}
      < Modal
        isOpen={showVideowallModal}
        onClose={() => setShowVideowallModal(false)}
        title="Save Videowall Preset"
      >
        <div className="space-y-4">
          <Input
            label="Videowall Name"
            value={videowallName}
            onChange={(e) => setVideowallName(e.target.value)}
            placeholder="e.g., Main Monitoring"
          />

          <div className="text-sm text-slate-500">
            This will save the current grid layout ({Math.sqrt(cells)}x{Math.sqrt(cells)}) and all camera positions.
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowVideowallModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveCurrentVideowall}>
              Save Videowall
            </Button>
          </div>
        </div>
      </Modal >

      {/* H.265 detection popup */}
      {showHevcPopup && (
        <div className="fixed inset-0 z-[10010] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowHevcPopup(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#0f0f0f] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight mb-1">H.265 Stream Detected</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                  One or more cameras stream in <span className="font-bold text-slate-700 dark:text-slate-300">H.265/HEVC</span>, which your browser cannot decode. Video will appear as a black screen.
                </p>
                <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 mb-4 border border-slate-100 dark:border-white/5">
                  <p className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-2">Fix: run the HEVC Helper</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">Download and run <span className="font-mono font-bold text-slate-700 dark:text-slate-300">hevc-helper</span> on this machine — it transcodes H.265 to H.264 locally so the browser can play it.</p>
                  <ol className="text-[10px] text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
                    <li>Download <span className="font-mono font-bold">hevc-helper</span> for your OS from the hub admin</li>
                    <li>Run it — no config needed, it starts on port 7788</li>
                    <li>Reload this page — H.265 cameras will play automatically</li>
                  </ol>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-4">
                  <span className="font-bold">Requires:</span> FFmpeg installed and in PATH on this machine.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowHevcPopup(false)
                      // Re-check helper availability
                      fetch('http://localhost:7788/health', { signal: AbortSignal.timeout(1500) })
                        .then(r => {
                          if (r.ok) {
                            helperAvailableRef.current = true
                            setHelperAvailable(true)
                          }
                        })
                        .catch(() => {})
                    }}
                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    I started it — retry
                  </button>
                  <button
                    onClick={() => setShowHevcPopup(false)}
                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  )
}
