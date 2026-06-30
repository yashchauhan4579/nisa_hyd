import { useState, useEffect } from 'react';
import { apiClient, type Vehicle, type VehicleDetection, type TrafficViolation } from '@/lib/api';
import { X, Eye, EyeOff, MapPin, Clock, AlertTriangle, Camera } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { JunctionMap, hasGeo } from '@/components/maps/JunctionMap';

interface VehicleDetailProps {
  vehicle: Vehicle;
  onClose: () => void;
  onUpdate: () => void;
}

export function VehicleDetail({ vehicle, onUpdate, onClose }: VehicleDetailProps) {
  const [detections, setDetections] = useState<VehicleDetection[]>([]);
  const [violations, setViolations] = useState<TrafficViolation[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [watchlistReason, setWatchlistReason] = useState('');
  const [showWatchlistDialog, setShowWatchlistDialog] = useState(false);
  const [mapJunction, setMapJunction] = useState<{ lat: number; lng: number; name: string; subtitle?: string } | null>(null);

  useEffect(() => {
    fetchDetections();
    fetchViolations();
  }, [vehicle.id]);

  const fetchDetections = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getVehicleDetections(vehicle.id, { limit: 50 });
      setDetections(data);
    } catch (err) {
      console.error('Failed to fetch detections:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchViolations = async () => {
    try {
      // Violations link to a vehicle by vehicle_id ONLY if the plate matched a
      // known vehicle at creation time — many (esp. older or slightly-different
      // OCR reads) have a NULL vehicle_id and would show as "0" here while the
      // Violations page (which matches by plate text) lists them. So union the
      // vehicle_id-linked rows with a plate-number lookup and dedupe by id.
      const byVehicle = await apiClient.getVehicleViolations(vehicle.id, { limit: 100 }).catch(() => [] as TrafficViolation[]);
      const plate = (vehicle.plateNumber || '').trim();
      const byPlate = plate
        ? await apiClient.getViolations({ plateNumber: plate, limit: 100 }).then(r => r.violations).catch(() => [] as TrafficViolation[])
        : [];
      const merged = new Map<string | number, TrafficViolation>();
      [...byVehicle, ...byPlate].forEach(v => merged.set(v.id, v));
      setViolations(Array.from(merged.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
    } catch (err) {
      console.error('Failed to fetch violations:', err);
    }
  };

  const handleAddToWatchlist = async () => {
    if (!watchlistReason.trim()) {
      alert('Please provide a reason');
      return;
    }
    try {
      await apiClient.addToWatchlist(vehicle.id, {
        reason: watchlistReason,
        addedBy: 'user',
        alertOnDetection: true,
        alertOnViolation: true,
      });
      setShowWatchlistDialog(false);
      setWatchlistReason('');
      onUpdate();
    } catch (err) {
      console.error('Failed to add to watchlist:', err);
      alert('Failed to add to watchlist');
    }
  };

  const handleRemoveFromWatchlist = async () => {
    try {
      await apiClient.removeFromWatchlist(vehicle.id);
      onUpdate();
    } catch (err) {
      console.error('Failed to remove from watchlist:', err);
      alert('Failed to remove from watchlist');
    }
  };

  const getVehicleTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      '2W': 'bg-amber-500',
      '4W': 'bg-green-500',
      'AUTO': 'bg-yellow-500',
      'BUS': 'bg-amber-500',
      'HMV': 'bg-red-500',
      'UNKNOWN': 'bg-gray-500',
    };
    return colors[type] || 'bg-gray-500';
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  };

  return (
    <Card className="glass h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-semibold font-mono">
                {vehicle.plateNumber || 'UNKNOWN VEHICLE'}
              </h2>
              {vehicle.isWatchlisted && (
                <Badge variant="warning" className="gap-1">
                  <Eye className="w-3 h-3" />
                  Watchlisted
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              {vehicle.make && vehicle.model && (
                <span>{vehicle.make} {vehicle.model}</span>
              )}
              <Badge className={cn("text-xs", getVehicleTypeColor(vehicle.vehicleType))}>
                {vehicle.vehicleType}
              </Badge>
              {vehicle.color && <span>Color: {vehicle.color}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {vehicle.isWatchlisted ? (
              <Button variant="outline" size="sm" onClick={handleRemoveFromWatchlist}>
                <EyeOff className="w-4 h-4 mr-2" />
                Remove from Watchlist
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowWatchlistDialog(true)}>
                <Eye className="w-4 h-4 mr-2" />
                Add to Watchlist
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Detections</div>
            <div className="text-2xl font-semibold">{vehicle.detectionCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Violations</div>
            <div className="text-2xl font-semibold">{violations.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">First Seen</div>
            <div className="text-sm font-medium">{formatDateTime(vehicle.firstSeen)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Last Seen</div>
            <div className="text-sm font-medium">{formatDateTime(vehicle.lastSeen)}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="detections">Detections ({detections.length})</TabsTrigger>
            <TabsTrigger value="violations">Violations ({violations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="space-y-3">
              {(() => {
                const d0 = detections?.[0];
                const veh = d0?.vehicleImageUrl || d0?.fullImageUrl;
                const plate = d0?.plateImageUrl;
                if (!veh && !plate) return null;
                return (
                  <Card className="p-0 overflow-hidden border border-white/5">
                    <div
                      className="relative w-full bg-black flex items-center justify-center"
                      style={{ height: 'calc(100vh - 280px)' }}
                    >
                      {veh && (
                        <img
                          src={veh}
                          alt={vehicle.plateNumber || 'Vehicle'}
                          className="w-full h-full object-contain"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; }}
                        />
                      )}
                      {plate && (
                        <div className="absolute top-3 right-3 rounded-md overflow-hidden border-2 border-amber-400/60 shadow-2xl bg-black/80 backdrop-blur">
                          <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-amber-400 font-semibold">Plate</div>
                          <img
                            src={plate}
                            alt="Plate"
                            className="block max-h-16 max-w-[220px] object-contain"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; }}
                          />
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })()}

              {vehicle.watchlist && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Watchlist Information</h3>
                  <div className="space-y-2">
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Reason</div>
                      <div>{vehicle.watchlist.reason}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Added By</div>
                      <div>{vehicle.watchlist.addedBy}</div>
                    </div>
                    {vehicle.watchlist.notes && (
                      <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Notes</div>
                        <div>{vehicle.watchlist.notes}</div>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="detections">
            <div className="space-y-3">
              {detections.map((detection) => (
                <Card key={detection.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {detection.device && (
                          hasGeo(detection.device) ? (
                            <button
                              type="button"
                              onClick={() => setMapJunction({
                                lat: detection.device!.lat,
                                lng: detection.device!.lng,
                                name: detection.device!.name || detection.device!.id,
                                subtitle: `Detected ${formatDateTime(detection.timestamp)}`,
                              })}
                              title="Show this junction on the map"
                              className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-500 hover:underline"
                            >
                              <MapPin className="w-4 h-4" />
                              {detection.device.name || detection.device.id}
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/80">· map</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                              <MapPin className="w-4 h-4" />
                              {detection.device.name || detection.device.id}
                            </div>
                          )
                        )}
                        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                          <Clock className="w-4 h-4" />
                          {formatDateTime(detection.timestamp)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {detection.plateDetected && (
                          <Badge variant="success" className="text-xs">Plate Detected</Badge>
                        )}
                        {detection.makeModelDetected && (
                          <Badge variant="success" className="text-xs">Make/Model Detected</Badge>
                        )}
                        <Badge className={cn("text-xs", getVehicleTypeColor(detection.vehicleType))}>
                          {detection.vehicleType}
                        </Badge>
                      </div>
                    </div>
                    {(detection.vehicleImageUrl || detection.fullImageUrl || detection.plateImageUrl) && (
                      <img
                        src={detection.vehicleImageUrl || detection.fullImageUrl || detection.plateImageUrl || undefined}
                        alt="Detection"
                        className="w-32 h-24 object-cover rounded border border-white/10"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; }}
                      />
                    )}
                  </div>
                </Card>
              ))}
              {detections.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No detections found</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="violations">
            <div className="space-y-3">
              {violations.map((violation) => (
                <Card key={violation.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-red-500">{violation.violationType}</Badge>
                        <Badge
                          variant={
                            violation.status === 'APPROVED' ? 'success' :
                            violation.status === 'REJECTED' ? 'destructive' :
                            violation.status === 'FINED' ? 'warning' : 'default'
                          }
                        >
                          {violation.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDateTime(violation.timestamp)}
                      </div>
                      {violation.detectedSpeed && (
                        <div className="text-sm font-semibold text-red-500 mt-1">
                          Speed: {violation.detectedSpeed.toFixed(1)} km/h
                        </div>
                      )}
                    </div>
                    {violation.fullSnapshotUrl && (
                      <img
                        src={violation.fullSnapshotUrl}
                        alt="Violation"
                        className="w-24 h-16 object-cover rounded"
                      />
                    )}
                  </div>
                </Card>
              ))}
              {violations.length === 0 && (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No violations found</p>
                </div>
              )}
            </div>
          </TabsContent>

        </Tabs>
      </div>

      {/* Watchlist Dialog */}
      {showWatchlistDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="glass p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Add to Watchlist</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Please provide a reason for adding this vehicle to the watchlist:
            </p>
            <Input
              value={watchlistReason}
              onChange={(e) => setWatchlistReason(e.target.value)}
              placeholder="Reason for watchlisting..."
              className="mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setShowWatchlistDialog(false);
                setWatchlistReason('');
              }}>
                Cancel
              </Button>
              <Button onClick={handleAddToWatchlist}>Add to Watchlist</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Junction location map (light mode) */}
      {mapJunction && (
        <JunctionMap
          lat={mapJunction.lat}
          lng={mapJunction.lng}
          name={mapJunction.name}
          subtitle={mapJunction.subtitle}
          onClose={() => setMapJunction(null)}
        />
      )}
    </Card>
  );
}

