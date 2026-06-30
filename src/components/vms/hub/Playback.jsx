import React, { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { playbackAPI, hlsStreamUrl } from './utils/api.js'
import generate65BCertificate from './utils/generate65BCertificate.js'

export default function Playback({ deviceId, cameras, onClose, devices, onDeviceChange, globalLoading, globalError, hasNoDevices }) {
  // Filter to cameras with a brand set (required for NVR playback)
  const playableCameras = (cameras || []).filter((c) => c.brand && c.brand !== 'Unknown')

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
  const [playbackInfo, setPlaybackInfo] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState(null)

  // 65B Certificate modal state
  const [show65B, setShow65B] = useState(false)
  const [certForm, setCertForm] = useState({
    caseRef: '',
    signatoryName: '',
    signatoryRole: '',
    policeStation: '',
    division: '',
    signatoryOrg: 'Bengaluru City Police',
    remarks: '',
  })

  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const canvasRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordingTimerRef = useRef(null)
  const animFrameRef = useRef(null)
  const playbackInfoRef = useRef(null)

  // Keep ref in sync for beforeunload handler
  useEffect(() => {
    playbackInfoRef.current = playbackInfo
  }, [playbackInfo])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyHls()
      stopRecording()
      if (playbackInfoRef.current) {
        playbackAPI.stop(playbackInfoRef.current.playbackId).catch(() => { })
      }
    }
  }, [])

  // sendBeacon cleanup on page unload
  useEffect(() => {
    function onBeforeUnload() {
      if (playbackInfoRef.current) {
        navigator.sendBeacon(`/api/playback/cleanup/${playbackInfoRef.current.playbackId}`)
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  function destroyHls() {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }

  const handlePlay = useCallback(async () => {
    if (!selectedCameraId) return setError('Select a camera')
    if (new Date(endTime) <= new Date(startTime)) return setError('End time must be after start time')

    setError('')
    setLoading(true)
    destroyHls()
    setRecordedBlob(null)

    try {
      // datetime-local gives "YYYY-MM-DDTHH:MM" — append :00Z for RFC3339
      // Z is required by edge parser; values stay as-entered (no UTC conversion)
      const fmtTime = (t) => (t.length === 16 ? t + ':00Z' : t)
      const res = await playbackAPI.start(
        deviceId,
        selectedCameraId,
        fmtTime(startTime),
        fmtTime(endTime)
      )
      const info = res.data
      setPlaybackInfo(info)
      setIsPlaying(true)

      // IRIS has no server playback — stream the live MediaMTX HLS off the
      // selected camera's edge device.
      const video = videoRef.current
      const _cam = (cameras || []).find((c) => String(c.id) === String(selectedCameraId))
      const hlsUrl = hlsStreamUrl(selectedCameraId, _cam?.host)

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,   // Match MediaMTX hlsVariant: lowLatency
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          manifestLoadingTimeOut: 120000,  // 120s — MediaMTX blocks until first segment
          manifestLoadingMaxRetry: 6,
          manifestLoadingRetryDelay: 3000,
          levelLoadingTimeOut: 120000,
          levelLoadingMaxRetry: 6,
          levelLoadingRetryDelay: 3000,
          fragLoadingMaxRetry: 6,
        })
        hlsRef.current = hls
        let networkRetries = 0

        hls.loadSource(hlsUrl)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          networkRetries = 0
          video.play().catch(() => { })
        })

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error('HLS fatal error:', data)
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              networkRetries++
              if (networkRetries <= 5) {
                console.log(`HLS network error, retrying (${networkRetries}/5)...`)
                setTimeout(() => hls.startLoad(), 3000)
              } else {
                setError('Network error loading stream. The recording may not be available.')
              }
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError()
            } else {
              setError('Playback error: ' + data.details)
            }
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl
        video.addEventListener('loadedmetadata', () => video.play().catch(() => { }), { once: true })
      } else {
        setError('HLS not supported in this browser')
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.message
      setError('Failed to start playback: ' + msg)
      setIsPlaying(false)
    } finally {
      setLoading(false)
    }
  }, [selectedCameraId, startTime, endTime])

  const handleStop = useCallback(async () => {
    stopRecording()
    destroyHls()

    if (playbackInfo) {
      try {
        await playbackAPI.stop(playbackInfo.playbackId)
      } catch { }
    }

    setPlaybackInfo(null)
    setIsPlaying(false)
  }, [playbackInfo])

  // --- Browser Recording ---
  function startRecording() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')

    function drawFrame() {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      animFrameRef.current = requestAnimationFrame(drawFrame)
    }

    const stream = canvas.captureStream(30)
    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')
      ? 'video/mp4;codecs=avc1,mp4a.40.2'
      : MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm;codecs=vp8'
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      setRecordedBlob(blob)
    }

    mediaRecorderRef.current = recorder
    recorder.start(1000)
    drawFrame()

    setIsRecording(true)
    setRecordingDuration(0)
    setRecordedBlob(null)
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration((d) => d + 1)
    }, 1000)
  }

  function stopRecording() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    setIsRecording(false)
  }

  function getRecordingFileName() {
    const deviceName = (devices || []).find(d => d.id === deviceId)?.name || deviceId || 'device'
    const ts = startTime ? startTime.replace(/[T:]/g, '-').slice(0, 16) : new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
    const safeName = deviceName.replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase()
    const ext = recordedBlob?.type?.includes('mp4') ? 'mp4' : recordedBlob?.type?.includes('webm') ? 'mkv' : 'mp4'
    return `magicbox_${safeName}_${ts}.${ext}`
  }

  function downloadRecording() {
    if (!recordedBlob) return
    const url = URL.createObjectURL(recordedBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = getRecordingFileName()
    a.click()
    URL.revokeObjectURL(url)
  }

  async function computeFileHash(blob) {
    try {
      const buffer = await blob.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
    } catch {
      return ''
    }
  }

  function extractNvrIp(camera) {
    // Use camera.ip if available (direct NVR IP)
    if (camera?.ip) return camera.ip
    // Otherwise extract from RTSP URL in address/primaryStream/subStream
    const url = camera?.address || camera?.primaryStream || camera?.subStream || ''
    const match = url.match(/@([\d.]+)/)
    return match ? match[1] : 'N/A'
  }

  async function handleGenerate65B() {
    const device = (devices || []).find(d => d.id === deviceId)
    const camera = (cameras || []).find(c => String(c.id) === String(selectedCameraId))
    let fileHash = ''
    if (recordedBlob) {
      fileHash = await computeFileHash(recordedBlob)
    }

    // Download the recording first
    downloadRecording()

    // Then generate the certificate
    generate65BCertificate({
      caseRef: certForm.caseRef,
      deviceName: device?.name || String(deviceId),
      deviceIp: extractNvrIp(camera),
      cameraName: camera?.name || camera?.cameraName || selectedCameraId || 'N/A',
      cameraBrand: camera?.brand || 'N/A',
      startTime,
      endTime,
      fileName: getRecordingFileName(),
      fileHash,
      signatoryName: certForm.signatoryName,
      signatoryRole: certForm.signatoryRole,
      policeStation: certForm.policeStation,
      division: certForm.division,
      signatoryOrg: certForm.signatoryOrg,
      remarks: certForm.remarks,
    })
    setShow65B(false)
  }

  function formatDuration(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0')
    const s = String(seconds % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h2 className="text-[13px] font-black text-slate-900 dark:text-slate-100 tracking-tighter uppercase leading-none">Access Recordings</h2>
          <p className="text-[8px] text-slate-500 font-bold mt-1 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shadow-xl shadow-amber-500/50"></span>
            Telemetry Retrieval for Command ID: {deviceId || 'NONE'}
          </p>
        </div>
        <button
          onClick={() => { handleStop(); onClose?.() }}
          className="px-3 py-1 rounded-lg bg-slate-50 dark:bg-ink-950 border border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest hover:bg-white dark:hover:bg-slate-700 hover:shadow-md transition-all active:scale-95 flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
            <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L4.81 6h5.44a.75.75 0 010 1.5H4.81l2.958 2.707a.75.75 0 11-1.018 1.1l-4.25-3.886a.75.75 0 010-1.1 l4.25-3.886a.75.75 0 011.06.025z" clipRule="evenodd" />
          </svg>
          Back to Live Link
        </button>
      </div>

      {globalError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-red-100 dark:border-red-900/30 rounded-3xl bg-red-50/50 dark:bg-red-950/20">
          <div className="w-16 h-16 bg-white dark:bg-ink-950 rounded-2xl shadow-sm border border-red-100 dark:border-red-500/20 flex items-center justify-center mb-8 text-red-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-4">
            <span className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-widest block">Failed to Load Telemetry</span>
            <p className="text-[10px] text-red-500 dark:text-red-300 font-bold uppercase tracking-tight max-w-[300px] mx-auto">{globalError}</p>
          </div>
        </div>
      ) : globalLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-3xl bg-slate-50/50 dark:bg-ink-950/30">
          <div className="w-16 h-16 bg-white dark:bg-ink-950 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5 flex items-center justify-center mb-8 text-amber-500">
            <svg className="animate-spin w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
          <div className="space-y-4">
            <span className="text-sm font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest block animate-pulse">Establishing Secure Uplink</span>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight max-w-[300px] mx-auto">Retrieving device infrastructure matrix</p>
          </div>
        </div>
      ) : hasNoDevices ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-3xl bg-slate-50/50 dark:bg-ink-950/30">
          <div className="w-16 h-16 bg-white dark:bg-ink-950 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5 flex items-center justify-center mb-8 text-slate-300 dark:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <div className="space-y-4">
            <span className="text-sm font-black text-slate-400 uppercase tracking-widest block">No Infrastructure Detected</span>
            <p className="text-[10px] text-slate-300 dark:text-slate-500 font-bold uppercase tracking-tight max-w-[300px] mx-auto">Register devices in the command centre to access telemetry tools</p>
          </div>
        </div>
      ) : (cameras || []).length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-3xl bg-slate-50/50 dark:bg-ink-950/30">
          <div className="w-16 h-16 bg-white dark:bg-ink-950 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5 flex items-center justify-center mb-8 text-slate-300 dark:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </div>
          <div className="space-y-4">
            <span className="text-sm font-black text-slate-400 uppercase tracking-widest block">No Cameras Found</span>
            <p className="text-[10px] text-slate-300 dark:text-slate-500 font-bold uppercase tracking-tight max-w-[300px] mx-auto">This device has no cameras configured. Select a different device or add cameras from the Devices page.</p>
          </div>
        </div>
    ) : playableCameras.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-3xl bg-slate-50/50 dark:bg-ink-950/30">
          <div className="w-16 h-16 bg-white dark:bg-ink-950 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5 flex items-center justify-center mb-8 text-slate-300 dark:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div className="space-y-4">
            <span className="text-sm font-black text-slate-400 uppercase tracking-widest block">Incompatible Node Configuration</span>
            <p className="text-[10px] text-slate-300 dark:text-slate-500 font-bold uppercase tracking-tight max-w-[300px] mx-auto">Nodes must have manufacturer brand metadata defined for archive retrieval</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          {/* Controls Grid */}
          <div className={`grid grid-cols-1 gap-3 p-3 bg-slate-50/50 dark:bg-ink-950/80 rounded-xl border border-slate-100 dark:border-white/5 relative overflow-hidden group ${devices?.length ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[80px] -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-colors" />

            {devices?.length > 0 && (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] px-1">Device</label>
                <select
                  value={deviceId || ''}
                  onChange={(e) => { onDeviceChange?.(Number(e.target.value)) }}
                  disabled={isPlaying}
                  className="w-full bg-white dark:bg-ink-950 border border-slate-200 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-[10px] font-bold focus:ring-2 focus:ring-amber-500/10 focus:border-amber-600 outline-none transition-all uppercase appearance-none cursor-pointer"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} — {d.host}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] px-1">Camera</label>
              <select
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                disabled={isPlaying}
                className="w-full bg-white dark:bg-ink-950 border border-slate-200 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-[10px] font-bold focus:ring-2 focus:ring-amber-500/10 focus:border-amber-600 outline-none transition-all uppercase appearance-none cursor-pointer"
              >
                <option value="">Select Camera...</option>
                {playableCameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name} [{cam.brand?.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] px-1">Start Time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isPlaying}
                className="w-full bg-white dark:bg-ink-950 border border-slate-200 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-[10px] font-mono font-black focus:ring-2 focus:ring-amber-500/10 focus:border-amber-600 outline-none transition-all uppercase dark:[color-scheme:dark]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] px-1">End Time</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={isPlaying}
                className="w-full bg-white dark:bg-ink-950 border border-slate-200 dark:border-white/5 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-[10px] font-mono font-black focus:ring-2 focus:ring-amber-500/10 focus:border-amber-600 outline-none transition-all uppercase dark:[color-scheme:dark]"
              />
            </div>

            <div className="flex flex-col justify-end min-w-0">
              <div className="flex gap-1.5 flex-wrap">
                {!isPlaying ? (
                  <button
                    onClick={handlePlay}
                    disabled={loading || !selectedCameraId}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-amber-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    )}
                    Initialize
                  </button>
                ) : (
                  <div className="flex-1 flex gap-1.5 flex-wrap">
                    <button
                      onClick={handleStop}
                      className="flex-1 bg-slate-900 hover:bg-black text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm5-2.25A.75.75 0 0 1 7.75 7h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5Z" clipRule="evenodd" />
                      </svg>
                      Stop
                    </button>

                    {!isRecording ? (
                      <button
                        onClick={startRecording}
                        className="px-3 py-2 rounded-lg bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100 transition-all flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest"
                      >
                        <div className="w-2 h-2 rounded-full bg-orange-600 shadow-lg shadow-orange-600/40" />
                        Record
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="px-3 py-2 rounded-lg bg-red-600 text-white text-[9px] font-black uppercase tracking-widest animate-pulse flex items-center gap-1.5"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                          <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z" />
                        </svg>
                        Stop ({formatDuration(recordingDuration)})
                      </button>
                    )}

                    {recordedBlob && (
                      <button
                        onClick={() => setShow65B(true)}
                        className="px-4 py-3.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                        title="Download recording with Section 65B(4) Certificate"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                          <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                        </svg>
                        Download with 65B Certificate
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="px-6 py-4 bg-red-50 border border-red-100 text-red-700 text-[10px] font-black uppercase tracking-tight rounded-2xl animate-in shake duration-300">
              <span className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                CRITICAL ERROR: {error}
              </span>
            </div>
          )}

          {/* Video Player Section — 16:9 aspect ratio, centred */}
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
            <div className={`aspect-video h-full max-w-full rounded-2xl overflow-hidden relative bg-slate-50 dark:bg-ink-900 border-2 ${isPlaying ? 'border-slate-200 dark:border-white/5' : 'border-dashed border-slate-200 dark:border-white/5'}`}>
              {/* Video element — always mounted so HLS can attach */}
              <video
                ref={videoRef}
                className="w-full h-full object-contain bg-black"
                controls
                playsInline
                style={{ display: isPlaying ? 'block' : 'none' }}
              />

              {/* Idle placeholder */}
              {!isPlaying && !loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 select-none">
                  <div className="w-16 h-16 rounded-2xl bg-white dark:bg-ink-950 border border-slate-200 dark:border-white/5 shadow-sm flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-slate-300">
                      <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500 text-xs font-black uppercase tracking-widest">No recording playing</p>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold mt-1">Select a camera, set a time range and press Play</p>
                  </div>
                </div>
              )}

              {/* Loading spinner */}
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="relative w-14 h-14">
                    <div className="absolute inset-0 border-4 border-slate-200 dark:border-white/5 rounded-full" />
                    <div className="absolute inset-0 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest animate-pulse">Loading recording...</p>
                </div>
              )}

              {/* Playing badge */}
              {isPlaying && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-lg pointer-events-none">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[9px] text-white font-black uppercase tracking-widest">Playing</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas for recording */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* 65B Certificate Modal */}
      {show65B && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShow65B(false)}>
          <div className="bg-white dark:bg-ink-950 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-3 border-b border-slate-100 dark:border-white/5 flex-shrink-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wide">Section 65B(4) Certificate</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Indian Evidence Act, 1872 — Electronic Evidence Authentication</p>
            </div>

            <div className="px-6 py-3 space-y-3 overflow-y-auto flex-1 min-h-0">
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/20">
                <p className="text-[9px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  Fill in the details below. This will download the recorded clip along with a Section 65B(4) certificate PDF that authenticates the recording as admissible electronic evidence. Device, camera, and time details are auto-filled.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-ink-900">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Device</span>
                  <p className="text-slate-700 dark:text-slate-200 font-medium mt-0.5">{(devices || []).find(d => d.id === deviceId)?.name || deviceId}</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-ink-900">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Camera</span>
                  <p className="text-slate-700 dark:text-slate-200 font-medium mt-0.5">{(cameras || []).find(c => String(c.id) === String(selectedCameraId))?.name || selectedCameraId || 'N/A'}</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-ink-900">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Start Time</span>
                  <p className="text-slate-700 dark:text-slate-200 font-medium mt-0.5">{startTime || 'N/A'}</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-ink-900">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">End Time</span>
                  <p className="text-slate-700 dark:text-slate-200 font-medium mt-0.5">{endTime || 'N/A'}</p>
                </div>
              </div>

              {recordedBlob && (
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/20">
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold">Recording file</span>
                  <p className="text-emerald-700 dark:text-emerald-300 text-xs font-medium mt-0.5">{getRecordingFileName()}</p>
                  <p className="text-[9px] text-emerald-500 mt-0.5">SHA-256 hash will be computed and included in the certificate</p>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Case / FIR Reference</label>
                <input
                  type="text"
                  value={certForm.caseRef}
                  onChange={e => setCertForm(f => ({ ...f, caseRef: e.target.value }))}
                  placeholder="e.g. FIR No. 123/2026, PS Koramangala"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-ink-900 text-sm text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Signatory Name</label>
                <input
                  type="text"
                  value={certForm.signatoryName}
                  onChange={e => setCertForm(f => ({ ...f, signatoryName: e.target.value }))}
                  placeholder="Full name of the certifying officer"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-ink-900 text-sm text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Designation / Role</label>
                  <input
                    type="text"
                    value={certForm.signatoryRole}
                    onChange={e => setCertForm(f => ({ ...f, signatoryRole: e.target.value }))}
                    placeholder="e.g. Sub-Inspector"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-ink-900 text-sm text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Organisation</label>
                  <input
                    type="text"
                    value={certForm.signatoryOrg}
                    onChange={e => setCertForm(f => ({ ...f, signatoryOrg: e.target.value }))}
                    placeholder="e.g. Bengaluru City Police"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-ink-900 text-sm text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Police Station</label>
                  <input
                    type="text"
                    value={certForm.policeStation}
                    onChange={e => setCertForm(f => ({ ...f, policeStation: e.target.value }))}
                    placeholder="e.g. Koramangala PS"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-ink-900 text-sm text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Division</label>
                  <input
                    type="text"
                    value={certForm.division}
                    onChange={e => setCertForm(f => ({ ...f, division: e.target.value }))}
                    placeholder="e.g. South-East Division"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-ink-900 text-sm text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Remarks (optional)</label>
                <textarea
                  value={certForm.remarks}
                  onChange={e => setCertForm(f => ({ ...f, remarks: e.target.value }))}
                  placeholder="Any additional notes for the certificate..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-ink-900 text-sm text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setShow65B(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-ink-900 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate65B}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clipRule="evenodd" />
                </svg>
                Download Clip + Certificate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
