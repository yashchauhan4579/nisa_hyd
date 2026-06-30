import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Activity } from 'lucide-react';

export interface Insight {
  count: number;
  density: string;
  movement?: string;
  flow_rate?: number;
  free_space?: number;
  congestion?: number;
  demographics?: string;
  behavior: string;
  alerts: string[];
  timestamp: string;
  frame_id: number;
}

interface Props {
  currentInsight: Insight | null;
  history: Insight[];
}

const densityColor = (d: string) => {
  switch (d?.toLowerCase()) {
    case 'low': return 'text-emerald-500';
    case 'medium': return 'text-yellow-500';
    case 'high': return 'text-orange-500';
    case 'critical': return 'text-red-600';
    default: return 'text-muted-foreground';
  }
};

export const InsightsSidebar: React.FC<Props> = ({ currentInsight }) => (
  <Card className="h-full border-l rounded-none flex flex-col bg-card">
    <CardHeader>
      <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Real-time Insights</CardTitle>
    </CardHeader>
    <CardContent className="flex-1 overflow-y-auto">
      {currentInsight ? (
        <div className="space-y-5">
          {/* count + condition */}
          <Card className="p-3 flex items-center justify-between bg-muted/30 border-l-4 border-l-primary">
            <div>
              <div className="text-2xl font-bold tabular-nums">{currentInsight.count}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">People</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold capitalize ${densityColor(currentInsight.density)}`}>
                {currentInsight.density || 'Unknown'}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Condition</div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Card className="p-3 flex flex-col items-center justify-center bg-muted/30">
              <span className="text-lg font-bold">{currentInsight.congestion !== undefined ? `${currentInsight.congestion}/10` : 'N/A'}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Congestion</span>
            </Card>
            <Card className="p-3 flex flex-col items-center justify-center bg-muted/30">
              <span className="text-lg font-bold">{currentInsight.free_space !== undefined ? `${currentInsight.free_space}%` : 'N/A'}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Free Space</span>
            </Card>
          </div>

          {currentInsight.demographics && (
            <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded border border-dashed border-border">
              <span className="font-semibold mr-1 text-foreground">Demographics:</span>{currentInsight.demographics}
            </div>
          )}

          <Card className="p-4 bg-muted/30">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Crowd Movement</h4>
            {currentInsight.movement?.toLowerCase() === 'moving' ? (
              <div className="flex items-center gap-2 text-amber-500">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" /><span className="font-bold">Moving</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-zinc-500" /><span className="font-bold">Static</span>
              </div>
            )}
          </Card>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observed Behavior</h4>
            <div className="bg-muted p-3 rounded-md text-sm border border-border">{currentInsight.behavior}</div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Safety Alerts</h4>
            <div className="flex flex-col gap-2">
              {currentInsight.alerts?.length > 0 && currentInsight.alerts[0] !== 'none' ? (
                currentInsight.alerts.map((alert, i) => (
                  <div key={i} className="flex items-center gap-2 bg-red-900/30 text-red-400 p-2 rounded border border-red-900">
                    <AlertTriangle className="h-4 w-4 shrink-0" /><span className="text-sm font-medium">{alert}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 bg-emerald-900/30 text-emerald-400 p-2 rounded border border-emerald-900">
                  <span className="h-4 w-4 rounded-full border-2 border-current grid place-items-center text-[10px]">✓</span>
                  <span className="text-sm font-medium">No active alerts</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-4">
          <Activity className="h-12 w-12 mb-4 opacity-20" />
          <p>Select a video and start analysis to view real-time crowd insights.</p>
        </div>
      )}
    </CardContent>
  </Card>
);
