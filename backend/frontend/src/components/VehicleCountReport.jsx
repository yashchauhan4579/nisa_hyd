import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import VehicleCountTable from './VehicleCountTable';
import VehicleCountChart from './VehicleCountChart';
import { Calendar, Camera, Loader2 } from 'lucide-react';

const VehicleCountReport = ({ cameras }) => {
    const [period, setPeriod] = useState('day');
    const [selectedCamera, setSelectedCamera] = useState('all');
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchReportData();
    }, [period, selectedCamera]);

    const fetchReportData = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ period });
            if (selectedCamera !== 'all') {
                params.append('camera_id', selectedCamera);
            }
            
            const response = await api.get(`/reports/vehicle-counts?${params.toString()}`);
            setReportData(response.data);
        } catch (err) {
            console.error('Error fetching vehicle count report:', err);
            setError('Failed to load vehicle count report. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const periods = [
        { value: 'day', label: 'Day (Last 24 Hours)' },
        { value: 'week', label: 'Week (Last 7 Days)' },
        { value: 'month', label: 'Month (Last 30 Days)' },
        { value: 'year', label: 'Year (Last 12 Months)' }
    ];

    return (
        <div className="bg-[#0a101a]/80 border border-cyan-900/30 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-cyan-900/30 bg-cyan-950/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Calendar size={20} className="text-cyan-500" />
                    <h2 className="font-bold text-cyan-100">Vehicle Count Reports</h2>
                </div>
                <div className="flex items-center gap-4">
                    {/* Period Selector */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-400">Period:</label>
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                            className="bg-[#050b14] border border-cyan-900/50 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                        >
                            {periods.map(p => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Camera Selector */}
                    <div className="flex items-center gap-2">
                        <Camera size={16} className="text-gray-400" />
                        <label className="text-sm text-gray-400">Camera:</label>
                        <select
                            value={selectedCamera}
                            onChange={(e) => setSelectedCamera(e.target.value)}
                            className="bg-[#050b14] border border-cyan-900/50 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                        >
                            <option value="all">All Cameras</option>
                            {cameras.map(cam => (
                                <option key={cam.id} value={cam.id}>{cam.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="p-6">
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="animate-spin text-cyan-500" size={32} />
                        <span className="ml-3 text-gray-400">Loading report data...</span>
                    </div>
                )}

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-center">
                        {error}
                    </div>
                )}

                {!loading && !error && reportData && (
                    <>
                        {Object.keys(reportData.cameras || {}).length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                No vehicle count data available for the selected period.
                            </div>
                        ) : (
                            Object.entries(reportData.cameras || {}).map(([cameraId, cameraData]) => (
                                <div key={cameraId} className="mb-8 last:mb-0">
                                    <div className="mb-4">
                                        <h3 className="text-xl font-bold text-cyan-400 mb-2">{cameraData.name}</h3>
                                        {cameraData.summary && (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="bg-black/20 border border-cyan-900/20 rounded-lg p-3">
                                                    <p className="text-xs text-gray-500 mb-1">Total Count</p>
                                                    <p className="text-lg font-bold text-cyan-400">{cameraData.summary.total}</p>
                                                </div>
                                                <div className="bg-black/20 border border-cyan-900/20 rounded-lg p-3">
                                                    <p className="text-xs text-gray-500 mb-1">Average</p>
                                                    <p className="text-lg font-bold text-blue-400">{cameraData.summary.average}</p>
                                                </div>
                                                <div className="bg-black/20 border border-cyan-900/20 rounded-lg p-3">
                                                    <p className="text-xs text-gray-500 mb-1">Maximum</p>
                                                    <p className="text-lg font-bold text-emerald-400">{cameraData.summary.max}</p>
                                                </div>
                                                <div className="bg-black/20 border border-cyan-900/20 rounded-lg p-3">
                                                    <p className="text-xs text-gray-500 mb-1">Minimum</p>
                                                    <p className="text-lg font-bold text-amber-400">{cameraData.summary.min}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {cameraData.data && cameraData.data.length > 0 && (
                                        <>
                                            <div className="mb-6">
                                                <VehicleCountChart data={cameraData.data} period={period} cameraName={cameraData.name} />
                                            </div>
                                            <VehicleCountTable data={cameraData.data} period={period} />
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default VehicleCountReport;

