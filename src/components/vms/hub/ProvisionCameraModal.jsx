// Add a camera directly to a MagicBox edge box from IRIS.
// Mirrors the MagicBox device app's add-camera form (brand → RTSP URL, IP, creds,
// channel, or Custom RTSP) and provisions it ON the edge via the backend proxy
// (POST /api/vms/cameras/provision?host=<edge>) — the edge then creates the
// MediaMTX stream, so the camera actually plays (not just a DB row).
import { useState } from 'react'
import { deviceAPI } from './utils/api'

const BRANDS = [
  'Hikvision', 'Dahua', 'Axis', 'Sony', 'Panasonic', 'Bosch', 'CP Plus', 'Zicom',
  'Samsung', 'Honeywell', 'Uniview', 'EZVIZ', 'Matrix', 'Godrej', 'TVT', 'HDView',
  'Provision ISR', 'Securus', 'Aeriqs', 'Idis', 'Custom RTSP',
]

// Brand → RTSP URL (ported from the MagicBox device app's generateRtspLink).
function generateRtspLink({ brand, username, password, ip }, channel, streamType = 'main') {
  const enc = password ? encodeURIComponent(password) : ''
  const userPass = username && password ? `${username}:${enc}@` : ''
  const ch = channel || 1
  if (brand === 'Custom RTSP') return ''
  switch (brand) {
    case 'Hikvision': return `rtsp://${userPass}${ip}:554/Streaming/Channels/${ch * 100 + (streamType === 'main' ? 1 : 2)}`
    case 'Dahua':
    case 'CP Plus': return `rtsp://${userPass}${ip}:554/cam/realmonitor?channel=${ch}&subtype=${streamType === 'main' ? 0 : 1}`
    case 'Axis': return `rtsp://${userPass}${ip}:554/axis-media/media.amp`
    case 'Sony': return `rtsp://${userPass}${ip}:554/video`
    case 'Panasonic': return `rtsp://${userPass}${ip}:554/MediaInput/h264`
    case 'Bosch': return `rtsp://${userPass}${ip}:554/rtsp_tunnel`
    case 'Zicom': return `rtsp://${userPass}${ip}:554/live`
    case 'Samsung': return `rtsp://${userPass}${ip}:554/profile2/media.smp`
    case 'Honeywell': return `rtsp://${userPass}${ip}:554/Streaming/Channels/1`
    case 'Uniview': return `rtsp://${userPass}${ip}:554/unicast/c${ch}/s${streamType === 'main' ? 0 : 1}/live`
    case 'EZVIZ': return `rtsp://${userPass}${ip}:554/h264/ch${ch}/${streamType === 'main' ? 'main' : 'sub'}/av_stream`
    case 'Matrix': return `rtsp://${userPass}${ip}:554/cam${ch}/${streamType === 'main' ? 'mpeg4' : 'mjpeg'}`
    case 'Godrej':
    case 'TVT':
    case 'Provision ISR': return `rtsp://${userPass}${ip}:554/Streaming/Channels/${ch * 100 + (streamType === 'main' ? 1 : 2)}`
    case 'HDView': return `rtsp://${userPass}${ip}:554/ch${ch}/${streamType === 'main' ? 0 : 1}`
    case 'Securus': return `rtsp://${userPass}${ip}:554/stream${ch}${streamType === 'main' ? '' : '_sub'}`
    case 'Aeriqs': return `rtsp://${userPass}${ip}:554/avstream/channel=${ch}/stream=${streamType === 'main' ? 0 : 1}.sdp`
    case 'Idis': return `rtsp://${userPass}${ip}:554/trackID=${ch}&streamID=${streamType === 'main' ? 2 : 1}`
    default: return ''
  }
}

const ipFromRtsp = (url) => {
  const m = String(url || '').match(/@([^:/]+)|rtsp:\/\/([^:/@]+)/i)
  return (m && (m[1] || m[2])) || ''
}

const field = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-ink-950 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40'
const label = 'block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1'

export default function ProvisionCameraModal({ open, device, onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', brand: 'Hikvision', ip: '', username: '', password: '', channel: 1, rtsp: '' })
  const [busy, setBusy] = useState(false)
  const [verify, setVerify] = useState(null) // {ok, msg}
  const [error, setError] = useState('')

  if (!open) return null
  const host = device?.host || ''
  const custom = form.brand === 'Custom RTSP'
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setVerify(null) }

  const buildAddress = () => custom
    ? form.rtsp.trim()
    : generateRtspLink({ brand: form.brand, username: form.username, password: form.password, ip: form.ip.trim() }, Number(form.channel) || 1, 'main')

  const buildBody = () => {
    const address = buildAddress()
    const ip = custom ? ipFromRtsp(address) : form.ip.trim()
    return {
      name: form.name.trim() || `${form.brand} ${ip}`.trim(),
      ip,
      address,
      status: 'offline',
      resolution: '1920x1080',
      fps: 30,
      brand: form.brand,
      username: form.username || undefined,
      password: form.password || undefined,
      channel: Number(form.channel) || 1,
    }
  }

  const valid = host && (custom ? form.rtsp.trim() : form.ip.trim())

  const doVerify = async () => {
    setError(''); setVerify(null); setBusy(true)
    try {
      const { data } = await deviceAPI.verifyCamera(host, custom
        ? { rtsp_url: form.rtsp.trim() }
        : { ip: form.ip.trim(), port: 554, username: form.username, password: form.password, brand: form.brand, channel: Number(form.channel) || 1 })
      setVerify(data?.ok ? { ok: true, msg: 'Stream reachable' } : { ok: false, msg: data?.error || 'Could not reach the stream' })
    } catch (e) {
      setVerify({ ok: false, msg: e.message || 'Verify failed' })
    } finally { setBusy(false) }
  }

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!valid) return
    setError(''); setBusy(true)
    try {
      await deviceAPI.provisionCamera(host, buildBody())
      onAdded?.()
      onClose?.()
    } catch (e) {
      setError(e.message?.includes('502') ? 'The MagicBox edge device is unreachable.' : (e.message || 'Failed to add camera'))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-ink-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/10">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Add Camera to MagicBox</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{device?.name || 'device'}{host ? ` · ${host}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {!host && (
            <div className="text-[11px] font-medium text-rose-600 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-lg px-3 py-2">
              This device has no edge host configured — register the MagicBox (with its IP) first.
            </div>
          )}
          <div>
            <label className={label}>Brand</label>
            <select className={field} value={form.brand} onChange={(e) => set('brand', e.target.value)}>
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {custom ? (
            <div>
              <label className={label}>RTSP URL</label>
              <input className={field} placeholder="rtsp://user:pass@ip:port/path" value={form.rtsp} onChange={(e) => set('rtsp', e.target.value)} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>IP Address</label>
                  <input className={field} placeholder="192.168.1.100" value={form.ip} onChange={(e) => set('ip', e.target.value)} />
                </div>
                <div>
                  <label className={label}>Channel</label>
                  <input className={field} type="number" min={1} max={64} value={form.channel} onChange={(e) => set('channel', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Username</label>
                  <input className={field} placeholder="admin" value={form.username} onChange={(e) => set('username', e.target.value)} />
                </div>
                <div>
                  <label className={label}>Password</label>
                  <input className={field} type="password" placeholder="••••••" value={form.password} onChange={(e) => set('password', e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div>
            <label className={label}>Camera Name <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
            <input className={field} placeholder="Front Gate" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          {!custom && form.ip.trim() && (
            <div className="text-[10px] font-mono text-slate-400 break-all bg-slate-50 dark:bg-ink-950/60 rounded-lg px-3 py-2 border border-slate-100 dark:border-white/5">
              {buildAddress() || 'RTSP preview unavailable for this brand'}
            </div>
          )}

          {verify && (
            <div className={`text-[11px] font-semibold rounded-lg px-3 py-2 ${verify.ok ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-rose-600 bg-rose-50 dark:bg-rose-900/20'}`}>
              {verify.ok ? '✓ ' : '✕ '}{verify.msg}
            </div>
          )}
          {error && <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{error}</div>}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={doVerify} disabled={!valid || busy}
              className="px-3 py-2 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40">
              {busy ? '…' : 'Verify'}
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5">Cancel</button>
            <button type="submit" disabled={!valid || busy}
              className="px-4 py-2 rounded-lg text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-sm disabled:opacity-40">
              {busy ? 'Adding…' : 'Add Camera'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
