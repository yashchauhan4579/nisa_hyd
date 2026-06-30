import { useState, useEffect, useMemo, useRef } from 'react';
import { apiClient, type Device } from '@sringeri/lib/api';
import {
  Camera, ChevronDown, ChevronRight, LayoutGrid, Maximize2, Minimize2,
  Plus, Settings, Trash2, X, Save, Car, Users, ScanFace, GitCommit,
} from 'lucide-react';
import { Button } from '@sringeri/components/ui/button';
import { HudBadge } from '@sringeri/components/ui/hud-badge';
import { useCameraGrid } from '@sringeri/contexts/CameraGridContext';
import { cn } from '@sringeri/lib/utils';
import Hls from 'hls.js';
import { WebSocketVideoFrame } from './WebSocketVideoFrame';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CameraConfig {
  services: string[];
}

interface CameraFormState {
  name: string;
  rtspUrl: string;
  zoneId: string;
  lat: string;
  lng: string;
  config: CameraConfig;
}

const SERVICES = [
  {
    id: 'anpr_vcc',
    label: 'ANPR / VCC',
    description: 'Number plate recognition & vehicle counting',
    icon: Car,
    color: '#00DCEF',
  },
  {
    id: 'crowd',
    label: 'Crowd Analytics',
    description: 'Crowd density, counting & movement analysis',
    icon: Users,
    color: '#fbbf24',
  },
  {
    id: 'frs',
    label: 'FRS (Face Recognition)',
    description: 'Face detection, recognition & watchlist matching',
    icon: ScanFace,
    color: '#f472b6',
  },
];

const DEFAULT_FORM: CameraFormState = {
  name: '',
  rtspUrl: '',
  zoneId: '',
  lat: '0',
  lng: '0',
  config: { services: [] },
};

// ─── Camera Config Modal ───────────────────────────────────────────────────────

type FlowLine = { x1: number; y1: number; x2: number; y2: number };

export function CameraConfigModal({
  open,
  camera,
  onClose,
  onSaved,
}: {
  open: boolean;
  camera: Device | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CameraFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Crowd analytics config
  const [crowdAnalyticsType, setCrowdAnalyticsType] = useState<'density' | 'flow'>('density');
  const [crowdFlowLine, setCrowdFlowLine] = useState<FlowLine | null>(null);
  const [firstPoint, setFirstPoint] = useState<{ x: number; y: number } | null>(null);
  // crowdFlowInSide: which side of the line counts as "inside" (+1 or -1).
  // 0 = unset → pipeline falls back to legacy behaviour (every cross = in).
  const [crowdFlowInSide, setCrowdFlowInSide] = useState<0 | -1 | 1>(0);
  // 2-click "Set IN side" mode: first click marks an OUT-side reference
  // point, second click marks an IN-side reference point. The IN-side is
  // derived from the second point's side of the line.
  const [inDirMode, setInDirMode] = useState(false);
  const [inDirOut, setInDirOut] = useState<{ x: number; y: number } | null>(null);
  // ANPR ROI polygon (normalized [0,1] points). Vehicles whose box center is
  // outside this polygon are ignored by the ANPR pipeline. Empty = whole frame.
  const [anprRoi, setAnprRoi] = useState<{ x: number; y: number }[]>([]);
  const roiCanvasRef = useRef<HTMLCanvasElement>(null);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  // Native aspect ratio of the live frame (e.g. 16/9, 4/3). Defaults to
  // 16:9 until the image loads. Used to size the canvas container so
  // there's no letterboxing or cropping — clicks then map 1:1 to the
  // actual camera frame the inference sees.
  const [frameAspect, setFrameAspect] = useState<string>('16 / 9');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Populate form when opening
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setFirstPoint(null);
    setLiveFrame(null);
    if (camera) {
      const cfg = (camera.config || {}) as CameraConfig & {
        crowdAnalyticsType?: string;
        crowdFlowLine?: FlowLine;
        crowdFlowInSide?: number;
      };
      setForm({
        name: camera.name || '',
        rtspUrl: camera.rtspUrl || '',
        zoneId: camera.zoneId || '',
        lat: String(camera.lat ?? 0),
        lng: String(camera.lng ?? 0),
        config: { services: cfg.services || [] },
      });
      setCrowdAnalyticsType((cfg.crowdAnalyticsType as 'density' | 'flow') || 'density');
      setCrowdFlowLine(cfg.crowdFlowLine || null);
      const inSideRaw = cfg.crowdFlowInSide;
      setCrowdFlowInSide(inSideRaw === 1 || inSideRaw === -1 ? inSideRaw : 0);
      setInDirMode(false);
      setInDirOut(null);
      setAnprRoi(Array.isArray((cfg as any).anprRoi) ? (cfg as any).anprRoi : []);
    } else {
      setForm(DEFAULT_FORM);
      setCrowdAnalyticsType('density');
      setCrowdFlowLine(null);
      setCrowdFlowInSide(0);
      setInDirMode(false);
      setInDirOut(null);
      setAnprRoi([]);
    }
  }, [open, camera]);

  // Fetch live frame when flow type is selected and crowd is enabled
  useEffect(() => {
    if (!open || !camera) return;
    // Need a live frame to draw on for either the crowd flow line or the ANPR ROI.
    const needFrame = crowdAnalyticsType === 'flow' || form.config.services.includes('anpr_vcc');
    if (!needFrame) return;
    apiClient.getAllLiveFrames().then(frames => {
      setLiveFrame(frames[camera.id] || null);
    }).catch(() => {});
  }, [crowdAnalyticsType, open, camera, form.config.services]);

  // Redraw canvas whenever points change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawDot = (nx: number, ny: number, color: string) => {
      const px = nx * canvas.width;
      const py = ny * canvas.height;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    if (crowdFlowLine) {
      const { x1, y1, x2, y2 } = crowdFlowLine;
      const px1 = x1 * canvas.width, py1 = y1 * canvas.height;
      const px2 = x2 * canvas.width, py2 = y2 * canvas.height;
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.strokeStyle = '#00DCEF';
      ctx.lineWidth = 3;
      ctx.stroke();
      drawDot(x1, y1, '#00DCEF');
      drawDot(x2, y2, '#00DCEF');

      // IN-direction arrow perpendicular to the line, pointing toward
      // the in-side. side +1 is on the left of the segment direction.
      if (crowdFlowInSide === 1 || crowdFlowInSide === -1) {
        const mx = (px1 + px2) / 2;
        const my = (py1 + py2) / 2;
        const dx = px2 - px1;
        const dy = py2 - py1;
        const len = Math.max(1e-6, Math.hypot(dx, dy));
        const nx = -dy / len;
        const ny = dx / len;
        const arrowLen = Math.min(canvas.width, canvas.height) * 0.18;
        const ax = mx + nx * arrowLen * crowdFlowInSide;
        const ay = my + ny * arrowLen * crowdFlowInSide;
        ctx.strokeStyle = '#46dc5a';
        ctx.fillStyle = '#46dc5a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        const head = 10;
        const ang = Math.atan2(ay - my, ax - mx);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - head * Math.cos(ang - Math.PI / 6), ay - head * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - head * Math.cos(ang + Math.PI / 6), ay - head * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.fillText('IN', ax + 6, ay - 4);
      }

      // Pending "out" marker while user is mid-pick for the IN side.
      if (inDirMode && inDirOut) {
        drawDot(inDirOut.x, inDirOut.y, '#ff8a4c');
        ctx.fillStyle = '#ff8a4c';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.fillText('OUT', inDirOut.x * canvas.width + 10, inDirOut.y * canvas.height - 6);
      }
    } else if (firstPoint) {
      drawDot(firstPoint.x, firstPoint.y, '#fbbf24');
    }
  }, [firstPoint, crowdFlowLine, crowdFlowInSide, inDirMode, inDirOut]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // 2-click IN-direction picker: first click = OUT-side reference,
    // second click = IN-side reference. We then derive ±1 from which
    // side of the line the IN point lies on.
    if (inDirMode && crowdFlowLine) {
      if (!inDirOut) {
        setInDirOut({ x, y });
        return;
      }
      const { x1, y1, x2, y2 } = crowdFlowLine;
      const cp = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
      const side: 0 | -1 | 1 = cp > 0 ? 1 : cp < 0 ? -1 : 0;
      if (side !== 0) setCrowdFlowInSide(side);
      setInDirMode(false);
      setInDirOut(null);
      return;
    }

    if (!firstPoint) {
      setFirstPoint({ x, y });
    } else {
      setCrowdFlowLine({ x1: firstPoint.x, y1: firstPoint.y, x2: x, y2: y });
      setFirstPoint(null);
      // New line geometry invalidates any previously-picked IN side.
      setCrowdFlowInSide(0);
    }
  };

  // Append a polygon vertex for the ANPR ROI.
  const handleRoiClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = roiCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setAnprRoi(prev => [...prev, { x, y }]);
  };

  // Redraw the ANPR ROI polygon whenever its points change.
  useEffect(() => {
    const canvas = roiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (anprRoi.length === 0) return;
    ctx.beginPath();
    anprRoi.forEach((p, i) => {
      const px = p.x * canvas.width, py = p.y * canvas.height;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    if (anprRoi.length >= 3) ctx.closePath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (anprRoi.length >= 3) {
      ctx.fillStyle = 'rgba(245,158,11,0.15)';
      ctx.fill();
    }
    anprRoi.forEach((p) => {
      const px = p.x * canvas.width, py = p.y * canvas.height;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [anprRoi]);

  if (!open) return null;

  const toggleService = (serviceId: string) => {
    setForm(prev => {
      const isEnabled = prev.config.services.includes(serviceId);
      return {
        ...prev,
        config: {
          services: isEnabled
            ? prev.config.services.filter(s => s !== serviceId)
            : [...prev.config.services, serviceId],
        },
      };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Camera name is required.'); return; }
    if (!form.rtspUrl.trim()) { setError('RTSP URL is required.'); return; }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        rtspUrl: form.rtspUrl.trim(),
        zoneId: form.zoneId.trim() || undefined,
        lat: parseFloat(form.lat) || 0,
        lng: parseFloat(form.lng) || 0,
        type: 'CAMERA' as const,
        status: 'ACTIVE' as const,
        config: form.config,
      };
      let deviceId: string;
      if (camera) {
        await apiClient.updateDevice(camera.id, payload);
        deviceId = camera.id;
      } else {
        const created = await apiClient.createDevice(payload);
        deviceId = created.id;
      }
      // Persist crowd analytics type + flow line + IN-direction whenever
      // crowd service is enabled. In-side is only meaningful with a line,
      // and 0/unset means legacy behaviour (every cross counted as in).
      if (form.config.services.includes('crowd')) {
        await apiClient.updateDeviceAnalyticsConfig(deviceId, {
          crowdAnalyticsType,
          ...(crowdAnalyticsType === 'flow' && crowdFlowLine ? { crowdFlowLine } : {}),
          ...(crowdAnalyticsType === 'flow' && crowdFlowLine && crowdFlowInSide !== 0
            ? { crowdFlowInSide }
            : {}),
        });
      }
      // Persist the ANPR ROI polygon (≥3 points), or clear it ([]), when ANPR is on.
      if (form.config.services.includes('anpr_vcc')) {
        await apiClient.updateDeviceAnalyticsConfig(deviceId, {
          anprRoi: anprRoi.length >= 3 ? anprRoi : [],
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save camera.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!camera) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await apiClient.deleteDevice(camera.id);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete camera.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <Camera className="w-4 h-4 text-[#00DCEF]" />
            <span className="text-sm font-semibold text-zinc-100">
              {camera ? 'Configure Camera' : 'Add Camera'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Basic Info */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Camera Info</p>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">Camera Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Gate 1 - Entrance"
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#00DCEF]/50 focus:ring-1 focus:ring-[#00DCEF]/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">RTSP URL *</label>
              <input
                type="text"
                value={form.rtspUrl}
                onChange={e => setForm(p => ({ ...p, rtspUrl: e.target.value }))}
                placeholder="rtsp://192.168.1.10:554/stream"
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#00DCEF]/50 focus:ring-1 focus:ring-[#00DCEF]/20 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Zone / Location</label>
                <input
                  type="text"
                  value={form.zoneId}
                  onChange={e => setForm(p => ({ ...p, zoneId: e.target.value }))}
                  placeholder="e.g. North Gate"
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#00DCEF]/50 focus:ring-1 focus:ring-[#00DCEF]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Lat</label>
                  <input
                    type="number"
                    value={form.lat}
                    onChange={e => setForm(p => ({ ...p, lat: e.target.value }))}
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-[#00DCEF]/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Lng</label>
                  <input
                    type="number"
                    value={form.lng}
                    onChange={e => setForm(p => ({ ...p, lng: e.target.value }))}
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-[#00DCEF]/50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Services */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Analytics Services</p>
            <p className="text-[11px] text-zinc-500">Select which pipelines to run on this camera feed.</p>

            <div className="space-y-2">
              {SERVICES.map(svc => {
                const Icon = svc.icon;
                const isEnabled = form.config.services.includes(svc.id);
                const isCrowd = svc.id === 'crowd';
                return (
                  <div key={svc.id}>
                    <button
                      type="button"
                      onClick={() => toggleService(svc.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left',
                        isEnabled ? 'border-white/20 bg-white/5' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04]'
                      )}
                    >
                      {/* Toggle */}
                      <div
                        className={cn(
                          'w-9 h-5 rounded-full transition-colors relative shrink-0',
                          isEnabled ? 'bg-[#00DCEF]' : 'bg-zinc-700'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                            isEnabled ? 'translate-x-4' : 'translate-x-0.5'
                          )}
                        />
                      </div>
                      {/* Icon */}
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${svc.color}18` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: svc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs font-medium', isEnabled ? 'text-zinc-100' : 'text-zinc-400')}>
                          {svc.label}
                        </p>
                        <p className="text-[10px] text-zinc-600 truncate">{svc.description}</p>
                      </div>
                    </button>

                    {/* Crowd Analytics sub-config — shown when crowd service is enabled */}
                    {isCrowd && isEnabled && (
                      <div className="mt-1.5 ml-9 p-3 rounded-lg bg-zinc-800/60 border border-white/5 space-y-3">
                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Analytics Mode</p>
                        <div className="flex gap-2">
                          {(['density', 'flow'] as const).map(type => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => { setCrowdAnalyticsType(type); setCrowdFlowLine(null); setFirstPoint(null); }}
                              className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors',
                                crowdAnalyticsType === type
                                  ? 'bg-[#fbbf24]/20 border-[#fbbf24]/50 text-[#fbbf24]'
                                  : 'border-white/10 text-zinc-400 hover:bg-white/5'
                              )}
                            >
                              {type === 'density' ? <Users className="w-3 h-3" /> : <GitCommit className="w-3 h-3" />}
                              {type === 'density' ? 'Density Count' : 'Flow Count'}
                            </button>
                          ))}
                        </div>

                        {crowdAnalyticsType === 'flow' && (
                          <div className="space-y-2">
                            <p className="text-[10px] text-zinc-500">
                              Click two points on the frame to draw the crossing line.
                            </p>
                            {/* Canvas area */}
                            <div
                              className="relative rounded-lg overflow-hidden bg-zinc-900 mx-auto max-w-full"
                              style={{ aspectRatio: frameAspect }}
                            >
                              {liveFrame && (
                                <img
                                  src={liveFrame}
                                  alt="Live frame"
                                  // object-contain + container aspect = no crop, no letterbox.
                                  // Clicks on the canvas above map exactly to the camera frame
                                  // the inference will use.
                                  className="absolute inset-0 w-full h-full object-contain"
                                  onLoad={(e) => {
                                    const img = e.currentTarget;
                                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                                      setFrameAspect(`${img.naturalWidth} / ${img.naturalHeight}`);
                                    }
                                  }}
                                />
                              )}
                              {!liveFrame && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <p className="text-[10px] text-zinc-600">No live frame — draw on blank canvas</p>
                                </div>
                              )}
                              <canvas
                                ref={canvasRef}
                                width={400}
                                height={225}
                                onClick={handleCanvasClick}
                                className="absolute inset-0 w-full h-full cursor-crosshair"
                              />
                            </div>
                            {/* Status / clear */}
                            <div className="flex items-center justify-between text-[10px]">
                              {inDirMode ? (
                                <span className="text-[#ff8a4c]">
                                  {inDirOut ? 'Click on the IN side of the line' : 'Click on the OUT side first'}
                                </span>
                              ) : crowdFlowLine ? (
                                <span className="text-zinc-500 font-mono">
                                  ({crowdFlowLine.x1.toFixed(2)},{crowdFlowLine.y1.toFixed(2)}) → ({crowdFlowLine.x2.toFixed(2)},{crowdFlowLine.y2.toFixed(2)})
                                  {crowdFlowInSide !== 0 && (
                                    <span className="ml-2 text-[#46dc5a]">IN: side {crowdFlowInSide > 0 ? '+1' : '−1'}</span>
                                  )}
                                </span>
                              ) : firstPoint ? (
                                <span className="text-[#fbbf24]">Point 1 set — click to place endpoint</span>
                              ) : (
                                <span className="text-zinc-600">Click to set first point</span>
                              )}
                              {(crowdFlowLine || firstPoint) && (
                                <button
                                  type="button"
                                  onClick={() => { setCrowdFlowLine(null); setFirstPoint(null); setCrowdFlowInSide(0); setInDirMode(false); setInDirOut(null); }}
                                  className="text-red-400 hover:text-red-300 transition-colors"
                                >
                                  Clear line
                                </button>
                              )}
                            </div>
                            {/* IN-direction picker — only meaningful once a line is drawn */}
                            {crowdFlowLine && (
                              <div className="flex items-center gap-2 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInDirMode((m) => !m);
                                    setInDirOut(null);
                                  }}
                                  className={cn(
                                    'px-2 py-1 rounded border transition-colors',
                                    inDirMode
                                      ? 'bg-[#ff8a4c]/20 border-[#ff8a4c]/60 text-[#ff8a4c]'
                                      : 'border-white/10 text-zinc-300 hover:bg-white/5'
                                  )}
                                >
                                  {inDirMode ? 'Cancel' : crowdFlowInSide === 0 ? 'Set IN direction' : 'Change IN direction'}
                                </button>
                                {crowdFlowInSide !== 0 && !inDirMode && (
                                  <button
                                    type="button"
                                    onClick={() => setCrowdFlowInSide(0)}
                                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                  >
                                    Clear IN
                                  </button>
                                )}
                                <span className="text-zinc-600 ml-auto">
                                  {crowdFlowInSide === 0
                                    ? 'No IN side set — every cross counts as in'
                                    : 'Crossings into the green arrow side = IN'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ANPR ROI sub-config — shown when ANPR service is enabled */}
                    {svc.id === 'anpr_vcc' && isEnabled && (
                      <div className="mt-1.5 ml-9 p-3 rounded-lg bg-zinc-800/60 border border-white/5 space-y-2">
                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Detection ROI</p>
                        <p className="text-[10px] text-zinc-500">
                          Click to drop polygon points around the area to detect in. Vehicles outside are ignored. Empty = whole frame.
                        </p>
                        <div
                          className="relative rounded-lg overflow-hidden bg-zinc-900 mx-auto max-w-full"
                          style={{ aspectRatio: frameAspect }}
                        >
                          {liveFrame && (
                            <img
                              src={liveFrame}
                              alt="Live frame"
                              className="absolute inset-0 w-full h-full object-contain"
                              onLoad={(e) => {
                                const img = e.currentTarget;
                                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                                  setFrameAspect(`${img.naturalWidth} / ${img.naturalHeight}`);
                                }
                              }}
                            />
                          )}
                          {!liveFrame && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <p className="text-[10px] text-zinc-600">No live frame — draw on blank canvas</p>
                            </div>
                          )}
                          <canvas
                            ref={roiCanvasRef}
                            width={400}
                            height={225}
                            onClick={handleRoiClick}
                            className="absolute inset-0 w-full h-full cursor-crosshair"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500">
                            {anprRoi.length === 0
                              ? 'Whole frame (no ROI)'
                              : `${anprRoi.length} point${anprRoi.length === 1 ? '' : 's'}${anprRoi.length < 3 ? ' — need ≥3' : ''}`}
                          </span>
                          {anprRoi.length > 0 && (
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => setAnprRoi(prev => prev.slice(0, -1))}
                                className="text-zinc-400 hover:text-zinc-200 transition-colors"
                              >
                                Undo
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnprRoi([])}
                                className="text-red-400 hover:text-red-300 transition-colors"
                              >
                                Clear ROI
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 shrink-0 bg-zinc-900/80">
          <div>
            {camera && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors',
                  confirmDelete
                    ? 'bg-red-500/80 hover:bg-red-500 text-white'
                    : 'text-red-400 hover:bg-red-500/10'
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmDelete ? (deleting ? 'Deleting…' : 'Confirm Delete') : 'Delete'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:bg-white/8 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg bg-[#00DCEF] text-zinc-900 font-semibold hover:bg-[#00DCEF]/90 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : camera ? 'Save Changes' : 'Add Camera'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LiveFrameFallback — polls raw VMS frames from backend ────────────────────

function LiveFrameFallback({ deviceId }: { deviceId: string }) {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const resp = await fetch('/api/vms/live-frames');
        if (resp.ok) {
          const frames = await resp.json();
          if (active && frames && frames[deviceId]) {
            setFrameSrc(frames[deviceId]);
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, [deviceId]);

  if (!frameSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-zinc-600">
        <div className="text-center">
          <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-[10px]">Waiting for frames…</p>
        </div>
      </div>
    );
  }

  return <img src={frameSrc} className="w-full h-full object-cover" alt="" />;
}

// ─── CameraView ────────────────────────────────────────────────────────────────

interface GridSlot {
  id: string | null;
  deviceId: string | null;
  device: Device | null;
  fullscreenToggleRef?: React.RefObject<(() => void) | undefined>;
}

export function CameraView() {
  const { gridSize, setUsedSlots } = useCameraGrid();
  const [cameras, setCameras] = useState<Device[]>([]);
  const [zones, setZones] = useState<Record<string, Device[]>>({});
  const [fullscreenStates] = useState<Record<number, boolean>>({});
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [gridSlots, setGridSlots] = useState<GridSlot[]>([]);
  const [draggedDevice, setDraggedDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [touchDraggedDevice, setTouchDraggedDevice] = useState<Device | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [slotServiceView, setSlotServiceView] = useState<Record<string, string>>({});

  // Camera config modal state
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Device | null>(null);


  const gridDimensions = useMemo(() => {
    const [cols, rows] = gridSize.split('x').map(Number);
    return { rows, cols, total: rows * cols };
  }, [gridSize]);

  const fetchCameras = async () => {
    try {
      setLoading(true);
      const devices = await apiClient.getDevices({ type: 'CAMERA' }) as Device[];
      setCameras(devices);
      const zonesMap: Record<string, Device[]> = {};
      devices.forEach((device) => {
        const zone = device.zoneId || 'Unassigned';
        if (!zonesMap[zone]) zonesMap[zone] = [];
        zonesMap[zone].push(device);
      });
      setZones(zonesMap);
      setExpandedZones(new Set(Object.keys(zonesMap)));

      try {
        const savedGridState = localStorage.getItem('cameraGridState');
        if (savedGridState) {
          const parsed = JSON.parse(savedGridState);
          if (parsed.gridSize === gridSize && parsed.slots?.length === gridDimensions.total) {
            setGridSlots((prevSlots) =>
              prevSlots.map((slot, index) => {
                const savedSlot = parsed.slots[index];
                if (savedSlot?.deviceId) {
                  const device = devices.find((d) => d.id === savedSlot.deviceId);
                  return { id: slot.id, deviceId: savedSlot.deviceId, device: device || null, fullscreenToggleRef: slot.fullscreenToggleRef || { current: undefined } };
                }
                return slot;
              })
            );
          }
        }
      } catch {}
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const savedGridState = localStorage.getItem('cameraGridState');
      if (savedGridState) {
        const parsed = JSON.parse(savedGridState);
        if (parsed.gridSize === gridSize && parsed.slots?.length === gridDimensions.total) {
          setGridSlots(parsed.slots.map((s: any, i: number) => ({
            id: s.id || `slot-${i}`,
            deviceId: s.deviceId,
            device: null,
            fullscreenToggleRef: { current: undefined },
          })));
          return;
        }
      }
    } catch {}
    setGridSlots(Array.from({ length: gridDimensions.total }, (_, i) => ({
      id: `slot-${i}`, deviceId: null, device: null, fullscreenToggleRef: { current: undefined },
    })));
  }, [gridSize, gridDimensions.total]);

  useEffect(() => { fetchCameras(); }, [gridSize]);

  const toggleZone = (zoneId: string) => {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId); else next.add(zoneId);
      return next;
    });
  };

  const handleDragStart = (device: Device) => setDraggedDevice(device);
  const handleDragEnd = () => setDraggedDevice(null);

  const handleDrop = (slotIndex: number, device?: Device) => {
    const deviceToAdd = device || draggedDevice;
    if (!deviceToAdd) return;
    setGridSlots((prev) => {
      const newSlots = [...prev];
      const prevSlotIndex = newSlots.findIndex((s) => s.deviceId === deviceToAdd.id);
      if (prevSlotIndex !== -1) {
        newSlots[prevSlotIndex] = { id: newSlots[prevSlotIndex].id, deviceId: null, device: null, fullscreenToggleRef: newSlots[prevSlotIndex].fullscreenToggleRef || { current: undefined } };
      }
      newSlots[slotIndex] = { id: newSlots[slotIndex].id, deviceId: deviceToAdd.id, device: deviceToAdd, fullscreenToggleRef: newSlots[slotIndex].fullscreenToggleRef || { current: undefined } };
      setUsedSlots(newSlots.filter((s) => s.device).length);
      try {
        localStorage.setItem('cameraGridState', JSON.stringify({ gridSize, slots: newSlots.map((s) => ({ id: s.id, deviceId: s.deviceId })) }));
      } catch {}
      return newSlots;
    });
    setDraggedDevice(null);
  };

  const handleCameraTap = (device: Device) => {
    const idx = gridSlots.findIndex((slot) => !slot.device);
    handleDrop(idx !== -1 ? idx : 0, device);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleTouchStart = (e: React.TouchEvent, device: Device) => {
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    setTouchDraggedDevice(device);
    setIsDragging(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos || !touchDraggedDevice) return;
    const touch = e.touches[0];
    if (!touch) return;
    const deltaX = Math.abs(touch.clientX - touchStartPos.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.y);
    if (deltaX > 10 || deltaY > 10) {
      if (!isDragging) setIsDragging(true);
      e.preventDefault(); e.stopPropagation();
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (el) {
        const slot = el.closest('[data-slot-index]');
        if (slot) {
          const idx = parseInt(slot.getAttribute('data-slot-index') || '-1');
          if (idx >= 0) slot.classList.add('border-amber-400', 'border-solid', 'bg-amber-50/50', 'dark:bg-amber-900/20');
        }
      }
    }
  };

  const handleTouchEnd = (_e?: React.TouchEvent, slotIndex?: number) => {
    if (!touchDraggedDevice) { setTouchStartPos(null); setTouchDraggedDevice(null); setIsDragging(false); return; }
    if (isDragging && slotIndex !== undefined) handleDrop(slotIndex);
    setTouchStartPos(null); setTouchDraggedDevice(null); setIsDragging(false);
  };

  const handleTouchCancel = () => { setTouchStartPos(null); setTouchDraggedDevice(null); setIsDragging(false); };

  const removeFromGrid = (slotIndex: number) => {
    setGridSlots((prev) => {
      const newSlots = [...prev];
      newSlots[slotIndex] = { id: newSlots[slotIndex].id, deviceId: null, device: null, fullscreenToggleRef: newSlots[slotIndex].fullscreenToggleRef || { current: undefined } };
      setUsedSlots(newSlots.filter((s) => s.device).length);
      try { localStorage.setItem('cameraGridState', JSON.stringify({ gridSize, slots: newSlots.map((s) => ({ id: s.id, deviceId: s.deviceId })) })); } catch {}
      return newSlots;
    });
  };

  useEffect(() => { setUsedSlots(gridSlots.filter((s) => s.device).length); }, [gridSlots, setUsedSlots]);

  useEffect(() => {
    setSlotServiceView((prev) => {
      const next = { ...prev };
      for (const slot of gridSlots) {
        if (!slot.device || !slot.id) continue;
        const services: string[] = ((slot.device.config as CameraConfig)?.services || []).filter(Boolean);
        if (services.length <= 1) {
          next[slot.id] = services[0] || 'all';
          continue;
        }
        if (!next[slot.id] || !services.includes(next[slot.id])) {
          next[slot.id] = services[0];
        }
      }
      return next;
    });
  }, [gridSlots]);

  const sortedZones = useMemo(() => Object.keys(zones).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  }), [zones]);

  const openAddModal = () => { setEditingCamera(null); setConfigModalOpen(true); };
  const openEditModal = (camera: Device, e: React.MouseEvent) => { e.stopPropagation(); setEditingCamera(camera); setConfigModalOpen(true); };

  // Helper: get active services label for a camera
  const getCameraServiceBadges = (camera: Device) => {
    const services: string[] = (camera.config as CameraConfig)?.services || [];
    return services.map(s => SERVICES.find(svc => svc.id === s)).filter(Boolean);
  };

  return (
    <div className="h-full flex overflow-hidden relative iris-dashboard-root">
      {/* Camera Config Modal */}
      <CameraConfigModal
        open={configModalOpen}
        camera={editingCamera}
        onClose={() => setConfigModalOpen(false)}
        onSaved={fetchCameras}
      />

      {/* Sidebar */}
      <div className="w-72 bg-zinc-900/40 border-r border-white/5 overflow-y-auto flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/10 dark:border-white/5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Live Feed
            </h2>
            <div className="flex items-center gap-1.5">
              <HudBadge variant="default" size="sm">Live</HudBadge>
              <button
                onClick={openAddModal}
                title="Add Camera"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#00DCEF]/10 hover:bg-[#00DCEF]/20 border border-[#00DCEF]/30 text-[#00DCEF] text-[11px] font-medium transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">Cameras ({cameras.length})</p>
        </div>

        {/* Camera List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-zinc-400">Loading cameras...</div>
          ) : cameras.length === 0 ? (
            <div className="p-6 text-center">
              <Camera className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No cameras added yet.</p>
              <button
                onClick={openAddModal}
                className="mt-3 text-xs text-[#00DCEF] hover:underline"
              >
                + Add your first camera
              </button>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {sortedZones.map((zoneId) => {
                const zoneCameras = zones[zoneId];
                const isExpanded = expandedZones.has(zoneId);
                return (
                  <div key={zoneId} className="mb-1">
                    <Button
                      variant="ghost"
                      onClick={() => toggleZone(zoneId)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                        <span className="text-sm font-medium text-zinc-300">{zoneId}</span>
                        <span className="text-xs text-zinc-400">({zoneCameras.length})</span>
                      </div>
                    </Button>

                    {isExpanded && (
                      <div className="ml-6 mt-1 space-y-1">
                        {zoneCameras.map((camera) => {
                          const isInGrid = gridSlots.some((s) => s.deviceId === camera.id);
                          const serviceBadges = getCameraServiceBadges(camera);
                          return (
                            <div
                              key={camera.id}
                              draggable={!('ontouchstart' in window)}
                              onDragStart={() => handleDragStart(camera)}
                              onDragEnd={handleDragEnd}
                              onTouchStart={(e) => handleTouchStart(e, camera)}
                              onTouchMove={handleTouchMove}
                              onTouchEnd={(e) => {
                                if (!isDragging) { e.preventDefault(); handleCameraTap(camera); setTouchStartPos(null); setTouchDraggedDevice(null); return; }
                                handleTouchEnd(e);
                              }}
                              onTouchCancel={handleTouchCancel}
                              onClick={(e) => { if (!isDragging && !touchDraggedDevice) { e.preventDefault(); e.stopPropagation(); handleCameraTap(camera); } }}
                              className={cn(
                                "px-3 py-2 rounded-lg cursor-pointer transition-all select-none group",
                                "bg-white/5 border border-white/10",
                                "hover:bg-white/10 hover:shadow-sm active:scale-95",
                                isInGrid && "opacity-50"
                              )}
                              style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                            >
                              <div className="flex items-center gap-2">
                                <Camera className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                <span className="text-xs text-zinc-300 truncate flex-1">
                                  {camera.name || camera.id}
                                </span>
                                {isInGrid && <span className="text-xs text-green-500">✓</span>}
                                {/* Settings button */}
                                <button
                                  onClick={(e) => openEditModal(camera, e)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/20 text-zinc-400 hover:text-zinc-200 transition-all"
                                  title="Configure camera"
                                >
                                  <Settings className="w-3 h-3" />
                                </button>
                              </div>
                              {/* Service badges */}
                              {serviceBadges.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {serviceBadges.map(svc => {
                                    if (!svc) return null;
                                    const Icon = svc.icon;
                                    return (
                                      <span
                                        key={svc.id}
                                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border"
                                        style={{ backgroundColor: `${svc.color}29`, borderColor: `${svc.color}4d`, color: svc.color }}
                                      >
                                        <Icon className="w-2.5 h-2.5" />
                                        {svc.label.split(' ')[0]}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        <div className="shrink-0 mb-3 rounded-xl border border-white/5 bg-zinc-900/30 px-3 py-2 flex items-center justify-between">
          <div className="text-xs text-zinc-300 font-medium">Grid Layout: {gridDimensions.cols} x {gridDimensions.rows}</div>
          <div className="text-[10px] text-zinc-500">Drag or tap camera to place in slot</div>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl border border-white/5 bg-zinc-900/25 p-3">
          <div
            className="grid gap-2 h-full"
            style={{
              gridTemplateColumns: `repeat(${gridDimensions.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridDimensions.rows}, minmax(0, 1fr))`,
            }}
          >
            {gridSlots.map((slot, index) => (
              <div
                key={slot.id}
                data-slot-index={index}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                onTouchEnd={(e) => { if (touchDraggedDevice) { e.preventDefault(); handleTouchEnd(undefined, index); } }}
                onTouchMove={(e) => { if (touchDraggedDevice) e.preventDefault(); }}
                className={cn(
                  "relative rounded-lg border-2 border-dashed transition-all select-none overflow-hidden flex flex-col",
                  slot.device ? "border-amber-500/50 bg-zinc-900/90" : "border-white/10 bg-zinc-900/30",
                  (draggedDevice || touchDraggedDevice) && !slot.device && "border-amber-400 border-solid bg-amber-50/50 dark:bg-amber-900/20"
                )}
                style={{ WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'none' }}
              >
                {slot.device ? (
                  <>
                    {(() => {
                      const enabledServices: string[] = ((slot.device.config as CameraConfig)?.services || []).filter(Boolean);
                      const activeService = slot.id ? (slotServiceView[slot.id] || enabledServices[0] || 'all') : 'all';
                      return enabledServices.length > 1 ? (
                        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-black/70 rounded px-1.5 py-1">
                          {enabledServices.map((svcId) => {
                            const svc = SERVICES.find((s) => s.id === svcId);
                            if (!svc) return null;
                            const Icon = svc.icon;
                            const active = activeService === svcId;
                            return (
                              <button
                                key={`${slot.id}-${svcId}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const slotKey = slot.id;
                                  if (!slotKey) return;
                                  setSlotServiceView((prev) => ({ ...prev, [slotKey]: svcId }));
                                }}
                                className={cn(
                                  'px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1',
                                  active ? 'text-white border-white/40 bg-white/20' : 'text-zinc-300 border-white/10 hover:bg-white/10'
                                )}
                                title={`Show ${svc.label} overlays`}
                              >
                                <Icon className="w-2.5 h-2.5" />
                                {svc.label.split(' ')[0]}
                              </button>
                            );
                          })}
                        </div>
                      ) : null;
                    })()}
                    <div className="absolute top-2 left-2 z-10">
                      <div className="bg-black/70 rounded px-2 py-1">
                        <p className="text-xs text-white font-medium truncate max-w-[200px]">
                          {slot.device.name || slot.device.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex-1 relative">
                      {(() => {
                        const enabledServices: string[] = ((slot.device?.config as CameraConfig)?.services || []).filter(Boolean);
                        const activeService = slot.id ? (slotServiceView[slot.id] || enabledServices[0] || 'all') : 'all';
                        if (slot.device?.workerId) {
                          return (
                            <WebSocketVideoFrame
                              workerId={slot.device.workerId}
                              cameraId={slot.device.id}
                              showOverlays={enabledServices.length > 0}
                              enabledServices={enabledServices}
                              serviceFilter={activeService}
                              className="w-full h-full"
                            />
                          );
                        }
                        // Use crowd heatmap live frames as primary feed (always available)
                        return <LiveFrameFallback deviceId={slot.device!.id} />;
                      })()}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/70 backdrop-blur-sm flex items-center justify-between px-2 py-1.5">
                      <span className="text-xs text-white/90 truncate flex-1">{slot.device.name || slot.device.id}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => slot.fullscreenToggleRef?.current?.()}
                          className="bg-white/20 hover:bg-white/30 rounded p-1 h-auto w-auto transition-colors"
                          title={fullscreenStates[index] ? "Exit fullscreen" : "Enter fullscreen"}
                        >
                          {fullscreenStates[index] ? <Minimize2 className="w-3.5 h-3.5 text-white" /> : <Maximize2 className="w-3.5 h-3.5 text-white" />}
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => removeFromGrid(index)}
                          className="bg-red-500/80 hover:bg-red-600 rounded p-1 h-auto w-auto transition-colors"
                          title="Remove from grid"
                        >
                          <span className="text-white text-xs">×</span>
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <LayoutGrid className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                      <p className="text-xs text-zinc-400">Drop camera here</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
