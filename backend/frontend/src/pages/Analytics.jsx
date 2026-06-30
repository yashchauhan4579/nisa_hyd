import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { API_URL } from '../config';
import { Activity, Camera, AlertTriangle, Shield, Server, Clock, Filter, Loader2 } from 'lucide-react';

const Analytics = () => {
    const [cameras, setCameras] = useState([]);
    const [stats, setStats] = useState({});
    const [violations, setViolations] = useState([]);
    const [allViolations, setAllViolations] = useState([]); // For total counts
    const [uptime, setUptime] = useState("0s");
    const [loading, setLoading] = useState(true);
    const [timeFilter, setTimeFilter] = useState('today'); // Filter for violations
    const [statusFilter, setStatusFilter] = useState('all'); // Filter by status
    const [violationsLoading, setViolationsLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [camerasRes, uptimeRes] = await Promise.all([
                    api.get('/cameras', { timeout: 10000 }),
                    api.get('/uptime', { timeout: 5000 })
                ]);
                setCameras(camerasRes.data);
                setUptime(uptimeRes.data.uptime);

                const statsData = {};
                for (const cam of camerasRes.data) {
                    try {
                        const statsRes = await api.get(`/stats/${cam.id}`, { timeout: 5000 });
                        statsData[cam.id] = statsRes.data;
                    } catch (e) {
                        // Stats might not be available for paused cameras
                    }
                }
                setStats(statsData);
            } catch (error) {
                console.error('Error fetching analytics data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000); // Refresh every 5s
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchViolations = async () => {
            setViolationsLoading(true);
            try {
                const params = new URLSearchParams();

                // Add status filter
                if (statusFilter && statusFilter !== 'all') {
                    if (statusFilter === 'approved') {
                        params.append('status', 'verified');
                    } else {
                        params.append('status', statusFilter);
                    }
                }

                // Add time filter (always send it since default is 'today')
                params.append('time_filter', timeFilter);

                const url = `/violations?${params.toString()}`;
                console.log('Fetching violations with URL:', url, 'timeFilter:', timeFilter);
                const response = await api.get(url, {
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });
                console.log(`Received ${response.data.length} violations for filter: ${timeFilter}`);
                setViolations(response.data);
            } catch (error) {
                console.error('Error fetching violations:', error);
            } finally {
                setViolationsLoading(false);
            }
        };

        const fetchAllViolations = async () => {
            try {
                const response = await api.get('/violations');
                setAllViolations(response.data);
            } catch (error) {
                console.error('Error fetching all violations:', error);
            }
        };

        // Fetch immediately
        fetchViolations();
        fetchAllViolations();

        // Set up interval for periodic updates (only fetch violations, not all violations every time)
        const interval = setInterval(() => {
            fetchViolations();
        }, 10000); // Increased to 10 seconds to reduce frequent loading

        return () => clearInterval(interval);
    }, [timeFilter, statusFilter]);

    const activeCameras = cameras.filter(c => c.is_active !== false).length;
    const totalViolations = allViolations.length;
    const pendingViolations = allViolations.filter(v => v.status === 'pending').length;

    if (loading) {
        return <div className="h-full flex items-center justify-center text-cyan-500">Loading Analytics...</div>;
    }

    return (
        <div className="p-8 h-full overflow-y-auto bg-[#050b14] text-gray-200">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-cyan-500 tracking-wider mb-2">System Analytics</h1>
                <p className="text-gray-500">Real-time monitoring and violation statistics.</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-[#0a101a]/80 border border-cyan-900/30 p-6 rounded-xl relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-sm font-medium mb-1">Active Cameras</p>
                            <h3 className="text-3xl font-bold text-blue-400">{activeCameras}</h3>
                        </div>
                        <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400">
                            <Camera size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-[#0a101a]/80 border border-cyan-900/30 p-6 rounded-xl relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-sm font-medium mb-1">Pending Review</p>
                            <h3 className="text-3xl font-bold text-amber-400">{pendingViolations}</h3>
                        </div>
                        <div className="p-3 bg-amber-500/10 rounded-lg text-amber-400">
                            <AlertTriangle size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-[#0a101a]/80 border border-cyan-900/30 p-6 rounded-xl relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-sm font-medium mb-1">Total Processed</p>
                            <h3 className="text-3xl font-bold text-emerald-400">{totalViolations}</h3>
                        </div>
                        <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
                            <Shield size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-[#0a101a]/80 border border-cyan-900/30 p-6 rounded-xl relative overflow-hidden group hover:border-cyan-500/30 transition-all">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-sm font-medium mb-1">System Uptime</p>
                            <h3 className="text-2xl font-bold text-purple-400">{uptime}</h3>
                        </div>
                        <div className="p-3 bg-purple-500/10 rounded-lg text-purple-400">
                            <Activity size={24} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-8">
                {/* Recent Activity - Full width */}
                <div className="bg-[#0a101a]/80 border border-cyan-900/30 rounded-xl overflow-hidden flex flex-col h-[400px]">
                    <div className="p-4 border-b border-cyan-900/30 bg-cyan-950/20 flex items-center gap-2">
                        <Clock size={20} className="text-cyan-500" />
                        <h2 className="font-bold text-cyan-100">Recent Alerts</h2>
                    </div>
                    <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar flex-1">
                        {violations.slice(0, 10).map(v => (
                            <div key={v.id} className="flex items-center gap-4 p-3 bg-black/20 rounded-lg border border-cyan-900/20 hover:bg-cyan-900/10 transition-colors">
                                <div className={`p-2 rounded-lg ${v.violationType === 'helmet' ? 'bg-red-500/10 text-red-400' :
                                    v.violationType === 'triple_riding' ? 'bg-amber-500/10 text-amber-400' :
                                        'bg-cyan-500/10 text-cyan-400'
                                    }`}>
                                    <AlertTriangle size={18} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold text-gray-200 text-sm uppercase">{v.violationType.replace('_', ' ')}</span>
                                        <span className="text-xs text-gray-500 font-mono">{new Date(v.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="text-xs text-gray-400 flex items-center gap-2">
                                        <span className="font-mono bg-gray-800 px-1.5 py-0.5 rounded">{v.licensePlate}</span>
                                        <span>•</span>
                                        <span>{v.location}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {violations.length === 0 && (
                            <div className="text-center py-8 text-gray-500">No recent alerts</div>
                        )}
                    </div>
                </div>
            </div>

            {/* System Status */}
            <div className="bg-[#0a101a]/80 border border-cyan-900/30 rounded-xl overflow-hidden mb-8">
                <div className="p-4 border-b border-cyan-900/30 bg-cyan-950/20 flex items-center gap-2">
                    <Server size={20} className="text-cyan-500" />
                    <h2 className="font-bold text-cyan-100">Camera Status</h2>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cameras.map(cam => (
                        <div key={cam.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-cyan-900/20">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse"></div>
                                <span className="font-medium text-gray-300">{cam.name}</span>
                            </div>
                            <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">ONLINE</span>
                        </div>
                    ))}
                    {cameras.length === 0 && (
                        <div className="col-span-full text-center py-4 text-gray-500">No cameras configured</div>
                    )}
                </div>
            </div>

            {/* Filtered Violations */}
            <div className="bg-[#0a101a]/80 border border-cyan-900/30 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-cyan-900/30 bg-cyan-950/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Filter size={20} className="text-cyan-500" />
                        <h2 className="font-bold text-cyan-100">Violations Report</h2>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Status Filter */}
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-400">Status:</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-[#050b14] border border-cyan-900/50 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                            >
                                <option value="all">All</option>
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </div>

                        {/* Time Filter */}
                        <div className="flex items-center gap-2">
                            <Clock size={16} className="text-gray-400" />
                            <label className="text-sm text-gray-400">Period:</label>
                            <select
                                value={timeFilter}
                                onChange={(e) => setTimeFilter(e.target.value)}
                                className="bg-[#050b14] border border-cyan-900/50 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                            >
                                <option value="1hour">Last One Hour</option>
                                <option value="today">Today</option>
                                <option value="1week">1 Week</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {violationsLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="animate-spin text-cyan-500" size={32} />
                            <span className="ml-3 text-gray-400">Loading violations...</span>
                        </div>
                    ) : violations.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            No violations found for the selected filters.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                                <div className="bg-black/20 border border-cyan-900/20 rounded-lg p-4">
                                    <p className="text-xs text-gray-500 mb-1">Total Violations</p>
                                    <p className="text-2xl font-bold text-cyan-400">{violations.length}</p>
                                </div>
                                <div className="bg-black/20 border border-cyan-900/20 rounded-lg p-4">
                                    <p className="text-xs text-gray-500 mb-1">By Type</p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {Object.entries(
                                            violations.reduce((acc, v) => {
                                                acc[v.violationType] = (acc[v.violationType] || 0) + 1;
                                                return acc;
                                            }, {})
                                        ).map(([type, count]) => (
                                            <span key={type} className="text-xs px-2 py-1 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">
                                                {type.replace('_', ' ')}: {count}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-black/20 border border-cyan-900/20 rounded-lg p-4">
                                    <p className="text-xs text-gray-500 mb-1">By Status</p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {Object.entries(
                                            violations.reduce((acc, v) => {
                                                acc[v.status] = (acc[v.status] || 0) + 1;
                                                return acc;
                                            }, {})
                                        ).map(([status, count]) => (
                                            <span key={status} className={`text-xs px-2 py-1 rounded border ${status === 'verified' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                    'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                }`}>
                                                {status}: {count}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-black/20 border border-cyan-900/20 rounded-lg overflow-hidden">
                                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                                    <table className="w-full">
                                        <thead className="bg-cyan-950/30 border-b border-cyan-900/30 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">Time</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">Type</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">License Plate</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">Camera</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-cyan-900/20">
                                            {violations.map((v) => (
                                                <tr key={v.id} className="hover:bg-cyan-900/10 transition-colors">
                                                    <td className="px-4 py-3 text-sm text-gray-300 font-mono">
                                                        {new Date(v.timestamp).toLocaleTimeString('en-US', {
                                                            hour: 'numeric',
                                                            minute: '2-digit',
                                                            hour12: true
                                                        })}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-xs px-2 py-1 rounded border ${v.violationType === 'helmet' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                            v.violationType === 'triple_riding' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                                v.violationType === 'speed' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                                                    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                                                            }`}>
                                                            {v.violationType.replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-mono text-gray-200">{v.licensePlate}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-400">{v.cameraId || v.location}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-xs px-2 py-1 rounded ${v.status === 'verified' ? 'text-green-400 bg-green-400/10' :
                                                            v.status === 'rejected' ? 'text-red-400 bg-red-400/10' :
                                                                'text-amber-400 bg-amber-400/10'
                                                            }`}>
                                                            {v.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Analytics;
