import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileDown, RefreshCw, FileSpreadsheet, Activity } from 'lucide-react';
import { format, subDays, isWithinInterval, parseISO, differenceInMinutes, formatDuration, intervalToDuration } from 'date-fns';
import * as XLSX from 'xlsx';

interface OfflineInterval {
    cameraId: string;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
}

import { DateTimeRangeContent, type DateTimeRange } from '@/components/nvcc/DateTimeRangePicker';

interface HealthData {
    id: string;
    cameraId: string;
    status: string;
    lastPing: string;
    latencyMs: number;
    location?: string; // Add location
    history?: {
        timestamp: string;
        latencyMs: number;
        status: string;
    }[];
}

interface HealthReportModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCameraIds?: string[];
}

import { LocationSelector } from '@/components/nvcc/LocationSelector';

export function HealthReportModal({ open, onOpenChange, selectedCameraIds }: HealthReportModalProps) {
    const [healthData, setHealthData] = useState<HealthData[]>([]);
    const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [excelLoading, setExcelLoading] = useState(false);
    const [ready, setReady] = useState(false);
    const [dateRange, setDateRange] = useState<DateTimeRange>({
        startDate: subDays(new Date(), 1),
        endDate: new Date()
    });

    useEffect(() => {
        if (open) {
            setReady(false);
            setHealthData([]);
            setSelectedLocations([]);
        }
    }, [open]);

    const locations = useMemo(() => {
        const locs = new Set<string>();
        healthData.forEach(h => {
            if (h.location) locs.add(h.location);
        });
        return Array.from(locs).sort();
    }, [healthData]);

    const handleGenerate = async () => {
        try {
            setLoading(true);
            setReady(false);

            // Fetch historical health data for the selected date range
            const params = new URLSearchParams({
                startTime: dateRange.startDate.toISOString(),
                endTime: dateRange.endDate.toISOString(),
            });

            const token = localStorage.getItem('token');
            const response = await fetch(`/api/camera-health/history?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch historical health data: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            setHealthData(data || []);
            setReady(true);
        } catch (error) {
            console.error("Failed to generate health report data:", error);
            alert(`Failed to load health data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const filteredHealthData = useMemo(() => {
        let targets = healthData;

        // Filter by Location
        if (selectedLocations.length > 0) {
            targets = targets.filter(t => t.location && selectedLocations.includes(t.location));
        }

        // Filter by Camera Selection (from Page or manual if we add specific selector here?)
        // Currently selectedCameraIds comes from PROPS (Linked to Page).
        if (selectedCameraIds && selectedCameraIds.length > 0) {
            targets = targets.filter(t => selectedCameraIds.includes(t.id) || selectedCameraIds.includes(t.cameraId));
        }

        // History is already filtered by date range from backend
        return targets;
    }, [healthData, selectedCameraIds, selectedLocations]);

    // offlineIntervals moved up for dependency
    const offlineIntervals = useMemo(() => {
        const intervals: OfflineInterval[] = [];
        filteredHealthData.forEach(cam => {
            if (!cam.history || cam.history.length === 0) return;

            // Sort history by timestamp asc
            const sorted = [...cam.history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            let currentStart: Date | null = null;

            for (let i = 0; i < sorted.length; i++) {
                const point = sorted[i];
                const isOffline = point.status !== 'online';

                if (isOffline && !currentStart) {
                    currentStart = new Date(point.timestamp);
                } else if (!isOffline && currentStart) {
                    const end = new Date(point.timestamp);
                    const duration = differenceInMinutes(end, currentStart);
                    if (duration >= 1) { // Only log > 1 min
                        intervals.push({
                            cameraId: (cam.cameraId).replace(/^Camera\s+/i, ""),
                            startTime: currentStart,
                            endTime: end,
                            durationMinutes: duration
                        });
                    }
                    currentStart = null;
                }
            }
            // If still offline at end
            if (currentStart) {
                const end = new Date(); // Assume until now
                const duration = differenceInMinutes(end, currentStart);
                if (duration >= 1) {
                    intervals.push({
                        cameraId: (cam.cameraId).replace(/^Camera\s+/i, ""),
                        startTime: currentStart,
                        endTime: end,
                        durationMinutes: duration
                    });
                }
            }
        });
        return intervals.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }, [filteredHealthData]);

    // Calculate stats based on filtered data
    const stats = useMemo(() => {
        const total = filteredHealthData.length;
        const online = filteredHealthData.filter(c => c.status === 'online').length;
        const offline = total - online;
        const avgLatency = online > 0
            ? Math.round(filteredHealthData.filter(c => c.status === 'online').reduce((acc, c) => acc + c.latencyMs, 0) / online)
            : 0;

        // Calculate global uptime: (Total Time - Offline Time) / Total Time
        // Total Time = numCameras * (EndDate - StartDate)
        // Offline Time = Sum of offlineIntervals duration

        let totalTimeMinutes = 0;
        let totalOfflineMinutes = 0;

        const start = dateRange.startDate;
        const end = dateRange.endDate;
        const durationMinutes = differenceInMinutes(end, start);

        if (durationMinutes > 0 && total > 0) {
            totalTimeMinutes = total * durationMinutes;

            // Sum all offline minutes that fall within the selected range logic
            // Note: offlineIntervals already parsed based on filteredHealthData which is loosely filtered.
            // But we should re-verify offlineIntervals logic relies on history.
            // Ideally we sum up 'durationMinutes' from offlineIntervals for these cameras.
            totalOfflineMinutes = offlineIntervals.reduce((acc, curr) => acc + curr.durationMinutes, 0);

            const uptimePct = ((totalTimeMinutes - totalOfflineMinutes) / totalTimeMinutes) * 100;
            const uptime = Math.min(Math.max(uptimePct, 0), 100).toFixed(1); // 99.9%

            return { total, online, offline, avgLatency, uptime };
        }

        return { total, online, offline, avgLatency, uptime: 0 };
    }, [filteredHealthData, offlineIntervals, dateRange]);

    const handleDownloadExcel = () => {
        try {
            setExcelLoading(true);

            if (!healthData || healthData.length === 0) {
                alert("No data found.");
                setExcelLoading(false);
                return;
            }

            // Create a single combined report
            const reportData: any[] = [];

            // Add header section with summary
            reportData.push({ 'A': 'IRIS Camera Health Report', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
            reportData.push({ 'A': 'Generated', 'B': format(new Date(), 'yyyy-MM-dd HH:mm:ss'), 'C': '', 'D': '', 'E': '', 'F': '' });
            reportData.push({
                'A': 'Report Selection',
                'B': `${format(dateRange.startDate, 'yyyy-MM-dd HH:mm')} to ${format(dateRange.endDate, 'yyyy-MM-dd HH:mm')}`,
                'C': '', 'D': '', 'E': '', 'F': ''
            });
            reportData.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });

            // Summary row
            reportData.push({
                'A': 'Summary:',
                'B': `Total: ${stats.total}`,
                'C': `Online: ${stats.online}`,
                'D': `Offline: ${stats.offline}`,
                'E': `Avg Latency: ${stats.avgLatency}ms`,
                'F': `Uptime: ${stats.uptime}%`
            });
            reportData.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });

            // Column headers for camera data
            reportData.push({
                'A': 'Camera IP',
                'B': 'Camera Name',
                'C': 'Status',
                'D': 'Latency (ms)',
                'E': 'Last Ping',
                'F': 'Uptime %'
            });

            // Camera data rows with individual uptime
            filteredHealthData.forEach(cam => {
                const history = cam.history || [];
                const camUptime = history.length > 0
                    ? Math.round((history.filter(h => h.status === 'online').length / history.length) * 100)
                    : 0;

                reportData.push({
                    'A': cam.id,
                    'B': cam.cameraId,
                    'C': cam.status.toUpperCase(),
                    'D': cam.latencyMs,
                    'E': format(new Date(cam.lastPing), 'yyyy-MM-dd HH:mm:ss'),
                    'F': `${camUptime}%`
                });
            });

            // Create workbook with single sheet
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(reportData, { skipHeader: true });

            // Set column widths
            worksheet['!cols'] = [
                { wch: 18 },  // Camera IP
                { wch: 35 },  // Camera Name
                { wch: 10 },  // Status
                { wch: 12 },  // Latency
                { wch: 20 },  // Last Ping
                { wch: 10 },  // Uptime
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, "Health Report");

            // Offline Analysis Sheet
            if (offlineIntervals && offlineIntervals.length > 0) {
                const offlineData = offlineIntervals.map(i => ({
                    'Camera': i.cameraId,
                    'Start Time': format(i.startTime, 'yyyy-MM-dd HH:mm:ss'),
                    'End Time': format(i.endTime, 'yyyy-MM-dd HH:mm:ss'),
                    'Duration (Mins)': i.durationMinutes,
                    'Time Range': `${format(i.startTime, 'HH:mm')} - ${format(i.endTime, 'HH:mm')}`
                }));
                const wsOffline = XLSX.utils.json_to_sheet(offlineData);
                wsOffline['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 20 }];
                XLSX.utils.book_append_sheet(workbook, wsOffline, "Offline Analysis");
            }

            // Trigger download
            const fileName = `iris_health_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;
            XLSX.writeFile(workbook, fileName);

        } catch (error) {
            console.error("Failed to download Excel:", error);
            alert("Failed to generate Excel file.");
        } finally {
            setExcelLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-amber-500" />
                        Generate Health Report
                    </DialogTitle>
                    <DialogDescription>
                        Export camera health and connectivity data as Excel.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">

                    {/* Date Range Picker */}
                    <div className="border rounded-md bg-muted/10">
                        <DateTimeRangeContent
                            value={dateRange}
                            onChange={(r) => {
                                setDateRange(r);
                                // If already ready, maybe we should stay ready but just re-calc stats?
                                // Actually generating data fetches fresh data from backend. 
                                // But filtering is local. So we don't need to re-fetch to filter.
                                // But if user wants to 'prepare data', existing flow is fetch first.
                                // We can keep it simple: date range just filters displayed/exported data.
                            }}
                            showFooter={false}
                        />
                    </div>

                    {/* Filters */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">Location Filter</label>
                        <LocationSelector
                            locations={locations}
                            selectedLocations={selectedLocations}
                            onSelectionChange={setSelectedLocations}
                            className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10"
                        />
                    </div>

                    {ready && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="p-3 bg-muted/50 rounded-lg text-center">
                                <div className="text-2xl font-bold">{stats.total}</div>
                                <div className="text-xs text-muted-foreground">Total Cameras</div>
                            </div>
                            <div className="p-3 bg-green-500/10 rounded-lg text-center">
                                <div className="text-2xl font-bold text-green-500">{stats.online}</div>
                                <div className="text-xs text-muted-foreground">Online</div>
                            </div>
                            <div className="p-3 bg-red-500/10 rounded-lg text-center">
                                <div className="text-2xl font-bold text-red-500">{stats.offline}</div>
                                <div className="text-xs text-muted-foreground">Offline</div>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg text-center">
                                <div className="text-2xl font-bold">{stats.uptime}%</div>
                                <div className="text-xs text-muted-foreground">Uptime</div>
                            </div>
                        </div>
                    )}

                    {ready && healthData.length > 0 && (
                        <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                            <div className="text-sm font-medium mb-2">Camera Status Preview</div>
                            <div className="space-y-1">
                                {healthData.slice(0, 10).map(cam => (
                                    <div key={cam.id} className="flex justify-between text-sm">
                                        <span className="truncate flex-1">{cam.cameraId}</span>
                                        <span className={`ml-2 ${cam.status === 'online' ? 'text-green-500' : 'text-red-500'}`}>
                                            {cam.status.toUpperCase()}
                                        </span>
                                    </div>
                                ))}
                                {healthData.length > 10 && (
                                    <div className="text-xs text-muted-foreground">...and {healthData.length - 10} more</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {!ready ? (
                        <Button onClick={handleGenerate} disabled={loading} className="w-full sm:w-auto">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                            Prepare Data
                        </Button>
                    ) : (
                        <div className="flex gap-2 w-full sm:w-auto justify-end">
                            <Button variant="ghost" onClick={() => setReady(false)}>Refresh</Button>
                            <Button className="bg-white text-black hover:bg-zinc-200" onClick={handleDownloadExcel} disabled={excelLoading}>
                                {excelLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                                Download Excel Report
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
