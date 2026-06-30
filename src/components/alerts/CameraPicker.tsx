// CameraPicker — multi-select list of cameras (id + name + location) used by
// the alert form to scope a rule to specific cameras. Empty selection = all
// cameras (matches the backend's "empty deviceIds means all" semantics).
import { useEffect, useMemo, useState } from 'react';
import { Search, Check, List, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { apiClient, type Device } from '@/lib/api';
import { CameraMapPicker, type MapCamera } from '@/components/maps/CameraMapPicker';

interface CameraPickerProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function CameraPicker({ selected, onChange }: CameraPickerProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'list' | 'map'>('list');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = (await apiClient.getDevices({ type: 'CAMERA' })) as Device[];
        if (alive) setDevices(Array.isArray(res) ? res : []);
      } catch {
        if (alive) setDevices([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        (d.name ?? '').toLowerCase().includes(q) ||
        (d.zoneId ?? '').toLowerCase().includes(q),
    );
  }, [devices, query]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const mapCams: MapCamera[] = useMemo(
    () => devices.map((d) => ({ id: d.id, name: d.name || d.id, lat: d.lat, lng: d.lng, status: String(d.status) })),
    [devices],
  );

  return (
    <div className="space-y-2">
      {/* List | Map toggle */}
      <div className="flex gap-1.5">
        {([['list', 'List', List], ['map', 'Map', MapPin]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
              mode === k ? 'border-amber-500 bg-amber-500 text-black' : 'border-border bg-background/60 text-foreground hover:bg-accent'
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {mode === 'map' ? (
        <CameraMapPicker cameras={mapCams} selected={selected} onChange={onChange} height={300} />
      ) : (
      <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cameras by name or location…"
          className="pl-8"
        />
      </div>

      <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background/60">
        {loading ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Loading cameras…</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">No cameras found.</p>
        ) : (
          filtered.map((d) => {
            const on = selected.includes(d.id);
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => toggle(d.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent"
              >
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                  }`}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{d.name || d.id}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {d.id}
                    {d.zoneId ? ` · ${d.zoneId}` : ''}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
      </>
      )}

      <p className="text-[11px] text-muted-foreground">
        {selected.length === 0
          ? 'No cameras selected — rule applies to all cameras.'
          : `${selected.length} camera${selected.length > 1 ? 's' : ''} selected.`}
      </p>
    </div>
  );
}
