import { useMemo, useState, useEffect, type DragEvent } from 'react'
import { Camera, ChevronDown, ChevronRight, Server } from 'lucide-react'
import { cn } from '@irisdrone/lib/utils'

interface VmsCamera {
  id: string
  name: string
  deviceId: string
  deviceName: string
  deviceHost: string
}

interface ExplorerSidebarProps {
  title: string
  description: string
  cameras: VmsCamera[]
  loading: boolean
  selectedGroup: string
  onSelectedGroupChange: (group: string) => void
  onCameraClick?: (camera: VmsCamera) => void
  onCameraDragStart?: (e: DragEvent, camera: VmsCamera) => void
}

export function VmsExplorerSidebar({
  title,
  description,
  cameras,
  loading,
  selectedGroup,
  onSelectedGroupChange,
  onCameraClick,
  onCameraDragStart,
}: ExplorerSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const [isAllExpanded, setIsAllExpanded] = useState(true)

  const grouped = useMemo(() => {
    const groups = new Map<string, VmsCamera[]>()
    cameras.forEach((cam) => {
      const key = cam.deviceName || 'Unknown Device'
      const existing = groups.get(key) ?? []
      groups.set(key, [...existing, cam])
    })
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [cameras])

  useEffect(() => {
    setExpandedGroups(grouped.map(([name]) => name))
  }, [grouped])

  return (
    <aside className="flex w-full flex-col rounded-2xl border border-white/10 bg-zinc-900/50 shadow-sm lg:w-72">
      <div className="flex-shrink-0 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">{title}</h2>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 rounded-full border-2 border-zinc-700 border-t-amber-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* All cameras group */}
            <div className="rounded-lg border border-white/10 bg-zinc-800/50">
              <button
                onClick={() => {
                  onSelectedGroupChange('All cameras')
                  setIsAllExpanded(!isAllExpanded)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
                  selectedGroup === 'All cameras'
                    ? 'bg-zinc-700/50 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                )}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-zinc-800"
                  onClick={(e) => { e.stopPropagation(); setIsAllExpanded(!isAllExpanded) }}
                >
                  {isAllExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <span className="font-medium">All cameras</span>
                <span className="text-xs text-zinc-500">({cameras.length})</span>
              </button>

              {isAllExpanded && (
                <div className="space-y-1 border-t border-white/10 px-3 py-2">
                  {[...cameras].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((cam) => (
                    <button
                      key={`${cam.deviceId}-${cam.id}`}
                      draggable
                      onDragStart={(e) => onCameraDragStart?.(e, cam)}
                      onClick={() => onCameraClick?.(cam)}
                      className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-400 transition hover:bg-zinc-700/50 hover:text-zinc-200"
                      title="Drag into grid or click to add"
                    >
                      <Camera className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300" />
                      <div className="flex flex-1 flex-col overflow-hidden">
                        <span className="truncate font-medium text-zinc-200">{cam.name}</span>
                        <span className="truncate text-[11px] text-zinc-500">{cam.deviceName}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Per-device groups */}
            {grouped.map(([deviceName, groupCameras]) => {
              const isExpanded = expandedGroups.includes(deviceName)
              const toggleGroup = () =>
                setExpandedGroups((prev) =>
                  isExpanded ? prev.filter((n) => n !== deviceName) : [...prev, deviceName]
                )

              return (
                <div key={deviceName} className="rounded-lg border border-white/10 bg-zinc-800/50">
                  <button
                    onClick={() => onSelectedGroupChange(deviceName)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition',
                      selectedGroup === deviceName
                        ? 'bg-zinc-700/50 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    )}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-zinc-800"
                      onClick={(e) => { e.stopPropagation(); toggleGroup() }}
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                    <Server className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="truncate font-medium">{deviceName}</span>
                    <span className="text-xs text-zinc-500">({groupCameras.length})</span>
                  </button>

                  {isExpanded && (
                    <div className="space-y-1 border-t border-white/10 px-3 py-2">
                      {[...groupCameras].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((cam) => (
                        <button
                          key={`${cam.deviceId}-${cam.id}`}
                          draggable
                          onDragStart={(e) => onCameraDragStart?.(e, cam)}
                          onClick={() => onCameraClick?.(cam)}
                          className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-400 transition hover:bg-zinc-700/50 hover:text-zinc-200"
                          title="Drag into grid or click to add"
                        >
                          <Camera className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300" />
                          <div className="flex flex-1 flex-col overflow-hidden">
                            <span className="truncate font-medium text-zinc-200">{cam.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}

export type { VmsCamera }
