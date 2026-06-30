import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const StatsChart = ({ data, cameraName }) => {
    if (!data || data.length === 0) {
        return (
            <div className="bg-[#0a101a]/80 border border-cyan-900/30 p-6 rounded-xl">
                <h3 className="text-lg font-semibold mb-2 text-gray-200">{cameraName}</h3>
                <div className="text-center text-gray-500 py-6">
                    <p>No count data available</p>
                    <p className="text-xs mt-2">Violation detection is active. People counting is disabled.</p>
                </div>
            </div>
        );
    }

    // Format data for chart
    const formattedData = data.map(item => ({
        time: new Date(item.timestamp + 'Z').toLocaleTimeString(),
        count: item.count
    })).reverse(); // Reverse to show oldest to newest if API returns newest first

    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold mb-4 text-gray-200">{cameraName} - People Count Trend</h3>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={formattedData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} tickMargin={10} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                            itemStyle={{ color: '#60A5FA' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="count"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default StatsChart;
