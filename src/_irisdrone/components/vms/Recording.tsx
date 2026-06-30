import { useState, useEffect, useCallback, useRef } from 'react'
import Hls from 'hls.js'
import { apiClient, type Device } from '@irisdrone/lib/api'

export function VmsRecording() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [childCameras, setChildCameras] = useState<Device[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState('')

  const [startTime, setStartTime] = useState(() => {
    const d = new Date(Date.now() - 3600000)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })
  const [endTime, setEndTime] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [playbackId, setPlaybackId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isVideoReady, setIsVideoReady] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const playbackIdRef = useRef<string | null>(null)

  useEffect(() => { playbackIdRef.current = playbackId }, [playbackId])

  // Load devices
  useEffect(() => {
    apiClient.getDevices().then((devs) => {
      const d = (devs as Device[]).filter((dev) => dev.type === 'MAGICBOX' || dev.type === 'CAMERA')
      setDevices(d)
    }).catch(() => {})
  }, [])

  // Load cameras when device selected
  useEffect(() => {
    if (!selectedDeviceId) { setChildCameras([]); setSelectedCameraId(''); return }
    apiClient.getDeviceCameras(selectedDeviceId).then((cams) => {
      setChildCameras(cams)
      if (cams.length > 0) setSelectedCameraId(cams[0].id)
    }).catch(() => setChildCameras([]))
  }, [selectedDeviceId])

  function destroyHls() {
    hlsRef.current?.destroy()
    hlsRef.current = null
  }

  const getDeviceHost = useCallback(() => {
    const dev = devices.find((d) => d.id === selectedDeviceId)
    return dev?.metadata?.wireguardIp || dev?.metadata?.host || ''
  }, [devices, selectedDeviceId])

  const cleanupPlayback = useCallback(async (id: string | null) => {
    if (!id) return
    const host = getDeviceHost()
    if (!host) return
    try {
      const url = `/api/edge/${host}/api/playback/stream/${id}`
      navigator.sendBeacon ? navigator.sendBeacon(url) : await fetch(url, { method: 'DELETE' })
    } catch {}
  }, [getDeviceHost])

  // HLS init
  useEffect(() => {
    if (!playbackUrl || !videoRef.current) return
    const video = videoRef.current
    setIsVideoReady(false)
    destroyHls()

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadingTimeOut: 120000,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 3000,
        levelLoadingTimeOut: 120000,
        levelLoadingMaxRetry: 6,
        fragLoadingMaxRetry: 6,
      })
      hlsRef.current = hls
      let networkRetries = 0
      hls.loadSource(playbackUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        networkRetries = 0
        video.play().catch(() => {})
        setIsVideoReady(true)
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            networkRetries++
            if (networkRetries <= 5) setTimeout(() => hls.startLoad(), 3000)
            else setError('Network error loading stream.')
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
          } else {
            setError('Playback error: ' + data.details)
          }
        }
      })
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playbackUrl
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {})
        setIsVideoReady(true)
      }, { once: true })
    } else {
      setError('HLS is not supported in this browser')
    }

    return () => { destroyHls() }
  }, [playbackUrl])

  // Cleanup on unmount
  useEffect(() => {
    const onUnload = () => {
      if (playbackIdRef.current) {
        const host = getDeviceHost()
        if (host) navigator.sendBeacon(`/api/edge/${host}/api/playback/stream/${playbackIdRef.current}`)
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      destroyHls()
      stopRecording()
      if (playbackIdRef.current) cleanupPlayback(playbackIdRef.current)
    }
  }, [cleanupPlayback, getDeviceHost])

  const handlePlay = async () => {
    if (!selectedCameraId) return setError('Select a camera')
    if (new Date(endTime) <= new Date(startTime)) return setError('End time must be after start time')
    const host = getDeviceHost()
    if (!host) return setError('Device host not available')

    setError(null)
    setLoading(true)
    setIsPlaying(false)
    setIsVideoReady(false)
    setRecordedBlob(null)
    destroyHls()

    if (playbackId) {
      await cleanupPlayback(playbackId)
      setPlaybackId(null)
    }

    try {
      const res = await fetch(`/api/edge/${host}/api/playback/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cameraId: selectedCameraId,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start playback')
      }
      const data = await res.json()
      // Proxy the playback stream URL through the central server
      const rawUrl = data.streamUrl?.startsWith('http')
        ? data.streamUrl
        : `http://${host}:8888${data.streamUrl}`
      const target = rawUrl.replace(/\/index\.m3u8$/, '/').replace(/([^/])$/, '$1/')
      const enc = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
      const streamUrl = `/api/stream/p/${enc}/index.m3u8`
      setPlaybackUrl(streamUrl)
      setPlaybackId(data.playbackId)
      setIsPlaying(true)
    } catch (err: any) {
      setError(err.message)
      setIsPlaying(false)
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    stopRecording()
    destroyHls()
    if (playbackId) await cleanupPlayback(playbackId)
    setPlaybackUrl(null)
    setPlaybackId(null)
    setIsPlaying(false)
    setIsVideoReady(false)
  }

  function startRecording() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !isVideoReady) return

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')!

    function drawFrame() {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return
      ctx.drawImage(video!, 0, 0, canvas!.width, canvas!.height)
      animFrameRef.current = requestAnimationFrame(drawFrame)
    }

    const stream = canvas.captureStream(30)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm;codecs=vp8'
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => setRecordedBlob(new Blob(chunks, { type: mimeType }))

    mediaRecorderRef.current = recorder
    recorder.start(1000)
    drawFrame()

    setIsRecording(true)
    setRecordingDuration(0)
    setRecordedBlob(null)
    recordingTimerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000)
  }

  function stopRecording() {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    mediaRecorderRef.current = null
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
    setIsRecording(false)
  }

  function downloadRecording() {
    if (!recordedBlob) return
    const cam = childCameras.find((c) => c.id === selectedCameraId)
    const ts = startTime.replace(/[T:]/g, '-').slice(0, 16)
    const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm'
    const url = URL.createObjectURL(recordedBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `playback_${cam?.name ?? 'camera'}_${ts}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatDuration(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  const inputCls = 'w-full bg-zinc-800 border border-white/10 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all'

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="shrink-0 flex flex-col gap-3 px-4 py-3 border-b border-white/10 bg-zinc-950">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Playback</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Review recorded footage from NVR cameras</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-xs text-zinc-500">Device</label>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={isPlaying}
              className={inputCls + ' cursor-pointer'}
            >
              <option value="">Select device...</option>
              {devices.map((dev) => (
                <option key={dev.id} value={dev.id}>{dev.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-xs text-zinc-500">Camera</label>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              disabled={isPlaying || !selectedDeviceId}
              className={inputCls + ' cursor-pointer'}
            >
              <option value="">Select camera...</option>
              {childCameras.map((cam) => (
                <option key={cam.id} value={cam.id}>{cam.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-xs text-zinc-500">Start time</label>
            <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={isPlaying} className={inputCls} />
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-xs text-zinc-500">End time</label>
            <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={isPlaying} className={inputCls} />
          </div>

          <div className="flex gap-2 items-end pb-0.5">
            {!isPlaying ? (
              <button
                onClick={handlePlay}
                disabled={loading || !selectedCameraId}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 flex items-center gap-2 shadow-sm"
              >
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                )}
                {loading ? 'Loading...' : 'Play'}
              </button>
            ) : (
              <>
                <button onClick={handleStop} className="bg-zinc-700 hover:bg-zinc-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm5-2.25A.75.75 0 0 1 7.75 7h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5Z" clipRule="evenodd" />
                  </svg>
                  Stop
                </button>

                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={!isVideoReady}
                    className="px-4 py-2 rounded-lg bg-orange-950/40 text-orange-400 border border-orange-800 hover:bg-orange-950/60 disabled:opacity-40 transition-all flex items-center gap-2 text-sm font-medium"
                  >
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    Record
                  </button>
                ) : (
                  <button onClick={stopRecording} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium animate-pulse flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z" />
                    </svg>
                    Stop - {formatDuration(recordingDuration)}
                  </button>
                )}

                {recordedBlob && !isRecording && (
                  <button onClick={downloadRecording} className="px-4 py-2 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-800 hover:bg-emerald-950/60 transition-all flex items-center gap-2 text-sm font-medium">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                      <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                    </svg>
                    Download
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-950/40 border border-red-800 text-red-400 text-xs rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
      </div>

      {/* Video */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-zinc-950 p-4">
        <div
          className={`relative rounded-xl overflow-hidden bg-zinc-900 border ${isPlaying ? 'border-white/10' : 'border-dashed border-zinc-700'}`}
          style={{ aspectRatio: '16/9', height: '100%', maxWidth: '100%' }}
        >
          <video ref={videoRef} className="w-full h-full object-contain bg-black" controls playsInline crossOrigin="anonymous" style={{ display: isPlaying ? 'block' : 'none' }} />

          {!isPlaying && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none">
              <div className="w-14 h-14 rounded-xl bg-zinc-800 border border-white/10 shadow-sm flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-zinc-600">
                  <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-zinc-400 text-sm">No recording playing</p>
                <p className="text-zinc-600 text-xs mt-1">Select a device & camera, set a time range and press Play</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-4 border-zinc-700 rounded-full" />
                <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-zinc-400 text-sm animate-pulse">Loading recording...</p>
            </div>
          )}

          {isPlaying && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-md pointer-events-none">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-white">Playing</span>
            </div>
          )}

          {isRecording && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-600/90 backdrop-blur-sm px-2.5 py-1 rounded-md pointer-events-none animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
              <span className="text-xs text-white">REC {formatDuration(recordingDuration)}</span>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
