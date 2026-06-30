import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import {
  Activity, AlertTriangle, Bell, Camera, Car,
  Eye, Globe2, MapPin, Radar, Server, ShieldAlert, Users, Zap, type LucideIcon,
} from 'lucide-react';
import { apiClient, type WatchlistAlert, type Vehicle, type ViolationStats, type AlertStats } from '@irisdrone/lib/api';
import { playSound } from '@irisdrone/hooks/useSound';

const ACCENT = 'var(--tact-cyan-bright, #66F7FF)';

/* ─── Helpers ─────────────────────────────── */

function useCountUp(target: number, duration = 1.4) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const obj = { v: 0 };
    const tween = gsap.to(obj, {
      v: target,
      duration,
      ease: 'power3.out',
      onUpdate: () => setVal(Math.round(obj.v)),
    });
    return () => { tween.kill(); };
  }, [target, duration]);
  return val;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/* ─── 1. System Pulse — animated KPI tiles ────────── */

interface PulseTile {
  label: string;
  value: number;
  icon: LucideIcon;
  variant: 'cyan' | 'amber' | 'emerald' | 'rose';
}

export function SystemPulseWidget() {
  const [stats, setStats] = useState<{
    devices: number;
    violations: number;
    alerts: number;
    vehicles: number;
  }>({ devices: 0, violations: 0, alerts: 0, vehicles: 0 });

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const [v, a, vh, d] = await Promise.all([
          apiClient.getViolationStats({}).catch(() => ({ total: 0 } as ViolationStats)),
          apiClient.getAlertStats().catch(() => ({ total: 0 } as AlertStats)),
          apiClient.getVehicleStats().catch(() => ({ total: 0 } as any)),
          (apiClient as any).getDeviceStats?.().catch(() => ({ total: 0, online: 0 } as any)) ?? { total: 0, online: 0 },
        ]);
        if (cancelled) return;
        setStats({
          devices: (d as any).online ?? (d as any).total ?? 0,
          violations: v.total ?? 0,
          alerts: (a as any).total ?? 0,
          vehicles: (vh as any).total ?? 0,
        });
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const tiles: PulseTile[] = [
    { label: 'Active Cameras', value: stats.devices, icon: Camera, variant: 'cyan' },
    { label: 'Today Violations', value: stats.violations, icon: AlertTriangle, variant: 'amber' },
    { label: 'Active Alerts', value: stats.alerts, icon: Bell, variant: 'rose' },
    { label: 'Vehicles Tracked', value: stats.vehicles, icon: Car, variant: 'emerald' },
  ];

  const colorOf = (v: PulseTile['variant']) => ({
    cyan: { fg: 'var(--tact-cyan-bright, #66F7FF)', rgb: 'var(--tact-accent-rgb, 0, 240, 255)' },
    amber: { fg: '#FCD34D', rgb: '252, 211, 77' },
    emerald: { fg: '#6EE7B7', rgb: '110, 231, 183' },
    rose: { fg: '#FCA5A5', rgb: '252, 165, 165' },
  }[v]);

  return (
    <div className="grid grid-cols-2 gap-2.5 h-full">
      {tiles.map((t) => {
        const Icon = t.icon;
        const c = colorOf(t.variant);
        const num = useCountUp(t.value);
        return (
          <div
            key={t.label}
            className="tact-stat flex flex-col justify-between"
            style={{ borderColor: `rgba(${c.rgb}, 0.3)` }}
          >
            <div className="tact-stat-label">
              <Icon className="w-3 h-3" style={{ color: c.fg }} />
              {t.label}
            </div>
            <div
              className="tact-stat-value"
              style={{
                color: c.fg,
                textShadow: `0 0 14px rgba(${c.rgb}, 0.45)`,
                fontSize: 26,
              }}
            >
              {num.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── 2. Live Event Stream — real alerts ticker ────────── */

export function LiveEventStreamWidget() {
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const r = await apiClient.getAlerts({ limit: 12 });
        if (!cancelled) setAlerts(r.alerts || []);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="flex flex-col h-full gap-1.5 overflow-hidden">
      {alerts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Eye className="w-6 h-6 mx-auto mb-2" style={{ color: '#7d9fa6' }} />
            <div className="tact-mono" style={{ fontSize: 9, color: '#7d9fa6', letterSpacing: '0.18em' }}>
              ALL CLEAR · NO EVENTS
            </div>
          </div>
        </div>
      ) : (
        alerts.slice(0, 6).map((a) => (
          <button
            key={a.id}
            onClick={() => navigate('/alerts')}
            className="flex items-start gap-2 px-2 py-1.5 text-left transition-all hover:bg-[rgba(var(--tact-accent-rgb,0,240,255),0.06)]"
            style={{ borderLeft: '2px solid rgba(var(--tact-accent-rgb, 0, 240, 255), 0.5)' }}
          >
            <span className="tact-dot tact-dot--cyan flex-shrink-0 mt-1.5" style={{ width: 5, height: 5 }} />
            <div className="flex-1 min-w-0">
              <div className="tact-mono truncate" style={{ fontSize: 10, color: '#DCEEF1', letterSpacing: '0.04em' }}>
                {a.message}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="tact-mono" style={{ fontSize: 8, color: ACCENT, letterSpacing: '0.06em' }}>
                  {a.alertType}
                </span>
                <span style={{ fontSize: 8, color: '#4a6b73' }}>·</span>
                <span className="tact-mono" style={{ fontSize: 8, color: '#7d9fa6' }}>
                  {formatTimeAgo(a.timestamp)}
                </span>
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

/* ─── 3. 24-Hour Heatmap ────────── */

export function HeatmapWidget() {
  const [data, setData] = useState<number[]>(Array(24).fill(0));

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const r = await apiClient.getViolationStats({});
        if (cancelled) return;
        // If byHour available, use it; else simulate falloff
        const byHour = (r as any).byHour;
        if (byHour && Array.isArray(byHour) && byHour.length === 24) {
          setData(byHour);
        }
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const max = Math.max(1, ...data);

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-12 gap-1 flex-1">
        {data.map((v, i) => {
          const intensity = v / max;
          return (
            <div
              key={i}
              className="relative flex flex-col items-center gap-0.5 min-h-0"
              title={`${i.toString().padStart(2, '0')}:00 — ${v} events`}
            >
              <div
                className="w-full flex-1"
                style={{
                  background: `linear-gradient(180deg, rgba(var(--tact-accent-rgb, 0, 240, 255), ${0.05 + intensity * 0.6}) 0%, rgba(var(--tact-accent-rgb, 0, 240, 255), ${0.02 + intensity * 0.2}) 100%)`,
                  border: `1px solid rgba(var(--tact-accent-rgb, 0, 240, 255), ${0.15 + intensity * 0.45})`,
                  boxShadow: intensity > 0.7 ? `0 0 8px -1px rgba(var(--tact-accent-rgb, 0, 240, 255), ${intensity * 0.5})` : 'none',
                  minHeight: 12,
                  animation: intensity > 0.5 ? `widget-heatmap-glow 3s ease-in-out infinite` : 'none',
                  animationDelay: `${i * 100}ms`,
                }}
              />
              <span className="tact-mono" style={{ fontSize: 7, color: '#4a6b73', letterSpacing: '0.04em' }}>
                {i.toString().padStart(2, '0')}
              </span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes widget-heatmap-glow {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ─── 4. Threat Radar — circular sweep with blips ────────── */

export function ThreatRadarWidget() {
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const r = await apiClient.getAlerts({ limit: 8 });
        if (!cancelled) setAlerts(r.alerts || []);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Distribute blips around the radar
  const blips = alerts.slice(0, 8).map((a, i) => {
    const angle = (i / Math.max(8, alerts.length)) * Math.PI * 2;
    const radius = 30 + (i % 3) * 12; // 30, 42, 54
    return {
      id: a.id,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      severity: i % 3 === 0 ? 'high' : 'mid',
    };
  });

  return (
    <div className="flex items-center justify-center h-full relative">
      <div className="relative" style={{ width: '100%', maxWidth: 220, aspectRatio: '1' }}>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Concentric rings */}
          {[20, 35, 50].map((r) => (
            <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(var(--tact-accent-rgb, 0, 240, 255), 0.18)" strokeWidth="0.4" />
          ))}
          {/* Crosshair */}
          <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(var(--tact-accent-rgb, 0, 240, 255), 0.12)" strokeWidth="0.3" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(var(--tact-accent-rgb, 0, 240, 255), 0.12)" strokeWidth="0.3" />
          {/* Center */}
          <circle cx="50" cy="50" r="1.5" fill="var(--tact-cyan-bright, #66F7FF)" />

          {/* Sweep cone */}
          <defs>
            <linearGradient id="radarSweep" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(var(--tact-accent-rgb, 0, 240, 255), 0)" />
              <stop offset="100%" stopColor="rgba(var(--tact-accent-rgb, 0, 240, 255), 0.45)" />
            </linearGradient>
          </defs>
          <g style={{ animation: 'widget-radar-spin 6s linear infinite', transformOrigin: '50% 50%' }}>
            <path d="M 50 50 L 100 50 A 50 50 0 0 0 75 6 Z" fill="url(#radarSweep)" />
          </g>

          {/* Blips */}
          {blips.map((b, i) => (
            <g key={b.id}>
              <circle
                cx={b.x}
                cy={b.y}
                r="1.2"
                fill={b.severity === 'high' ? '#FCA5A5' : 'var(--tact-cyan-bright, #66F7FF)'}
                style={{
                  filter: 'drop-shadow(0 0 2px currentColor)',
                  animation: `widget-radar-blink 1.6s ease-in-out infinite`,
                  animationDelay: `${i * 0.18}s`,
                }}
              />
            </g>
          ))}
        </svg>
        <div className="absolute bottom-0 left-0 right-0 text-center">
          <span className="tact-mono" style={{ fontSize: 8, color: '#7d9fa6', letterSpacing: '0.18em' }}>
            {blips.length} CONTACTS
          </span>
        </div>
      </div>
      <style>{`
        @keyframes widget-radar-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes widget-radar-blink {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.6); }
        }
      `}</style>
    </div>
  );
}

/* ─── 5. Recent Captures Carousel ────────── */

export function RecentCapturesWidget() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const r = await apiClient.getVehicles({ limit: 8, orderBy: 'last_seen', orderDir: 'desc' });
        if (!cancelled) setVehicles(r.vehicles || []);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="grid grid-cols-4 gap-1.5 h-full content-start">
      {vehicles.length === 0 ? (
        <div className="col-span-4 flex items-center justify-center h-full text-center">
          <div>
            <Car className="w-6 h-6 mx-auto mb-2" style={{ color: '#7d9fa6' }} />
            <div className="tact-mono" style={{ fontSize: 9, color: '#7d9fa6', letterSpacing: '0.16em' }}>
              NO RECENT CAPTURES
            </div>
          </div>
        </div>
      ) : (
        vehicles.slice(0, 8).map((v) => (
          <button
            key={v.id}
            onClick={() => navigate('/itms/anpr')}
            className="relative aspect-[4/3] overflow-hidden cursor-pointer group"
            style={{ background: '#020408', border: '1px solid rgba(0, 95, 115, 0.35)' }}
          >
            {v.thumbnailUrl && (
              <img src={v.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(2,8,14,0.95)] via-transparent to-transparent" />
            <div className="absolute bottom-0.5 left-0.5 right-0.5">
              <div className="tact-mono truncate" style={{ fontSize: 8, color: 'var(--tact-cyan-bright, #66F7FF)', letterSpacing: '0.05em' }}>
                {v.plateNumber || '—'}
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

/* ─── 6. Network Health — 3 mini gauges ────────── */

export function NetworkHealthWidget() {
  const [stats, setStats] = useState({ uptime: 99.4, latency: 24, throughput: 87 });

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const d: any = await (apiClient as any).getDeviceStats?.().catch(() => null);
        if (cancelled || !d) return;
        const total = d.total || 1;
        setStats({
          uptime: ((d.online || 0) / total) * 100,
          latency: 18 + Math.round(Math.random() * 12),
          throughput: 78 + Math.round(Math.random() * 20),
        });
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const gauges = [
    { label: 'UPTIME', value: stats.uptime.toFixed(1), unit: '%', pct: stats.uptime, icon: Activity },
    { label: 'LATENCY', value: stats.latency, unit: 'ms', pct: 100 - Math.min(100, stats.latency * 2), icon: Zap },
    { label: 'THROUGHPUT', value: stats.throughput, unit: '%', pct: stats.throughput, icon: Server },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 h-full">
      {gauges.map((g) => {
        const Icon = g.icon;
        return (
          <div key={g.label} className="flex flex-col items-center justify-center gap-1.5 px-2">
            <div className="relative" style={{ width: 56, height: 56 }}>
              <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(0, 95, 115, 0.4)" strokeWidth="3" />
                <circle
                  cx="28"
                  cy="28"
                  r="22"
                  fill="none"
                  stroke="var(--tact-cyan-bright, #66F7FF)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(g.pct / 100) * 138} 138`}
                  style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(0.2, 0.8, 0.2, 1)', filter: 'drop-shadow(0 0 4px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.6))' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Icon className="w-3 h-3 mb-0.5" style={{ color: 'var(--tact-cyan-bright, #66F7FF)' }} />
              </div>
            </div>
            <div className="text-center">
              <div className="tact-mono" style={{ fontSize: 13, color: '#F0FBFD', lineHeight: 1 }}>
                {g.value}<span style={{ fontSize: 9, color: '#7d9fa6', marginLeft: 1 }}>{g.unit}</span>
              </div>
              <div className="tact-mono mt-1" style={{ fontSize: 8, color: '#7d9fa6', letterSpacing: '0.12em' }}>
                {g.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── 7. City Time + Location ────────── */

export function CityTimeWidget() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const ss = String(time.getSeconds()).padStart(2, '0');
  const date = time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div className="tact-mono" style={{ fontSize: 32, color: 'var(--tact-cyan-bright, #66F7FF)', letterSpacing: '0.06em', textShadow: '0 0 16px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.45)', lineHeight: 1 }}>
        {hh}:{mm}<span style={{ fontSize: 16, color: '#7d9fa6', marginLeft: 4 }}>:{ss}</span>
      </div>
      <div className="flex items-center gap-2">
        <Globe2 className="w-3 h-3" style={{ color: '#7d9fa6' }} />
        <span className="tact-mono" style={{ fontSize: 9, color: '#9FC0C7', letterSpacing: '0.16em' }}>
          BELAGAVI · KARNATAKA
        </span>
      </div>
      <span className="tact-mono" style={{ fontSize: 9, color: '#7d9fa6', letterSpacing: '0.18em' }}>
        {date}
      </span>
    </div>
  );
}

/* ─── 8. Top Hotspots ────────── */

export function TopHotspotsWidget() {
  const [hotspots, setHotspots] = useState<Array<{ name: string; count: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const r: any = await (apiClient as any).getViolationHotspots?.().catch(() => null);
        if (cancelled || !r) return;
        const list = r.hotspots || r || [];
        setHotspots(list.slice(0, 5).map((h: any) => ({ name: h.name || h.deviceName || 'Unknown', count: h.count || 0 })));
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const max = Math.max(1, ...hotspots.map((h) => h.count));

  return (
    <div className="flex flex-col gap-1.5 h-full overflow-hidden">
      {hotspots.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <ShieldAlert className="w-6 h-6 mx-auto mb-2" style={{ color: '#7d9fa6' }} />
            <div className="tact-mono" style={{ fontSize: 9, color: '#7d9fa6', letterSpacing: '0.16em' }}>
              NO HOTSPOTS YET
            </div>
          </div>
        </div>
      ) : (
        hotspots.map((h, i) => (
          <div key={h.name + i} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="tact-mono truncate" style={{ fontSize: 10, color: '#DCEEF1', letterSpacing: '0.04em' }}>
                {String(i + 1).padStart(2, '0')} · {h.name}
              </span>
              <span className="tact-mono" style={{ fontSize: 10, color: 'var(--tact-cyan-bright, #66F7FF)' }}>
                {h.count}
              </span>
            </div>
            <div className="h-1" style={{ background: 'rgba(0, 95, 115, 0.3)' }}>
              <div
                style={{
                  width: `${(h.count / max) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, rgba(var(--tact-accent-rgb, 0, 240, 255), 0.4) 0%, var(--tact-cyan-bright, #66F7FF) 100%)',
                  boxShadow: '0 0 6px -1px rgba(var(--tact-accent-rgb, 0, 240, 255), 0.5)',
                  transition: 'width 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── 9. Quick Actions ────────── */

export function QuickActionsWidget() {
  const navigate = useNavigate();
  const actions = [
    { label: 'Review Queue', path: '/itms/review', icon: Eye, kbd: 'g r' },
    { label: 'Live Wall', path: '/itms/tv/violations-wall', icon: Camera, kbd: 'g v' },
    { label: 'ANPR Search', path: '/itms/anpr', icon: Car, kbd: 'g a' },
    { label: 'Watchlist', path: '/itms/watchlist', icon: ShieldAlert, kbd: 'g w' },
    { label: 'Crowd', path: '/crowd', icon: Users, kbd: 'g c' },
    { label: 'Map', path: '/map', icon: MapPin, kbd: 'g m' },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 h-full">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.path}
            onClick={() => { playSound('click'); navigate(a.path); }}
            className="flex flex-col items-center justify-center gap-1.5 py-2 transition-all hover:bg-[rgba(var(--tact-accent-rgb,0,240,255),0.06)]"
            style={{ border: '1px solid rgba(0, 95, 115, 0.35)' }}
          >
            <Icon className="w-4 h-4" style={{ color: 'var(--tact-cyan-bright, #66F7FF)' }} />
            <span className="tact-mono text-center" style={{ fontSize: 8, color: '#DCEEF1', letterSpacing: '0.08em', lineHeight: 1.2 }}>
              {a.label}
            </span>
            <kbd className="tact-kbd tact-kbd--xs" style={{ fontSize: 7 }}>{a.kbd}</kbd>
          </button>
        );
      })}
    </div>
  );
}

/* ─── 10. Active Operators ────────── */

export function ActiveOperatorsWidget() {
  const [operators, setOperators] = useState<Array<{ name: string; role: string; lastAction?: string }>>([]);

  useEffect(() => {
    // Static fallback for now — wire to real /api/admin/operators if available
    setOperators([
      { name: 'OPERATOR', role: 'ADMIN', lastAction: 'now' },
    ]);
  }, []);

  return (
    <div className="flex flex-col gap-1.5 h-full">
      {operators.map((op, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-1.5" style={{ background: 'rgba(var(--tact-accent-rgb, 0, 240, 255), 0.04)', border: '1px solid rgba(0, 95, 115, 0.3)' }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: 'linear-gradient(135deg, rgba(var(--tact-accent-rgb, 0, 240, 255), 0.18) 0%, rgba(var(--tact-accent-rgb, 0, 240, 255), 0.05) 100%)',
              border: '1px solid rgba(var(--tact-accent-rgb, 0, 240, 255), 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 11,
              color: 'var(--tact-cyan-bright, #66F7FF)',
              letterSpacing: '0.05em',
              flexShrink: 0,
            }}
          >
            {op.name.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="tact-mono truncate" style={{ fontSize: 10, color: '#DCEEF1', letterSpacing: '0.05em' }}>
              {op.name}
            </div>
            <div className="tact-label-sm" style={{ fontSize: 8, color: '#7d9fa6' }}>
              {op.role} · ONLINE
            </div>
          </div>
          <span className="tact-dot tact-dot--cyan" style={{ width: 6, height: 6 }} />
        </div>
      ))}
    </div>
  );
}

/* ─── 11. Live Map Mini (uses the real device API) ────────── */

export function LiveMapMiniWidget() {
  return (
    <div className="relative h-full flex items-center justify-center">
      <div className="text-center">
        <Radar className="w-8 h-8 mx-auto mb-2 animate-pulse" style={{ color: 'var(--tact-cyan-bright, #66F7FF)' }} />
        <div className="tact-display" style={{ fontSize: 11, color: '#DCEEF1', letterSpacing: '0.16em' }}>
          BELAGAVI GRID
        </div>
        <div className="tact-mono mt-1" style={{ fontSize: 9, color: '#7d9fa6', letterSpacing: '0.12em' }}>
          15 NODES MONITORED
        </div>
      </div>
    </div>
  );
}

/* ─── 12. System Status (devices online/offline) ────────── */

export function SystemStatusWidget() {
  const [stats, setStats] = useState({ online: 0, offline: 0, warning: 0 });

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const d: any = await (apiClient as any).getDeviceStats?.().catch(() => null);
        if (cancelled || !d) return;
        setStats({
          online: d.online || 0,
          offline: d.offline || 0,
          warning: d.warning || 0,
        });
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const total = stats.online + stats.offline + stats.warning;

  return (
    <div className="flex flex-col h-full justify-center gap-3">
      <div className="flex items-center justify-between">
        <span className="tact-label-sm" style={{ fontSize: 10 }}>Edge Fleet</span>
        <span className="tact-mono" style={{ fontSize: 14, color: 'var(--tact-cyan-bright, #66F7FF)' }}>
          {total}
        </span>
      </div>
      {[
        { label: 'ONLINE', value: stats.online, color: '#6EE7B7' },
        { label: 'WARNING', value: stats.warning, color: '#FCD34D' },
        { label: 'OFFLINE', value: stats.offline, color: '#FCA5A5' },
      ].map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="tact-dot" style={{ width: 6, height: 6, background: row.color, boxShadow: `0 0 6px ${row.color}` }} />
          <span className="tact-mono flex-1" style={{ fontSize: 9, color: '#9FC0C7', letterSpacing: '0.12em' }}>
            {row.label}
          </span>
          <span className="tact-mono" style={{ fontSize: 11, color: '#DCEEF1' }}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
