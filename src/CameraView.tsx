import { useState, useEffect, useMemo, useRef } from 'react';
import { type Device, type Worker } from '@/lib/api';
import { Camera, ChevronDown, ChevronRight, LayoutGrid, Maximize2, Minimize2 } from 'lucide-react';
import { useCameraGrid } from '@/contexts/CameraGridContext';
import { cn } from '@/lib/utils';
import { WhepPlayer } from '@/components/video/WhepPlayer';
import { useTheme } from '@/contexts/ThemeContext';

// Mapping helper
interface CameraHealth {
  id: string; // IP
  cameraId: string; // Name
  location: string;
  status: string;
}

interface GridSlot {
  id: string;
  deviceId: string | null;
  device: Device | null;
  fullscreenToggleRef?: React.MutableRefObject<(() => void) | undefined>;
}

export function CameraView() {
  const { gridSize, setGridSize, setUsedSlots } = useCameraGrid();
  const [cameras, setCameras] = useState<Device[]>([]);
  const [zones, setZones] = useState<Record<string, Device[]>>({});
  const [fullscreenStates, setFullscreenStates] = useState<Record<number, boolean>>({});
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [gridSlots, setGridSlots] = useState<GridSlot[]>([]);
  const [draggedDevice, setDraggedDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [touchDraggedDevice, setTouchDraggedDevice] = useState<Device | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { theme } = useTheme();

  // Filters
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  const locations = useMemo(() => {
    const locs = new Set(cameras.map(c => c.zoneId).filter(l => l && l !== 'Unassigned'));
    return Array.from(locs).sort();
  }, [cameras]);

  // Get MediaMTX server URL (proxied through /media for HLS, /webrtc for WebRTC)
  const mediaServerUrl = useMemo(() => {
    return '/webrtc';
  }, []);

  // Parse grid size (format: colsxrows, e.g., 2x3 = 2 columns, 3 rows)
  const gridDimensions = useMemo(() => {
    const [cols, rows] = gridSize.split('x').map(Number);
    return { rows, cols, total: rows * cols };
  }, [gridSize]);

  // Initialize grid slots when grid size changes
  useEffect(() => {
    try {
      const savedGridState = localStorage.getItem('cameraGridState');
      if (savedGridState) {
        const parsed = JSON.parse(savedGridState);
        // Only load if grid size matches
        if (parsed.gridSize === gridSize && parsed.slots && parsed.slots.length === gridDimensions.total) {
          // We'll restore devices after cameras are loaded
          const savedSlots = parsed.slots as Array<{ id: string; deviceId: string | null }>;
          setGridSlots(savedSlots.map((s, i) => ({
            id: s.id || `slot-${i}`,
            deviceId: s.deviceId,
            device: null, // Will be restored after cameras load
            fullscreenToggleRef: { current: undefined },
          })));
          return;
        }
      }
    } catch (err) {
      console.error('Failed to load grid state from localStorage:', err);
    }

    // Initialize empty slots if no saved state or grid size changed
    const slots: GridSlot[] = Array.from({ length: gridDimensions.total }, (_, i) => ({
      id: `slot-${i}`,
      deviceId: null,
      device: null,
      fullscreenToggleRef: { current: undefined },
    }));
    setGridSlots(slots);
  }, [gridSize, gridDimensions.total]);

  // Fetch cameras and restore grid state
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/camera-health');
        if (!res.ok) throw new Error('Failed to fetch cameras');

        const healthData: CameraHealth[] = await res.json();
        const devices: Device[] = healthData.map(h => ({
          id: h.id, // IP
          name: h.cameraId, // Name
          type: 'CAMERA',
          status: h.status === 'online' ? 'ACTIVE' : 'INACTIVE',
          zoneId: h.location || 'Unassigned',
          rtspUrl: null,
          lat: 0,
          lng: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));

        setCameras(devices);

        // Group by zone (Location)
        const zonesMap: Record<string, Device[]> = {};
        devices.forEach((device) => {
          const zone = device.zoneId || 'Unassigned';
          if (!zonesMap[zone]) {
            zonesMap[zone] = [];
          }
          zonesMap[zone].push(device);
        });
        setZones(zonesMap);

        // Expand all zones by default
        setExpandedZones(new Set(Object.keys(zonesMap)));

        // Restore devices in grid slots from localStorage
        try {
          const savedGridState = localStorage.getItem('cameraGridState');
          if (savedGridState) {
            const parsed = JSON.parse(savedGridState);
            if (parsed.gridSize === gridSize && parsed.slots && parsed.slots.length === gridDimensions.total) {
              setGridSlots((prevSlots) => {
                // Match saved slots with current slots by index
                return prevSlots.map((slot, index) => {
                  const savedSlot = parsed.slots[index];
                  if (savedSlot && savedSlot.deviceId) {
                    const device = devices.find((d) => d.id === savedSlot.deviceId);
                    return {
                      id: slot.id,
                      deviceId: savedSlot.deviceId,
                      device: device || null,
                      fullscreenToggleRef: slot.fullscreenToggleRef || { current: undefined },
                    };
                  }
                  return slot;
                });
              });
            }
          }
        } catch (err) {
          console.error('Failed to restore grid state:', err);
        }
      } catch (err) {
        console.error('Failed to fetch cameras:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCameras();
  }, [gridSize]); // Should probably depend on gridDimensions too or empty if we handle updates differently

  const toggleZone = (zoneId: string) => {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
      }
      return next;
    });
  };

  const handleDragStart = (device: Device) => {
    setDraggedDevice(device);
  };

  const handleDragEnd = () => {
    setDraggedDevice(null);
  };

  const handleDrop = (slotIndex: number, device?: Device) => {
    const deviceToAdd = device || draggedDevice;
    if (!deviceToAdd) return;

    setGridSlots((prev) => {
      const newSlots = [...prev];
      // Remove device from previous slot if it exists
      const prevSlotIndex = newSlots.findIndex((s) => s.deviceId === deviceToAdd.id);
      if (prevSlotIndex !== -1) {
        newSlots[prevSlotIndex] = {
          id: newSlots[prevSlotIndex].id,
          deviceId: null,
          device: null,
          fullscreenToggleRef: newSlots[prevSlotIndex].fullscreenToggleRef || { current: undefined },
        };
      }
      // Add device to new slot
      newSlots[slotIndex] = {
        id: newSlots[slotIndex].id,
        deviceId: deviceToAdd.id,
        device: deviceToAdd,
        fullscreenToggleRef: newSlots[slotIndex].fullscreenToggleRef || { current: undefined },
      };
      // Update used slots count
      const usedCount = newSlots.filter((s) => s.device).length;
      setUsedSlots(usedCount);

      // Save to localStorage
      try {
        localStorage.setItem('cameraGridState', JSON.stringify({
          gridSize,
          slots: newSlots.map((s) => ({
            id: s.id,
            deviceId: s.deviceId,
          })),
        }));
      } catch (err) {
        console.error('Failed to save grid state to localStorage:', err);
      }

      return newSlots;
    });

    setDraggedDevice(null);
  };

  // Tap to add camera to next available slot
  const handleCameraTap = (device: Device) => {
    // Find first available slot
    const availableSlotIndex = gridSlots.findIndex((slot) => !slot.device);

    if (availableSlotIndex !== -1) {
      handleDrop(availableSlotIndex, device);
    } else {
      // No available slots - replace the first one
      handleDrop(0, device);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Touch event handlers for iPad/mobile support
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
    const dragThreshold = 10;

    if (deltaX > dragThreshold || deltaY > dragThreshold) {
      if (!isDragging) setIsDragging(true);
      e.preventDefault();
      e.stopPropagation();

      const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
      if (elementUnderTouch) {
        const slotElement = elementUnderTouch.closest('[data-slot-index]');
        if (slotElement) {
          // Visual feedback handled by CSS on slot
        }
      }
    }
  };

  const handleTouchEnd = (_e?: React.TouchEvent, slotIndex?: number) => {
    if (!touchDraggedDevice) {
      setTouchStartPos(null);
      setTouchDraggedDevice(null);
      setIsDragging(false);
      return;
    }

    if (isDragging && slotIndex !== undefined) {
      handleDrop(slotIndex);
    }

    setTouchStartPos(null);
    setTouchDraggedDevice(null);
    setIsDragging(false);
  };

  const handleTouchCancel = () => {
    setTouchStartPos(null);
    setTouchDraggedDevice(null);
    setIsDragging(false);
  };

  const removeFromGrid = (slotIndex: number) => {
    setGridSlots((prev) => {
      const newSlots = [...prev];
      newSlots[slotIndex] = {
        id: newSlots[slotIndex].id,
        deviceId: null,
        device: null,
        fullscreenToggleRef: newSlots[slotIndex].fullscreenToggleRef || { current: undefined },
      };
      const usedCount = newSlots.filter((s) => s.device).length;
      setUsedSlots(usedCount);

      try {
        localStorage.setItem('cameraGridState', JSON.stringify({
          gridSize,
          slots: newSlots.map((s) => ({
            id: s.id,
            deviceId: s.deviceId,
          })),
        }));
      } catch (err) {
        console.error('Failed to save grid state to localStorage:', err);
      }

      return newSlots;
    });
  };

  // Update used slots count when grid slots change
  useEffect(() => {
    const usedCount = gridSlots.filter((s) => s.device).length;
    setUsedSlots(usedCount);
  }, [gridSlots, setUsedSlots]);

  const sortedZones = useMemo(() => {
    const visibleZoneIds = Object.keys(zones).filter(zoneId => {
      if (locationFilter !== 'all' && zoneId !== locationFilter) return false;
      return true;
    });

    return visibleZoneIds.sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [zones, locationFilter]);

  const getFilteredCamerasInZone = (zoneId: string) => {
    return zones[zoneId].filter(cam => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'online') return cam.status === 'ACTIVE';
      if (statusFilter === 'offline') return cam.status !== 'ACTIVE';
      return true;
    });
  };

  return (
    <div className="h-full flex">
      {/* Sidebar - Zone and Camera List */}
      <div className={cn(
        "w-64 border-r overflow-y-auto flex flex-col",
        theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-900/50 border-white/5'
      )}>
        <div className={cn(
          "p-4 border-b flex items-center justify-between sticky top-0 bg-inherit z-10",
          theme === 'light' ? 'border-gray-200' : 'border-white/5'
        )}>
          <h2 className={cn(
            "text-sm font-semibold flex items-center gap-2",
            theme === 'light' ? 'text-black' : 'text-white'
          )}>
            <Camera className="w-4 h-4" />
            Cameras ({cameras.length})
          </h2>
        </div>

        {/* Filters */}
        <div className={cn("p-4 space-y-3 border-b", theme === 'light' ? 'border-gray-200' : 'border-white/5')}>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Location</label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className={cn(
                "w-full text-sm p-2 rounded-md border outline-none",
                theme === 'light' ? 'bg-white border-gray-200' : 'bg-black/20 border-white/10 text-gray-300'
              )}
            >
              <option value="all">All Locations</option>
              {locations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 p-1 bg-gray-100 dark:bg-white/5 rounded-lg">
            {(['all', 'online', 'offline'] as const).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "flex-1 text-xs py-1 rounded-md capitalize transition-all",
                  statusFilter === status
                    ? "bg-white dark:bg-white/10 shadow-sm font-medium"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading cameras...</div>
        ) : (
          <div className="p-2 space-y-1 flex-1">
            {sortedZones.map((zoneId) => {
              const zoneCameras = getFilteredCamerasInZone(zoneId);
              if (zoneCameras.length === 0) return null;

              const isExpanded = expandedZones.has(zoneId);

              return (
                <div key={zoneId} className="mb-1">
                  <div
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors group",
                      theme === 'light' ? 'hover:bg-gray-100' : 'hover:bg-white/5'
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={() => toggleZone(zoneId)}>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      )}
                      <span className={cn(
                        "text-sm font-medium truncate",
                        theme === 'light' ? 'text-black' : 'text-gray-300'
                      )}>
                        {zoneId}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        ({zoneCameras.length})
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Find available slots and fill with zoneCameras
                        setGridSlots(prev => {
                          const newSlots = [...prev];
                          let camIndex = 0;
                          // First fill empty slots
                          for (let i = 0; i < newSlots.length && camIndex < zoneCameras.length; i++) {
                            if (!newSlots[i].device) {
                              newSlots[i] = {
                                ...newSlots[i],
                                deviceId: zoneCameras[camIndex].id,
                                device: zoneCameras[camIndex]
                              };
                              camIndex++;
                            }
                          }
                          // If still cameras left and no empty slots? (Optional: Overwrite or just stop)
                          // User expectation: Play ALL. If grid is small, maybe just fill what fits.
                          return newSlots;
                        });
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-all"
                      title="Play all in this location"
                    >
                      <LayoutGrid className="w-3.5 h-3.5 text-amber-500" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                      {zoneCameras.map((camera) => {
                        const isInGrid = gridSlots.some((s) => s.deviceId === camera.id);
                        return (
                          <div
                            key={camera.id}
                            draggable={!('ontouchstart' in window)}
                            onDragStart={() => handleDragStart(camera)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={(e) => handleTouchStart(e, camera)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={(e) => {
                              if (!isDragging) {
                                e.preventDefault();
                                handleCameraTap(camera);
                                setTouchStartPos(null);
                                setTouchDraggedDevice(null);
                                return;
                              }
                              handleTouchEnd(e);
                            }}
                            onTouchCancel={handleTouchCancel}
                            onClick={(e) => {
                              if (!isDragging && !touchDraggedDevice) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleCameraTap(camera);
                              }
                            }}
                            className={cn(
                              "px-3 py-2 rounded-lg cursor-pointer transition-all select-none",
                              "border flex items-center gap-2",
                              theme === 'light'
                                ? 'bg-white border-gray-200 hover:bg-gray-100'
                                : 'bg-white/5 border-white/10 hover:bg-white/10',
                              "hover:shadow-sm active:scale-95",
                              isInGrid && "opacity-50"
                            )}
                            style={{
                              WebkitUserSelect: 'none',
                              userSelect: 'none',
                              WebkitTouchCallout: 'none',
                              WebkitTapHighlightColor: 'transparent',
                              touchAction: 'manipulation'
                            }}
                          >
                            {/* Status Dot */}
                            <div className={cn(
                              "w-2 h-2 rounded-full flex-shrink-0",
                              camera.status === 'ACTIVE' ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" : "bg-red-500"
                            )} />

                            <span className={cn(
                              "text-xs truncate flex-1",
                              theme === 'light' ? 'text-black' : 'text-gray-300'
                            )}>
                              {(camera.name || camera.id).replace(/^Camera\s+/i, "")}
                            </span>
                            {isInGrid && (
                              <span className="text-xs text-green-500">✓</span>
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

      {/* Main Grid Area */}
      <div className="flex-1 flex flex-col overflow-hidden" ref={(node) => {
        // Store ref to container for fullscreen
        if (node) {
          (window as any).gridContainerRef = node;
        }
      }}>
        {/* Grid Toolbar */}
        <div className={cn(
          "p-3 border-b flex items-center justify-between",
          theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-900/30 border-white/5'
        )}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-gray-500" />
              <span className={cn(
                "text-sm font-medium",
                theme === 'light' ? 'text-gray-700' : 'text-gray-300'
              )}>Grid Layout</span>
            </div>

            {/* Grid Size Buttons */}
            <div className="flex items-center gap-2">
              {(['1x1', '2x2', '3x3', '4x4'] as const).map((size) => {
                const isActive = gridSize === size;
                return (
                  <button
                    key={size}
                    onClick={() => setGridSize(size as any)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                      isActive
                        ? "bg-amber-500 text-white shadow-sm"
                        : theme === 'light'
                          ? "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                          : "bg-white/10 border border-white/10 text-gray-400 hover:bg-white/20"
                    )}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const el = (window as any).gridContainerRef;
                if (!document.fullscreenElement) {
                  el?.requestFullscreen().catch((err: any) => {
                    console.error(`Error attempting to enable fullscreen: ${err.message}`);
                  });
                } else {
                  document.exitFullscreen();
                }
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                theme === 'light'
                  ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                  : "bg-white/10 border border-white/10 text-gray-300 hover:bg-white/20"
              )}
              title="Toggle Fullscreen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Fullscreen Wall</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear all cameras from the grid?')) {
                  setGridSlots(prev => prev.map(s => ({ ...s, deviceId: null, device: null })));
                  setUsedSlots(0);
                  localStorage.removeItem('cameraGridState');
                }
              }}
              className="text-xs text-red-500 hover:text-red-600 font-medium px-3 py-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-transparent hover:border-red-200 flex items-center gap-2"
              title="Remove all cameras from grid"
            >
              <span>Clear All</span>
            </button>
          </div>
        </div>

        {/* Grid Container */}
        <div className="flex-1 p-0.5 overflow-auto bg-gray-100/50 dark:bg-black/20">
          <div
            className="grid gap-[1px] h-full transition-all duration-300 ease-in-out"
            style={{
              gridTemplateColumns: `repeat(${gridDimensions.cols}, minmax(0, 1fr))`,
              gridAutoRows: 'minmax(0, 1fr)', // Use 1fr to share height evenly in fullscreen
            }}
          >
            {gridSlots.map((slot, index) => (
              <div
                key={slot.id}
                data-slot-index={index}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                onTouchEnd={(e) => {
                  if (touchDraggedDevice) {
                    e.preventDefault();
                    handleTouchEnd(undefined, index);
                  }
                }}
                onTouchMove={(e) => {
                  if (touchDraggedDevice) {
                    e.preventDefault();
                    e.stopPropagation(); // prevent header confusion
                  }
                }}
                className={cn(
                  "relative rounded-none border border-solid transition-all select-none overflow-hidden flex flex-col group",
                  slot.device
                    ? "border-gray-800 bg-gray-900/90 dark:bg-black"
                    : "border-gray-800 dark:border-gray-800 bg-gray-100/50 dark:bg-gray-900/30",
                  (draggedDevice || touchDraggedDevice) && !slot.device && "border-amber-400 border-solid bg-amber-50/50 dark:bg-amber-900/20"
                )}
                style={{
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  touchAction: 'none'
                }}
              >
                {slot.device ? (
                  <>
                    <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="bg-black/70 rounded px-2 py-1 flex items-center gap-2">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          slot.device.status === 'ACTIVE' ? "bg-green-500" : "bg-red-500"
                        )} />
                        <p className="text-xs text-white font-medium truncate max-w-[200px]">
                          {(slot.device.name || slot.device.id).replace(/^Camera\s+/i, "")}
                        </p>
                      </div>
                    </div>
                    <div className="flex-1 relative bg-black w-full h-full">
                      <WhepPlayer
                        url={`${mediaServerUrl || ''}/camera_${slot.device.id}`}
                        className="w-full h-full object-contain" // object-contain preserves aspect ratio
                        autoPlay
                        muted
                      />
                    </div>
                    {/* Footer with controls */}
                    <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between">
                      <div className="text-white/90 text-xs font-medium px-1 truncate">
                        {(slot.device.name || slot.device.id).replace(/^Camera\s+/i, "")}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            if (slot.fullscreenToggleRef?.current) {
                              slot.fullscreenToggleRef.current();
                            }
                          }}
                          className="bg-white/20 hover:bg-white/30 rounded p-1.5 transition-colors"
                          title={fullscreenStates[index] ? "Exit fullscreen" : "Enter fullscreen"}
                        >
                          {fullscreenStates[index] ? (
                            <Minimize2 className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Maximize2 className="w-3.5 h-3.5 text-white" />
                          )}
                        </button>
                        <button
                          onClick={() => removeFromGrid(index)}
                          className="bg-red-500/80 hover:bg-red-600 rounded p-1.5 transition-colors"
                          title="Remove from grid"
                        >
                          <span className="text-white text-xs font-bold px-0.5">×</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity">
                    <div className="text-center">
                      <LayoutGrid className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Drop Camera
                      </p>
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
