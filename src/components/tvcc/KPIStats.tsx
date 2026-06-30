import React from 'react';
import { Card } from '@/components/ui/card';
import type { VCCStats, VCCRealtime } from '@/lib/api';
import { ArrowUpRight, ArrowDownRight, Activity, Car, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPIStatsProps {
    stats: VCCStats | null;
    realtime: VCCRealtime | null;
    loading: boolean;
    totalCameras?: number; // Total cameras in the system for calculating operational %
    isSingleCamera?: boolean;
}

export function KPIStats({ stats, realtime, loading, totalCameras = 0, isSingleCamera = false }: KPIStatsProps) {
    // Calculate active cameras from stats.byDevice (cameras with detections in the period)
    const activeCameras = stats?.byDevice?.length || 0;

    // Calculate operational percentage
    const operationalPercent = totalCameras > 0
        ? Math.round((activeCameras / totalCameras) * 100)
        : (activeCameras > 0 ? 100 : 0);

    // Find busiest camera
    const busiestCamera = React.useMemo(() => {
        if (!stats?.byDevice || stats.byDevice.length === 0) return null;
        return stats.byDevice.reduce((prev, current) =>
            (prev.totalDetections > current.totalDetections) ? prev : current
        );
    }, [stats]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Detection Rate */}
            <Card className="glass p-4 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200">
                <div className="absolute -top-6 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity bg-green-500" />
                <div className="flex flex-col gap-0.5 z-10 w-full pr-4">
                    <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                        Detection Rate
                    </p>
                    <h3 className="text-2xl font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                        {realtime?.perMinute ? Math.round(realtime.perMinute) : (stats?.averagePerHour ? Math.round(stats.averagePerHour / 60) : 0)}
                    </h3>
                    <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">
                        Vehicles / min
                    </div>
                </div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10 shrink-0 bg-green-500/10 text-green-500">
                    <Activity className="w-7 h-7" />
                </div>
            </Card>

            {/* Busiest Camera / Peak Hour Count (single camera) */}
            <Card className="glass p-4 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200">
                <div className="absolute -top-6 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity bg-amber-500" />
                <div className="flex flex-col gap-0.5 z-10 flex-1 min-w-0 pr-4">
                    {isSingleCamera ? (
                        <>
                            <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                                Peak Hour Count
                            </p>
                            <h3 className="text-2xl font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                                {stats?.byHour
                                    ? Math.max(...Object.values(stats.byHour).map(Number), 0).toLocaleString()
                                    : '0'}
                            </h3>
                            <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">
                                Detections in busiest hour
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                                Busiest Camera
                            </p>
                            <h3 className={`font-bold tracking-tight truncate pr-2 mt-0.5 ${
                                (busiestCamera?.deviceName?.length || 0) > 26 ? 'text-xs' :
                                (busiestCamera?.deviceName?.length || 0) > 22 ? 'text-sm' :
                                (busiestCamera?.deviceName?.length || 0) > 17 ? 'text-base' :
                                (busiestCamera?.deviceName?.length || 0) > 12 ? 'text-lg' : 'text-2xl'
                            }`} title={busiestCamera?.deviceName || 'N/A'}>
                                {busiestCamera?.deviceName || 'N/A'}
                            </h3>
                            <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">
                                {busiestCamera ? `${busiestCamera.totalDetections.toLocaleString()} detections` : 'No data'}
                            </div>
                        </>
                    )}
                </div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10 shrink-0 bg-amber-500/10 text-amber-500">
                    <Activity className="w-7 h-7" />
                </div>
            </Card>

            {/* System Uptime / Avg per Hour (single camera) */}
            <Card className="glass p-4 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200">
                <div className="absolute -top-6 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity bg-amber-500" />
                <div className="flex flex-col gap-0.5 z-10 w-full pr-4">
                    {isSingleCamera ? (
                        <>
                            <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                                Avg per Hour
                            </p>
                            <h3 className="text-2xl font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                                {stats?.averagePerHour ? Math.round(stats.averagePerHour).toLocaleString() : '0'}
                            </h3>
                            <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">
                                Detections / hour
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                                Cameras Active
                            </p>
                            <h3 className="text-2xl font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                                {operationalPercent}%
                            </h3>
                            <div className="mt-1 w-full bg-secondary h-1.5 rounded-full overflow-hidden max-w-[150px]">
                                <div
                                    className="bg-amber-500 h-full rounded-full transition-all"
                                    style={{ width: `${operationalPercent}%` }}
                                ></div>
                            </div>
                            <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">
                                {activeCameras}/{totalCameras} cameras active
                            </div>
                        </>
                    )}
                </div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10 shrink-0 bg-amber-500/10 text-amber-500">
                    <Activity className="w-7 h-7" />
                </div>
            </Card>

            {/* Avg Per Camera / Peak Day Count (single camera) */}
            <Card className="glass p-4 flex flex-row items-center justify-between relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200">
                <div className="absolute -top-6 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity bg-green-500" />
                <div className="flex flex-col gap-0.5 z-10 w-full pr-4">
                    <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                        {isSingleCamera ? 'Peak Day Count' : 'Avg Per Camera'}
                    </p>
                    <h3 className="text-2xl font-bold tabular-nums tracking-tight truncate pr-2 mt-0.5">
                        {isSingleCamera
                            ? Math.max(...Object.values(stats?.byDayOfWeek || {}).map(Number), 0).toLocaleString()
                            : activeCameras > 0
                                ? Math.round((stats?.totalDetections || 0) / activeCameras).toLocaleString()
                                : '0'}
                    </h3>
                    <div className="text-sm font-medium text-muted-foreground mt-0.5 truncate">
                        {isSingleCamera ? 'Detections on busiest day' : 'Detections per device'}
                    </div>
                </div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10 shrink-0 bg-green-500/10 text-green-500">
                    <Car className="w-7 h-7" />
                </div>
            </Card>
        </div>
    );
}

function BadgeTrend({ value }: { value: number }) {
    const isPositive = value >= 0;
    return (
        <div className={cn(
            "flex items-center text-xs font-medium px-1.5 py-0.5 rounded",
            isPositive ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"
        )}>
            {isPositive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
            {Math.abs(value).toFixed(1)}%
        </div>
    );
}
