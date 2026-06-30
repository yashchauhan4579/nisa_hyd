import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-chart-matrix'; // Keep this if used, otherwise remove. Assuming line charts for now.

interface HealthChartProps {
    data: { timestamp: string; value: number; status: string }[];
    color: string;
    label: string;
    height?: number;
    showXAxis?: boolean;
}

export function HealthChart({ data, color, label, height = 100, showXAxis = false }: HealthChartProps) {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (!chartRef.current) return;

        // Cleanup previous instance
        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ', 0.5)'));
        gradient.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ', 0.0)'));

        chartInstance.current = new Chart(chartRef.current, {
            type: 'line',
            data: {
                labels: data.map(d => new Date(d.timestamp).toLocaleTimeString()),
                datasets: [{
                    label: label,
                    data: data.map(d => d.value),
                    borderColor: color,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (context) => `${context.parsed.y} ms`
                        }
                    }
                },
                scales: {
                    x: {
                        display: showXAxis,
                        grid: { display: false, color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 5 }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 3 },
                        suggestedMax: 100
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [data, color, height, showXAxis, label]);

    return <canvas ref={chartRef} height={height} className="w-full" />;
}
