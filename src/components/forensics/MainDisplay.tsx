import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, X, ScanSearch } from 'lucide-react';

interface MainDisplayProps {
  selectedVideo: string | null;
  status: string;
  onStartAnalysis: () => void;
  streamImage: string | null;
  isStreaming: boolean;
  selectedHistoricalFrame: { url: string; id: number } | null;
  onCloseHistoricalFrame: () => void;
}

export const MainDisplay: React.FC<MainDisplayProps> = ({
  selectedVideo, onStartAnalysis, streamImage, isStreaming,
  selectedHistoricalFrame, onCloseHistoricalFrame,
}) => {
  if (!selectedVideo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <ScanSearch className="h-10 w-10 opacity-30" />
        <span>Select a source to begin Observer analysis</span>
      </div>
    );
  }

  const isHistorical = !!selectedHistoricalFrame;
  const displayImage = isHistorical ? selectedHistoricalFrame!.url : streamImage;

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 h-full">
      <div className="flex justify-between items-center gap-3">
        <h2 className="text-lg font-semibold flex items-center gap-2 min-w-0">
          <span className="truncate">{selectedVideo}</span>
          {isHistorical && (
            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
              Frame {selectedHistoricalFrame?.id}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {isHistorical ? (
            <Button variant="outline" onClick={onCloseHistoricalFrame}>
              <X className="mr-2 h-4 w-4" /> Close frame
            </Button>
          ) : isStreaming ? (
            <Button disabled variant="destructive">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…
            </Button>
          ) : (
            <Button onClick={onStartAnalysis}>Start analysis</Button>
          )}
        </div>
      </div>

      <Card className="flex-1 overflow-hidden flex items-center justify-center bg-black/40 relative">
        {displayImage ? (
          <img src={displayImage} alt="Processed frame" className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="text-muted-foreground text-sm">{isStreaming ? 'Connecting to stream…' : 'Ready to start'}</div>
        )}
      </Card>
    </div>
  );
};
