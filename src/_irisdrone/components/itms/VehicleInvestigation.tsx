import { useState, useEffect, useCallback } from 'react';
import { apiClient, type Vehicle, type VehicleDetection, type TrafficViolation, type WatchlistAlert } from '@irisdrone/lib/api';
import { Search, Loader2, MapPin, Clock, Car, Download } from 'lucide-react';
import { Badge } from '@irisdrone/components/ui/badge';
import { Button } from '@irisdrone/components/ui/button';
import { Card } from '@irisdrone/components/ui/card';
import { Input } from '@irisdrone/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@irisdrone/components/ui/tabs';
import { cn } from '@irisdrone/lib/utils';
import { formatDateTime, getViolationTypeColor, getViolationTypeLabel } from './widgets/utils';
import { ITMSLayout } from './components/ITMSLayout';
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from '@irisdrone/components/ui/empty';
import { cleanDeviceName } from '@irisdrone/lib/displayName';

export function VehicleInvestigation() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [detections, setDetections] = useState<VehicleDetection[]>([]);
  const [violations, setViolations] = useState<TrafficViolation[]>([]);
  const [, setAlerts] = useState<WatchlistAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const searchVehicles = useCallback(async () => {
    if (!searchQuery.trim()) {
      setVehicles([]);
      return;
    }

    try {
      setLoading(true);
      const result = await apiClient.getVehicles({
        plateNumber: searchQuery,
        limit: 50,
      });
      setVehicles(result.vehicles);
      if (result.vehicles.length === 1) {
        setSelectedVehicle(result.vehicles[0]);
      }
    } catch (err) {
      console.error('Failed to search vehicles:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timeout = setTimeout(searchVehicles, 500);
    return () => clearTimeout(timeout);
  }, [searchVehicles]);

  useEffect(() => {
    if (selectedVehicle?.id) {
      Promise.all([
        apiClient.getVehicleDetections(selectedVehicle.id, { limit: 100 }),
        apiClient.getVehicleViolations(selectedVehicle.id, { limit: 100 }),
        apiClient.getAlerts({ limit: 100 }).then((r) =>
          r.alerts.filter((a) => a.vehicleId === selectedVehicle.id)
        ),
      ]).then(([dets, viols, alts]) => {
        setDetections(dets);
        setViolations(viols);
        setAlerts(alts);
      });
    }
  }, [selectedVehicle]);

  return (
    <ITMSLayout>
      <div className="h-full w-full flex flex-col lg:flex-row gap-4 p-4">
        {/* Left Panel - Search & Vehicle List */}
        <div className="w-full lg:w-96 shrink-0 flex flex-col gap-3 relative z-10 h-full">
          <Card className="bg-zinc-900/30 backdrop-blur-sm p-4">
          <h2 className="text-xl font-bold text-zinc-100 mb-4">Vehicle Search</h2>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Plate number, make, model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-900/50 border-white/10 text-zinc-100"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 p-0.5 -m-0.5">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-amber-400 mx-auto" />}
            {vehicles.map((vehicle) => (
              <Card
                key={vehicle.id}
                className={cn(
                  "p-3 cursor-pointer transition-all bg-zinc-900/50 border",
                  selectedVehicle?.id === vehicle.id
                    ? "border-amber-500 ring-2 ring-amber-500"
                    : "border-white/10 hover:border-amber-500"
                )}
                onClick={() => setSelectedVehicle(vehicle)}
              >
                <div className="text-sm font-bold text-zinc-100 font-mono mb-1">
                  {vehicle.plateNumber || 'UNKNOWN'}
                </div>
                {vehicle.make && vehicle.model && (
                  <div className="text-xs text-zinc-300 mb-1">
                    {vehicle.make} {vehicle.model}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs">
                    {vehicle.vehicleType}
                  </Badge>
                  {vehicle.isWatchlisted && (
                    <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs">
                      Watchlisted
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </div>

        {/* Right Panel - Vehicle Details */}
        <div className="flex-1 relative z-10">
          {selectedVehicle ? (
            <VehicleDetailView
              vehicle={selectedVehicle}
              detections={detections}
              violations={violations}
            />
          ) : (
            <Card className="h-full bg-zinc-900/30 backdrop-blur-sm">
              <Empty>
                <EmptyIcon><Car /></EmptyIcon>
                <EmptyTitle>No vehicle selected</EmptyTitle>
                <EmptyDescription>Search for a vehicle by plate number, make, or model to view its history.</EmptyDescription>
              </Empty>
            </Card>
          )}
        </div>
      </div>
    </ITMSLayout>
  );
}

function VehicleDetailView({
  vehicle,
  detections,
  violations,
}: {
  vehicle: Vehicle;
  detections: VehicleDetection[];
  violations: TrafficViolation[];
}) {
  const [activeTab, setActiveTab] = useState('timeline');

  return (
    <Card className="h-full bg-zinc-900/30 backdrop-blur-sm flex flex-col">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-2xl font-bold text-zinc-100 mb-2">
              {vehicle.plateNumber || 'UNKNOWN VEHICLE'}
            </div>
            {vehicle.make && vehicle.model && (
              <div className="text-sm text-zinc-300">
                {vehicle.make} {vehicle.model}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className="border-white/10 text-zinc-300 hover:bg-white/5"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4 bg-zinc-900/50 border border-white/10">
            <TabsTrigger value="timeline" className="text-xs">
              Timeline ({detections.length + violations.length})
            </TabsTrigger>
            <TabsTrigger value="detections" className="text-xs">
              Detections ({detections.length})
            </TabsTrigger>
            <TabsTrigger value="violations" className="text-xs">
              Violations ({violations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-3">
            {[...detections, ...violations]
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .map((item) => (
                <Card key={item.id} className="bg-zinc-900/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    <span className="text-xs text-zinc-300 font-mono">
                      {formatDateTime(item.timestamp)}
                    </span>
                    {('violationType' in item) && (
                      <Badge className={cn("text-[10px]", getViolationTypeColor(item.violationType))}>
                        {getViolationTypeLabel(item.violationType)}
                      </Badge>
                    )}
                  </div>
                  {item.device && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <MapPin className="w-3 h-3" />
                      {cleanDeviceName(item.device.name) || item.deviceId}
                    </div>
                  )}
                </Card>
              ))}
          </TabsContent>

          <TabsContent value="detections" className="space-y-3">
            {detections.map((detection) => (
              <Card key={detection.id} className="bg-zinc-900/50 p-3">
                <div className="text-xs text-zinc-300 font-mono mb-2">
                  {formatDateTime(detection.timestamp)}
                </div>
                {detection.device && (
                  <div className="text-xs text-zinc-500">
                    {cleanDeviceName(detection.device.name) || detection.deviceId}
                  </div>
                )}
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="violations" className="space-y-3">
            {violations.map((violation) => (
              <Card key={violation.id} className="bg-zinc-900/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={cn("text-xs", getViolationTypeColor(violation.violationType))}>
                    {getViolationTypeLabel(violation.violationType)}
                  </Badge>
                  <Badge
                    className={cn(
                      "text-xs",
                      violation.status === 'PENDING'
                        ? "bg-amber-500/10 text-amber-400"
                        : violation.status === 'APPROVED'
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-rose-500/10 text-rose-400"
                    )}
                  >
                    {violation.status}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-300 font-mono mb-1">
                  {formatDateTime(violation.timestamp)}
                </div>
                {violation.device && (
                  <div className="text-xs text-zinc-500">
                    {cleanDeviceName(violation.device.name) || violation.deviceId}
                  </div>
                )}
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
}
