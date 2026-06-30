import React from 'react';

const VehicleCountTable = ({ data, period }) => {
    if (!data || data.length === 0) {
        return null;
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
            // Format as Month Day, Year at Hour:Minute AM/PM
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } else {
            // Format as Month Year
            return date.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric'
            });
        }
    };

    return (
        <div className="bg-black/20 border border-cyan-900/20 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-cyan-950/30 border-b border-cyan-900/30">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                                Time Period
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                                Average Count
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                                Max Count
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                                Min Count
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                                Total Count
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-900/20">
                        {data.map((item, index) => (
                            <tr 
                                key={index} 
                                className="hover:bg-cyan-900/10 transition-colors"
                            >
                                <td className="px-4 py-3 text-sm text-gray-300 font-mono">
                                    {formatTimestamp(item.timestamp, period)}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-blue-400 font-semibold">
                                    {item.avg}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-emerald-400">
                                    {item.max}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-amber-400">
                                    {item.min}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-cyan-400 font-semibold">
                                    {item.total}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default VehicleCountTable;

