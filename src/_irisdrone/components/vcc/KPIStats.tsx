import React from 'react';
import { Card } from '@irisdrone/components/ui/card';
import type { VCCStats, VCCRealtime } from '@irisdrone/lib/api';
import { Activity, Car } from 'lucide-react';

interface KPIStatsProps {
    stats: VCCStats | null;
    realtime: VCCRealtime | null;
    loading: boolean;
    totalCameras?: number; // Total cameras in the system for calculating operational %
    isSingleCamera?: boolean;
}

export function KPIStats({ stats, realtime, totalCameras = 0, isSingleCamera = false }: KPIStatsProps) {
    // Calculate active cameras from stats.byDevice (cameras with detections in the period)
    const activeCameras = stats?.byDevice?.length || 0;

    // Calculate operational percentage
    const operationalPercent = totalCameras > 0
        ? Math.round((activeCameras / totalCameras) * 100)
        : (activeCameras > 0 ? 100 : 0);

    const deviceTotal = (d: { totalDetections?: number; count: number }) => d.totalDetections ?? d.count;

    // Find busiest camera
    const busiestCamera = React.useMemo(() => {
        if (!stats?.byDevice || stats.byDevice.length === 0) return null;
        return stats.byDevice.reduce((prev, current) =>
            (deviceTotal(prev) > deviceTotal(current)) ? prev : current
        );
    }, [stats]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Detection Rate */}
            <Card className="bg-zinc-900/30 border border-white/5 rounded-lg p-3 flex flex-row items-center justify-between relative overflow-hidden group hover:bg-zinc-900/50 transition-all duration-200">
                <div className="flex flex-col gap-0.5 z-10 w-full pr-4">
                    <p className="text-[10px] font-semibold text-muted-foreground tracking-wide uppercase">
                        Detection Rate
                    </p>
                    <h3 className="text-lg font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                        {realtime?.perMinute ? Math.round(realtime.perMinute) : (stats?.averagePerHour ? Math.round(stats.averagePerHour / 60) : 0)}
                    </h3>
                    <div className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
                        Vehicles / min
                    </div>
                </div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center relative z-10 shrink-0 bg-green-500/10 text-green-500">
                    <Activity className="w-5 h-5" />
                </div>
            </Card>

            {/* Busiest Camera / Peak Hour Count (single camera) */}
            <Card className="bg-zinc-900/30 border border-white/5 rounded-lg p-3 flex flex-row items-center justify-between relative overflow-hidden group hover:bg-zinc-900/50 transition-all duration-200">
                <div className="flex flex-col gap-0.5 z-10 flex-1 min-w-0 pr-4">
                    {isSingleCamera ? (
                        <>
                            <p className="text-[10px] font-semibold text-muted-foreground tracking-wide uppercase">
                                Peak Hour Count
                            </p>
                            <h3 className="text-lg font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                                {stats?.byHour
                                    ? Math.max(...Object.values(stats.byHour).map(Number), 0).toLocaleString()
                                    : '0'}
                            </h3>
                            <div className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
                                Detections in busiest hour
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-[10px] font-semibold text-muted-foreground tracking-wide uppercase">
                                Busiest Camera
                            </p>
                            <h3 className="text-lg font-bold tracking-tight truncate pr-2 mt-0.5" title={busiestCamera?.deviceName || 'N/A'}>
                                {busiestCamera?.deviceName || 'N/A'}
                            </h3>
                            <div className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
                                {busiestCamera ? `${deviceTotal(busiestCamera).toLocaleString()} detections` : 'No data'}
                            </div>
                        </>
                    )}
                </div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center relative z-10 shrink-0 bg-yellow-500/10 text-yellow-500">
                    <Activity className="w-5 h-5" />
                </div>
            </Card>

            {/* System Uptime / Avg per Hour (single camera) */}
            <Card className="bg-zinc-900/30 border border-white/5 rounded-lg p-3 flex flex-row items-center justify-between relative overflow-hidden group hover:bg-zinc-900/50 transition-all duration-200">
                <div className="flex flex-col gap-0.5 z-10 w-full pr-4">
                    {isSingleCamera ? (
                        <>
                            <p className="text-[10px] font-semibold text-muted-foreground tracking-wide uppercase">
                                Avg per Hour
                            </p>
                            <h3 className="text-lg font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                                {stats?.averagePerHour ? Math.round(stats.averagePerHour).toLocaleString() : '0'}
                            </h3>
                            <div className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
                                Detections / hour
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-[10px] font-semibold text-muted-foreground tracking-wide uppercase">
                                Cameras Active
                            </p>
                            <h3 className="text-lg font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                                {operationalPercent}%
                            </h3>
                            <div className="mt-1 w-full bg-secondary h-1.5 rounded-full overflow-hidden max-w-[150px]">
                                <div
                                    className="bg-amber-500 h-full rounded-full transition-all"
                                    style={{ width: `${operationalPercent}%` }}
                                ></div>
                            </div>
                            <div className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
                                {activeCameras}/{totalCameras} cameras active
                            </div>
                        </>
                    )}
                </div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center relative z-10 shrink-0 bg-amber-500/10 text-amber-500">
                    <Activity className="w-5 h-5" />
                </div>
            </Card>

            {/* Avg Per Camera / Peak Day Count (single camera) */}
            <Card className="bg-zinc-900/30 border border-white/5 rounded-lg p-3 flex flex-row items-center justify-between relative overflow-hidden group hover:bg-zinc-900/50 transition-all duration-200">
                <div className="flex flex-col gap-0.5 z-10 w-full pr-4">
                    <p className="text-[10px] font-semibold text-muted-foreground tracking-wide uppercase">
                        {isSingleCamera ? 'Peak Day Count' : 'Avg Per Camera'}
                    </p>
                    <h3 className="text-lg font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                        {isSingleCamera
                            ? Math.max(...Object.values(stats?.byDayOfWeek || {}).map(Number), 0).toLocaleString()
                            : activeCameras > 0
                                ? Math.round((stats?.totalDetections || 0) / activeCameras).toLocaleString()
                                : '0'}
                    </h3>
                    <div className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
                        {isSingleCamera ? 'Detections on busiest day' : 'Detections per device'}
                    </div>
                </div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center relative z-10 shrink-0 bg-green-500/10 text-green-500">
                    <Car className="w-5 h-5" />
                </div>
            </Card>
        </div>
    );
}
