import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, FileSpreadsheet, Activity } from 'lucide-react';
import { format, subDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { DateTimeRangeContent, type DateTimeRange } from '@/components/tvcc/DateTimeRangePicker';

interface HealthData {
    id: string;
    cameraId: string;
    location?: string;
    status: string;
    lastPing: string;
    latencyMs: number;
    history?: {
        timestamp: string;
        latencyMs: number;
        status: string;
    }[];
}

interface DowntimeInterval {
    cameraIp: string;
    cameraName: string;
    location: string;
    start: Date;
    end: Date;
    durationMinutes: number;
}

interface HealthReportModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function computeDowntimeIntervals(cameras: HealthData[]): DowntimeInterval[] {
    const intervals: DowntimeInterval[] = [];
    for (const cam of cameras) {
        const history = [...(cam.history || [])].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        if (history.length === 0) continue;

        let offlineStart: Date | null = null;
        for (const ping of history) {
            const ts = new Date(ping.timestamp);
            if (ping.status === 'offline' && offlineStart === null) {
                offlineStart = ts;
            } else if (ping.status === 'online' && offlineStart !== null) {
                const durationMs = ts.getTime() - offlineStart.getTime();
                intervals.push({
                    cameraIp: cam.id,
                    cameraName: cam.cameraId,
                    location: cam.location || '',
                    start: offlineStart,
                    end: ts,
                    durationMinutes: Math.round(durationMs / 60000),
                });
                offlineStart = null;
            }
        }
        // Still offline at end of data window
        if (offlineStart !== null) {
            const lastTs = new Date(history[history.length - 1].timestamp);
            const durationMs = lastTs.getTime() - offlineStart.getTime();
            intervals.push({
                cameraIp: cam.id,
                cameraName: cam.cameraId,
                location: cam.location || '',
                start: offlineStart,
                end: lastTs,
                durationMinutes: Math.round(durationMs / 60000),
            });
        }
    }
    return intervals;
}

export function HealthReportModal({ open, onOpenChange }: HealthReportModalProps) {
    const [healthData, setHealthData] = useState<HealthData[]>([]);
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
        }
    }, [open]);

    const handleGenerate = async () => {
        try {
            setLoading(true);
            setReady(false);

            const token = localStorage.getItem('token');
            const start = dateRange.startDate.toISOString();
            const end = dateRange.endDate.toISOString();

            const response = await fetch(
                `/api/camera-health/history?startTime=${encodeURIComponent(start)}&endTime=${encodeURIComponent(end)}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch health data');

            const data = await response.json();
            setHealthData(data || []);
            setReady(true);
        } catch (error) {
            console.error("Failed to generate health report data:", error);
            alert("Failed to load health data.");
        } finally {
            setLoading(false);
        }
    };

    // Calculate per-camera uptime from history
    const perCameraStats = useMemo(() => {
        return healthData.map(cam => {
            const history = cam.history || [];
            const total = history.length;
            const onlineCount = history.filter(h => h.status === 'online').length;
            const uptime = total > 0 ? Math.round((onlineCount / total) * 100) : 100;
            const avgLatency = onlineCount > 0
                ? Math.round(history.filter(h => h.status === 'online').reduce((s, h) => s + h.latencyMs, 0) / onlineCount)
                : 0;
            return { ...cam, uptime, avgLatency };
        });
    }, [healthData]);

    const stats = useMemo(() => {
        const total = perCameraStats.length;
        const online = perCameraStats.filter(c => c.status === 'online').length;
        const offline = total - online;
        const avgLatency = perCameraStats.length > 0
            ? Math.round(perCameraStats.reduce((s, c) => s + c.avgLatency, 0) / perCameraStats.length)
            : 0;
        const overallUptime = total > 0
            ? Math.round(perCameraStats.reduce((s, c) => s + c.uptime, 0) / total)
            : 0;
        return { total, online, offline, avgLatency, uptime: overallUptime };
    }, [perCameraStats]);

    const handleDownloadExcel = () => {
        try {
            setExcelLoading(true);

            if (!healthData || healthData.length === 0) {
                alert("No data found.");
                setExcelLoading(false);
                return;
            }

            const workbook = XLSX.utils.book_new();

            // ── Sheet 1: Summary ──────────────────────────────────────────────
            const summaryRows: any[] = [];

            summaryRows.push({ 'A': 'IRIS Camera Health Report', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
            summaryRows.push({ 'A': 'Generated', 'B': format(new Date(), 'yyyy-MM-dd HH:mm:ss'), 'C': '', 'D': '', 'E': '', 'F': '' });
            summaryRows.push({
                'A': 'Period',
                'B': `${format(dateRange.startDate, 'yyyy-MM-dd HH:mm')} to ${format(dateRange.endDate, 'yyyy-MM-dd HH:mm')}`,
                'C': '', 'D': '', 'E': '', 'F': ''
            });
            summaryRows.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });

            summaryRows.push({
                'A': 'Total Cameras', 'B': `${stats.total}`,
                'C': 'Online', 'D': `${stats.online}`,
                'E': 'Offline', 'F': `${stats.offline}`
            });
            summaryRows.push({ 'A': 'Avg Latency', 'B': `${stats.avgLatency} ms`, 'C': 'Overall Uptime', 'D': `${stats.uptime}%`, 'E': '', 'F': '' });
            summaryRows.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });

            summaryRows.push({
                'A': 'Camera IP',
                'B': 'Camera Name',
                'C': 'Location',
                'D': 'Current Status',
                'E': 'Avg Latency (ms)',
                'F': 'Uptime %'
            });

            perCameraStats.forEach(cam => {
                summaryRows.push({
                    'A': cam.id,
                    'B': cam.cameraId,
                    'C': cam.location || '',
                    'D': cam.status.toUpperCase(),
                    'E': cam.avgLatency,
                    'F': `${cam.uptime}%`
                });
            });

            const summarySheet = XLSX.utils.json_to_sheet(summaryRows, { skipHeader: true });
            summarySheet['!cols'] = [
                { wch: 18 }, { wch: 35 }, { wch: 25 }, { wch: 14 }, { wch: 16 }, { wch: 10 }
            ];
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Health Summary');

            // ── Sheet 2: Downtime Periods ────────────────────────────────────
            const downtimeIntervals = computeDowntimeIntervals(healthData);

            const downtimeRows: any[] = [];
            downtimeRows.push({ 'A': 'IRIS Camera Downtime Report', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
            downtimeRows.push({
                'A': 'Period',
                'B': `${format(dateRange.startDate, 'yyyy-MM-dd HH:mm')} to ${format(dateRange.endDate, 'yyyy-MM-dd HH:mm')}`,
                'C': '', 'D': '', 'E': '', 'F': ''
            });
            downtimeRows.push({ 'A': '', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });

            if (downtimeIntervals.length === 0) {
                downtimeRows.push({ 'A': 'No downtime recorded in this period.', 'B': '', 'C': '', 'D': '', 'E': '', 'F': '' });
            } else {
                downtimeRows.push({
                    'A': 'Camera IP',
                    'B': 'Camera Name',
                    'C': 'Location',
                    'D': 'Downtime Start',
                    'E': 'Downtime End',
                    'F': 'Duration (min)'
                });

                downtimeIntervals.forEach(interval => {
                    downtimeRows.push({
                        'A': interval.cameraIp,
                        'B': interval.cameraName,
                        'C': interval.location,
                        'D': format(interval.start, 'yyyy-MM-dd HH:mm:ss'),
                        'E': format(interval.end, 'yyyy-MM-dd HH:mm:ss'),
                        'F': interval.durationMinutes,
                    });
                });
            }

            const downtimeSheet = XLSX.utils.json_to_sheet(downtimeRows, { skipHeader: true });
            downtimeSheet['!cols'] = [
                { wch: 18 }, { wch: 35 }, { wch: 25 }, { wch: 22 }, { wch: 22 }, { wch: 14 }
            ];
            XLSX.utils.book_append_sheet(workbook, downtimeSheet, 'Downtime Periods');

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
                        Export camera health and downtime periods as Excel.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="border rounded-md bg-muted/10">
                        <DateTimeRangeContent
                            value={dateRange}
                            onChange={(r) => {
                                setDateRange(r);
                                setReady(false);
                            }}
                            showFooter={false}
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
                                <div className="text-xs text-muted-foreground">Avg Uptime</div>
                            </div>
                        </div>
                    )}

                    {ready && healthData.length > 0 && (
                        <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                            <div className="text-sm font-medium mb-2">Camera Status Preview</div>
                            <div className="space-y-1">
                                {perCameraStats.slice(0, 10).map(cam => (
                                    <div key={cam.id} className="flex justify-between text-sm">
                                        <span className="truncate flex-1">{cam.cameraId}</span>
                                        <span className={`ml-4 shrink-0 ${cam.uptime < 100 ? 'text-yellow-500' : 'text-green-500'}`}>
                                            {cam.uptime}%
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
