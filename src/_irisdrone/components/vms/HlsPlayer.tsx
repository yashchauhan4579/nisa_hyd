import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

interface HlsPlayerProps {
  src: string
  className?: string
  autoPlay?: boolean
}

export function HlsPlayer({ src, className = '', autoPlay = true }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let destroyed = false

    const start = () => {
      if (destroyed) return
      setLoading(true)

      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          maxBufferLength: 4,
          maxMaxBufferLength: 8,
          backBufferLength: 0,
          liveBackBufferLength: 0,
        })
        hlsRef.current = hls
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false)
          if (autoPlay) video.play().catch(() => {})
        })
        hls.on(Hls.Events.FRAG_CHANGED, () => {
          if (!video.duration || !isFinite(video.duration)) return
          const lag = video.duration - video.currentTime
          if (lag > 8) video.currentTime = video.duration - 1
        })
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return
          const delay = data.details?.includes('manifest') || data.details?.includes('level') ? 5000 : 2000
          retryTimer.current = setTimeout(() => { if (!destroyed) start() }, delay)
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
        video.addEventListener('loadedmetadata', () => {
          setLoading(false)
          if (autoPlay) video.play().catch(() => {})
        }, { once: true })
      }
    }

    start()

    return () => {
      destroyed = true
      if (retryTimer.current) clearTimeout(retryTimer.current)
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [src, autoPlay])

  return (
    <div className={`relative bg-black ${className}`}>
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        muted
        playsInline
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 rounded-full border-2 border-zinc-700" />
            <div className="absolute inset-0 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          </div>
        </div>
      )}
    </div>
  )
}
