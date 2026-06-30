import { useState } from 'react';
import { Badge } from '@irisdrone/components/ui/badge';
import { Button } from '@irisdrone/components/ui/button';
import { Card } from '@irisdrone/components/ui/card';
import {
  ArrowLeft, Loader2, Trash2, Cctv, Wifi, WifiOff, Compass, Ruler,
  Gauge, Clock, Copy, Check, Eye, EyeOff, ScanLine, Activity, Hash,
} from 'lucide-react';
import { apiClient } from '@irisdrone/lib/api';
import type { Device, DeviceHeartbeatPoint } from '@irisdrone/lib/api';
import { formatTimeAgo } from '../widgets/utils';
import { UptimeChart } from './UptimeChart';

// Human labels for the violation types a camera can be set to detect.
const VIOLATION_LABELS: Record<string, string> = {
  helmet: 'No Helmet',
  no_helmet: 'No Helmet',
  triple_riding: 'Triple Riding',
  triple: 'Triple Riding',
  seatbelt: 'No Seatbelt',
  no_seatbelt: 'No Seatbelt',
  minor_rider: 'Minor Rider',
  wrong_side: 'Wrong Side',
  wrong_way: 'Wrong Side',
  speed: 'Over-speed',
  over_speed: 'Over-speed',
  mobile: 'Mobile Use',
  number_plate: 'Number Plate',
};

// Config keys rendered in their own dedicated sections — every other key
// falls through to the "Activity" section so nothing is ever hidden.
const HANDLED_KEYS = new Set([
  'enabled_violations', 'is_active', 'camera_angle', 'camera_height_meters',
  'mpp', 'last_checked', 'last_online', 'speed_limit',
]);

function parseViolations(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.map(String);
    } catch { /* not JSON */ }
    if (v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function fmtDate(v: unknown): string {
  if (v == null || v === '') return '—';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function prettyKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtVal(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

/* ---- small building blocks ---- */

function Tile({
  icon: Icon, label, value, sub, accent,
}: {
  icon: typeof Compass; label: string; value: React.ReactNode; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className={`mt-1.5 text-lg font-semibold tabular-nums leading-none ${accent ?? 'text-zinc-100'}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function Section({
  title, icon: Icon, right, children,
}: {
  title: string; icon: typeof Compass; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-zinc-900/30 overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          <Icon className="w-3.5 h-3.5 text-zinc-500" />
          {title}
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export interface CameraDetailViewProps {
  device: Device;
  parent: Device | null;
  heartbeats: DeviceHeartbeatPoint[];
  onBack: () => void;
  onDelete: () => void;
  loading?: boolean;
}

export function CameraDetailView({
  device, parent, heartbeats, onBack, onDelete, loading,
}: CameraDetailViewProps) {
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <Card className="h-full bg-zinc-900/30 border border-white/5 backdrop-blur-sm flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </Card>
    );
  }

  const cfg = (device.config as Record<string, unknown> | undefined) ?? {};
  const online = device.isOnline === true;
  const name = device.name || device.id;
  const status = (device.status || '').toLowerCase();

  const violations = parseViolations(cfg.enabled_violations);
  const speedLimit = num(cfg.speed_limit);
  const angle = num(cfg.camera_angle);
  const height = num(cfg.camera_height_meters);
  const mpp = num(cfg.mpp);
  const calibrated = (angle ?? 0) !== 0 || (height ?? 0) !== 0 || (mpp ?? 0) !== 0;
  const uptime = device.uptimePercent;

  const rtsp = device.rtspUrl || '';
  const displayRtsp = showPw
    ? rtsp
    : rtsp.replace(/(:\/\/[^:/]+:)([^@]+)(@)/, (_m, a, _pw, c) => `${a}••••••${c}`);

  const extraKeys = Object.keys(cfg).filter((k) => !HANDLED_KEYS.has(k));

  const handleDelete = async () => {
    if (!window.confirm(`Delete camera "${name}"?`)) return;
    try {
      await apiClient.deleteDevice(device.id);
      onDelete();
    } catch (e) {
      console.error(e);
      window.alert('Failed to delete camera');
    }
  };

  const copyRtsp = async () => {
    try {
      await navigator.clipboard.writeText(rtsp);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  };

  return (
    <Card className="h-full bg-zinc-900/30 border border-white/5 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* ---------- Header ---------- */}
      <div className="shrink-0 border-b border-white/10 p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-zinc-300 hover:text-zinc-100 hover:bg-white/5"
            onClick={onBack}
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {parent?.name || parent?.id || 'MagicBox'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-rose-500/40 text-rose-400 hover:bg-rose-500/15 hover:border-rose-500/70"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            Delete
          </Button>
        </div>

        <div className="flex items-start gap-3.5">
          <div
            className={`shrink-0 grid place-items-center w-12 h-12 rounded-xl border ${
              online
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
            }`}
          >
            <Cctv className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-zinc-100 leading-tight truncate" title={name}>
              {name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge
                className={`text-[10px] font-semibold tracking-wide border ${
                  online
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                }`}
              >
                {online ? 'ONLINE' : 'OFFLINE'}
              </Badge>
              <Badge
                className={`text-[10px] font-semibold tracking-wide border ${
                  status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : status === 'inactive'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                }`}
              >
                {(device.status || 'unknown').toUpperCase()}
              </Badge>
              <Badge className="text-[10px] font-semibold tracking-wide bg-amber-500/10 text-amber-300 border border-amber-500/20">
                CAMERA
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
          <Hash className="w-3 h-3" />
          <span className="truncate" title={device.id}>{device.id}</span>
        </div>
      </div>

      {/* ---------- Body ---------- */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Status hero */}
        <div
          className={`rounded-xl border px-4 py-3.5 flex items-center gap-3.5 ${
            online
              ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
              : 'border-rose-500/20 bg-rose-500/[0.06]'
          }`}
        >
          {online ? (
            <Wifi className="w-7 h-7 shrink-0 text-emerald-400" />
          ) : (
            <WifiOff className="w-7 h-7 shrink-0 text-rose-400" />
          )}
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${online ? 'text-emerald-300' : 'text-rose-300'}`}>
              {online ? 'Camera is online' : 'Camera is offline'}
            </div>
            <div className="text-xs text-zinc-400">
              {device.lastSeen
                ? `Last heartbeat ${formatTimeAgo(device.lastSeen)}`
                : 'No heartbeat recorded yet'}
            </div>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-3 gap-3">
          <Tile
            icon={Activity}
            label="Uptime 24h"
            value={uptime != null ? `${uptime.toFixed(1)}%` : '—'}
            accent={
              uptime == null ? 'text-zinc-100'
                : uptime >= 90 ? 'text-emerald-400'
                : uptime >= 50 ? 'text-amber-400'
                : 'text-rose-400'
            }
          />
          <Tile
            icon={Clock}
            label="Last Online"
            value={device.lastSeen ? formatTimeAgo(device.lastSeen) : 'Never'}
          />
          <Tile
            icon={ScanLine}
            label="Detections"
            value={violations.length}
            sub={violations.length === 1 ? 'type' : 'types'}
          />
        </div>

        {/* Uptime chart */}
        <UptimeChart heartbeats={heartbeats} title="Uptime — last 24 hours" height={180} />

        {/* Detection coverage */}
        <Section
          title="Detection Coverage"
          icon={ScanLine}
          right={
            <span
              className={`text-[10px] font-semibold tracking-wide ${
                cfg.is_active === true || String(cfg.is_active) === 'true'
                  ? 'text-emerald-400'
                  : 'text-zinc-500'
              }`}
            >
              {cfg.is_active === true || String(cfg.is_active) === 'true' ? '● ACTIVE' : '○ PAUSED'}
            </span>
          }
        >
          {violations.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {violations.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-1 text-xs font-medium text-amber-300"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {VIOLATION_LABELS[v] || prettyKey(v)}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">No violation types configured for this camera.</div>
          )}
          {speedLimit != null && (
            <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Speed Limit
              </span>
              <span className="text-sm font-semibold tabular-nums text-zinc-100">
                {speedLimit} km/h
              </span>
            </div>
          )}
        </Section>

        {/* Calibration */}
        <Section title="Calibration" icon={Compass}>
          <div className="grid grid-cols-3 gap-3">
            <Tile icon={Compass} label="View Angle" value={`${angle ?? 0}°`} />
            <Tile icon={Ruler} label="Mount Height" value={`${height ?? 0} m`} />
            <Tile icon={Gauge} label="Metres / Pixel" value={mpp != null && mpp !== 0 ? mpp : '—'} />
          </div>
          {!calibrated && (
            <div className="mt-3 text-[11px] text-amber-400/80">
              ⚠ Camera not yet calibrated — speed estimation and zone accuracy may be limited.
            </div>
          )}
        </Section>

        {/* Stream source */}
        {rtsp && (
          <Section
            title="Stream Source"
            icon={Cctv}
            right={
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowPw((s) => !s)}
                  className="grid place-items-center w-6 h-6 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                  title={showPw ? 'Hide password' : 'Reveal password'}
                >
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={copyRtsp}
                  className="grid place-items-center w-6 h-6 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                  title="Copy RTSP URL"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            }
          >
            <code className="block break-all rounded-lg border border-white/[0.06] bg-zinc-950/60 px-3 py-2 text-xs font-mono text-zinc-300">
              {displayRtsp}
            </code>
          </Section>
        )}

        {/* Activity / timestamps */}
        <Section title="Activity" icon={Clock}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Last Checked</dt>
              <dd className="mt-0.5 text-zinc-200">{fmtDate(cfg.last_checked)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-zinc-500">Last Online</dt>
              <dd className="mt-0.5 text-zinc-200">{fmtDate(cfg.last_online)}</dd>
            </div>
            {extraKeys.map((k) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{prettyKey(k)}</dt>
                <dd className="mt-0.5 text-zinc-200 font-mono break-all">{fmtVal(cfg[k])}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </Card>
  );
}
