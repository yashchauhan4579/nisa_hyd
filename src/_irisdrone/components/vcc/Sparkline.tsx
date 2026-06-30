import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface SparklineProps {
    data: number[];
    color?: string;
    height?: number;
    className?: string;
}

export function Sparkline({ data, color = "#f59e0b", height = 40, className }: SparklineProps) {
    const chartData = data.map((val, i) => ({ i, val }));

    return (
        <div className={className} style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    <Line
                        type="monotone"
                        dataKey="val"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                    <YAxis domain={['dataMin', 'dataMax']} hide />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
