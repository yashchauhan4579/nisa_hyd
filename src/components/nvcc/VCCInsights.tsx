import { Card } from '@/components/ui/card';
import { type VCCStats, type VCCDeviceStats } from '@/lib/api';
import { Award, Clock, Calendar, TrendingUp, Car, Camera, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CameraOption } from '@/components/nvcc/CameraSelector';
import { CountUp } from './CountUp';
import { formatUTCHourToIST, formatUTCHourToISTCompact } from '@/lib/dateUtils';

interface HealthStats {
    total: number;
    online: number;
    offline: number;
    avgLatency: number;
    uptime: number;
}

interface VCCInsightsProps {
    stats: VCCStats | VCCDeviceStats | null;
    overallStats?: VCCStats | null; // Full stats for Total Detections (2.4M)
    loading?: boolean;
    cameras?: CameraOption[];
    isSingleCamera?: boolean;
    hourlyStats?: Record<string, number>; // Targeted fix for Peak/Quiet hours
    healthStats?: HealthStats; // Camera health and uptime data
    variant?: 'itms' | 'vcc'; // Dashboard variant: 'itms' shows uptime/busiest camera, 'vcc' shows busiest day/hour
}

export function VCCInsights({ stats, overallStats, loading, cameras, isSingleCamera, hourlyStats, healthStats, variant = 'itms' }: VCCInsightsProps) {
    if (loading || !stats) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[0, 1, 2, 3].map((i) => (
                    <Card key={i} className="glass p-4">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="h-3 w-24 bg-white/10 rounded animate-pulse mb-3" />
                                <div className="h-7 w-32 bg-white/10 rounded animate-pulse mb-2" />
                                <div className="h-3 w-20 bg-white/10 rounded animate-pulse" />
                            </div>
                            <div className="w-9 h-9 rounded-lg bg-white/10 animate-pulse" />
                        </div>
                    </Card>
                ))}
            </div>
        );
    }

    // Helper to safely access stats properties which might vary between VCCStats and VCCDeviceStats
    const safeStats = stats as any;

    // 1. Most Active Camera (only for global stats)
    const getTopDevice = () => {
        if (!safeStats.byDevice || safeStats.byDevice.length === 0) return null;
        return safeStats.byDevice[0]; // Already sorted by backend
    };

    // 2. Peak Traffic Time
    const getPeakTime = () => {
        let day = safeStats.peakDay;
        // Fallback: derive busiest day from byDayOfWeek (VCCDeviceStats doesn't include peakDay)
        if (!day && safeStats.byDayOfWeek) {
            let maxCount = 0;
            Object.entries(safeStats.byDayOfWeek as Record<string, number>).forEach(([d, c]) => {
                if (Number(c) > maxCount) { maxCount = Number(c); day = d; }
            });
        }
        return {
            hour: safeStats.peakHour,
            day
        };
    };

    // 3. Dominant Vehicle Type (use full time-range stats, not today-only stats)
    const getDominantVehicle = () => {
        const types = (overallStats as any)?.byVehicleType || safeStats.byVehicleType || {};
        let max = 0;
        let type = 'N/A';
        Object.entries(types).forEach(([k, v]) => {
            if (Number(v) > max) {
                max = Number(v);
                type = k;
            }
        });
        return { type, count: max };
    };

    // 4. Top 3 Peak & Quiet Hours
    const getHourlyInsights = () => {
        // Use byHour directly from API (UTC hour keys 0-23 → total count).
        // This avoids brittle byTime string-parsing and keeps hours as UTC
        // so formatUTCHourToISTCompact renders the correct IST range.
        const apiByHour: Record<string, number> = safeStats.byHour || {};

        let hours = Object.entries(apiByHour)
            .map(([utcHourStr, count]) => ({
                hour: Number(utcHourStr), // UTC hour — consumed by formatUTCHourToISTCompact
                count: Number(count)
            }))
            .filter(e => !isNaN(e.hour) && e.hour >= 0 && e.hour <= 23);

        // Fallback: derive from byTime if byHour is absent
        if (hours.length === 0 && safeStats.byTime && safeStats.byTime.length > 0) {
            const hourMap: Record<number, number> = {};
            (safeStats.byTime as any[]).forEach((entry: any) => {
                let ts = entry.hour || entry.time_period || entry.date;
                if (!ts) return;
                if (/^\d{4}-\d{2}-\d{2}\s\d{1,2}$/.test(ts.toString())) {
                    const parts = ts.toString().split(' ');
                    ts = `${parts[0]}T${parts[1].padStart(2, '0')}:00:00`;
                }
                const safeTs = ts.toString().trim().replace(' ', 'T') + 'Z';
                const utcDate = new Date(safeTs);
                if (isNaN(utcDate.getTime())) return;
                const utcHour = utcDate.getUTCHours();
                hourMap[utcHour] = (hourMap[utcHour] || 0) + (Number(entry.count) || 0);
            });
            hours = Object.entries(hourMap).map(([h, c]) => ({ hour: Number(h), count: Number(c) }));
        }

        const sorted = [...hours].sort((a, b) => b.count - a.count);
        const top3Peak = sorted.slice(0, 3);
        const top3Quiet = [...sorted].reverse().slice(0, 3).sort((a, b) => a.count - b.count);

        return { top3Peak, top3Quiet };
    };

    const topDevice = getTopDevice();

    // Resolve location for top device
    let topDeviceLocation = '';
    let topDeviceName = topDevice ? (topDevice.deviceName || topDevice.deviceId) : '';

    if (topDevice) {
        // Strip prefix
        topDeviceName = topDeviceName.replace(/^Camera\s+/i, "");

        // Find location
        if (cameras) {
            const cam = cameras.find(c => c.id === topDevice.deviceId);
            if (cam && cam.metadata && cam.metadata.location) {
                topDeviceLocation = cam.metadata.location;
            }
        }
    }

    const peakTime = getPeakTime();
    const dominantVehicle = getDominantVehicle();
    const { top3Peak, top3Quiet } = getHourlyInsights();
    const total = (overallStats as any)?.totalDetections || safeStats.totalDetections || 0;

    // Use overallStats for Total Detections if available, otherwise fall back to stats
    const totalStats = overallStats || stats;

    // Get busiest camera
    const busiestCamera = topDevice ? {
        name: topDeviceName,
        detections: topDevice.totalDetections
    } : null;

    // Count active cameras using health stats if available, otherwise use hardcoded values
    const totalCameras = healthStats?.total || 94;
    const activeCameras = healthStats?.online || 0;
    const operationalPercentage = healthStats?.uptime || (totalCameras > 0 ? Math.round((activeCameras / totalCameras) * 100) : 0);

    // Format busiest day and hour for VCC variant
    const formatBusiestDay = () => {
        if (!peakTime.day) return 'N/A';
        // peakDay returns day name like "Thursday", "Monday", etc.
        return peakTime.day;
    };

    const formatBusiestHour = () => {
        if (peakTime.hour === undefined || peakTime.hour === null) return 'N/A';
        const utcHour = Number(peakTime.hour);
        // Convert UTC hour to IST time range
        return formatUTCHourToIST(utcHour);
    };

    const formatAverageRate = () => {
        const avg = (totalStats as any)?.averagePerHour;
        if (!avg) return 'N/A';
        return Math.round(avg).toLocaleString();
    };

    const getValueClassName = (insight: { title: string; value: string | number }) => {
        const baseClass = "font-bold tracking-tight leading-tight";

        if (typeof insight.value === 'string') {
            const length = insight.value.length;

            if (length > 26) return `${baseClass} text-xs`;
            if (length > 22) return `${baseClass} text-sm`;
            if (length > 17) return `${baseClass} text-base`;
            if (length > 12) return `${baseClass} text-lg`;
        }

        return `${baseClass} text-xl`;
    };

    // Create insights based on variant
    const insights = variant === 'vcc' ? [
        {
            title: 'Total Detections',
            value: (totalStats as any)?.totalDetections?.toLocaleString() || '0',
            subtext: (totalStats as any)?.averagePerHour ? `~${Math.round((totalStats as any).averagePerHour).toLocaleString()}/hr avg` : 'All time',
            icon: Car,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10'
        },
        {
            title: 'Busiest Day',
            value: formatBusiestDay(),
            subtext: peakTime.day ? 'Peak traffic day' : null,
            icon: Calendar,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10'
        },
        {
            title: 'Busiest Hour',
            value: formatBusiestHour(),
            subtext: peakTime.hour !== undefined ? 'Peak traffic hour' : null,
            icon: Clock,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10'
        },
        {
            title: 'Dominant Vehicle',
            value: dominantVehicle.type,
            subtext: `${total > 0 ? ((dominantVehicle.count / total) * 100).toFixed(1) : 0}% of traffic`,
            icon: TrendingUp,
            color: 'text-green-500',
            bgColor: 'bg-green-500/10'
        }
    ] : [
        {
            title: 'Total Detections',
            value: (totalStats as any)?.totalDetections?.toLocaleString() || '0',
            subtext: (totalStats as any)?.averagePerHour ? `~${Math.round((totalStats as any).averagePerHour).toLocaleString()}/hr avg` : 'All time',
            icon: Car,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10'
        },
        {
            title: 'Busiest Camera',
            value: busiestCamera?.name || 'N/A',
            subtext: busiestCamera ? `${busiestCamera.detections.toLocaleString()} detections` : null,
            icon: Award,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10'
        },
        {
            title: 'Avg Detection Rate',
            value: activeCameras > 0 ? Math.round(total / activeCameras).toLocaleString() : '0',
            subtext: `per active camera`,
            icon: Activity,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10'
        },
        {
            title: 'Dominant Vehicle',
            value: dominantVehicle.type,
            subtext: `${total > 0 ? ((dominantVehicle.count / total) * 100).toFixed(1) : 0}% of traffic`,
            icon: TrendingUp,
            color: 'text-green-500',
            bgColor: 'bg-green-500/10'
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {insights.map((insight, idx) => (
                <Card key={idx} className="glass p-4 transition-all hover:bg-white/5">
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 pr-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider mb-1">
                                {insight.title}
                            </p>
                            <h3
                                className={cn(
                                    getValueClassName(insight),
                                    insight.title === 'Busiest Camera' && "truncate"
                                )}
                                title={typeof insight.value === 'string' ? insight.value : ''}
                            >
                                {typeof insight.value === 'number' ? <CountUp end={insight.value} /> : insight.value}
                            </h3>
                            <div className="text-sm text-gray-500 mt-1">
                                {insight.subtext}
                            </div>
                        </div>
                        <div className={cn("p-2 rounded-lg", insight.bgColor)}>
                            <insight.icon className={cn("w-5 h-5", insight.color)} />
                        </div>
                    </div>
                </Card>
            ))}


        </div>
    );
}
