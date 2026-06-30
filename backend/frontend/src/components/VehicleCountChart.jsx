import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const VehicleCountChart = ({ data, period, cameraName }) => {
    if (!data || data.length === 0) {
        return (
            <div className="bg-black/20 border border-cyan-900/20 rounded-lg p-8 text-center text-gray-500">
                No data available for chart
            </div>
        );
    }

    const formatTimestamp = (timestamp, periodType) => {
        const date = new Date(timestamp);
        
        if (periodType === 'day') {
            // Format as hour:minute AM/PM
            return date.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
            });
        } else if (periodType === 'week' || periodType === 'month') {
            // Format as Month Day
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        } else {
            // Format as Month Year
            return date.toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric'
            });
        }
    };

    // Format data for chart
    const chartData = data.map(item => ({
        time: formatTimestamp(item.timestamp, period),
        timestamp: item.timestamp,
        average: item.avg,
        max: item.max,
        min: item.min,
        total: item.total
    }));

    return (
        <div className="bg-black/20 border border-cyan-900/20 rounded-lg p-4">
            <h4 className="text-lg font-semibold mb-4 text-cyan-300">{cameraName} - Vehicle Count Trend</h4>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" opacity={0.3} />
                        <XAxis 
                            dataKey="time" 
                            stroke="#9CA3AF" 
                            fontSize={12} 
                            tickMargin={10}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                        />
                        <YAxis 
                            stroke="#9CA3AF" 
                            fontSize={12}
                            label={{ value: 'Vehicle Count', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                        />
                        <Tooltip
                            contentStyle={{ 
                                backgroundColor: '#0a101a', 
                                borderColor: '#0891b2', 
                                color: '#F3F4F6',
                                borderRadius: '8px'
                            }}
                            itemStyle={{ color: '#60A5FA' }}
                            labelStyle={{ color: '#34d399' }}
                        />
                        <Legend 
                            wrapperStyle={{ color: '#9CA3AF' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="average"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                            name="Average Count"
                        />
                        <Line
                            type="monotone"
                            dataKey="max"
                            stroke="#10B981"
                            strokeWidth={1.5}
                            dot={false}
                            strokeDasharray="5 5"
                            name="Max Count"
                        />
                        <Line
                            type="monotone"
                            dataKey="min"
                            stroke="#F59E0B"
                            strokeWidth={1.5}
                            dot={false}
                            strokeDasharray="5 5"
                            name="Min Count"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default VehicleCountChart;

