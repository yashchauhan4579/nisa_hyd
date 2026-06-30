import { useState, useEffect } from 'react';
import { Camera, Plus, Edit, Trash2, Search, Filter, MapPin, Wifi, WifiOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api';
import { useDataCache } from '@/contexts/DataCacheContext';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';

interface CameraHealth {
  id: string;
  cameraId: string;
  status: string;
  lastPing: string;
  latencyMs: number;
  location?: string;
}

/**
 * Camera Management Page - centralized camera configuration and monitoring
 * Features:
 * - View all cameras
 * - Add new cameras
 * - Edit camera settings
 * - Monitor camera status
 * - Organize by location
 */
export function CameraManagementPage() {
  const { theme } = useTheme();
  const { cameras: cachedCameras, getCameras } = useDataCache();
  const [cameras, setCameras] = useState<CameraHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [editCamera, setEditCamera] = useState<CameraHealth | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    fetchCameras();
    // Refresh every 30 seconds
    const interval = setInterval(fetchCameras, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchCameras = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/camera-health', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data: CameraHealth[] = await res.json();
        setCameras(data);
      }
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editCamera) return;
    try {
      setEditSaving(true);
      await apiClient.updateDevice(editCamera.id, {
        name: editName,
        metadata: { location: editLocation },
      });
      setEditCamera(null);
      await fetchCameras();
    } catch (err) {
      console.error('Failed to update camera:', err);
    } finally {
      setEditSaving(false);
    }
  };

  const locations = Array.from(new Set(cameras.map(c => c.location || 'Unassigned'))).sort();

  const filteredCameras = cameras.filter(camera => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesId = camera.id.toLowerCase().includes(query);
      const matchesName = camera.cameraId.toLowerCase().includes(query);
      if (!matchesId && !matchesName) return false;
    }

    // Location filter
    if (locationFilter !== 'all' && camera.location !== locationFilter) {
      return false;
    }

    // Status filter
    if (statusFilter === 'online' && camera.status !== 'online') return false;
    if (statusFilter === 'offline' && camera.status === 'online') return false;

    return true;
  });

  const stats = {
    total: cameras.length,
    online: cameras.filter(c => c.status === 'online').length,
    offline: cameras.filter(c => c.status !== 'online').length,
    locations: locations.length,
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className={cn(
        "sticky top-0 z-10 backdrop-blur-sm border-b",
        theme === 'light'
          ? 'bg-white/90 border-gray-200'
          : 'bg-gray-900/90 border-white/10'
      )}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Camera className={cn("w-7 h-7", theme === 'light' ? 'text-amber-600' : 'text-amber-400')} />
              <div>
                <h1 className={cn("text-2xl font-bold", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                  Camera Management
                </h1>
                <p className={cn("text-sm mt-1", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                  Configure and monitor all system cameras
                </p>
              </div>
            </div>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Camera
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className={cn(
              "p-4 rounded-lg border",
              theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-white/5 border-white/10'
            )}>
              <div className={cn("text-2xl font-bold", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                {stats.total}
              </div>
              <div className={cn("text-xs", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                Total Cameras
              </div>
            </div>
            <div className={cn(
              "p-4 rounded-lg border",
              theme === 'light' ? 'bg-green-50 border-green-200' : 'bg-green-500/10 border-green-500/20'
            )}>
              <div className="text-2xl font-bold text-green-500">{stats.online}</div>
              <div className={cn("text-xs", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                Online
              </div>
            </div>
            <div className={cn(
              "p-4 rounded-lg border",
              theme === 'light' ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/20'
            )}>
              <div className="text-2xl font-bold text-red-500">{stats.offline}</div>
              <div className={cn("text-xs", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                Offline
              </div>
            </div>
            <div className={cn(
              "p-4 rounded-lg border",
              theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-white/5 border-white/10'
            )}>
              <div className={cn("text-2xl font-bold", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                {stats.locations}
              </div>
              <div className={cn("text-xs", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                Locations
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className={cn(
                "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4",
                theme === 'light' ? 'text-gray-400' : 'text-gray-500'
              )} />
              <Input
                placeholder="Search cameras by ID or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "pl-10",
                  theme === 'light'
                    ? 'bg-white border-gray-300'
                    : 'bg-white/5 border-white/10'
                )}
              />
            </div>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className={cn(
                "px-4 py-2 rounded-md border outline-none",
                theme === 'light'
                  ? 'bg-white border-gray-300'
                  : 'bg-white/5 border-white/10 text-gray-300'
              )}
            >
              <option value="all">All Locations</option>
              {locations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
            <div className={cn(
              "flex gap-1 p-1 rounded-md border",
              theme === 'light' ? 'bg-gray-100 border-gray-300' : 'bg-white/5 border-white/10'
            )}>
              {(['all', 'online', 'offline'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "px-4 py-2 rounded text-sm font-medium capitalize transition-all",
                    statusFilter === status
                      ? theme === 'light'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'bg-white/10 text-white'
                      : theme === 'light'
                        ? 'text-gray-600 hover:text-gray-900'
                        : 'text-gray-400 hover:text-gray-200'
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Camera Dialog */}
      <Dialog open={!!editCamera} onOpenChange={(open) => { if (!open) setEditCamera(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Camera</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Camera Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Camera name" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Location</label>
              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Location" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCamera(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera Grid */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className={cn(
              "text-sm",
              theme === 'light' ? 'text-gray-600' : 'text-gray-400'
            )}>
              Loading cameras...
            </div>
          </div>
        ) : filteredCameras.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Camera className={cn(
              "w-16 h-16 mb-4",
              theme === 'light' ? 'text-gray-300' : 'text-gray-600'
            )} />
            <p className={cn(
              "text-sm",
              theme === 'light' ? 'text-gray-600' : 'text-gray-400'
            )}>
              No cameras found
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCameras.map((camera) => (
              <Card
                key={camera.id}
                className={cn(
                  "group hover:shadow-lg transition-all",
                  theme === 'light'
                    ? 'bg-white border-gray-200'
                    : 'glass'
                )}
              >
                <div className="p-5 space-y-4">
                  {/* Status Badge */}
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={camera.status === 'online' ? 'default' : 'destructive'}
                      className={cn(
                        "gap-1.5",
                        camera.status === 'online'
                          ? 'bg-green-500 hover:bg-green-600'
                          : 'bg-red-500 hover:bg-red-600'
                      )}
                    >
                      {camera.status === 'online' ? (
                        <Wifi className="w-3 h-3" />
                      ) : (
                        <WifiOff className="w-3 h-3" />
                      )}
                      {camera.status.toUpperCase()}
                    </Badge>
                    {camera.status === 'online' && (
                      <span className={cn(
                        "text-xs",
                        theme === 'light' ? 'text-gray-500' : 'text-gray-400'
                      )}>
                        {camera.latencyMs}ms
                      </span>
                    )}
                  </div>

                  {/* Camera Info */}
                  <div className="space-y-2">
                    <h3 className={cn(
                      "font-semibold truncate",
                      theme === 'light' ? 'text-gray-900' : 'text-white'
                    )}>
                      {camera.cameraId.replace(/^Camera\s+/i, "")}
                    </h3>
                    <p className={cn(
                      "text-xs font-mono truncate",
                      theme === 'light' ? 'text-gray-500' : 'text-gray-400'
                    )}>
                      {camera.id}
                    </p>
                    {camera.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className={cn(
                          "w-3.5 h-3.5",
                          theme === 'light' ? 'text-gray-400' : 'text-gray-500'
                        )} />
                        <span className={cn(
                          "text-xs",
                          theme === 'light' ? 'text-gray-600' : 'text-gray-400'
                        )}>
                          {camera.location}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => {
                      setEditCamera(camera);
                      setEditName(camera.cameraId);
                      setEditLocation(camera.location || '');
                    }}>
                      <Edit className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
