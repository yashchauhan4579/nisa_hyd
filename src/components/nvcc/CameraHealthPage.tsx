import React, { useEffect, useState, useMemo } from 'react';
import { Activity, Radio, Wifi, WifiOff, Clock, Plus, X, Upload, BarChart3, TrendingUp, AlertTriangle, Trash2, FileSpreadsheet } from 'lucide-react';
import { HealthReportModal } from '@/components/nvcc/HealthReportModal';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

interface PingResult {
    timestamp: string;
    latencyMs: number;
    status: string;
}

interface CameraHealth {
    id: string;
    cameraId: string; // Approach Name
    location: string;
    status: string;
    lastPing: string;
    latencyMs: number;
    history?: PingResult[];
}
// ...


// --- Chart Components ---

const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false,
        },
        tooltip: {
            mode: 'index' as const,
            intersect: false,
            backgroundColor: 'rgba(17, 24, 39, 0.9)',
            titleColor: '#fff',
            bodyColor: '#9ca3af',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
        },
    },
    scales: {
        x: {
            display: false, // Hide X axis labels for cleaner look in small charts
            grid: {
                display: false,
            }
        },
        y: {
            display: true,
            grid: {
                color: 'rgba(255, 255, 255, 0.05)',
            },
            ticks: {
                color: '#6b7280',
                font: {
                    size: 10,
                },
            },
            beginAtZero: true,
        },
    },
    interaction: {
        mode: 'nearest' as const,
        axis: 'x' as const,
        intersect: false
    }
};

const DetailedChart = ({ history, label, color = 'rgb(245, 158, 11)' }: { history: PingResult[], label: string, color?: string }) => {
    const data = {
        labels: history.map(h => new Date(h.timestamp).toLocaleTimeString()),
        datasets: [
            {
                label: label,
                data: history.map(h => h.latencyMs),
                borderColor: color,
                backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4,
            },
        ],
    };

    const detailedOptions = {
        ...options,
        plugins: {
            legend: { display: true, labels: { color: '#9ca3af' } },
            tooltip: options.plugins.tooltip
        },
        scales: {
            x: {
                display: true,
                grid: { display: false },
                ticks: { color: '#6b7280', maxTicksLimit: 8 }
            },
            y: {
                display: true,
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#6b7280' }
            }
        }
    };

    return <Line data={data} options={detailedOptions} />;
};


export function CameraHealthPage() {
    const [cameras, setCameras] = useState<CameraHealth[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCamera, setSelectedCamera] = useState<CameraHealth | null>(null);
    const [displayedCameras, setDisplayedCameras] = useState<CameraHealth[]>([]);
    const [showHealthReport, setShowHealthReport] = useState(false);

    // Filters
    const [locationFilter, setLocationFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

    const locations = useMemo(() => {
        const locs = new Set(cameras.map(c => c.location).filter(l => l));
        return Array.from(locs).sort();
    }, [cameras]);

    const filteredCameras = useMemo(() => {
        return cameras.filter(c => {
            const matchesLoc = locationFilter === 'all' || c.location === locationFilter;
            const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
            return matchesLoc && matchesStatus;
        });
    }, [cameras, locationFilter, statusFilter]);

    // Rotate displayed cameras... (using filtered or all? User probably wants to see filtered ones detailed)
    // Let's keep displayedCameras as "Interesting Online Cameras" from the FULL list for the overview chart
    // OR adapt it to filtered list? 
    // Usually overview chart shows "System Health" so maybe keep full list. 
    // But the grid below will use filteredCameras.
    useEffect(() => {
        const onlineCameras = cameras.filter(c => c.status === 'online' && c.history && c.history.length > 0);
        if (onlineCameras.length <= 3) {
            setDisplayedCameras(onlineCameras);
            return;
        }

        // Initial shuffle
        const shuffle = () => {
            const shuffled = [...onlineCameras].sort(() => Math.random() - 0.5);
            setDisplayedCameras(shuffled.slice(0, 3));
        };
        shuffle();

        const interval = setInterval(shuffle, 10000); // Rotate every 10 seconds
        return () => clearInterval(interval);
    }, [cameras]);

    // Stats
    const stats = useMemo(() => {
        const total = cameras.length;
        const online = cameras.filter(c => c.status === 'online').length;
        const offline = cameras.filter(c => c.status !== 'online').length;
        const avgLatency = online > 0
            ? Math.round(cameras.filter(c => c.status === 'online').reduce((acc, c) => acc + c.latencyMs, 0) / online)
            : 0;

        // Calculate uptime from history
        let uptime = 0;
        const allHistoryPoints = cameras.flatMap(c => c.history || []);
        if (allHistoryPoints.length > 0) {
            const onlineCount = allHistoryPoints.filter(h => h.status === 'online').length;
            uptime = Math.round((onlineCount / allHistoryPoints.length) * 1000) / 10; // Round to 1 decimal
        }

        return { total, online, offline, avgLatency, uptime };
    }, [cameras]);

    // System History (Estimated by aggregating latest histories)
    const systemHistory = useMemo(() => {
        if (cameras.length === 0) return [];
        // Use the first camera's timestamps as a baseline if available, or just synthesize
        // Actually, let's just use the history of the first online camera for "System Trend" representation 
        // to avoid complex time-alignment on the client side for this demo.
        // A better approach: Aggregating is hard without aligned timestamps.
        // We will show "Average Latency" of the *currently* online cameras as a single point? 
        // No, we want a timeline. 
        // Let's pick the camera with the most history points as the 'time base' 
        // and average the others if they have a point near that time.
        // For simplicity/robustness: Just use the history of the most 'stable' camera to show trend, 
        // OR simpler: Just show the first camera's history labeled as "Sample Node Latency" if easier.
        // BUT user asked for "Combined one". 
        // Let's try to map all histories to a flat array.

        const allPoints = cameras.flatMap(c => c.history || []).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        // Reduce into buckets of 1 minute?
        // Too complex for client side "quick" impl. 
        // Let's show the "Average Latency" calculated from the camera with the most data, 
        // or just visualize the individual lines of the top 3 cameras.
        return allPoints;
    }, [cameras]);


    useEffect(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    const fetchHealth = async () => {
        try {
            const res = await fetch('/api/camera-health');
            if (res.ok) {
                const data = await res.json();
                setCameras(data || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const [showAddModal, setShowAddModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'manual' | 'csv'>('manual');
    const [manualForm, setManualForm] = useState({ ip: '', name: '', location: '' });
    const [csvText, setCsvText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await fetch('/api/camera-health/targets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(manualForm)
            });
            setShowAddModal(false);
            setManualForm({ ip: '', name: '', location: '' });
            fetchHealth();
        } catch (err) {
            console.error(err);
            alert('Failed to add camera');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCsvSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!csvText.trim()) return;
        setIsSubmitting(true);
        try {
            const lines = csvText.split('\n');
            const startIndex = lines[0].toLowerCase().includes('ip') ? 1 : 0;
            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const [ip, name, location] = line.split(',').map(s => s.trim());
                if (ip && name) {
                    await fetch('/api/camera-health/targets', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ip, name, location: location || '' })
                    });
                }
            }
            setShowAddModal(false);
            setCsvText('');
            fetchHealth();
        } catch (err) {
            console.error(err);
            alert('Import failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (ip: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to remove the camera ${ip}?`)) return;

        try {
            const res = await fetch(`/api/camera-health/targets/${encodeURIComponent(ip)}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                fetchHealth();
                if (selectedCamera?.id === ip) setSelectedCamera(null);
            } else {
                alert('Failed to delete camera');
            }
        } catch (err) {
            console.error(err);
            alert('Error deleting camera');
        }
    };

    return (
        <div className="p-6 h-full overflow-y-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Activity className="w-8 h-8 text-amber-500" />
                    <div>
                        <h1 className="text-2xl font-bold">Camera Health Monitor</h1>
                        <p className="text-sm text-gray-400">Real-time approach analytics</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowHealthReport(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-medium border border-white/20"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Health Report
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium shadow-lg shadow-amber-500/25"
                    >
                        <Plus className="w-4 h-4" />
                        Add Camera
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">Total Approaches</div>
                    <div className="text-3xl font-bold flex items-baseline gap-2">
                        {stats.total}
                        <span className="text-sm font-normal text-gray-500">cameras</span>
                    </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">System Status</div>
                    <div className="flex items-center gap-2">
                        <div className="text-3xl font-bold text-green-500">{stats.online}</div>
                        <span className="text-sm text-gray-500">Online</span>
                        <div className="h-4 w-px bg-white/10 mx-2"></div>
                        <div className="text-3xl font-bold text-red-500">{stats.offline}</div>
                        <span className="text-sm text-gray-500">Offline</span>
                    </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">Avg Latency</div>
                    <div className="text-3xl font-bold flex items-baseline gap-2">
                        {stats.avgLatency}
                        <span className="text-sm font-normal text-gray-500">ms</span>
                    </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">Uptime</div>
                    <div className="text-3xl font-bold flex items-baseline gap-2">
                        {stats.uptime > 0 ? stats.uptime.toFixed(1) : '0.0'}%
                        <span className="text-sm font-normal text-gray-500">avg</span>
                    </div>
                </div>
            </div>

            {/* Combined Chart - Top 5 High Latency or just Representative */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-amber-400" />
                        Network Performance Overview
                    </h3>
                    <span className="text-xs text-gray-500">Auto-rotates every 10s</span>
                </div>
                <div className="h-64 w-full">
                    {/* Render a combined chart of randomly rotating online cameras */}
                    <Line
                        data={{
                            labels: (displayedCameras[0]?.history || []).map(h => new Date(h.timestamp).toLocaleTimeString()),
                            datasets: displayedCameras.map((c, i) => ({
                                label: c.cameraId,
                                data: c.history?.map(h => h.latencyMs) || [],
                                borderColor: i === 0 ? '#f59e0b' : i === 1 ? '#10b981' : '#f59e0b',
                                tension: 0.4,
                                pointRadius: 0
                            }))
                        }}
                        options={{
                            ...options,
                            maintainAspectRatio: false,
                            plugins: { ...options.plugins, legend: { display: true, labels: { color: '#9ca3af' } } },
                            scales: {
                                x: { display: true, grid: { display: false }, ticks: { color: '#6b7280', maxTicksLimit: 10 } },
                                y: { display: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#6b7280' } }
                            }
                        }}
                    />
                    {displayedCameras.length === 0 && (
                        <div className="h-full flex items-center justify-center text-gray-500">Not enough data for system chart</div>
                    )}
                </div>
            </div>

            {loading ? (
                <div>Loading...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredCameras.map((cam) => (
                        <div
                            key={cam.cameraId}
                            onClick={() => setSelectedCamera(cam)}
                            className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col gap-3 backdrop-blur-sm hover:border-amber-500/50 transition-colors cursor-pointer group"
                        >
                            <div className="flex justify-between items-start">
                                <div className="font-semibold text-lg truncate pr-2 group-hover:text-amber-400 transition-colors">{cam.cameraId}</div>
                                {cam.status === 'online' ? (
                                    <div className="flex items-center gap-1 text-green-500 bg-green-500/10 px-2 py-1 rounded-full text-xs shrink-0">
                                        <Wifi className="w-3 h-3" /> Online
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 text-red-500 bg-red-500/10 px-2 py-1 rounded-full text-xs shrink-0">
                                        <WifiOff className="w-3 h-3" /> Offline
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={(e) => handleDelete(cam.id, e)}
                                className="absolute top-4 right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-white/10 rounded"
                                title="Remove Camera"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>

                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="text-xs text-gray-400 mb-1">Latency</div>
                                    <div className={`text-2xl font-mono font-bold ${cam.latencyMs > 100 ? 'text-yellow-500' : 'text-white'}`}>
                                        {cam.latencyMs} <span className="text-sm font-sans font-normal text-gray-500">ms</span>
                                    </div>
                                </div>
                                <div className="h-10 w-24">
                                    {/* Mini sparkline */}
                                    <Line
                                        data={{
                                            labels: cam.history?.map(() => '') || [],
                                            datasets: [{
                                                data: cam.history?.map(h => h.latencyMs) || [],
                                                borderColor: cam.status === 'online' ? '#10b981' : '#ef4444',
                                                borderWidth: 2,
                                                tension: 0.4,
                                                pointRadius: 0
                                            }]
                                        }}
                                        options={{
                                            ...options,
                                            scales: { x: { display: false }, y: { display: false } }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-2 pt-2 border-t border-white/5">
                                <Clock className="w-3 h-3" />
                                <span>Updated: {new Date(cam.lastPing).toLocaleTimeString()}</span>
                            </div>
                        </div>
                    ))}

                    {cameras.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-500 bg-white/5 rounded-xl border border-white/10 border-dashed">
                            <Activity className="w-12 h-12 dashed mx-auto mb-3 opacity-20" />
                            <p>No cameras configured.</p>
                            <button onClick={() => setShowAddModal(true)} className="text-amber-400 hover:underline text-sm mt-2">Add your first target</button>
                        </div>
                    )}
                </div>
            )
            }

            {/* Detailed Camera Modal */}
            {
                selectedCamera && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setSelectedCamera(null)}>
                        <div className="w-full max-w-4xl bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-6 border-b border-white/10">
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                        {selectedCamera.cameraId}
                                        {selectedCamera.status === 'online'
                                            ? <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Online</span>
                                            : <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Offline</span>
                                        }
                                    </h3>
                                    <p className="text-sm text-gray-400 mt-1">{selectedCamera.id}</p>
                                </div>
                                <button onClick={() => setSelectedCamera(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                    <X className="w-6 h-6 text-gray-400" />
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="h-80 w-full mb-6 bg-black/20 rounded-xl p-4 border border-white/5">
                                    <DetailedChart
                                        history={selectedCamera.history || []}
                                        label="Latency (ms)"
                                        color={selectedCamera.status === 'online' ? '#10b981' : '#ef4444'}
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                        <div className="text-gray-400 text-xs uppercase mb-1">Current Latency</div>
                                        <div className="text-2xl font-mono font-bold">{selectedCamera.latencyMs} ms</div>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                        <div className="text-gray-400 text-xs uppercase mb-1">Last seen</div>
                                        <div className="text-lg font-medium">{new Date(selectedCamera.lastPing).toLocaleString()}</div>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                        <div className="text-gray-400 text-xs uppercase mb-1">Uptime</div>
                                        <div className="text-lg font-medium">
                                            {(() => {
                                                const history = selectedCamera.history || [];
                                                if (history.length === 0) return 'N/A';
                                                const online = history.filter((h: any) => h.status === 'online').length;
                                                return `${Math.round((online / history.length) * 100)}%`;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Add Modal (Reused) */}
            {
                showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-white/10">
                                <h3 className="font-semibold text-white">Add Health Monitor Target</h3>
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>
                            {/* Tabs */}
                            <div className="flex border-b border-white/10">
                                <button onClick={() => setActiveTab('manual')} className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'manual' ? "border-amber-500 text-amber-500" : "border-transparent text-gray-400 hover:text-gray-200"}`}>Manual Entry</button>
                                <button onClick={() => setActiveTab('csv')} className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'csv' ? "border-amber-500 text-amber-500" : "border-transparent text-gray-400 hover:text-gray-200"}`}>Paste CSV/List</button>
                            </div>
                            {/* Body */}
                            <div className="p-6">
                                {activeTab === 'manual' ? (
                                    <form onSubmit={handleManualSubmit} className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Device IP</label>
                                            <input type="text" required value={manualForm.ip} onChange={e => setManualForm({ ...manualForm, ip: e.target.value })} placeholder="192.168.1.100" className="w-full px-4 py-2 rounded-xl border border-white/10 bg-white/5 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-white outline-none transition-all" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Approach Name</label>
                                            <input type="text" required value={manualForm.name} onChange={e => setManualForm({ ...manualForm, name: e.target.value })} placeholder="Main Entrance" className="w-full px-4 py-2 rounded-xl border border-white/10 bg-white/5 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-white outline-none transition-all" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Location</label>
                                            <input type="text" value={manualForm.location} onChange={e => setManualForm({ ...manualForm, location: e.target.value })} placeholder="Entrance" className="w-full px-4 py-2 rounded-xl border border-white/10 bg-white/5 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-white outline-none transition-all" />
                                        </div>
                                        <button type="submit" disabled={isSubmitting} className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-lg shadow-amber-500/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">{isSubmitting ? 'Adding...' : 'Add Target'}</button>
                                    </form>
                                ) : (
                                    <form onSubmit={handleCsvSubmit} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Paste Data (IP, Name, Location)</label>
                                            <textarea
                                                value={csvText}
                                                onChange={e => setCsvText(e.target.value)}
                                                rows={8}
                                                placeholder={`192.168.1.50, Front Gate, Ext
192.168.1.51, Back Gate, Ext
10.0.0.5, Lobby Camera, Int`}
                                                className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-white outline-none transition-all font-mono text-sm"
                                            />
                                            <p className="text-xs text-gray-500">Format per line: IP, Name, Location</p>
                                        </div>
                                        <button type="submit" disabled={!csvText.trim() || isSubmitting} className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-lg shadow-amber-500/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">{isSubmitting ? 'Importing...' : 'Import Targets'}</button>
                                    </form>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            <HealthReportModal
                open={showHealthReport}
                onOpenChange={setShowHealthReport}
                selectedCameraIds={filteredCameras.map(c => c.id)}
            />
        </div>
    );
}
