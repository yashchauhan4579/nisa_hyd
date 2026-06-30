import { useState, useEffect } from 'react';
import { apiClient, type Vehicle, type VehicleType, type TrafficViolation } from '@/lib/api';
import { Search, Filter, Loader2, Car, Eye, EyeOff, TrendingUp, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FaMotorcycle, FaCar, FaTaxi, FaBus, FaTruck } from 'react-icons/fa';
import { cn } from '@/lib/utils';
import { DateTimeRangePicker, type DateTimeRange } from '@/components/tvcc/DateTimeRangePicker';
import { VehicleDetail } from './VehicleDetail';

const VEHICLE_TYPE_OPTIONS = [
  { value: '2W', label: '2 Wheeler', Icon: FaMotorcycle },
  { value: '4W', label: '4 Wheeler', Icon: FaCar },
  { value: 'AUTO', label: 'Auto', Icon: FaTaxi },
  { value: 'BUS', label: 'Bus', Icon: FaBus },
  { value: 'HMV', label: 'Heavy Vehicle', Icon: FaTruck },
] as const;

export function ANPRDashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Fallback: violations for a searched plate that has NO vehicle record (the
  // plate only exists in traffic_violations, vehicle_id NULL) so search still works.
  const [plateViolations, setPlateViolations] = useState<TrafficViolation[]>([]);
  const [cameras, setCameras] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState({
    vehicleType: '' as VehicleType | '',
    watchlisted: '',
    cameraId: '',
  });
  // Date range — defaults to the last 30 days (presets cover 24h/7d/etc).
  const [dateRange, setDateRange] = useState<DateTimeRange>(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startDate: start, endDate: end };
  });

  // Camera list from the devices table (the camera = location selector).
  useEffect(() => {
    apiClient.getDevices({ type: 'CAMERA' })
      .then((devs) => setCameras((devs as { id: string; name: string }[]).map((d) => ({
        id: d.id,
        name: (d.name || d.id).replace(/^Camera\s+/i, ''),
      }))))
      .catch(() => {});
  }, []);

  const deviceIds = filters.cameraId;

  const hasActiveFilters =
    !!searchQuery || !!filters.vehicleType || !!filters.watchlisted || !!filters.cameraId;

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({ vehicleType: '', watchlisted: '', cameraId: '' });
  };

  const fetchVehicles = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const result = await apiClient.getVehicles({
        plateNumber: searchQuery || undefined,
        vehicleType: filters.vehicleType || undefined,
        deviceIds: deviceIds || undefined,
        watchlisted: filters.watchlisted === 'true' ? true : filters.watchlisted === 'false' ? false : undefined,
        startTime: dateRange.startDate.toISOString(),
        endTime: dateRange.endDate.toISOString(),
        limit: 100,
        orderBy: 'last_seen',
        orderDir: 'desc',
      });
      setVehicles(result.vehicles);

      // If a plate search found no vehicle record, look for violations on that
      // plate (they live in a separate table with no vehicle row).
      const q = searchQuery.trim();
      if (q && result.vehicles.length === 0) {
        const v = await apiClient.getViolations({ plateNumber: q, limit: 24 }).catch(() => null);
        setPlateViolations(v?.violations ?? []);
      } else if (plateViolations.length) {
        setPlateViolations([]);
      }
    } catch (err) {
      console.error('Failed to fetch vehicles:', err);
      setError('Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, searchQuery, deviceIds, dateRange]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchVehicles(true);
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, searchQuery, deviceIds, dateRange]);

  const getVehicleTypeColor = (type: VehicleType) => {
    const colors: Record<VehicleType, string> = {
      '2W': 'bg-amber-500',
      '4W': 'bg-green-500',
      'AUTO': 'bg-yellow-500',
      'BUS': 'bg-amber-500',
      'HMV': 'bg-red-500',
      'UNKNOWN': 'bg-gray-500',
    };
    return colors[type] || 'bg-gray-500';
  };

  // Date + time (IST) — operators need the sighting time, not just the day.
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  };

  // A plate is only "real" with >= 7 alphanumeric chars — hide partial reads
  // and UNKNOWN (no plate) so the list shows actionable detections only.
  const plateChars = (p?: string | null) => (p || '').replace(/[^a-zA-Z0-9]/g, '').length;
  const visibleVehicles = vehicles.filter((v) => plateChars(v.plateNumber) >= 7);

  if (loading && vehicles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400">Loading vehicles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 p-4">
      {/* Left Panel - Search and Filters */}
      <div className="w-80 shrink-0 flex flex-col gap-4">
        <Card className="glass p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">ANPR System</h2>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by plate number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filters */}
          <div className="space-y-2.5 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Filters</span>
              </div>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
                  Clear all
                </button>
              )}
            </div>

            {/* Date range */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Date Range</label>
              <DateTimeRangePicker value={dateRange} onChange={setDateRange} />
            </div>

            {/* Camera */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Camera</label>
              <select
                value={filters.cameraId}
                onChange={(e) => setFilters({ ...filters, cameraId: e.target.value })}
                className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">All cameras</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Vehicle type — clickable icon boxes */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Vehicle Type</label>
              <div className="grid grid-cols-5 gap-1.5">
                {VEHICLE_TYPE_OPTIONS.map(({ value, label, Icon }) => {
                  const active = filters.vehicleType === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      title={label}
                      onClick={() => setFilters({ ...filters, vehicleType: active ? '' : value })}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 py-2 rounded-md border text-[10px] font-medium transition-colors',
                        active
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                          : 'border-input bg-background text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Watchlist */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Watchlist</label>
              <select
                value={filters.watchlisted}
                onChange={(e) => setFilters({ ...filters, watchlisted: e.target.value })}
                className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">All</option>
                <option value="true">Watchlisted</option>
                <option value="false">Not Watchlisted</option>
              </select>
            </div>
          </div>

        </Card>
      </div>

      {/* Right Panel - Detail View, or the full vehicle grid */}
      <div className="flex-1 min-w-0">
        {selectedVehicle ? (
          <VehicleDetail
            vehicle={selectedVehicle}
            onClose={() => setSelectedVehicle(null)}
            onUpdate={() => fetchVehicles()}
          />
        ) : visibleVehicles.length === 0 && searchQuery.trim() && plateViolations.length > 0 ? (
          // No vehicle record, but the plate appears in violations — surface those.
          <div className="h-full overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
            <Card className="glass p-3 mb-3 border-amber-500/30 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0 text-sm">
                No ANPR vehicle record for <span className="font-mono font-semibold">{searchQuery.trim()}</span> —
                showing <span className="font-semibold">{plateViolations.length}</span> violation{plateViolations.length > 1 ? 's' : ''} for this plate.
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => window.open('/itms/violations', '_blank', 'noopener,noreferrer')}>
                Open in Violations
              </Button>
            </Card>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {plateViolations.map((v) => (
                <Card
                  key={v.id}
                  onClick={() => window.open(`/itms/anpr/${v.id}?src=violation`, '_blank', 'noopener,noreferrer')}
                  className="glass p-0 overflow-hidden cursor-pointer hover:ring-2 hover:ring-amber-500/40 transition-all"
                >
                  <div className="aspect-video bg-black/40 relative flex items-center justify-center">
                    {(v.fullSnapshotUrl || v.plateImageUrl) ? (
                      <img src={v.fullSnapshotUrl || v.plateImageUrl || ''} alt="violation" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <AlertTriangle className="w-8 h-8 text-muted-foreground/40" />
                    )}
                    <Badge className="absolute top-1 left-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5">{v.violationType}</Badge>
                  </div>
                  <div className="p-2">
                    <div className="font-mono font-semibold text-sm truncate">{v.plateNumber || searchQuery.trim()}</div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{formatDate(v.timestamp)}</div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : visibleVehicles.length === 0 ? (
          <Card className="glass h-full flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <Car className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{vehicles.length > 0 ? 'No full plates in view' : 'No vehicles found'}</p>
            </div>
          </Card>
        ) : (
          <div className="h-full overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {visibleVehicles.map((vehicle) => {
                const det = vehicle.detections?.[0];
                const img = det?.vehicleImageUrl || det?.fullImageUrl || det?.plateImageUrl;
                return (
                  <Card
                    key={vehicle.id}
                    onClick={() => setSelectedVehicle(vehicle)}
                    className="glass p-0 overflow-hidden cursor-pointer hover:ring-2 hover:ring-amber-500/40 transition-all"
                  >
                    {/* Image — click opens the vehicle detail page in a new tab (keeps the grid open) */}
                    <div className="aspect-video bg-black/40 relative flex items-center justify-center">
                      {img ? (
                        <img
                          src={img}
                          alt={vehicle.plateNumber || 'vehicle'}
                          className="w-full h-full object-cover cursor-pointer"
                          loading="lazy"
                          title="Open vehicle details in new tab"
                          onClick={(e) => { e.stopPropagation(); window.open(`/itms/anpr/${vehicle.id}`, '_blank', 'noopener,noreferrer'); }}
                        />
                      ) : (
                        <Car className="w-8 h-8 text-muted-foreground/40" />
                      )}
                      <Badge className={cn('absolute top-1 left-1 text-[10px] px-1.5 py-0.5 text-white', getVehicleTypeColor(vehicle.vehicleType))}>
                        {vehicle.vehicleType}
                      </Badge>
                      {vehicle.isWatchlisted && (
                        <span className="absolute top-1 right-1 bg-black/70 rounded p-0.5">
                          <Eye className="w-3.5 h-3.5 text-yellow-500" />
                        </span>
                      )}
                    </div>
                    {/* Meta */}
                    <div className="p-2">
                      <div className="font-mono font-semibold text-sm truncate">{vehicle.plateNumber || 'UNKNOWN'}</div>
                      {vehicle.make && vehicle.model && (
                        <div className="text-[11px] text-muted-foreground truncate">{vehicle.make} {vehicle.model}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {vehicle.detectionCount} • {formatDate(vehicle.lastSeen)}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

