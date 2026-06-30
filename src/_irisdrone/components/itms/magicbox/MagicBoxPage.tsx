import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, type Device, type DeviceHeartbeatPoint } from '@irisdrone/lib/api';
import { Search, Loader2, Server, Thermometer, HardDrive, MemoryStick } from 'lucide-react';
import { HudBadge } from '@irisdrone/components/ui/hud-badge';
import { Card } from '@irisdrone/components/ui/card';
import { Input } from '@irisdrone/components/ui/input';
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from '@irisdrone/components/ui/empty';
import { cn } from '@irisdrone/lib/utils';
import { formatTimeAgo } from '../widgets/utils';
import { ITMSLayout } from '../components/ITMSLayout';
import { MagicBoxDetailView } from './MagicBoxDetailView';
import { CameraDetailView } from './CameraDetailView';

const REFRESH_MS = 30_000;

function onlineBadge(isOnline: boolean) {
  return isOnline ? (
    <HudBadge variant="success">Online</HudBadge>
  ) : (
    <HudBadge variant="danger">Offline</HudBadge>
  );
}

function uptimeBadge(percent: number | null | undefined) {
  const label = percent != null ? `${percent.toFixed(1)}%` : '—';
  return <HudBadge variant="default">Uptime {label}</HudBadge>;
}

function ramPct(rt?: Device['runtimeInfo']): number | null {
  if (!rt?.ram_total_bytes || !rt?.ram_used_bytes) return null;
  return Math.round((100 * rt.ram_used_bytes) / rt.ram_total_bytes);
}

function tempTone(c?: number): string {
  if (c == null) return 'text-zinc-400';
  if (c >= 80) return 'text-red-400';
  if (c >= 70) return 'text-amber-400';
  if (c >= 55) return 'text-lime-400';
  return 'text-emerald-400';
}

function pctTone(p: number | null): string {
  if (p == null) return 'text-zinc-400';
  if (p >= 90) return 'text-red-400';
  if (p >= 75) return 'text-amber-400';
  return 'text-zinc-300';
}

function TelemetryStrip({ rt }: { rt?: Device['runtimeInfo'] }) {
  if (!rt) return null;
  const ram = ramPct(rt);
  const disk = rt.disk_used_pct ?? null;
  const temp = rt.cpu_temp_c;
  if (temp == null && ram == null && disk == null) return null;
  return (
    <div className="mt-2 flex items-center gap-3 text-[11px] font-mono">
      {temp != null && (
        <span className={`inline-flex items-center gap-1 ${tempTone(temp)}`}>
          <Thermometer className="w-3 h-3" />
          {temp.toFixed(0)}°C
        </span>
      )}
      {ram != null && (
        <span className={`inline-flex items-center gap-1 ${pctTone(ram)}`}>
          <MemoryStick className="w-3 h-3" />
          {ram}%
        </span>
      )}
      {disk != null && (
        <span className={`inline-flex items-center gap-1 ${pctTone(disk)}`}>
          <HardDrive className="w-3 h-3" />
          {disk}%
        </span>
      )}
    </div>
  );
}

export function MagicBoxPage() {
  const [magicboxes, setMagicboxes] = useState<Device[]>([]);
  const [selectedMagicBox, setSelectedMagicBox] = useState<Device | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<Device | null>(null);
  const [cameras, setCameras] = useState<Device[]>([]);
  const [heartbeats, setHeartbeats] = useState<DeviceHeartbeatPoint[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [loadingHeartbeats, setLoadingHeartbeats] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMagicboxes = useCallback(async () => {
    try {
      setListLoading(true);
      const data = await apiClient.getDevices({ type: 'MAGICBOX' });
      const list = Array.isArray(data) ? (data as Device[]).filter((d) => d.type === 'MAGICBOX') : [];
      setMagicboxes(list);
      // Auto-select first magicbox if none selected
      setSelectedMagicBox((prev) => prev ?? (list.length > 0 ? list[0] : null));
    } catch (err) {
      console.error('Failed to fetch MagicBoxes:', err);
      setMagicboxes([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const refetchCameras = useCallback(async () => {
    if (!selectedMagicBox) return;
    try {
      const list = await apiClient.getDeviceCameras(selectedMagicBox.id);
      setCameras(list);
    } catch {
      setCameras([]);
    }
  }, [selectedMagicBox?.id]);

  useEffect(() => {
    fetchMagicboxes();
    const id = window.setInterval(fetchMagicboxes, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [fetchMagicboxes]);

  const detailDevice = selectedCamera ?? selectedMagicBox;

  useEffect(() => {
    if (!selectedMagicBox) {
      setCameras([]);
      return;
    }
    let ok = true;
    const fetch = () => {
      setLoadingCameras(true);
      apiClient
        .getDeviceCameras(selectedMagicBox.id)
        .then((list) => {
          if (ok) setCameras(list);
        })
        .catch(() => {
          if (ok) setCameras([]);
        })
        .finally(() => {
          if (ok) setLoadingCameras(false);
        });
    };
    fetch();
    const id = window.setInterval(fetch, REFRESH_MS);
    return () => {
      ok = false;
      window.clearInterval(id);
    };
  }, [selectedMagicBox?.id]);

  useEffect(() => {
    if (!detailDevice) {
      setHeartbeats([]);
      return;
    }
    let ok = true;
    const fetch = () => {
      setLoadingHeartbeats(true);
      apiClient
        .getDeviceHeartbeats(detailDevice.id, { last: '24h' })
        .then((list) => {
          if (ok) setHeartbeats(list);
        })
        .catch(() => {
          if (ok) setHeartbeats([]);
        })
        .finally(() => {
          if (ok) setLoadingHeartbeats(false);
        });
    };
    fetch();
    const id = window.setInterval(fetch, REFRESH_MS);
    return () => {
      ok = false;
      window.clearInterval(id);
    };
  }, [detailDevice?.id]);

  const filtered = magicboxes.filter(
    (d) =>
      !searchQuery ||
      (d.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Scroll detail pane into view on selection change (mobile: card is below sidebar)
  const detailPaneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedMagicBox || selectedCamera) {
      detailPaneRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.matchMedia('(max-width: 1024px)').matches) {
        detailPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [selectedMagicBox?.id, selectedCamera?.id]);

  return (
    <ITMSLayout>
      <div className="h-full w-full flex flex-col lg:flex-row gap-4 p-4 min-h-0 overflow-hidden">
        <div className="w-full lg:w-96 flex flex-col gap-4 relative z-10 min-h-0 lg:h-full">
          <Card className="bg-zinc-900/30 border border-white/5 backdrop-blur-sm p-4 flex flex-col min-h-0 lg:h-full">
            <h2 className="text-xl font-bold text-zinc-100 mb-4 shrink-0">MagicBox</h2>
            <div className="relative mb-4 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-zinc-900/50 border-white/10 text-zinc-300"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 p-0.5 -m-0.5 max-h-[60vh] lg:max-h-none">
              {listLoading && <Loader2 className="w-4 h-4 animate-spin text-amber-400 mx-auto" />}
              {filtered.map((d) => (
                <Card
                  key={d.id}
                  className={cn(
                    'p-3 cursor-pointer transition-all bg-zinc-900/50 border border-white/5',
                    selectedMagicBox?.id === d.id && !selectedCamera
                      ? 'ring-2 ring-amber-500/30'
                      : ''
                  )}
                  onClick={() => {
                    setSelectedMagicBox(d);
                    setSelectedCamera(null);
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-bold text-zinc-100">{d.name || d.id}</div>
                    <div className="flex items-center gap-2">
                      {onlineBadge(d.isOnline === true)}
                      {uptimeBadge(d.uptimePercent)}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500">
                    Last online: {d.lastSeen ? formatTimeAgo(d.lastSeen) : '—'}
                    {(() => {
                      const wg = (d.runtimeInfo?.wg_interface_ip as string | undefined)
                        ?? ((d.metadata as Record<string, unknown> | undefined)?.wg_interface_ip as string | undefined);
                      return wg ? ` · WG: ${wg}` : '';
                    })()}
                  </div>
                  <TelemetryStrip rt={d.runtimeInfo} />
                </Card>
              ))}
            </div>
          </Card>
        </div>

        <div ref={detailPaneRef} className="flex-1 relative z-10 min-w-0 min-h-0 overflow-y-auto scroll-smooth">
          {selectedCamera ? (
            <CameraDetailView
              device={selectedCamera}
              parent={selectedMagicBox}
              heartbeats={heartbeats}
              onBack={() => setSelectedCamera(null)}
              onDelete={() => {
                setSelectedCamera(null);
                refetchCameras();
              }}
              loading={loadingHeartbeats}
            />
          ) : selectedMagicBox ? (
            <MagicBoxDetailView
              device={selectedMagicBox}
              heartbeats={heartbeats}
              cameras={cameras}
              onSelectCamera={setSelectedCamera}
              onDelete={() => {
                setSelectedMagicBox(null);
                setSelectedCamera(null);
                fetchMagicboxes();
              }}
              onDeleteCamera={async (cam) => {
                try {
                  await apiClient.deleteDevice(cam.id);
                  refetchCameras();
                } catch (e) {
                  console.error(e);
                  window.alert('Failed to delete camera');
                }
              }}
              loading={loadingCameras || loadingHeartbeats}
            />
          ) : (
            <Card className="h-full bg-zinc-900/30 border border-white/5 backdrop-blur-sm">
              <Empty>
                <EmptyIcon>
                  <Server />
                </EmptyIcon>
                <EmptyTitle>No device selected</EmptyTitle>
                <EmptyDescription>Select a MagicBox from the list to view its details and connected cameras.</EmptyDescription>
              </Empty>
            </Card>
          )}
        </div>
      </div>
    </ITMSLayout>
  );
}
