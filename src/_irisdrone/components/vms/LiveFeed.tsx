import { useState, useMemo, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { Search, ChevronRight, RefreshCw, Trash2, Maximize2, Minimize2 } from 'lucide-react'
import { apiClient, type Device } from '@irisdrone/lib/api'
import { cn } from '@irisdrone/lib/utils'

function encodeStreamUrl(deviceHost: string, cameraId: string): string {
  const target = `http://${deviceHost}:8888/camera_${cameraId}/`
  const encoded = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `/api/stream/p/${encoded}/index.m3u8`
}

interface StreamInfo {
  deviceId: string
  cameraId: string
  hlsUrl: string
  cameraName: string
  deviceName: string
}

interface VmsCamera {
  id: string
  name: string
  deviceId: string
  deviceName: string
  deviceHost: string
  status?: string
}

/**
 * Self-contained HLS player — each cell owns its HLS instance and retry loop.
 * No global orchestration. Patterned after mg-src/magicboxdevice/frontend HlsPlayer.
 */
function HlsCell({ src, cameraName, onClear }: { src: string; cameraName: string; onClear: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let destroyed = false

    const start = () => {
      if (destroyed) return
      setLoading(true)
      setErrorMsg(null)

      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }

      if (Hls.isSupported()) {
        const token = localStorage.getItem('iris_token')
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          maxBufferLength: 4,
          maxMaxBufferLength: 8,
          backBufferLength: 0,
          xhrSetup: token ? (xhr: XMLHttpRequest) => { xhr.setRequestHeader('Authorization', `Bearer ${token}`) } : undefined,
        })
        hlsRef.current = hls
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false)
          video.play().catch(() => {})
        })
        // Snap to live edge if drift exceeds 8s
        hls.on(Hls.Events.FRAG_CHANGED, () => {
          if (!video.duration || !isFinite(video.duration)) return
          const lag = video.duration - video.currentTime
          if (lag > 8) video.currentTime = video.duration - 1
        })
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return
          const isManifest = data.details?.toString().toLowerCase().includes('manifest')
          setErrorMsg(isManifest ? 'Camera not responding' : 'Stream interrupted')
          setLoading(false)
          const delay = isManifest ? 5000 : 2500
          retryTimer.current = setTimeout(() => { if (!destroyed) start() }, delay)
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
        video.addEventListener('loadedmetadata', () => {
          setLoading(false)
          video.play().catch(() => {})
        }, { once: true })
      }
    }

    start()

    return () => {
      destroyed = true
      if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null }
      hlsRef.current?.destroy()
      hlsRef.current = null
      try { video.pause(); video.removeAttribute('src'); video.load() } catch {}
    }
  }, [src])

  const manualRetry = () => {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null }
    // Force a re-run by temporarily destroying and re-setting up
    const video = videoRef.current
    if (!video) return
    hlsRef.current?.destroy()
    hlsRef.current = null
    // Trigger the effect by nudging loading — simplest: call the start logic via a small state toggle would add complexity.
    // Simpler: dispatch a blur/focus on the video to re-run… actually just rely on the effect dep [src]. Bump a tick via a counter isn't worth it; reload via key prop from parent is cleaner. For now, inline retry:
    setLoading(true)
    setErrorMsg(null)
    if (Hls.isSupported()) {
      const token = localStorage.getItem('iris_token')
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        backBufferLength: 0,
        xhrSetup: token ? (xhr: XMLHttpRequest) => { xhr.setRequestHeader('Authorization', `Bearer ${token}`) } : undefined,
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setLoading(false); video.play().catch(() => {}) })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return
        const isManifest = data.details?.toString().toLowerCase().includes('manifest')
        setErrorMsg(isManifest ? 'Camera not responding' : 'Stream interrupted')
        setLoading(false)
      })
    }
  }

  return (
    <>
      <video ref={videoRef} className="w-full h-full object-contain bg-black" autoPlay muted playsInline />
      {loading && !errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[1px]">
          <div className="relative w-7 h-7">
            <div className="absolute inset-0 border-2 border-zinc-700 rounded-full" />
            <div className="absolute inset-0 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      )}
      {errorMsg && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 backdrop-blur-[1px] px-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-500">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span className="text-[9px] text-red-300 font-bold text-center truncate max-w-full">{errorMsg}</span>
          <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">{cameraName}</span>
          <button onClick={manualRetry} className="mt-1 px-2.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-[9px] text-zinc-200 font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}
      {/* Camera name overlay */}
      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded backdrop-blur-sm font-bold pointer-events-none">
        {cameraName}
      </div>
      {/* Close button */}
      <button onClick={onClear} className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600/80 text-zinc-400 hover:text-white rounded opacity-0 group-hover:opacity-100 transition-all shadow-sm" title="Clear cell">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </>
  )
}

export function VmsLiveFeed() {
  const [devices, setDevices] = useState<Device[]>([])
  const [cameras, setCameras] = useState<VmsCamera[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [, setLoadedDevices] = useState<Set<string>>(new Set())
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [cells, setCells] = useState(4)
  const [gridStreams, setGridStreams] = useState<Record<number, StreamInfo>>({})
  const [isFullscreen, setIsFullscreen] = useState(false)

  const gridSectionRef = useRef<HTMLDivElement>(null)

  // Load MagicBox devices, then fetch cameras from each edge device
  const deviceIp = (dev: Device): string => {
    return dev.metadata?.wireguardIp
      || (dev as any).runtimeInfo?.wg_interface_ip
      || dev.metadata?.wg_interface_ip
      || dev.metadata?.host
      || ''
  }
  const edgeHost = (dev: Device): string => {
    const ip = deviceIp(dev)
    if (!ip) return ''
    const port = dev.metadata?.usscorePort || 8001
    return `${ip}:${port}`
  }

  const fetchCamerasForDevice = async (dev: Device): Promise<VmsCamera[]> => {
    const host = edgeHost(dev)
    const ip = deviceIp(dev)
    if (!host) return []
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const token = localStorage.getItem('iris_token')
      const res = await fetch(`/api/edge/${host}/api/cameras`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) return []
      const data: any[] = await res.json()
      return data.map((c: any) => ({
        id: String(c.id),
        name: c.name || `Camera ${c.id}`,
        deviceId: dev.id,
        deviceName: dev.name,
        deviceHost: ip, // raw IP for HLS (port 8888 always)
        status: c.is_active !== false ? 'online' : 'offline',
      } as VmsCamera))
    } catch { clearTimeout(timer); return [] }
  }

  const loadAll = async () => {
    setLoadingDevices(true)
    try {
      const devs = ((await apiClient.getDevices()) as Device[]).filter((d) => d.type === 'MAGICBOX' && d.metadata?.hasUssCore === true)
      setDevices(devs)
      setLoadingDevices(false)
      const allCams: VmsCamera[] = []
      const loaded = new Set<string>()
      const results = await Promise.allSettled(devs.map((d) => fetchCamerasForDevice(d)))
      results.forEach((r, i) => {
        loaded.add(devs[i].id)
        if (r.status === 'fulfilled') allCams.push(...r.value)
      })
      setCameras(allCams)
      setLoadedDevices(loaded)
    } catch {
      setLoadingDevices(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Fullscreen listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const clearCell = (cellIndex: number) => {
    setGridStreams((prev) => { const n = { ...prev }; delete n[cellIndex]; return n })
  }

  const clearAll = () => {
    setGridStreams({})
  }

  const handleCameraClick = (cam: VmsCamera) => {
    let targetCell = -1
    for (let i = 0; i < cells; i++) {
      if (!gridStreams[i]) { targetCell = i; break }
    }
    if (targetCell === -1) targetCell = 0
    setGridStreams((prev) => ({
      ...prev,
      [targetCell]: {
        deviceId: cam.deviceId,
        cameraId: cam.id,
        hlsUrl: encodeStreamUrl(cam.deviceHost, cam.id),
        cameraName: cam.name,
        deviceName: cam.deviceName,
      },
    }))
  }

  const handlePlayAllGroup = (groupId: string) => {
    const groupCams = cameras.filter((c) => c.deviceId === groupId)
    if (groupCams.length === 0) return

    const emptyCells: number[] = []
    for (let i = 0; i < cells; i++) {
      if (!gridStreams[i]) emptyCells.push(i)
    }

    const newStreams = { ...gridStreams }
    groupCams.forEach((cam, idx) => {
      if (idx >= emptyCells.length) return
      const cellIdx = emptyCells[idx]
      newStreams[cellIdx] = {
        deviceId: cam.deviceId,
        cameraId: cam.id,
        hlsUrl: encodeStreamUrl(cam.deviceHost, cam.id),
        cameraName: cam.name,
        deviceName: cam.deviceName,
      }
    })
    setGridStreams(newStreams)
  }

  const handleDragStart = (e: React.DragEvent, cam: VmsCamera) => {
    e.dataTransfer.setData('application/json', JSON.stringify(cam))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDrop = (e: React.DragEvent, cellIndex: number) => {
    e.preventDefault()
    try {
      const cam: VmsCamera = JSON.parse(e.dataTransfer.getData('application/json'))
      setGridStreams((prev) => ({
        ...prev,
        [cellIndex]: {
          deviceId: cam.deviceId,
          cameraId: cam.id,
          hlsUrl: encodeStreamUrl(cam.deviceHost, cam.id),
          cameraName: cam.name,
          deviceName: cam.deviceName,
        },
      }))
    } catch {}
  }

  const toggleDevice = (groupName: string) => {
    setExpandedDevices((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      return next
    })
  }

  const toggleFullscreen = async () => {
    if (!gridSectionRef.current) return
    try {
      if (!document.fullscreenElement) await gridSectionRef.current.requestFullscreen()
      else await document.exitFullscreen()
    } catch {}
  }

  // Group cameras by device — show device name, include devices with 0 cameras
  const groups = useMemo(() => {
    const map = new Map<string, { displayName: string; cameras: VmsCamera[] }>()
    devices.forEach((dev) => {
      map.set(dev.id, { displayName: dev.name, cameras: [] })
    })
    cameras.forEach((cam) => {
      const entry = map.get(cam.deviceId)
      if (entry) entry.cameras.push(cam)
    })
    return Array.from(map.entries())
      .map(([id, data]) => ({ name: data.displayName, id, cameras: data.cameras }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [cameras, devices])

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return groups
    const q = searchTerm.toLowerCase()
    return groups.filter((g) => g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q) || g.cameras.some((c) => c.name.toLowerCase().includes(q)))
  }, [groups, searchTerm])

  const gridStyle = useMemo(() => {
    const dims: Record<number, [number, number]> = {
      1: [1, 1], 4: [2, 2], 9: [3, 3], 16: [4, 4], 25: [5, 5],
    }
    const [cols, rows] = dims[cells] ?? [Math.ceil(Math.sqrt(cells)), Math.ceil(Math.sqrt(cells))]
    return {
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      aspectRatio: `${cols * 16} / ${rows * 9}`,
    }
  }, [cells])

  const onlineCamCount = cameras.filter((c) => c.status === 'online').length

  return (
    <div className="h-full flex flex-col gap-2 p-2">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between py-1.5 px-3 bg-zinc-900 rounded-lg border border-white/10 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
          <span className="bg-zinc-800 px-2 py-0.5 rounded border border-white/10 text-zinc-300">{devices.length} BOXES</span>
          <span className="bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800 text-emerald-400">{onlineCamCount} CAMS</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Grid size buttons */}
          <div className="flex items-center gap-1 bg-zinc-800 p-0.5 rounded-lg border border-white/10">
            {[1, 4, 9, 16, 25].map((n) => (
              <button
                key={n}
                onClick={() => setCells(n)}
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-md text-xs font-bold transition-all',
                  cells === n ? 'bg-zinc-600 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-white/10" />

          <button onClick={clearAll} title="Clear Grid" className="h-8 w-8 flex items-center justify-center rounded-lg bg-red-950/50 text-red-400 border border-red-800/50 hover:bg-red-950 transition-all">
            <Trash2 className="w-4 h-4" />
          </button>

          <button onClick={toggleFullscreen} title="Fullscreen" className="h-8 w-8 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 border border-white/10 hover:bg-zinc-700 transition-all">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              'h-8 px-3 rounded-lg flex items-center gap-2 text-[11px] font-bold transition-all border',
              sidebarOpen ? 'bg-zinc-100 text-zinc-900 border-zinc-300' : 'bg-zinc-800 text-zinc-400 border-white/10'
            )}
          >
            {sidebarOpen ? 'HIDE' : 'SOURCES'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-2 overflow-hidden">
        {/* Grid Area */}
        <section ref={gridSectionRef} className="flex-1 relative flex flex-col justify-center">
          <div className="grid gap-0.5 w-full max-h-full mx-auto" style={gridStyle}>
            {Array.from({ length: cells }).map((_, i) => {
              const info = gridStreams[i]
              return (
                <div
                  key={i}
                  className="bg-zinc-900 rounded-md overflow-hidden relative group ring-1 ring-inset ring-zinc-700/60 hover:ring-amber-500/60 transition-colors"
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                  onDrop={(e) => handleDrop(e, i)}
                >
                  {info ? (
                    <HlsCell
                      key={info.hlsUrl}
                      src={info.hlsUrl}
                      cameraName={info.cameraName}
                      onClear={() => clearCell(i)}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 text-zinc-700">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Right Device Panel */}
        {sidebarOpen && (
          <aside className="w-60 flex-shrink-0 rounded-lg border border-white/10 bg-zinc-900 overflow-hidden flex flex-col shadow-sm">
            <div className="p-2 border-b border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[10px] text-zinc-400 uppercase tracking-widest">Sources</span>
                <button onClick={() => loadAll()} title="Reload all" className="p-1 text-zinc-500 hover:text-amber-400 transition-colors">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search sources..."
                  className="w-full pl-7 pr-2 py-1 bg-zinc-800 border border-white/10 rounded-md text-zinc-200 placeholder-zinc-600 text-[11px] outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingDevices ? (
                <div className="p-8 text-center text-zinc-500 text-sm">Loading devices...</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filteredGroups.map((group) => {
                    const isExpanded = expandedDevices.has(group.id)
                    const onlineCount = group.cameras.filter((c) => c.status === 'online').length

                    return (
                      <div key={group.id}>
                        <div className="flex items-center hover:bg-zinc-800/50 transition-colors group/dev">
                          <button onClick={() => toggleDevice(group.id)} className="flex-1 px-2 py-1.5 text-left flex items-center gap-2 overflow-hidden">
                            <div className={cn('p-0.5 rounded transition-all flex-shrink-0', isExpanded ? 'bg-amber-500/20 text-amber-400 rotate-90' : 'bg-zinc-800 text-zinc-500')}>
                              <ChevronRight className="w-3 h-3" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-zinc-100 text-[11px] truncate leading-tight">{group.name}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[8px] bg-emerald-950/50 text-emerald-400 font-bold px-1 rounded border border-emerald-800">
                                  {group.cameras.length} cam{group.cameras.length !== 1 ? 's' : ''}
                                </span>
                                {onlineCount > 0 && (
                                  <span className="text-[8px] text-zinc-500">{onlineCount} online</span>
                                )}
                              </div>
                            </div>
                          </button>
                          <button onClick={() => handlePlayAllGroup(group.id)} className="px-2 py-1.5 text-zinc-600 hover:text-amber-400 transition-all" title="Play all cameras">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="bg-zinc-950/50 border-t border-white/5">
                            <div className="p-1.5 space-y-1">
                              {group.cameras.map((cam) => (
                                <div
                                  key={cam.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, cam)}
                                  onClick={() => handleCameraClick(cam)}
                                  className="px-2 py-1.5 rounded-md bg-zinc-900 border border-white/5 hover:border-amber-500/50 hover:bg-amber-950/20 cursor-pointer active:cursor-grabbing transition-all flex items-center justify-between group/cam select-none"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cam.status === 'online' ? 'bg-emerald-500' : 'bg-red-400')} />
                                    <span className="text-[11px] text-zinc-300 font-medium truncate">{cam.name}</span>
                                  </div>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-zinc-600 group-hover/cam:text-amber-400 flex-shrink-0">
                                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                  </svg>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-white/10 p-1.5">
              <div className="flex items-center justify-between text-[9px] text-zinc-500 font-bold px-1.5 tracking-widest">
                <span>{onlineCamCount} CAMERAS ONLINE</span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
