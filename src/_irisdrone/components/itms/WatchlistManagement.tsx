import { useState, useEffect } from 'react';
import { apiClient, type Watchlist, type Vehicle, type VehicleDetection, type TrafficViolation } from '@irisdrone/lib/api';
import { Eye, Plus, Search, Loader2, X, Trash2, AlertCircle, Clock, MapPin, Camera } from 'lucide-react';
import { Badge } from '@irisdrone/components/ui/badge';
import { HudBadge } from '@irisdrone/components/ui/hud-badge';
import { Button } from '@irisdrone/components/ui/button';
import { Card } from '@irisdrone/components/ui/card';
import { Input } from '@irisdrone/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@irisdrone/components/ui/tabs';
import { ImageModal } from '@irisdrone/components/ui/image-modal';
import { cn } from '@irisdrone/lib/utils';
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from '@irisdrone/components/ui/empty';
import { Select } from '@irisdrone/components/ui/select';
import { cleanDeviceName } from '@irisdrone/lib/displayName';

const WATCHLIST_REASONS = [
  'Stolen Vehicle',
  'Crime Involved',
  'Suspicious Activity',
  'Wanted Person',
  'Traffic Violation History',
  'Other',
];

export function WatchlistManagement() {
  const [watchlist, setWatchlist] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWatchlistItem, setSelectedWatchlistItem] = useState<Watchlist | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEntry, setNewEntry] = useState({
    plateNumber: '',
    reason: '',
    notes: '',
    alertOnDetection: true,
    alertOnViolation: true,
  });
  const [vehicleHistory, setVehicleHistory] = useState<{
    vehicle: Vehicle | null;
    detections: VehicleDetection[];
    violations: TrafficViolation[];
    loading: boolean;
  }>({
    vehicle: null,
    detections: [],
    violations: [],
    loading: false,
  });
  const [modalImage, setModalImage] = useState<{ url: string; metadata: any } | null>(null);

  const fetchWatchlist = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getWatchlist();
      setWatchlist(data);
    } catch (err) {
      console.error('Failed to fetch watchlist:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  // Fetch vehicle history when plate number changes
  useEffect(() => {
    const plateNumber = newEntry.plateNumber.trim().toUpperCase();
    if (plateNumber.length >= 3) {
      const timeoutId = setTimeout(async () => {
        try {
          setVehicleHistory(prev => ({ ...prev, loading: true }));
          const result = await apiClient.getVehicles({ plateNumber, limit: 1 });
          if (result.vehicles.length > 0) {
            const vehicle = result.vehicles[0];
            const [detections, violations] = await Promise.all([
              apiClient.getVehicleDetections(vehicle.id, { limit: 10 }),
              apiClient.getVehicleViolations(vehicle.id, { limit: 10 }),
            ]);
            setVehicleHistory({ vehicle, detections, violations, loading: false });
          } else {
            setVehicleHistory({ vehicle: null, detections: [], violations: [], loading: false });
          }
        } catch (err) {
          console.error('Failed to fetch vehicle history:', err);
          setVehicleHistory({ vehicle: null, detections: [], violations: [], loading: false });
        }
      }, 500); // Debounce 500ms
      return () => clearTimeout(timeoutId);
    } else {
      setVehicleHistory({ vehicle: null, detections: [], violations: [], loading: false });
    }
  }, [newEntry.plateNumber]);

  const handleAdd = async () => {
    if (!newEntry.plateNumber.trim() || !newEntry.reason.trim()) {
      alert('Please provide plate number and reason');
      return;
    }

    try {
      await apiClient.createWatchlistByPlate({
        plateNumber: newEntry.plateNumber.trim().toUpperCase(),
        reason: newEntry.reason,
        addedBy: 'user', // TODO: Get from auth context
        alertOnDetection: newEntry.alertOnDetection,
        alertOnViolation: newEntry.alertOnViolation,
        notes: newEntry.notes || undefined,
      });
      setShowAddDialog(false);
      setNewEntry({ plateNumber: '', reason: '', notes: '', alertOnDetection: true, alertOnViolation: true });
      setVehicleHistory({ vehicle: null, detections: [], violations: [], loading: false });
      fetchWatchlist();
    } catch (err: any) {
      console.error('Failed to add to watchlist:', err);
      alert(err.message || 'Failed to add to watchlist');
    }
  };

  const handleRemove = async (vehicleId: string) => {
    if (!confirm('Remove this vehicle from watchlist?')) return;

    try {
      await apiClient.removeFromWatchlist(vehicleId);
      if (selectedWatchlistItem?.vehicleId === vehicleId) {
        setSelectedWatchlistItem(null);
      }
      fetchWatchlist();
    } catch (err) {
      console.error('Failed to remove from watchlist:', err);
      alert('Failed to remove from watchlist');
    }
  };

  // Fetch detections and violations when a watchlist item is selected
  useEffect(() => {
    if (selectedWatchlistItem?.vehicle?.id) {
      const fetchDetails = async () => {
        try {
          setVehicleHistory(prev => ({ ...prev, loading: true }));
          const [detections, violations] = await Promise.all([
            apiClient.getVehicleDetections(selectedWatchlistItem.vehicle!.id, { limit: 100 }),
            apiClient.getVehicleViolations(selectedWatchlistItem.vehicle!.id, { limit: 100 }),
          ]);
          setVehicleHistory({
            vehicle: selectedWatchlistItem.vehicle!,
            detections,
            violations,
            loading: false,
          });
        } catch (err) {
          console.error('Failed to fetch vehicle details:', err);
          setVehicleHistory(prev => ({ ...prev, loading: false }));
        }
      };
      fetchDetails();
    }
  }, [selectedWatchlistItem]);

  const filteredWatchlist = watchlist.filter((item) => {
    const plate = item.vehicle?.plateNumber || '';
    const reason = item.reason.toLowerCase();
    const query = searchQuery.toLowerCase();
    return plate.toLowerCase().includes(query) || reason.includes(query);
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading && watchlist.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center relative">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-2" />
            <p className="text-zinc-400">Loading watchlist...</p>
          </div>
        </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col lg:flex-row gap-4 p-4 relative">
        {/* Left Panel - Watchlist */}
        <div className="w-full lg:w-96 flex flex-col gap-4 relative z-10 min-h-0">
          <Card className="border border-white/[0.06] rounded-xl p-4 flex flex-col min-h-0 h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-zinc-100">Watchlist</h2>
            <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30">
              {filteredWatchlist.length}
            </Badge>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search by plate number or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-black/20 border-white/10 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          {/* Add Button */}
          <Button
            onClick={() => setShowAddDialog(true)}
            className="w-full mb-4 bg-amber-500 text-white hover:bg-amber-600 border border-amber-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add to Watchlist
          </Button>

          {/* Watchlist Items */}
          <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
            {filteredWatchlist.map((item) => (
              <Card
                key={item.id}
                className={cn(
                  "border border-white/5 bg-zinc-900/50 hover:bg-zinc-900/70 rounded-xl p-3 cursor-pointer transition-all",
                  selectedWatchlistItem?.id === item.id && "ring-2 ring-amber-500"
                )}
                onClick={() => setSelectedWatchlistItem(item)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm font-mono text-zinc-100">
                        {item.vehicle?.plateNumber || 'UNKNOWN'}
                      </span>
                      <Eye className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      {item.vehicle?.make && item.vehicle?.model && (
                        <span className="text-xs text-zinc-400">
                          {item.vehicle.make} {item.vehicle.model}
                        </span>
                      )}
                      {item.vehicle?.vehicleType && (
                        <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs">
                          {item.vehicle.vehicleType}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mb-1">
                      {item.reason}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {item.vehicle?.detectionCount || 0} detections · Last seen {item.vehicle?.lastSeen ? formatDate(item.vehicle.lastSeen) : 'N/A'}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {filteredWatchlist.length === 0 && (
              <Empty>
                <EmptyIcon><Eye /></EmptyIcon>
                <EmptyTitle>No watchlisted vehicles</EmptyTitle>
                <EmptyDescription>Add a vehicle to the watchlist to start monitoring.</EmptyDescription>
              </Empty>
            )}
          </div>
        </Card>
      </div>

        {/* Right Panel - Detail View */}
        <div className="flex-1 relative z-10">
          {selectedWatchlistItem && vehicleHistory.vehicle ? (
            <WatchlistDetailView
              watchlistItem={selectedWatchlistItem}
              vehicle={vehicleHistory.vehicle}
              detections={vehicleHistory.detections}
              violations={vehicleHistory.violations}
              loading={vehicleHistory.loading}
              onRemove={() => handleRemove(selectedWatchlistItem.vehicleId)}
              onImageClick={(url, metadata) => setModalImage({ url, metadata })}
            />
          ) : (
            <Card className="border border-white/5 bg-zinc-900/30 rounded-xl h-full">
              <Empty>
                <EmptyIcon><Eye /></EmptyIcon>
                <EmptyTitle>No vehicle selected</EmptyTitle>
                <EmptyDescription>Select a vehicle from the watchlist to view its details.</EmptyDescription>
              </Empty>
            </Card>
          )}
        </div>

        {/* Add Dialog */}
        {showAddDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <Card className="border border-white/5 bg-zinc-900/95 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-zinc-100">Add to Watchlist</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddDialog(false);
                  setNewEntry({ plateNumber: '', reason: '', notes: '', alertOnDetection: true, alertOnViolation: true });
                  setVehicleHistory({ vehicle: null, detections: [], violations: [], loading: false });
                }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Plate Number *</label>
                <Input
                  value={newEntry.plateNumber}
                  onChange={(e) => setNewEntry({ ...newEntry, plateNumber: e.target.value.toUpperCase() })}
                  placeholder="KA01AB1234"
                  className="bg-black/20 border-white/10 text-zinc-100 font-mono"
                />
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Reason *</label>
                <Select
                  value={newEntry.reason}
                  onValueChange={(v) => setNewEntry({ ...newEntry, reason: v })}
                  options={WATCHLIST_REASONS.map((r) => ({ value: r, label: r }))}
                  placeholder="Select a reason..."
                />
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Notes (optional)</label>
                <Input
                  value={newEntry.notes}
                  onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="bg-black/20 border-white/10 text-zinc-100"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-400 block">Alert Settings</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="alertDetection"
                    checked={newEntry.alertOnDetection}
                    onChange={(e) => setNewEntry({ ...newEntry, alertOnDetection: e.target.checked })}
                    className="h-4 w-4 rounded border-white/20 bg-black/20 accent-amber-500 cursor-pointer"
                  />
                  <label htmlFor="alertDetection" className="text-sm text-zinc-300">
                    Alert on Detection
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="alertViolation"
                    checked={newEntry.alertOnViolation}
                    onChange={(e) => setNewEntry({ ...newEntry, alertOnViolation: e.target.checked })}
                    className="h-4 w-4 rounded border-white/20 bg-black/20 accent-amber-500 cursor-pointer"
                  />
                  <label htmlFor="alertViolation" className="text-sm text-zinc-300">
                    Alert on Violation
                  </label>
                </div>
              </div>

              {/* Vehicle History Preview */}
              {vehicleHistory.loading && (
                <div className="rounded-lg p-3 bg-zinc-900/50">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Checking vehicle history...
                  </div>
                </div>
              )}

              {!vehicleHistory.loading && vehicleHistory.vehicle && (
                <div className="rounded-lg p-4 bg-zinc-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-zinc-100">Past History Found</div>
                    <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono">
                      {vehicleHistory.detections.length} detections · {vehicleHistory.violations.length} violations
                    </Badge>
                  </div>

                  {vehicleHistory.vehicle && (
                    <div className="text-xs text-zinc-400">
                      <div>First Seen: {new Date(vehicleHistory.vehicle.firstSeen).toLocaleString()}</div>
                      <div>Last Seen: {new Date(vehicleHistory.vehicle.lastSeen).toLocaleString()}</div>
                      <div>Total Detections: {vehicleHistory.vehicle.detectionCount}</div>
                    </div>
                  )}

                  {vehicleHistory.detections.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-zinc-500">Recent Detections:</div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {vehicleHistory.detections.slice(0, 3).map((detection) => (
                          <div key={detection.id} className="text-xs text-zinc-500 flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(detection.timestamp).toLocaleString()}</span>
                            {detection.device?.name && (
                              <>
                                <MapPin className="w-3 h-3 ml-2" />
                                <span>{cleanDeviceName(detection.device.name)}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {vehicleHistory.violations.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-zinc-500">Recent Violations:</div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {vehicleHistory.violations.slice(0, 3).map((violation) => (
                          <div key={violation.id} className="text-xs text-rose-400 flex items-center gap-2">
                            <AlertCircle className="w-3 h-3" />
                            <span>{violation.violationType}</span>
                            <span className="text-zinc-600">·</span>
                            <span>{new Date(violation.timestamp).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="text-[10px] text-zinc-500">
                      Alerts will be created for recent activity (last 48 hours) when added to watchlist.
                    </div>
                  </div>
                </div>
              )}

              {!vehicleHistory.loading && !vehicleHistory.vehicle && newEntry.plateNumber.trim().length >= 3 && (
                <div className="rounded-lg p-3 bg-zinc-900/50">
                  <div className="text-xs text-rose-400">No existing history - new vehicle will be monitored</div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddDialog(false);
                    setNewEntry({ plateNumber: '', reason: '', notes: '', alertOnDetection: true, alertOnViolation: true });
                    setVehicleHistory({ vehicle: null, detections: [], violations: [], loading: false });
                  }}
                  className="border-white/10 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  className="bg-amber-500 text-white hover:bg-amber-600 border border-amber-500"
                >
                  Add
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Image Modal */}
      <ImageModal
        isOpen={!!modalImage}
        onClose={() => setModalImage(null)}
        imageUrl={modalImage?.url || ''}
        metadata={modalImage?.metadata || {}}
      />
      </div>
  );
}

// Watchlist Detail View Component
function WatchlistDetailView({
  watchlistItem,
  vehicle,
  detections,
  violations,
  loading,
  onRemove,
  onImageClick,
}: {
  watchlistItem: Watchlist;
  vehicle: Vehicle;
  detections: VehicleDetection[];
  violations: TrafficViolation[];
  loading: boolean;
  onRemove: () => void;
  onImageClick: (url: string, metadata: any) => void;
}) {
  const [activeTab, setActiveTab] = useState('detections');

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Card className="border border-white/5 bg-zinc-900/30 rounded-xl h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-2" />
          <p className="text-zinc-400">Loading details...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border border-white/5 bg-zinc-900/30 rounded-xl h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-zinc-100 font-mono">
                {vehicle.plateNumber || 'UNKNOWN VEHICLE'}
              </h2>
              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <Eye className="w-3 h-3 mr-1" />
                Watchlisted
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              {vehicle.make && vehicle.model && (
                <span>{vehicle.make} {vehicle.model}</span>
              )}
              {vehicle.vehicleType && (
                <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs">
                  {vehicle.vehicleType}
                </Badge>
              )}
              {vehicle.color && <span>Color: {vehicle.color}</span>}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
            className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Remove
          </Button>
        </div>

        {/* Watchlist Info */}
        <div className="mb-4 p-3 bg-zinc-900/50 rounded-lg">
          <div className="text-xs text-zinc-500 mb-1">Watchlist Reason</div>
          <div className="text-sm text-zinc-300">{watchlistItem.reason}</div>
          {watchlistItem.notes && (
            <>
              <div className="text-xs text-zinc-500 mb-1 mt-2">Notes</div>
              <div className="text-sm text-zinc-400">{watchlistItem.notes}</div>
            </>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
            <span>Added: {formatDateTime(watchlistItem.addedAt)}</span>
            <span>By: {watchlistItem.addedBy}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-zinc-500">Detections</div>
            <div className="text-2xl font-bold text-zinc-100 font-mono">{detections.length}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Violations</div>
            <div className="text-2xl font-bold text-rose-400 font-mono">{violations.length}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">First Seen</div>
            <div className="text-sm font-medium text-zinc-300">{new Date(vehicle.firstSeen).toLocaleDateString()}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">Last Seen</div>
            <div className="text-sm font-medium text-zinc-300">{new Date(vehicle.lastSeen).toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {/* Content - Detections and Violations with Tabs */}
      <div className="flex-1 overflow-y-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 bg-zinc-900/50 border border-white/5 rounded-lg">
            <TabsTrigger
              value="detections"
              className={cn(
                activeTab === "detections"
                  ? "bg-amber-500/10 text-amber-400"
                  : "text-zinc-400 hover:bg-zinc-800/50"
              )}
            >
              Detections ({detections.length})
            </TabsTrigger>
            <TabsTrigger
              value="violations"
              className={cn(
                activeTab === "violations"
                  ? "bg-rose-500/10 text-rose-400"
                  : "text-zinc-400 hover:bg-zinc-800/50"
              )}
            >
              Violations ({violations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detections" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {detections.map((detection) => (
                <Card key={detection.id} className="border border-white/5 bg-zinc-900/50 hover:bg-zinc-900/70 rounded-xl p-0 transition-all overflow-hidden">
                  {/* Image Thumbnail */}
                  <div className="relative w-full aspect-video bg-black cursor-pointer"
                    onClick={() => {
                      const imageUrl = detection.vehicleImageUrl || detection.plateImageUrl || '';
                      if (imageUrl) {
                        onImageClick(imageUrl, {
                          title: 'Detection',
                          plateNumber: detection.plateNumber,
                          timestamp: detection.timestamp,
                          vehicleType: detection.vehicleType,
                          device: detection.device,
                          confidence: detection.confidence,
                          plateDetected: detection.plateDetected,
                          makeModelDetected: detection.makeModelDetected,
                        });
                      }
                    }}
                  >
                    {detection.vehicleImageUrl || detection.plateImageUrl ? (
                      <img
                        src={detection.vehicleImageUrl || detection.plateImageUrl || ''}
                        alt="Detection"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="w-12 h-12 text-zinc-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/95 via-zinc-900/50 to-transparent"></div>
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="text-xs font-bold text-zinc-100 font-mono">
                        {detection.plateNumber || 'UNKNOWN'}
                      </div>
                    </div>
                  </div>
                  {/* Metadata */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Clock className="w-3 h-3" />
                      <span className="truncate">{formatDateTime(detection.timestamp)}</span>
                    </div>
                    {detection.device?.name && (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{cleanDeviceName(detection.device.name)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {detection.plateDetected && (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono">
                          Plate
                        </Badge>
                      )}
                      {detection.makeModelDetected && (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono">
                          MAKE/MODEL
                        </Badge>
                      )}
                      <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px]">
                        {detection.vehicleType}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            {detections.length === 0 && (
              <Empty>
                <EmptyIcon><Camera /></EmptyIcon>
                <EmptyTitle>No detections found</EmptyTitle>
                <EmptyDescription>No detections have been recorded for this vehicle.</EmptyDescription>
              </Empty>
            )}
          </TabsContent>

          <TabsContent value="violations" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {violations.map((violation) => (
                <Card key={violation.id} className="border border-white/5 bg-zinc-900/50 hover:bg-zinc-900/70 rounded-xl p-0 transition-all overflow-hidden">
                  {/* Image Thumbnail */}
                  <div className="relative w-full aspect-video bg-black cursor-pointer"
                    onClick={() => {
                      if (violation.fullSnapshotUrl) {
                        onImageClick(violation.fullSnapshotUrl, {
                          title: 'Violation',
                          plateNumber: violation.plateNumber,
                          timestamp: violation.timestamp,
                          violationType: violation.violationType,
                          device: violation.device,
                          status: violation.status,
                          detectedSpeed: violation.detectedSpeed,
                          confidence: violation.confidence,
                        });
                      }
                    }}
                  >
                    {violation.fullSnapshotUrl ? (
                      <img
                        src={violation.fullSnapshotUrl}
                        alt="Violation"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <AlertCircle className="w-12 h-12 text-zinc-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/95 via-zinc-900/50 to-transparent"></div>
                    <div className="absolute top-2 left-2">
                      <Badge className="bg-rose-500/90 text-white border border-rose-500 text-[10px]">
                        {violation.violationType}
                      </Badge>
                    </div>
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="text-xs font-bold text-zinc-100 font-mono">
                        {violation.plateNumber || 'UNKNOWN'}
                      </div>
                    </div>
                  </div>
                  {/* Metadata */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px]">
                        {violation.violationType}
                      </Badge>
                      <HudBadge variant={
                        violation.status === 'APPROVED' ? 'success' :
                        violation.status === 'PENDING' ? 'warning' :
                        violation.status === 'REJECTED' ? 'danger' :
                        violation.status === 'FINED' ? 'info' :
                        'default'
                      } size="sm">
                        {violation.status}
                      </HudBadge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{formatDateTime(violation.timestamp)}</span>
                    </div>
                    {violation.device?.name && (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{cleanDeviceName(violation.device.name)}</span>
                      </div>
                    )}
                    {violation.detectedSpeed && (
                      <div className="text-xs font-semibold text-rose-400">
                        Speed: {violation.detectedSpeed.toFixed(1)} km/h
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
            {violations.length === 0 && (
              <Empty>
                <EmptyIcon><AlertCircle /></EmptyIcon>
                <EmptyTitle>No violations found</EmptyTitle>
                <EmptyDescription>No violations have been recorded for this vehicle.</EmptyDescription>
              </Empty>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
}

