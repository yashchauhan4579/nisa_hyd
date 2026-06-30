import { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { apiClient, type Device, type Vehicle, type VehicleType } from '@sringeri/lib/api';
import { Search, Loader2, Car, Eye, X, ChevronLeft, ChevronRight, Bike, Truck, Bus, LayoutGrid, Plus, MapPin, CalendarClock, ChevronDown, type LucideIcon } from 'lucide-react';
import { HudBadge } from '@sringeri/components/ui/hud-badge';
import { Button } from '@sringeri/components/ui/button';
import { Card } from '@sringeri/components/ui/card';
import { Input } from '@sringeri/components/ui/input';
import { Select } from '@sringeri/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@sringeri/components/ui/popover';
import { DateTimeRangeContent, type DateTimeRange } from '@sringeri/components/vcc/DateTimeRangePicker';
import { cn } from '@sringeri/lib/utils';
import { VehicleDetail } from './VehicleDetail';
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from '@sringeri/components/ui/empty';
import { SmoothImg } from '@sringeri/components/ui/smooth-img';
import { FilterBar } from '@sringeri/components/ui/filter-bar';

const PAGE_SIZE = 25;

const WATCHLIST_REASONS = [
  'Stolen Vehicle', 'Crime Involved', 'Suspicious Activity',
  'Wanted Person', 'Traffic Violation History', 'Other',
];

const TYPE_VARIANTS: Record<VehicleType, 'info' | 'success' | 'warning' | 'danger' | 'default' | 'secondary'> = {
  '2W': 'info', '4W': 'success', 'AUTO': 'warning',
  'TRUCK': 'danger', 'BUS': 'default', 'UNKNOWN': 'secondary',
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateString: string) {
  // Date + time so the card shows WHEN the vehicle was detected, not just the day.
  return new Date(dateString).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ANPRDashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');
  const [locationKey, setLocationKey] = useState<string>('');
  const [timeRange, setTimeRange] = useState<DateTimeRange | null>(null);
  const [cameras, setCameras] = useState<Device[]>([]);

  // Group cameras by derived location (first token of the camera name).
  // Selecting a location filters by every camera that belongs to it.
  const camerasByLocation = useMemo(() => {
    const map = new Map<string, Device[]>();
    for (const c of cameras) {
      const key = deriveLocationKey(c.name || c.id);
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [cameras]);

  const selectedDeviceIds = useMemo(() => {
    if (!locationKey) return '';
    return (camerasByLocation.get(locationKey) ?? []).map((c) => c.id).join(',');
  }, [locationKey, camerasByLocation]);
  const [showAddWatchlistDialog, setShowAddWatchlistDialog] = useState(false);
  const [watchlistPlate, setWatchlistPlate] = useState('');
  const [watchlistReason, setWatchlistReason] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFetchingRef = useRef(false);
  const filtersActive = !!(searchQuery || vehicleType || locationKey || timeRange);

  const fetchVehicles = async (pageOverride?: number, silent = false) => {
    if (isFetchingRef.current) return;
    const currentPage = pageOverride ?? page;
    try {
      isFetchingRef.current = true;
      if (!silent) setLoading(true);
      const result = await apiClient.getVehicles({
        plateNumber: searchQuery || undefined,
        vehicleType: vehicleType || undefined,
        deviceId: selectedDeviceIds || undefined,
        startTime: timeRange ? timeRange.startDate.toISOString() : undefined,
        endTime: timeRange ? timeRange.endDate.toISOString() : undefined,
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE,
        orderBy: 'last_seen',
        orderDir: 'desc',
        // Server-side filter for OCR junk: drops partial reads <6 chars,
        // so each page actually returns 25 valid plates and the grid
        // doesn't have to render placeholder slots for filtered rows.
        minPlateLength: 6,
      });
      setVehicles(result.vehicles);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch vehicles:', err);
    } finally {
      isFetchingRef.current = false;
      if (!silent) setLoading(false);
    }
  };

  // Load camera list once for the location dropdown
  useEffect(() => {
    let cancelled = false;
    apiClient
      .getDevices({ type: 'CAMERA' })
      .then((res) => {
        if (cancelled) return;
        const list = (res as Device[]).slice().sort((a, b) =>
          (a.name || a.id).localeCompare(b.name || b.id),
        );
        setCameras(list);
      })
      .catch((err) => console.error('Failed to load cameras for ANPR filter:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset to page 0 and fetch when filters/search change
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(0);
      fetchVehicles(0);
    }, 400);
    return () => clearTimeout(timeout);
  }, [vehicleType, searchQuery, locationKey, timeRange]);

  // Fetch when page changes
  useEffect(() => {
    fetchVehicles();
  }, [page]);

  // Auto-poll every 1s on page 0 with no filters (like violations page)
  useEffect(() => {
    if (page !== 0 || filtersActive) return;
    const id = setInterval(() => fetchVehicles(0, true), 1000);
    return () => clearInterval(id);
  }, [page, filtersActive]);

  const goToPage = (p: number) => {
    if (p < 0 || p >= totalPages) return;
    setPage(p);
    window.scrollTo(0, 0);
  };

  const handleAddToWatchlist = async () => {
    if (!watchlistPlate.trim() || !watchlistReason.trim()) {
      alert('Please provide plate number and reason');
      return;
    }
    try {
      await apiClient.createWatchlistByPlate({
        plateNumber: watchlistPlate.trim().toUpperCase(),
        reason: watchlistReason,
        addedBy: 'user',
        alertOnDetection: true,
        alertOnViolation: true,
      });
      setShowAddWatchlistDialog(false);
      setWatchlistPlate('');
      setWatchlistReason('');
      fetchVehicles();
    } catch (err: any) {
      alert(err.message || 'Failed to add to watchlist');
    }
  };

  return (
    <div className="h-full w-full flex flex-col text-white overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-4">
        {/* Page header strip */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <Car className="w-4 h-4 text-amber-300" />
            <span className="text-xs font-bold text-zinc-100 uppercase tracking-[0.18em]">
              ANPR · Vehicles
            </span>
            <HudBadge variant="secondary">{total.toLocaleString()}</HudBadge>
          </div>
          <button
            onClick={() => setShowAddWatchlistDialog(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add to Watchlist
          </button>
        </div>

        {/* Filter Bar */}
        <FilterBar
          className="anpr-filter-bar"
          leading={
            <div className="flex items-end gap-6 flex-wrap">
              <FilterField label="Plate" icon={Search}>
                <div className="relative" style={{ width: 240 }}>
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#7d9fa6' }} />
                  <Input
                    placeholder="KA01AB1234…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 !h-9"
                  />
                </div>
              </FilterField>
              <FilterField label="Location" icon={MapPin}>
                <LocationFilter
                  value={locationKey}
                  onChange={setLocationKey}
                  camerasByLocation={camerasByLocation}
                />
              </FilterField>
              <FilterField label="Time" icon={CalendarClock}>
                <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
              </FilterField>
            </div>
          }
          groups={[
            {
              id: 'vehicleType',
              label: 'Vehicle Type',
              icon: Car,
              value: vehicleType || 'all',
              defaultValue: 'all',
              onChange: (v) => setVehicleType(v === 'all' ? '' : (v as VehicleType)),
              options: [
                { value: 'all', label: 'All', icon: LayoutGrid },
                { value: '2W', label: '2W', icon: Bike },
                { value: '4W', label: '4W', icon: Car },
                { value: 'AUTO', label: 'Auto', icon: Car },
                { value: 'TRUCK', label: 'Truck', icon: Truck },
                { value: 'BUS', label: 'Bus', icon: Bus },
              ],
            },
          ]}
        />
      </div>

      {/* ── Content area (grid + pagination + slide-over scoped here) ── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">

      {/* ── Grid ── */}
      <div className="flex-1 overflow-y-auto p-4 pb-2">
        {loading && vehicles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-7 h-7 animate-spin text-amber-500 mx-auto" />
          </div>
        ) : vehicles.length === 0 ? (
          <Empty className="h-full">
            <EmptyIcon><Car /></EmptyIcon>
            <EmptyTitle>No vehicles found</EmptyTitle>
            <EmptyDescription>Try adjusting your search or filters.</EmptyDescription>
          </Empty>
        ) : (
          <div className={cn(
            // Fixed 5×5 frame: 5 columns, 5 equal-height rows.
            // Combined with the placeholder padding below, every page
            // renders exactly 25 same-sized slots regardless of how
            // many real results there are.
            "grid gap-3 grid-cols-5 grid-rows-5 auto-rows-fr",
            loading && "opacity-60 pointer-events-none"
          )}>
            {vehicles.map((vehicle) => {
              // Derive a thumbnail from the preloaded latest detection.
              const latestDet = vehicle.detections?.[0];
              const thumb =
                vehicle.thumbnailUrl ||
                latestDet?.vehicleImageUrl ||
                latestDet?.fullImageUrl ||
                latestDet?.plateImageUrl ||
                undefined;
              return (
              <Card
                key={vehicle.id}
                onClick={() => setSelectedVehicle(vehicle)}
                className="group cursor-pointer bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-900/20 transition-all duration-200"
              >
                {/* Image */}
                <div className="aspect-[4/3] relative overflow-hidden bg-zinc-900">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={vehicle.plateNumber || 'Vehicle'}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-700 opacity-30">
                      <Car className="w-1/3 h-1/3" />
                    </div>
                  )}
                  {vehicle.isWatchlisted && (
                    <div className="absolute top-1.5 right-1.5">
                      <span className="flex items-center gap-0.5 bg-yellow-500/90 text-black text-[9px] font-bold px-1.5 py-0.5 rounded">
                        <Eye className="w-2.5 h-2.5" /> Watch
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-1.5 left-1.5">
                    <HudBadge variant={TYPE_VARIANTS[vehicle.vehicleType] ?? 'secondary'} size="sm">
                      {vehicle.vehicleType}
                    </HudBadge>
                  </div>
                </div>
                {/* Info */}
                <div className="px-2.5 py-2">
                  <div className="font-mono font-bold text-xs text-white truncate">
                    {vehicle.plateNumber || 'UNKNOWN'}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] text-zinc-500">{vehicle.detectionCount} hits</span>
                    <span className="text-[10px] text-zinc-600">{formatDateTime(vehicle.matchedAt || vehicle.lastSeen)}</span>
                  </div>
                </div>
              </Card>
            );
            })}
            {/* Pad to PAGE_SIZE so every page renders the same 5×5 grid
                even when the result set isn't a full page. Same
                background colour as the real cards so the slot is
                visible (don't draw blank holes — that looked
                inconsistent across pages). */}
            {Array.from({ length: Math.max(0, PAGE_SIZE - vehicles.length) }).map((_, i) => (
              <div
                key={`placeholder-${i}`}
                aria-hidden
                className="bg-zinc-900/30 border border-dashed border-white/5 rounded-xl"
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-t border-white/5 bg-zinc-950/40">
          <span className="text-xs text-zinc-500">{total.toLocaleString()} vehicles</span>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" className="h-7 px-3 text-xs border-white/10" disabled={page === 0 || loading} onClick={() => goToPage(page - 1)}>
              <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
            </Button>
            <span className="text-xs text-zinc-400">Page {page + 1} of {totalPages}</span>
            <Button size="sm" variant="outline" className="h-7 px-3 text-xs border-white/10" disabled={page >= totalPages - 1 || loading} onClick={() => goToPage(page + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Detail slide-over (scoped below top bar) ── */}
      {selectedVehicle && (
        <>
          <div
            className="absolute inset-0 bg-black/60 z-40 backdrop-blur-[2px]"
            onClick={() => setSelectedVehicle(null)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl z-50 flex flex-col shadow-2xl shadow-black/60 border-l border-white/10 bg-zinc-950 animate-in slide-in-from-right duration-200">
            <VehicleDetail
              vehicle={selectedVehicle}
              onClose={() => setSelectedVehicle(null)}
              onUpdate={fetchVehicles}
            />
          </div>
        </>
      )}

      </div>{/* end content area */}

      {/* ── Add Watchlist Dialog ── */}
      {showAddWatchlistDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <Card className="border border-white/10 bg-zinc-900 rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add to Watchlist</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowAddWatchlistDialog(false); setWatchlistPlate(''); setWatchlistReason(''); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Plate Number *</label>
                <Input value={watchlistPlate} onChange={(e) => setWatchlistPlate(e.target.value.toUpperCase())} placeholder="KA01AB1234" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Reason *</label>
                <select
                  value={watchlistReason}
                  onChange={(e) => setWatchlistReason(e.target.value)}
                  className="w-full h-10 rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select a reason...</option>
                  {WATCHLIST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={() => { setShowAddWatchlistDialog(false); setWatchlistPlate(''); setWatchlistReason(''); }}>Cancel</Button>
                <Button onClick={handleAddToWatchlist}>Add</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// Wraps a leading filter control with the same label-on-top structure that
// FilterBar uses for its pill groups, so search / select / range pickers line
// up with the Vehicle Type group instead of floating mid-row.
function FilterField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
        <Icon className="w-3 h-3" strokeWidth={1.75} />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function LocationFilter({
  value,
  onChange,
  camerasByLocation,
}: {
  value: string;
  onChange: (key: string) => void;
  camerasByLocation: Map<string, Device[]>;
}) {
  const options = useMemo(() => {
    const entries = Array.from(camerasByLocation.entries())
      .map(([key, list]) => ({
        value: key,
        label: prettyLocation(key),
        count: list.length,
      }))
      // Push "Other" to the bottom; otherwise alphabetical.
      .sort((a, b) => {
        if (a.value === 'OTHER') return 1;
        if (b.value === 'OTHER') return -1;
        return a.label.localeCompare(b.label);
      });
    return [
      { value: '', label: 'All locations', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
      ...entries.map((e) => ({
        value: e.value,
        label: `${e.label} (${e.count})`,
        icon: <MapPin className="w-3.5 h-3.5" />,
      })),
    ];
  }, [camerasByLocation]);

  return (
    <div className="flex items-center gap-1">
      <Select
        value={value}
        onValueChange={onChange}
        options={options}
        placeholder="All locations"
        searchable
        className="min-w-[220px]"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-zinc-500 hover:text-white transition-colors"
          aria-label="Clear location filter"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// Derive a stable location bucket from a camera name. Cameras follow loose
// "<LOCATION>_<JUNCTION>_CAM<N>" / "<Location> <Junction> Cam<N>" shapes;
// we take the first underscore- or whitespace-separated token (after
// stripping a leading "Camera " label) and uppercase it. Generic "CAM*" or
// "TEST*" first-tokens fall into "OTHER" so the dropdown stays clean.
function deriveLocationKey(rawName: string): string {
  const stripped = rawName.replace(/^\s*camera\s+/i, '').trim();
  if (!stripped) return 'OTHER';
  const first = stripped.split(/[\s_]+/, 1)[0].toUpperCase();
  if (!first) return 'OTHER';
  if (/^CAM\d*$/.test(first)) return 'OTHER';
  if (first === 'TEST') return 'OTHER';
  return first;
}

function prettyLocation(key: string): string {
  if (key === 'OTHER') return 'Other';
  // Title-case so the dropdown reads "Athani" / "Gokak" not "ATHANI".
  return key.charAt(0) + key.slice(1).toLowerCase();
}

function TimeRangeFilter({
  value,
  onChange,
}: {
  value: DateTimeRange | null;
  onChange: (range: DateTimeRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Draft: when no committed range exists yet, default to last 24h.
  const [draft, setDraft] = useState<DateTimeRange>(() => {
    if (value) return value;
    const end = new Date();
    const start = new Date();
    start.setHours(start.getHours() - 24);
    return { startDate: start, endDate: end };
  });

  useEffect(() => {
    if (value) setDraft(value);
  }, [value]);

  const label = value
    ? `${format(value.startDate, 'MMM d, HH:mm')} – ${format(value.endDate, 'MMM d, HH:mm')}`
    : 'Any time';

  const handleApply = (range: DateTimeRange) => {
    if (range.startDate >= range.endDate) {
      onChange({ startDate: range.endDate, endDate: range.startDate });
    } else {
      onChange(range);
    }
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o && value) setDraft(value);
          setOpen(o);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 bg-zinc-900/50 border-white/10 text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            <CalendarClock className="mr-2 h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs truncate max-w-[260px]">{label}</span>
            <ChevronDown className="ml-2 h-3 w-3 text-zinc-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 min-w-[520px] bg-zinc-950 border-white/10"
          align="start"
        >
          <DateTimeRangeContent
            value={draft}
            onChange={setDraft}
            showFooter={false}
          />
          <div className="flex justify-between items-center px-4 py-3 border-t border-white/10">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              disabled={!value}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Clear
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => handleApply(draft)}>
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-zinc-500 hover:text-white transition-colors"
          aria-label="Clear time filter"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
