import { Camera, Plane, Radio, Layers, MapPin, Car, Grid3x3, RefreshCw, Satellite, Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IrisLogo } from '@/components/brand/IrisLogo';
import { useDeviceFilter } from '@/contexts/DeviceFilterContext';
import { useLayerVisibility } from '@/contexts/LayerVisibilityContext';
import { useCameraGrid, type GridSize } from '@/contexts/CameraGridContext';
import { useCrowdDashboard } from '@/contexts/CrowdDashboardContext';
import { useMapType } from '@/contexts/MapTypeContext';
import type { DeviceType } from '@/lib/api';
import { cn } from '@/lib/utils';

// Component for camera grid controls (separate to handle hook usage)
function CameraGridControls() {
  const { gridSize, setGridSize, usedSlots } = useCameraGrid();
  const [cols, rows] = gridSize.split('x').map(Number);
  const totalSlots = rows * cols;

  return (
    <div className="flex items-center gap-2 border-r border-white/10 dark:border-white/5 pr-4">
      <Grid3x3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      <span className="text-sm text-gray-700 dark:text-gray-300">Grid:</span>
      <div className="flex items-center gap-1">
        {(['1x1', '2x2', '3x3', '4x4'] as GridSize[]).map((size) => (
          <Button
            key={size}
            variant="ghost"
            size="sm"
            onClick={() => setGridSize(size)}
            className={cn(
              "rounded-lg transition-all px-2 py-1 text-xs",
              gridSize === size
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-white/50 dark:bg-white/5 hover:bg-white/70 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
            )}
          >
            {size}
          </Button>
        ))}
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
        {usedSlots} / {totalSlots}
      </span>
    </div>
  );
}

const deviceTypeConfig: Record<DeviceType, { label: string; icon: typeof Camera; color: string }> = {
  CAMERA: {
    label: 'Cameras',
    icon: Camera,
    color: 'blue',
  },
  DRONE: {
    label: 'Drones',
    icon: Plane,
    color: 'green',
  },
  SENSOR: {
    label: 'Sensors',
    icon: Radio,
    color: 'amber',
  },
};

interface TopBarProps {
  activeView?: string;
}

// Friendly breadcrumb label from a route key, e.g. "itms/anpr" -> "ITMS · ANPR".
const SEGMENT_LABELS: Record<string, string> = {
  itms: 'ITMS', vms: 'VMS', anpr: 'ANPR', vcc: 'VCC', nvcc: 'NVCC', frs: 'FRS',
  watchlist: 'Watchlist', violations: 'Violations', alerts: 'Alerts', map: 'Map',
  cameras: 'Cameras', crowd: 'Crowd', analytics: 'Analytics', dashboard: 'Dashboard',
  reports: 'Reports', liveview: 'Live View', devices: 'Devices', recording: 'Recording',
  camerahealth: 'Camera Health', settings: 'Settings', workers: 'Workers',
  search: 'IRIS Search', forensics: 'IRIS Observer', safety: 'Public Safety',
};
function viewLabel(view: string): string {
  return view
    .split('/')
    .map((s) => SEGMENT_LABELS[s] || s.charAt(0).toUpperCase() + s.slice(1))
    .join(' · ');
}

// Component for crowd dashboard controls (separate to handle hook usage)
function CrowdDashboardControls() {
  const { autoRefresh, setAutoRefresh } = useCrowdDashboard();

  return (
    <div className="flex items-center gap-2 border-r border-white/10 dark:border-white/5 pr-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAutoRefresh(!autoRefresh)}
        className={cn(
          "rounded-xl transition-all duration-200 flex items-center gap-2 border",
          autoRefresh
            ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/30"
            : "bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
        )}
      >
        <RefreshCw className={cn("w-4 h-4", autoRefresh && "animate-spin")} />
        {autoRefresh ? 'Auto-refresh: ON' : 'Auto-refresh: OFF'}
      </Button>
    </div>
  );
}

export function TopBar({ activeView = 'map' }: TopBarProps) {
  const { selectedTypes, toggleType, isTypeSelected } = useDeviceFilter();
  const { showCameras, showHotspots, showTraffic, toggleCameras, toggleHotspots, toggleTraffic } = useLayerVisibility();
  const { mapType, toggleMapType } = useMapType();

  return (
    <div
      className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center gap-4 px-4 bg-white/90 dark:bg-zinc-950/85 backdrop-blur-xl border-b border-black/10 dark:border-white/10 shadow-sm"
      style={{ boxShadow: 'inset 0 -2px 0 rgba(245,158,11,0.28), 0 1px 2px rgba(0,0,0,0.08)' }}
    >
      {/* IRIS brand lockup — full-height left block, like a desktop VMS title bar */}
      <div className="flex items-center gap-2.5 shrink-0 pr-4 h-full border-r border-black/10 dark:border-white/10">
        <IrisLogo className="w-7 h-7 text-amber-500" />
        <span className="text-xl font-bold tracking-tight leading-none text-gray-900 dark:text-white">IRIS</span>
      </div>
      <span className="text-sm font-medium leading-none text-gray-600 dark:text-gray-300 shrink-0">
        {viewLabel(activeView)}
      </span>

      <div className="flex-1" />

      {/* Crowd Dashboard Controls */}
      {activeView === 'crowd' && <CrowdDashboardControls />}

      {/* Camera Grid Controls (only for camera view) */}
      {activeView === 'cameras' && <CameraGridControls />}

      {/* Layer Visibility Controls (only for map view) */}
      {activeView === 'map' && (
        <div className="flex items-center gap-2 border-r border-white/10 dark:border-white/5 pr-4">
          <Layers className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCameras}
            className={cn(
              "rounded-xl transition-all duration-200 flex items-center gap-2 border",
              showCameras && "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/30",
              !showCameras && "bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
            )}
          >
            <MapPin className="w-4 h-4" />
            Devices
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleHotspots}
            className={cn(
              "rounded-xl transition-all duration-200 flex items-center gap-2 border",
              showHotspots && "bg-red-500 hover:bg-red-600 text-white border-red-500 shadow-lg shadow-red-500/30",
              !showHotspots && "bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
            )}
          >
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-400 via-orange-500 to-red-600" />
            Hotspots
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTraffic}
            className={cn(
              "rounded-xl transition-all duration-200 flex items-center gap-2 border",
              showTraffic && "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/30",
              !showTraffic && "bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
            )}
          >
            <Car className="w-4 h-4" />
            Traffic
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleMapType}
            className={cn(
              "rounded-xl transition-all duration-200 flex items-center gap-2 border",
              mapType === 'satellite'
                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/30"
                : "bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
            )}
            title={mapType === 'satellite' ? 'Switch to Roadmap' : 'Switch to Satellite'}
          >
            {mapType === 'satellite' ? (
              <>
                <Satellite className="w-4 h-4" />
                <span>Satellite</span>
              </>
            ) : (
              <>
                <MapIcon className="w-4 h-4" />
                <span>Roadmap</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Device Type Filters (only for map view) */}
      {activeView === 'map' && (
        <div className="flex items-center gap-2">
          {(Object.keys(deviceTypeConfig) as DeviceType[]).map((type) => {
            const config = deviceTypeConfig[type];
            const Icon = config.icon;
            const isSelected = isTypeSelected(type);

            return (
              <Button
                key={type}
                variant="ghost"
                size="sm"
                onClick={() => toggleType(type)}
                className={cn(
                  "rounded-xl transition-all duration-200 flex items-center gap-2 border",
                  isSelected && type === 'CAMERA' && "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/30",
                  isSelected && type === 'DRONE' && "bg-green-500 hover:bg-green-600 text-white border-green-500 shadow-lg shadow-green-500/30",
                  isSelected && type === 'SENSOR' && "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/30",
                  !isSelected && "bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
                )}
              >
                <Icon className="w-4 h-4" />
                {config.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* Live status */}
      <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-semibold tracking-wide text-emerald-500">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        LIVE
      </div>
    </div>
  );
}

