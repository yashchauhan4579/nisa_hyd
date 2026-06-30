import { useMemo, useState, useEffect, type DragEvent } from 'react';
import { Camera, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Flat camera shape (adapted from MagicBox's Go sql.NullString model to ours).
export interface VmsCamera {
  id: string;
  name: string;
  location: string;
  status: string; // "online" | "offline"
}

interface Props {
  title: string;
  description: string;
  cameras: VmsCamera[];
  selectedGroup: string;
  onSelectedGroupChange: (group: string) => void;
  onCameraClick?: (cameraId: string) => void;
  onCameraDragStart?: (e: DragEvent, cameraId: string) => void;
  draggableCameras?: boolean;
}

const byName = (a: VmsCamera, b: VmsCamera) =>
  (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });

function CameraRow({ camera, draggable, onCameraClick, onCameraDragStart }: {
  camera: VmsCamera; draggable: boolean;
  onCameraClick?: (id: string) => void;
  onCameraDragStart?: (e: DragEvent, id: string) => void;
}) {
  return (
    <button
      draggable={draggable}
      onDragStart={(e) => onCameraDragStart?.(e, camera.id)}
      onClick={(e) => { e.stopPropagation(); onCameraClick?.(camera.id); }}
      className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm
                 text-muted-foreground transition hover:bg-muted hover:text-foreground"
      title={draggable ? 'Drag into the wall or click to add' : camera.name}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full',
        camera.status === 'online' ? 'bg-emerald-400' : 'bg-zinc-600')} />
      <Camera className="h-4 w-4 text-muted-foreground/70 group-hover:text-foreground" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <span className="truncate font-medium text-foreground">{camera.name}</span>
        {camera.location && <span className="truncate text-[11px] text-muted-foreground">{camera.location}</span>}
      </div>
    </button>
  );
}

export function VmsExplorerSidebar({
  title, description, cameras, selectedGroup,
  onSelectedGroupChange, onCameraClick, onCameraDragStart, draggableCameras = false,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [allExpanded, setAllExpanded] = useState(true);

  const groupedCameras = useMemo(() => {
    const groups = new Map<string, VmsCamera[]>();
    cameras.forEach((c) => {
      const loc = c.location?.trim() || 'Unassigned';
      groups.set(loc, [...(groups.get(loc) ?? []), c]);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [cameras]);

  useEffect(() => { setExpandedGroups(groupedCameras.map(([loc]) => loc)); }, [groupedCameras]);

  return (
    <aside className="flex w-full flex-col rounded-2xl border border-border bg-card shadow-sm lg:w-72">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground/80">{description}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {/* All cameras */}
          <div className="rounded-lg border border-border bg-background">
            <button
              onClick={() => { onSelectedGroupChange('All cameras'); setAllExpanded(!allExpanded); }}
              className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
                selectedGroup === 'All cameras'
                  ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card"
                onClick={(e) => { e.stopPropagation(); setAllExpanded(!allExpanded); }}>
                {allExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </span>
              <span className="font-medium">All cameras</span>
              <span className="text-xs text-muted-foreground">({cameras.length})</span>
            </button>
            {allExpanded && (
              <div className="space-y-1 border-t border-border px-3 py-2">
                {[...cameras].sort(byName).map((c) => (
                  <CameraRow key={c.id} camera={c} draggable={draggableCameras}
                    onCameraClick={onCameraClick} onCameraDragStart={onCameraDragStart} />
                ))}
              </div>
            )}
          </div>

          {/* Grouped by location */}
          <div className="space-y-2">
            {groupedCameras.map(([location, groupCameras]) => {
              const isExpanded = expandedGroups.includes(location);
              const toggle = () => setExpandedGroups((p) =>
                isExpanded ? p.filter((n) => n !== location) : [...p, location]);
              return (
                <div key={location} className="rounded-lg border border-border bg-background">
                  <button onClick={() => onSelectedGroupChange(location)}
                    className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition',
                      selectedGroup === location
                        ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card"
                      onClick={(e) => { e.stopPropagation(); toggle(); }}>
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                    <span className="truncate font-medium">{location}</span>
                    <span className="text-xs text-muted-foreground">({groupCameras.length})</span>
                  </button>
                  {isExpanded && (
                    <div className="space-y-1 border-t border-border px-3 py-2">
                      {[...groupCameras].sort(byName).map((c) => (
                        <CameraRow key={c.id} camera={c} draggable={draggableCameras}
                          onCameraClick={onCameraClick} onCameraDragStart={onCameraDragStart} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
