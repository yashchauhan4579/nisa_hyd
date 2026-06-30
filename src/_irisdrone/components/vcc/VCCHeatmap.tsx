import { useRef, useEffect, useMemo } from 'react';
import { Card } from '@irisdrone/components/ui/card';
import { Loader2 } from 'lucide-react';
import { type VCCStats } from '@irisdrone/lib/api';
import { toIST, utcHourToIST } from '@irisdrone/lib/dateUtils';
import {
    Chart as ChartJS,
    Tooltip,
    Legend,
    Title,
    CategoryScale,
    LinearScale,
} from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';

ChartJS.register(
    MatrixController,
    MatrixElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Title
);

interface VCCHeatmapProps {
    stats: VCCStats | null;
    loading: boolean;
}

export function VCCHeatmap({ stats, loading }: VCCHeatmapProps) {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<ChartJS | null>(null);

    const data = useMemo(() => {
        if (!stats || !stats.byTime) return { processedData: [], labelsY: [] };

        const processedData: { x: string; y: string; v: number }[] = [];
        const uniqueDates = new Set<string>();
        const dateMap = new Map<string, string>(); // YYYY-MM-DD -> DD.MM.YYYY

        // Collect all dates - convert UTC to IST
        stats.byTime.forEach((item: any) => {
            let utcDate: Date;
            let s = item.hour || item.time_period;
            if (!s) return;

            // Parse as UTC by adding 'Z'
            const safeTs = s.toString().trim().replace(' ', 'T') + 'Z';
            utcDate = new Date(safeTs);

            if (isNaN(utcDate.getTime())) return;

            // Convert to IST
            const istDate = toIST(utcDate);
            const dateKey = `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${String(istDate.getUTCDate()).padStart(2, '0')}`;
            const displayLabel = new Intl.DateTimeFormat('en-GB', {
                day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'
            }).format(istDate).replace(/\//g, '.'); // DD.MM.YYYY

            uniqueDates.add(dateKey);
            dateMap.set(dateKey, displayLabel);
        });

        // Sort dates descending (Newest Top)
        // In Chart.js category scale, indices often go bottom-up or top-down.
        // If we pass labels as ['04.08', ..., '10.08'], usually 10.08 is top if reversed or bottom if standard.
        // Let's sort normally first.
        const sortedDateKeys = Array.from(uniqueDates).sort().reverse(); // Newest first
        const sortedLabels = sortedDateKeys.map(d => dateMap.get(d) || d);

        // Initial fill
        sortedDateKeys.forEach(dateKey => {
            const label = dateMap.get(dateKey)!;
            for (let h = 0; h < 24; h++) {
                processedData.push({ x: h.toString(), y: label, v: 0 });
            }
        });

        // Populate data
        stats.byTime.forEach((item: any) => {
            let utcDate: Date;
            let s = item.hour || item.time_period || item.date;
            if (!s) return;

            // Handle Postgres TO_CHAR "YYYY-MM-DD HH" format explicitly
            if (/^\d{4}-\d{2}-\d{2}\s\d{1,2}$/.test(s.toString())) {
                const parts = s.toString().split(' ');
                s = `${parts[0]}T${parts[1].padStart(2, '0')}:00:00`;
            }

            // Backend returns UTC timestamps - parse as UTC by adding 'Z' suffix
            const safeTs = s.toString().trim().replace(' ', 'T') + 'Z';
            utcDate = new Date(safeTs);

            if (isNaN(utcDate.getTime())) return;

            // Convert to IST for date bucketing
            const istDate = toIST(utcDate);
            const dateKey = `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${String(istDate.getUTCDate()).padStart(2, '0')}`;
            const label = dateMap.get(dateKey);

            // Convert UTC hour to IST hour
            const istHour = utcHourToIST(utcDate.getUTCHours()).toString();
            const count = Number(item.count) || 0;

            if (label) {
                const index = processedData.findIndex(d => d.x === istHour && d.y === label);
                if (index !== -1) {
                    processedData[index].v += count;
                }
            }
        });

        return { processedData, labelsY: sortedLabels };
    }, [stats]);

    useEffect(() => {
        if (!chartRef.current || !data.processedData.length) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        const values = data.processedData.map(d => d.v).filter(v => v > 0);
        const maxVal = Math.max(...values, 10);

        // ITPL-like Thresholds
        const t1 = maxVal * 0.2;
        const t2 = maxVal * 0.4;
        const t3 = maxVal * 0.6;
        const t4 = maxVal * 0.8;

        const getColor = (v: number) => {
            if (v <= 0) return 'rgba(34, 197, 94, 0.15)'; // Green-500 tint for empty
            if (v <= t1) return 'rgba(34, 197, 94, 0.4)';  // Muted Green
            if (v <= t2) return 'rgba(132, 204, 22, 0.5)'; // Muted Lime
            if (v <= t3) return 'rgba(234, 179, 8, 0.6)';  // Muted Yellow
            if (v <= t4) return 'rgba(249, 115, 22, 0.7)'; // Muted Orange
            return 'rgba(239, 68, 68, 0.8)';               // Muted Red
        };

        chartInstance.current = new ChartJS(ctx, {
            type: 'matrix',
            data: {
                datasets: [{
                    label: 'Traffic Density',
                    data: data.processedData as any,
                    backgroundColor(context) {
                        return getColor((context.raw as any).v);
                    },
                    borderWidth: 0,
                    borderRadius: 4,
                    // Calculate dynamic size
                    width: ({ chart }) => ((chart.chartArea || {}).width / 24) - 4,
                    height: ({ chart }) => ((chart.chartArea || {}).height / (data.labelsY.length || 1)) - 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title() { return ''; },
                            label(context) {
                                const v = context.raw as any;
                                return `${v.y} ${v.x}:00 - ${v.v} vehicles`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        labels: Array.from({ length: 24 }, (_, i) => i.toString()),
                        grid: { display: false },
                        ticks: {
                            color: '#888',
                            font: { size: 10 },
                            callback: (val) => `${val}:00`
                        }
                    },
                    y: {
                        type: 'category',
                        labels: data.labelsY,
                        offset: true,
                        grid: { display: false },
                        ticks: {
                            color: '#ccc',
                            font: { size: 11, weight: 'bold' }
                        }
                    }
                }
            }
        });

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [data]);

    // Dynamic height calculation
    // Base height per row ~35px + X-axis overhead ~50px
    // Min height 200px to maintain readability of axis if very few rows
    // But if only 1 row, 200px is still quite tall ( ~150px bar).
    // Let's relax min height to 120px for single day.
    const rows = data.labelsY.length || 7; // Default to 7 for loading state
    const containerHeight = Math.max(rows * 45 + 60, 100);

    return (
        <Card className="bg-zinc-900/30 border border-white/5 rounded-lg p-4 relative overflow-hidden hover:bg-zinc-900/50 transition-all duration-300">
            <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-64 h-64 bg-green-500 blur-[100px] opacity-[0.05] pointer-events-none" />
            <div className="flex items-center justify-between mb-4 relative z-10">
                <h2 className="text-lg font-semibold tracking-tight">Traffic Heatmap (Last 7 Days)</h2>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div style={{ height: `${containerHeight}px` }} className="w-full relative transition-all duration-300">
                <canvas ref={chartRef} />
                {!loading && data.processedData.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        No hourly data available for heatmap
                    </div>
                )}
            </div>
            <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(34, 197, 94, 0.4)' }}></div>Low</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(132, 204, 22, 0.5)' }}></div>Medium</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(234, 179, 8, 0.6)' }}></div>High</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(239, 68, 68, 0.8)' }}></div>Peak</div>
            </div>
        </Card>
    );
}
