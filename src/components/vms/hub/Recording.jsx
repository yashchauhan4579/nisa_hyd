import React, { useEffect, useState } from 'react'
import Playback from './Playback'
import { deviceAPI } from './utils/api'

// Standalone /vms/recording route. Main's Playback is a child modal that expects
// device/camera context; here we load IRIS devices + cameras and feed it so it
// works as a page. (IRIS has no server-side playback API, so the player streams
// live MediaMTX HLS via the adapter.)
export default function Recording() {
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    deviceAPI.getDevices()
      .then(({ data }) => {
        const list = data || []
        setDevices(list)
        if (list.length) setDeviceId(String(list[0].id))
      })
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!deviceId) return
    deviceAPI.getCameras(deviceId)
      .then(({ data }) => setCameras(data || []))
      .catch(() => setCameras([]))
  }, [deviceId])

  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <Playback
        deviceId={deviceId}
        cameras={cameras}
        devices={devices}
        onDeviceChange={(id) => setDeviceId(String(id))}
        globalLoading={loading}
        globalError={error}
        hasNoDevices={!loading && devices.length === 0}
        onClose={() => {}}
      />
    </div>
  )
}
