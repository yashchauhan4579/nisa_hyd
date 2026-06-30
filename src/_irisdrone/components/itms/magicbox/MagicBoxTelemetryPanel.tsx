import { Card } from '@irisdrone/components/ui/card';
import { Badge } from '@irisdrone/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@irisdrone/components/ui/tooltip';
import {
  Thermometer,
  HardDrive,
  Cpu,
  MemoryStick,
  Activity,
  Clock,
  Container as ContainerIcon,
  AlertTriangle,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import type { MagicBoxRuntimeInfo, MagicBoxContainer } from '@irisdrone/lib/api';

function humanBytes(b?: number): string {
  if (b == null || !Number.isFinite(b)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function humanDuration(s?: number): string {
  if (s == null || !Number.isFinite(s) || s < 0) return '—';
  const sec = Math.floor(s);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec % 60}s`;
  return `${sec}s`;
}

function tempColor(c?: number): { text: string; ring: string; bg: string; label: string } {
  if (c == null) return { text: 'text-zinc-400', ring: 'ring-zinc-500/30', bg: 'from-zinc-500/10 to-zinc-500/5', label: 'unknown' };
  if (c >= 80) return { text: 'text-red-400', ring: 'ring-red-500/40', bg: 'from-red-500/20 to-red-500/5', label: 'hot' };
  if (c >= 70) return { text: 'text-amber-400', ring: 'ring-amber-500/40', bg: 'from-amber-500/20 to-amber-500/5', label: 'warm' };
  if (c >= 55) return { text: 'text-lime-400', ring: 'ring-lime-500/30', bg: 'from-lime-500/15 to-lime-500/5', label: 'normal' };
  return { text: 'text-emerald-400', ring: 'ring-emerald-500/30', bg: 'from-emerald-500/15 to-emerald-500/5', label: 'cool' };
}

function pctColor(p: number): string {
  if (p >= 90) return 'bg-red-500';
  if (p >= 75) return 'bg-amber-500';
  if (p >= 50) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function UsageBar({ used, total, label, icon: Icon, hint }: {
  used?: number;
  total?: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  const pct = total && total > 0 ? Math.min(100, Math.max(0, (100 * (used ?? 0)) / total)) : 0;
  const barColor = pctColor(pct);
  return (
    <div className="rounded-lg bg-zinc-900/40 border border-white/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400">
          <Icon className="w-3.5 h-3.5" />
          {label}
        </div>
        <div className="text-xs font-mono text-zinc-300">{pct.toFixed(0)}%</div>
      </div>
      <div className="h-2 rounded-full bg-zinc-800/60 overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
        <span>{humanBytes(used)}</span>
        <span>/ {humanBytes(total)}</span>
      </div>
      {hint && <div className="mt-1 text-[10px] text-zinc-500">{hint}</div>}
    </div>
  );
}

function containerBadge(c: MagicBoxContainer) {
  const s = (c.state || '').toLowerCase();
  if (s === 'running' && c.status.toLowerCase().includes('unhealthy'))
    return <Badge className="bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-mono">unhealthy</Badge>;
  if (s === 'running') return <Badge className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-mono">running</Badge>;
  if (s === 'restarting') return <Badge className="bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-mono">restarting</Badge>;
  if (s === 'exited') return <Badge className="bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px] font-mono">exited</Badge>;
  if (s === 'created') return <Badge className="bg-zinc-500/10 text-zinc-300 border border-zinc-500/20 text-[10px] font-mono">created</Badge>;
  return <Badge className="bg-zinc-500/10 text-zinc-300 border border-zinc-500/20 text-[10px] font-mono">{c.state || '?'}</Badge>;
}

function thermalColor(c: number): string {
  if (c >= 80) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (c >= 70) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  if (c >= 55) return 'text-lime-400 bg-lime-500/10 border-lime-500/20';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
}

interface Props {
  runtime?: MagicBoxRuntimeInfo;
  lastSeen?: string | null;
}

const STALE_AFTER_MS = 2 * 60 * 1000;

export function MagicBoxTelemetryPanel({ runtime, lastSeen }: Props) {
  const stale = lastSeen ? Date.now() - new Date(lastSeen).getTime() > STALE_AFTER_MS : !!runtime;
  if (!runtime || Object.keys(runtime).length === 0) {
    return (
      <Card className="bg-zinc-900/30 border border-white/5 p-6">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Activity className="w-4 h-4" />
          Waiting for first telemetry beat from this MagicBox…
        </div>
      </Card>
    );
  }

  const t = tempColor(runtime.cpu_temp_c);
  const load = runtime.load_avg;
  const oomRecent = runtime.last_oom_kill_age_s != null && runtime.last_oom_kill_age_s < 3600;
  const workerStale = runtime.violation_worker_last_log_age_s != null && runtime.violation_worker_last_log_age_s > 300;
  const allZones = runtime.thermal_zones ? Object.entries(runtime.thermal_zones).sort((a, b) => a[0].localeCompare(b[0])) : [];

  return (
    <TooltipProvider delayDuration={200}>
    <div className={`space-y-4 relative transition-opacity ${stale ? 'opacity-60' : ''}`}>
      {stale && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/60 border border-amber-500/30 text-amber-300 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            Telemetry is stale
            {lastSeen && <> — last beat <span className="font-mono">{new Date(lastSeen).toLocaleString()}</span></>}
            . Values below are a snapshot, not live.
          </span>
        </div>
      )}
      {/* Flags / alerts row */}
      {(runtime.recently_rebooted || oomRecent || workerStale) && (
        <div className="flex flex-wrap gap-2">
          {runtime.recently_rebooted && (
            <Badge className="bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs gap-1">
              <RefreshCw className="w-3 h-3" /> Recently rebooted
            </Badge>
          )}
          {oomRecent && (
            <Badge className="bg-red-500/10 text-red-300 border border-red-500/20 text-xs gap-1">
              <AlertTriangle className="w-3 h-3" /> OOM {humanDuration(runtime.last_oom_kill_age_s)} ago
            </Badge>
          )}
          {workerStale && (
            <Badge className="bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs gap-1">
              <AlertTriangle className="w-3 h-3" /> violation-worker silent {humanDuration(runtime.violation_worker_last_log_age_s)}
            </Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-12 gap-3">
        {/* CPU temp — hero tile */}
        <Card className={`col-span-12 md:col-span-4 relative overflow-hidden border border-white/5 bg-gradient-to-br ${t.bg} ring-1 ${t.ring}`}>
          <div className="p-4 relative z-10">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400">
              <Thermometer className="w-3.5 h-3.5" />
              CPU Temperature
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-4xl font-bold ${t.text} tabular-nums`}>
                {runtime.cpu_temp_c != null ? runtime.cpu_temp_c.toFixed(1) : '—'}
              </span>
              <span className={`text-lg ${t.text}`}>°C</span>
              <span className={`ml-auto text-xs uppercase ${t.text} opacity-80`}>{t.label}</span>
            </div>
            {allZones.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {allZones.map(([zone, val]) => (
                  <Tooltip key={zone}>
                    <TooltipTrigger asChild>
                      <div className={`text-[10px] font-mono text-center rounded border px-1 py-0.5 ${thermalColor(val)}`}>
                        {val.toFixed(1)}°
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{zone}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Load avg */}
        <Card className="col-span-12 md:col-span-4 bg-zinc-900/30 border border-white/5">
          <div className="p-4">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400">
              <Cpu className="w-3.5 h-3.5" />
              Load Average
            </div>
            {load && load.length === 3 ? (
              <div className="mt-3 grid grid-cols-3 gap-3">
                {(['1m', '5m', '15m'] as const).map((lbl, i) => (
                  <div key={lbl}>
                    <div className="text-[10px] uppercase text-zinc-500">{lbl}</div>
                    <div className="text-xl font-bold text-zinc-100 tabular-nums">{load[i].toFixed(2)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-zinc-500 text-sm">—</div>
            )}
          </div>
        </Card>

        {/* Uptime */}
        <Card className="col-span-12 md:col-span-4 bg-zinc-900/30 border border-white/5">
          <div className="p-4">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400">
              <Clock className="w-3.5 h-3.5" />
              Uptime
            </div>
            <div className="mt-2 text-2xl font-bold text-zinc-100">
              {humanDuration(runtime.uptime_seconds)}
            </div>
          </div>
        </Card>

        {/* Disk */}
        <Card className="col-span-12 md:col-span-4 bg-zinc-900/30 border border-white/5 p-0">
          <div className="p-3">
            <UsageBar
              used={runtime.disk_used_bytes}
              total={runtime.disk_total_bytes}
              label="Disk"
              icon={HardDrive}
              hint={`${humanBytes(runtime.disk_free_bytes)} free`}
            />
          </div>
        </Card>

        {/* RAM */}
        <Card className="col-span-12 md:col-span-4 bg-zinc-900/30 border border-white/5 p-0">
          <div className="p-3">
            <UsageBar
              used={runtime.ram_used_bytes}
              total={runtime.ram_total_bytes}
              label="RAM"
              icon={MemoryStick}
              hint={`${humanBytes(runtime.ram_available_bytes)} available`}
            />
          </div>
        </Card>

        {/* Swap */}
        <Card className="col-span-12 md:col-span-4 bg-zinc-900/30 border border-white/5 p-0">
          <div className="p-3">
            <UsageBar
              used={runtime.swap_used_bytes}
              total={runtime.swap_total_bytes}
              label="Swap"
              icon={MemoryStick}
              hint={`${humanBytes(runtime.swap_free_bytes)} free`}
            />
          </div>
        </Card>
      </div>

      {/* Containers */}
      {runtime.containers && runtime.containers.length > 0 && (
        <Card className="bg-zinc-900/30 border border-white/5">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ContainerIcon className="w-4 h-4 text-amber-400" />
              <span className="text-sm uppercase tracking-wider text-zinc-400">Docker Containers</span>
            </div>
            <Badge className="bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-mono">
              {runtime.containers.filter((c) => c.running).length}/{runtime.containers.length} running
            </Badge>
          </div>
          <div className="divide-y divide-white/5">
            {runtime.containers.map((c) => (
              <div key={c.name} className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-100 truncate">{c.name}</div>
                  <div className="text-[11px] font-mono text-zinc-500 truncate">{c.image}</div>
                </div>
                <div className="text-[11px] text-zinc-400 hidden sm:block max-w-[240px] truncate">{c.status}</div>
                {containerBadge(c)}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Inference liveness */}
      {runtime.violation_worker_last_log_age_s != null && (
        <Card className="bg-zinc-900/30 border border-white/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Rocket className={`w-4 h-4 ${workerStale ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span className="text-sm uppercase tracking-wider text-zinc-400">Violation-Worker</span>
            </div>
            <div className={`text-sm font-mono ${workerStale ? 'text-amber-300' : 'text-emerald-300'}`}>
              {runtime.violation_worker_last_log_age_s === 0 ? 'live now' : `${humanDuration(runtime.violation_worker_last_log_age_s)} since last log`}
            </div>
          </div>
        </Card>
      )}
    </div>
    </TooltipProvider>
  );
}
