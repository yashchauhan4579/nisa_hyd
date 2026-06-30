import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FORENSICS_API } from './api';

interface Item { count: number; timestamp: string; frame_id: number }
interface TimelineProps {
  data: Item[];
  videoName: string | null;
  onFrameSelect: (frameId: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ data, videoName, onFrameSelect }) => {
  const frames = data
    .map((i) => ({ time: new Date(i.timestamp).toLocaleTimeString(), count: i.count, ts: new Date(i.timestamp).getTime(), frame_id: i.frame_id }))
    .sort((a, b) => a.ts - b.ts);

  return (
    <Card className="h-full border-t rounded-none flex flex-col bg-card">
      <CardHeader className="py-2">
        <CardTitle className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Processed Frames</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <div className="h-full bg-muted/20 overflow-x-auto whitespace-nowrap p-4 flex gap-4">
          {videoName && frames.map((item) => (
            <button key={item.frame_id} onClick={() => onFrameSelect(item.frame_id)}
              className="inline-block relative h-full aspect-video bg-black/30 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:ring-2 ring-primary transition-all shadow-md group">
              <img src={`${FORENSICS_API}/processed_frame/${encodeURIComponent(videoName)}/${item.frame_id}`}
                alt={`Frame ${item.frame_id}`} loading="lazy"
                className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-white p-1 truncate">
                {item.time} • {item.count} ppl
              </div>
            </button>
          ))}
          {frames.length === 0 && <div className="text-sm text-muted-foreground p-4">No frames yet — run an analysis.</div>}
        </div>
      </CardContent>
    </Card>
  );
};
