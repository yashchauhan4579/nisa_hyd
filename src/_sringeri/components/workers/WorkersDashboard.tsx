import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Cpu,
  HardDrive,
  Thermometer,
  Camera,
  Key,
  Copy,
  Trash2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sringeri/components/ui/card';
import { Empty, EmptyIcon, EmptyTitle, EmptyDescription, EmptyActions } from '@sringeri/components/ui/empty';
import { Button } from '@sringeri/components/ui/button';
import { HudBadge } from '@sringeri/components/ui/hud-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sringeri/components/ui/tabs';
import { apiClient } from '@sringeri/lib/api';
import type { 
  WorkerWithCounts, 
  WorkerApprovalRequest, 
  WorkerTokenWithStatus,
  WorkerStatus
} from '@sringeri/lib/worker-types';

// Status badge component
function StatusBadge({ status }: { status: WorkerStatus | string }) {
  const variantMap: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'default'> = {
    active: 'success',
    approved: 'success',
    pending: 'warning',
    offline: 'danger',
    revoked: 'danger',
  };
  const labelMap: Record<string, string> = {
    active: 'Active',
    approved: 'Approved',
    pending: 'Pending',
    offline: 'Offline',
    revoked: 'Revoked',
  };

  return (
    <HudBadge variant={variantMap[status] || 'default'}>
      {labelMap[status] || status}
    </HudBadge>
  );
}

// Time ago helper
function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function WorkersDashboard() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<WorkerWithCounts[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<WorkerApprovalRequest[]>([]);
  const [tokens, setTokens] = useState<WorkerTokenWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('workers');
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [workersData, requestsData, tokensData] = await Promise.all([
        apiClient.getWorkers(),
        apiClient.getApprovalRequests('pending'),
        apiClient.getWorkerTokens(),
      ]);
      setWorkers(workersData);
      setApprovalRequests(requestsData);
      setTokens(tokensData);
    } catch (error) {
      console.error('Failed to fetch workers data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (requestId: string) => {
    try {
      await apiClient.approveWorkerRequest(requestId);
      fetchData();
    } catch (error) {
      console.error('Failed to approve request:', error);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await apiClient.rejectWorkerRequest(requestId, 'Rejected by admin');
      fetchData();
    } catch (error) {
      console.error('Failed to reject request:', error);
    }
  };

  const handleCreateToken = async () => {
    setCreating(true);
    try {
      await apiClient.createWorkerToken({
        name: `Token ${new Date().toLocaleDateString()}`,
        expires_in: 168, // 7 days
      });
      fetchData();
    } catch (error) {
      console.error('Failed to create token:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
  };

  const handleRevokeToken = async (tokenId: string) => {
    try {
      await apiClient.revokeWorkerToken(tokenId);
      fetchData();
    } catch (error) {
      console.error('Failed to revoke token:', error);
    }
  };

  const handleDeleteWorker = async (workerId: string) => {
    if (!confirm('Are you sure you want to delete this worker?')) return;
    try {
      await apiClient.deleteWorker(workerId);
      fetchData();
    } catch (error) {
      console.error('Failed to delete worker:', error);
    }
  };

  const activeWorkers = workers.filter(w => w.status === 'active').length;
  const offlineWorkers = workers.filter(w => w.status === 'offline').length;
  const totalCameras = workers.reduce((sum, w) => sum + w.cameraCount, 0);

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full overflow-y-auto overflow-x-hidden p-4 md:p-6 space-y-6 iris-scroll-area">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="w-6 h-6" />
            Edge Workers
          </h1>
          <p className="text-zinc-400">
            Manage edge computing nodes and camera assignments
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Total Workers</p>
                <p className="text-2xl font-bold">{workers.length}</p>
              </div>
              <Server className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Active</p>
                <p className="text-2xl font-bold text-green-500">{activeWorkers}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Offline</p>
                <p className="text-2xl font-bold text-zinc-500">{offlineWorkers}</p>
              </div>
              <XCircle className="w-8 h-8 text-zinc-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Total Cameras</p>
                <p className="text-2xl font-bold">{totalCameras}</p>
              </div>
              <Camera className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals Alert */}
      {approvalRequests.length > 0 && (
        <Card className="bg-yellow-900/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="w-5 h-5" />
              {approvalRequests.length} Pending Approval{approvalRequests.length > 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {approvalRequests.map((req) => (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-800 p-3 rounded-lg">
                  <div>
                    <p className="font-medium">{req.deviceName}</p>
                    <p className="text-sm text-zinc-400">
                      {req.model} • {req.ip} • {timeAgo(req.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleApprove(req.id)} className="bg-green-500 hover:bg-green-600">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleReject(req.id)}>
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="workers">Workers ({workers.length})</TabsTrigger>
          <TabsTrigger value="tokens">Registration Tokens</TabsTrigger>
        </TabsList>

        <TabsContent value="workers" className="mt-4">
          <div className="grid gap-4">
            {workers.map((worker) => (
              <Card key={worker.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center ${
                        worker.status === 'active' ? 'bg-green-900/30' :
                        worker.status === 'offline' ? 'bg-zinc-800' :
                        'bg-yellow-900/30'
                      }`}>
                        <Server className={`w-6 h-6 ${
                          worker.status === 'active' ? 'text-green-600' :
                          worker.status === 'offline' ? 'text-zinc-500' :
                          'text-yellow-600'
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{worker.name}</h3>
                          <StatusBadge status={worker.status} />
                        </div>
                        <p className="text-sm text-zinc-400 mt-1">
                          {worker.model} • {worker.ip}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Last seen: {timeAgo(worker.lastSeen)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                      {/* Resources */}
                      {worker.resources && (
                        <div className="flex gap-4 text-sm">
                          <div className="flex items-center gap-1" title="CPU">
                            <Cpu className="w-4 h-4 text-zinc-500" />
                            <span>{worker.resources.cpu_percent || 0}%</span>
                          </div>
                          <div className="flex items-center gap-1" title="GPU">
                            <HardDrive className="w-4 h-4 text-zinc-500" />
                            <span>{worker.resources.gpu_percent || 0}%</span>
                          </div>
                          <div className="flex items-center gap-1" title="Temperature">
                            <Thermometer className="w-4 h-4 text-zinc-500" />
                            <span>{worker.resources.temperature_c || 0}°C</span>
                          </div>
                        </div>
                      )}

                      {/* Camera count */}
                      <div className="flex items-center gap-1 px-3 py-1 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                        <Camera className="w-4 h-4 text-amber-600" />
                        <span className="font-medium text-amber-600">{worker.cameraCount}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/settings/workers/${worker.id}`)}
                        >
                          Configure
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteWorker(worker.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {workers.length === 0 && !loading && (
              <Card>
                <CardContent>
                  <Empty>
                    <EmptyIcon>
                      <Server />
                    </EmptyIcon>
                    <EmptyTitle>No workers registered</EmptyTitle>
                    <EmptyDescription>
                      Generate a registration token to connect new edge workers to the platform.
                    </EmptyDescription>
                    <EmptyActions>
                      <Button size="sm" onClick={() => setActiveTab('tokens')}>
                        <Key className="w-4 h-4 mr-2" />
                        Generate Token
                      </Button>
                    </EmptyActions>
                  </Empty>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tokens" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Registration Tokens</CardTitle>
                  <CardDescription>Generate tokens for edge workers to register with the platform</CardDescription>
                </div>
                <Button onClick={handleCreateToken} disabled={creating}>
                  <Plus className="w-4 h-4 mr-2" />
                  {creating ? 'Creating...' : 'Generate Token'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tokens.map((token) => (
                  <div
                    key={token.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border ${
                      token.status === 'active' ? 'border-white/10' :
                      token.status === 'used' ? 'border-green-500/20 bg-green-900/20' :
                      'border-white/5 bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <Key className={`w-5 h-5 ${
                        token.status === 'active' ? 'text-amber-500' :
                        token.status === 'used' ? 'text-green-500' :
                        'text-zinc-500'
                      }`} />
                      <div>
                        <p className="font-medium">{token.name}</p>
                        <p className="text-xs text-zinc-500 font-mono mt-1">
                          {token.token.substring(0, 20)}...
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Created {timeAgo(token.createdAt)}
                          {token.expiresAt && ` • Expires ${new Date(token.expiresAt).toLocaleDateString()}`}
                          {token.usedBy && ` • Used by ${token.usedBy}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <HudBadge variant={
                        token.status === 'active' ? 'success' :
                        token.status === 'used' ? 'info' :
                        token.status === 'expired' ? 'secondary' :
                        'default'
                      } size="sm">
                        {token.status}
                      </HudBadge>
                      {token.status === 'active' && (
                        <>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleCopyToken(token.token)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleRevokeToken(token.id)}
                          >
                            <XCircle className="w-4 h-4 text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {tokens.length === 0 && (
                  <Empty>
                    <EmptyIcon>
                      <Key />
                    </EmptyIcon>
                    <EmptyTitle>No tokens created yet</EmptyTitle>
                    <EmptyDescription>
                      Create a registration token to allow edge workers to connect securely.
                    </EmptyDescription>
                    <EmptyActions>
                      <Button size="sm" onClick={handleCreateToken} disabled={creating}>
                        <Plus className="w-4 h-4 mr-2" />
                        {creating ? 'Creating...' : 'Generate Token'}
                      </Button>
                    </EmptyActions>
                  </Empty>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
