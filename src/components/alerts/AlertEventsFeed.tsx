// AlertEventsFeed — recently fired alert events for one module; polls every 15s.
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatIST } from '@/lib/dateUtils';
import { apiClient, type AlertEvent, type AlertModule } from '@/lib/api';

const POLL_MS = 15_000;

interface AlertEventsFeedProps {
  module: AlertModule;
}

function WhatsappStatus({ event }: { event: AlertEvent }) {
  if (event.sentWhatsapp) {
    return (
      <Badge className="border-transparent bg-green-500/15 text-green-400 hover:bg-green-500/15">
        sent
      </Badge>
    );
  }
  if (event.sendError) {
    return (
      <Badge
        className="border-transparent bg-red-500/15 text-red-400 hover:bg-red-500/15"
        title={event.sendError}
      >
        failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      pending
    </Badge>
  );
}

export function AlertEventsFeed({ module }: AlertEventsFeedProps) {
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenSnapshots, setHiddenSnapshots] = useState<Record<number, boolean>>({});
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEvents([]);
    setHiddenSnapshots({});

    const fetchEvents = async () => {
      if (inFlight.current) return; // skip overlapping fetches
      inFlight.current = true;
      try {
        const data = await apiClient.getAlertEvents({ module, limit: 30 });
        if (!cancelled) {
          setEvents(Array.isArray(data) ? data : []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load alerts');
      } finally {
        inFlight.current = false;
        if (!cancelled) setLoading(false);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [module]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading alerts…</p>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {events.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">No alerts fired yet</p>
        </div>
      )}

      {events.map((event) => (
        <div key={event.id} className="rounded-lg border border-border bg-background/50 p-3">
          <div className="flex gap-3">
            {event.snapshotUrl && !hiddenSnapshots[event.id] && (
              <img
                src={event.snapshotUrl}
                alt=""
                className="h-14 w-20 shrink-0 rounded-md border border-border object-cover"
                onError={() => setHiddenSnapshots((prev) => ({ ...prev, [event.id]: true }))}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-snug">{event.title}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {event.value !== null && (
                    <Badge className="border-transparent bg-amber-500/15 tabular-nums text-amber-400 hover:bg-amber-500/15">
                      {event.value}
                    </Badge>
                  )}
                  <WhatsappStatus event={event} />
                </div>
              </div>
              <p
                className="mt-0.5 overflow-hidden text-xs text-muted-foreground"
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
              >
                {event.message}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatIST(event.createdAt, 'relative')}
                {event.deviceId && (
                  <>
                    {' · '}
                    <span className="font-mono">{event.deviceId}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
