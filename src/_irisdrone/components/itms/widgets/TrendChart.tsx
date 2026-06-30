import { Card } from '@irisdrone/components/ui/card';
import { Activity } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface TrendChartProps {
  data: any[];
  dataKeys: Array<{ key: string; color: string; gradientId: string }>;
  height?: number;
  title?: string;
  xAxisKey?: string;
}

export function TrendChart({
  data,
  dataKeys,
  height = 200,
  title,
  xAxisKey = 'hour',
}: TrendChartProps) {
  const hasData = data && data.length > 0;

  return (
    <Card className="p-4 relative overflow-hidden">
      {title && (
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-3.5 h-3.5" style={{ color: 'var(--tact-cyan-bright)' }} />
          <span
            className="tact-display"
            style={{ fontSize: 11, color: 'var(--tact-text)', letterSpacing: '0.16em' }}
          >
            {title}
          </span>
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, var(--tact-cyan-dim) 0%, transparent 100%)', opacity: 0.5 }} />
          <span className="tact-mono" style={{ fontSize: 9, color: 'var(--tact-text-mid)', letterSpacing: '0.12em' }}>
            {hasData ? `${data.length} POINTS` : 'NO DATA'}
          </span>
        </div>
      )}

      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              {dataKeys.map(({ gradientId, color }) => (
                <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.6} />
                  <stop offset="50%" stopColor={color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="rgba(0, 240, 255, 0.08)"
              vertical={false}
            />
            <XAxis
              dataKey={xAxisKey}
              tick={{ fontSize: 9, fill: '#7d9fa6', fontFamily: 'Share Tech Mono, monospace' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0, 240, 255, 0.18)' }}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#7d9fa6', fontFamily: 'Share Tech Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(0, 240, 255, 0.4)', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{
                background: 'rgba(2, 8, 14, 0.96)',
                border: '1px solid rgba(0, 240, 255, 0.5)',
                borderRadius: 0,
                color: '#E0F7FA',
                fontFamily: 'Share Tech Mono, monospace',
                fontSize: 11,
                padding: '8px 12px',
                boxShadow: '0 8px 32px -8px rgba(0, 240, 255, 0.4)',
              }}
              labelStyle={{
                color: '#66F7FF',
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
              itemStyle={{
                color: '#DCEEF1',
                fontSize: 10,
                padding: '2px 0',
              }}
            />
            {dataKeys.map(({ key, color, gradientId }) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                isAnimationActive={true}
                animationDuration={1200}
                animationEasing="ease-out"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: color,
                  stroke: '#020408',
                  strokeWidth: 2,
                  style: { filter: `drop-shadow(0 0 6px ${color})` },
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <ChartEmptyState height={height} />
      )}
    </Card>
  );
}

/* ─── Beautiful empty state for charts — animated ghost grid + scan line ─── */
function ChartEmptyState({ height }: { height: number }) {
  // Generate a random ghost wave path so the empty state isn't a flat line
  const points = Array.from({ length: 24 }, (_, i) => {
    const x = (i / 23) * 100;
    const y = 50 + Math.sin(i * 0.6) * 18 + (Math.cos(i * 0.3) * 8);
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L 100,100 L 0,100 Z`;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: `${height}px`,
        background: 'linear-gradient(180deg, rgba(0, 240, 255, 0.02) 0%, transparent 100%)',
      }}
    >
      {/* Ghost grid */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.4 }}
      >
        <defs>
          <linearGradient id="ghost-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0, 240, 255, 0.18)" />
            <stop offset="60%" stopColor="rgba(0, 240, 255, 0.06)" />
            <stop offset="100%" stopColor="rgba(0, 240, 255, 0)" />
          </linearGradient>
          <pattern id="ghost-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(0, 240, 255, 0.08)" strokeWidth="0.2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#ghost-grid)" />
        <path
          d={areaD}
          fill="url(#ghost-area)"
          style={{ animation: 'tact-chart-empty-pulse 4s ease-in-out infinite' }}
        />
        <path
          d={pathD}
          fill="none"
          stroke="rgba(0, 240, 255, 0.4)"
          strokeWidth="0.4"
          strokeDasharray="1 1.5"
          style={{ animation: 'tact-chart-empty-pulse 4s ease-in-out infinite' }}
        />
      </svg>

      {/* Sweeping scan line */}
      <div
        className="absolute top-0 bottom-0"
        style={{
          width: 80,
          background: 'linear-gradient(90deg, transparent 0%, rgba(0, 240, 255, 0.18) 50%, transparent 100%)',
          animation: 'tact-chart-scan 3s ease-in-out infinite',
        }}
      />

      {/* Center label */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ zIndex: 2 }}
      >
        <div
          className="tact-mono"
          style={{
            fontSize: 10,
            color: 'var(--tact-text-mid)',
            letterSpacing: '0.18em',
            textShadow: '0 0 8px rgba(0, 240, 255, 0.3)',
          }}
        >
          AWAITING DATA STREAM
        </div>
        <div
          className="tact-mono mt-1.5"
          style={{
            fontSize: 8,
            color: 'var(--tact-text-dim)',
            letterSpacing: '0.16em',
          }}
        >
          ▓ ▓ ▓ ▓ ▓ ▓
        </div>
      </div>

      <style>{`
        @keyframes tact-chart-empty-pulse {
          0%, 100% { opacity: 0.4; transform: translateY(0); }
          50% { opacity: 0.7; transform: translateY(-2px); }
        }
        @keyframes tact-chart-scan {
          0% { left: -80px; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
}
