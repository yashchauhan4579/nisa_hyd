import { useState, useEffect, useCallback } from 'react';
import { apiClient, type WatchlistAlert, type AlertStats } from '@irisdrone/lib/api';
import { Bell, Loader2, MapPin, Clock, Camera, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@irisdrone/components/ui/badge';
import { HudBadge } from '@irisdrone/components/ui/hud-badge';
import { Button } from '@irisdrone/components/ui/button';
import { Card } from '@irisdrone/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@irisdrone/components/ui/tabs';
import { cn } from '@irisdrone/lib/utils';
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription } from '@irisdrone/components/ui/empty';
import { playSound } from '@irisdrone/hooks/useSound';
import { cleanDeviceName } from '@irisdrone/lib/displayName';

export function AlertsPage() {
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read' | 'detection' | 'violation'>('unread');
  const [total, setTotal] = useState(0);
  const [selectedAlert, setSelectedAlert] = useState<WatchlistAlert | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const options: any = {
        limit: 100,
      };

      if (filter === 'unread') {
        options.isRead = false;
      } else if (filter === 'read') {
        options.isRead = true;
      } else if (filter === 'detection') {
        options.alertType = 'DETECTION';
      } else if (filter === 'violation') {
        options.alertType = 'VIOLATION';
      }

      const result = await apiClient.getAlerts(options);
      setAlerts(result.alerts);
      setTotal(result.total);
      // Auto-select first alert if none selected
      if (!selectedAlert && result.alerts.length > 0) {
        setSelectedAlert(result.alerts[0]);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiClient.getAlertStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch alert stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    fetchStats();

    // Poll for new alerts every 30 seconds
    const interval = setInterval(() => {
      fetchAlerts();
      fetchStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchAlerts, fetchStats]);

  const handleMarkRead = async (id: string) => {
    try {
      await apiClient.markAlertRead(id);
      playSound('notification');
      if (selectedAlert?.id === id) {
        setSelectedAlert({ ...selectedAlert, isRead: true });
      }
      fetchAlerts();
      fetchStats();
    } catch (err) {
      console.error('Failed to mark alert as read:', err);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await apiClient.dismissAlert(id);
      playSound('success');
      if (selectedAlert?.id === id) {
        setSelectedAlert(null);
      }
      fetchAlerts();
      fetchStats();
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

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


  if (loading && alerts.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center relative">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-2" />
            <p className="text-zinc-300">Loading alerts...</p>
          </div>
        </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col lg:flex-row gap-4 p-4 relative overflow-hidden">
        {/* Left Panel - Alerts List with Filters */}
        <div className="w-full lg:w-96 flex flex-col gap-4 relative z-10 min-h-0">
          <Card className="border border-white/5 bg-zinc-900/30 rounded-xl p-4 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-zinc-100">Alerts</h2>
            <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20">
              {total}
            </Badge>
          </div>

          {/* Stats Summary */}
          {stats && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-zinc-900/50 p-2 rounded-lg">
                <div className="text-xs text-zinc-500">Unread</div>
                <div className="text-lg font-bold text-amber-400 font-mono">{stats.unread}</div>
              </div>
              <div className="bg-zinc-900/50 p-2 rounded-lg">
                <div className="text-xs text-zinc-500">Read</div>
                <div className="text-lg font-bold text-emerald-400 font-mono">{stats.read}</div>
              </div>
            </div>
          )}

          {/* Filters */}
          <Tabs value={filter} onValueChange={(v) => {
            setFilter(v as any);
            setSelectedAlert(null);
          }}>
            <TabsList className="grid w-full grid-cols-2 mb-2 bg-zinc-900/50 border-0 rounded-lg">
              <TabsTrigger
                value="unread"
                className={cn(
                  "text-xs",
                  filter === "unread"
                    ? "bg-amber-500/10 text-amber-400"
                    : "text-zinc-500 hover:bg-amber-500/10"
                )}
              >
                Unread ({stats?.unread || 0})
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className={cn(
                  "text-xs",
                  filter === "all"
                    ? "bg-rose-500/10 text-rose-400"
                    : "text-zinc-500 hover:bg-rose-500/10"
                )}
              >
                All ({total})
              </TabsTrigger>
            </TabsList>
            <TabsList className="grid w-full grid-cols-3 mb-4 bg-zinc-900/50 border-0 rounded-lg">
              <TabsTrigger
                value="read"
                className={cn(
                  "text-xs",
                  filter === "read"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-zinc-500 hover:bg-emerald-500/10"
                )}
              >
                Read
              </TabsTrigger>
              <TabsTrigger
                value="detection"
                className={cn(
                  "text-xs",
                  filter === "detection"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-zinc-500 hover:bg-emerald-500/10"
                )}
              >
                Detection
              </TabsTrigger>
              <TabsTrigger
                value="violation"
                className={cn(
                  "text-xs",
                  filter === "violation"
                    ? "bg-rose-500/10 text-rose-400"
                    : "text-zinc-500 hover:bg-rose-500/10"
                )}
              >
                Violation
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Alerts List */}
          <div className="space-y-2 flex-1 overflow-y-auto min-h-0 p-0.5 -m-0.5">
            {alerts.map((alert) => (
              <Card
                key={alert.id}
                className={cn(
                  "border border-white/5 bg-zinc-900/50 hover:bg-zinc-900/70 rounded-xl p-3 cursor-pointer transition-all",
                  !alert.isRead && "border-amber-500/20",
                  selectedAlert?.id === alert.id && "ring-2 ring-amber-500"
                )}
                onClick={() => setSelectedAlert(alert)}
              >
                <div className="flex items-start gap-2 mb-2">
                  <HudBadge variant={alert.alertType === 'DETECTION' ? 'success' : 'danger'} size="sm">
                    {alert.alertType}
                  </HudBadge>
                  {!alert.isRead && (
                    <HudBadge variant="warning" size="sm">
                      NEW
                    </HudBadge>
                  )}
                </div>
                {alert.vehicle?.plateNumber && (
                  <div className="text-sm font-bold text-zinc-100 font-mono mb-1">
                    {alert.vehicle.plateNumber}
                  </div>
                )}
                <div className="text-xs text-zinc-300 mb-1 line-clamp-2">
                  {alert.message}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <Clock className="w-3 h-3" />
                  <span>{formatDateTime(alert.timestamp)}</span>
                </div>
              </Card>
            ))}
            {alerts.length === 0 && (
              <Empty>
                <EmptyIcon><Bell /></EmptyIcon>
                <EmptyTitle>No alerts found</EmptyTitle>
                <EmptyDescription>No alerts match the current filters.</EmptyDescription>
              </Empty>
            )}
          </div>
        </Card>
      </div>

        {/* Right Panel - Detail View */}
        <div className="flex-1 relative z-10">
          {selectedAlert ? (
            <AlertDetailView
              alert={selectedAlert}
              onMarkRead={() => handleMarkRead(selectedAlert.id)}
              onDismiss={() => handleDismiss(selectedAlert.id)}
            />
          ) : (
            <Card className="border border-white/5 bg-zinc-900/20 rounded-xl h-full">
              <Empty>
                <EmptyIcon><Bell /></EmptyIcon>
                <EmptyTitle>No alert selected</EmptyTitle>
                <EmptyDescription>Select an alert from the list to view its details and take action.</EmptyDescription>
              </Empty>
            </Card>
          )}
        </div>
      </div>
  );
}

// Alert Detail View Component
function AlertDetailView({
  alert,
  onMarkRead,
  onDismiss,
}: {
  alert: WatchlistAlert;
  onMarkRead: () => void;
  onDismiss: () => void;
}) {
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


  return (
    <Card className="border border-white/5 bg-zinc-900/30 rounded-xl h-full flex flex-col">
      {/* Compact Header with Vehicle Info */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <HudBadge variant={alert.alertType === 'DETECTION' ? 'success' : 'danger'}>
                {alert.alertType}
              </HudBadge>
              {!alert.isRead && (
                <HudBadge variant="warning">
                  NEW
                </HudBadge>
              )}
              {alert.vehicle?.plateNumber && (
                <div className="text-xl font-bold text-zinc-100 font-mono">
                  {alert.vehicle.plateNumber}
                </div>
              )}
            </div>
            <div className="text-xs text-zinc-300 mb-3">{alert.message}</div>

            {/* Vehicle Information - Compact Grid */}
            {alert.vehicle && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {alert.vehicle.make && alert.vehicle.model && (
                  <div>
                    <div className="text-zinc-500 mb-0.5">Make/Model</div>
                    <div className="text-zinc-300">{alert.vehicle.make} {alert.vehicle.model}</div>
                  </div>
                )}
                {alert.vehicle.vehicleType && (
                  <div>
                    <div className="text-zinc-500 mb-0.5">Type</div>
                    <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] px-1.5 py-0.5">
                      {alert.vehicle.vehicleType}
                    </Badge>
                  </div>
                )}
                {alert.vehicle.color && (
                  <div>
                    <div className="text-zinc-500 mb-0.5">Color</div>
                    <div className="text-zinc-300">{alert.vehicle.color}</div>
                  </div>
                )}
                <div>
                  <div className="text-zinc-500 mb-0.5">Detections</div>
                  <div className="text-zinc-300 font-mono">{alert.vehicle.detectionCount}</div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons - Compact */}
          <div className="flex gap-2 flex-shrink-0">
            {!alert.isRead && (
              <Button
                variant="outline"
                size="sm"
                onClick={onMarkRead}
                className="border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 text-xs"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Mark Read
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onDismiss}
              className="border-rose-500/20 text-rose-400 hover:bg-rose-500/10 text-xs"
            >
              <XCircle className="w-3 h-3 mr-1" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Image and Details Side by Side */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 overflow-hidden">
        {/* Image - Takes 60% width */}
        <div className="w-full md:flex-[0.6] flex flex-col">
          <div className="text-xs font-bold text-zinc-300 mb-2">Evidence</div>
          <Card className="border border-white/5 bg-zinc-900/50 rounded-xl p-0 overflow-hidden flex-1">
            <div className="relative w-full h-full bg-black">
              {alert.detection?.vehicleImageUrl || alert.detection?.plateImageUrl ? (
                <img
                  src={alert.detection.vehicleImageUrl || alert.detection.plateImageUrl || ''}
                  alt="Alert Evidence"
                  className="w-full h-full object-contain"
                />
              ) : alert.metadata?.fullImageUrl || alert.metadata?.plateImageUrl ? (
                <img
                  src={alert.metadata.fullImageUrl || alert.metadata.plateImageUrl || ''}
                  alt="Alert Evidence"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Camera className="w-16 h-16 text-zinc-500/20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/95 via-transparent to-transparent"></div>
              {alert.vehicle?.plateNumber && (
                <div className="absolute bottom-3 left-3">
                  <div className="text-base font-bold text-zinc-100 font-mono">
                    {alert.vehicle.plateNumber}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Details - Takes 40% width */}
        <div className="w-full md:flex-[0.4] flex flex-col gap-3 overflow-y-auto">
          {/* Detection Details */}
          {alert.detection && (
            <div>
              <div className="text-xs font-bold text-amber-400 mb-2">Detection</div>
              <Card className="border border-white/5 bg-zinc-900/50 rounded-xl p-3">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{formatDateTime(alert.detection.timestamp)}</span>
                  </div>
                  {alert.device && (
                    <div className="flex items-center gap-2 text-zinc-300">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{cleanDeviceName(alert.device.name) || alert.deviceId}</span>
                    </div>
                  )}
                  {alert.detection.confidence && (
                    <div className="text-zinc-300">
                      Confidence: <span className="font-mono">{(alert.detection.confidence * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  <div>
                    <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] px-1.5 py-0.5">
                      {alert.detection.vehicleType}
                    </Badge>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Alert Information */}
          <div>
            <div className="text-xs font-bold text-amber-400 mb-2">Alert Info</div>
            <Card className="border border-white/5 bg-zinc-900/50 rounded-xl p-3">
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{formatDateTime(alert.timestamp)}</span>
                </div>
                {alert.device && (
                  <div className="flex items-center gap-2 text-zinc-300">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{cleanDeviceName(alert.device.name) || alert.deviceId}</span>
                  </div>
                )}
                {alert.readAt && (
                  <div className="text-zinc-300">
                    Read: {formatDateTime(alert.readAt)}
                  </div>
                )}
                {alert.watchlist && (
                  <div>
                    <div className="text-zinc-500 mb-0.5">Reason</div>
                    <div className="text-zinc-300">{alert.watchlist.reason}</div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Card>
  );
}
