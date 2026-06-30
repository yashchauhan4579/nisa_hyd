import { useEffect, useRef } from 'react';
import { apiClient } from '@irisdrone/lib/api';
import { playSound, startSiren, stopSiren } from './useSound';

/**
 * useWatchlistSiren — global poll on /api/alerts that buzzes the siren
 * ONLY when a fresh watchlist detection arrives.
 *
 *   - Polls every 6 seconds.
 *   - First successful fetch: records existing unread IDs as "already
 *     seen" — operators never hear the siren for backlog alerts that
 *     were already there when they logged in.
 *   - Subsequent polls: if any new alert id appears, plays a one-shot
 *     punch + starts the looped siren for *at most* SIREN_DURATION_MS
 *     (1 minute). After that the siren auto-stops; a fresh detection
 *     will retrigger it.
 *
 * Mount once at the top of the app (e.g. MainLayout) so it runs for the
 * lifetime of the session.
 */
const SIREN_DURATION_MS = 60_000;

export function useWatchlistSiren(): void {
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const sirenTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const armSiren = () => {
      startSiren();
      if (sirenTimer.current !== null) window.clearTimeout(sirenTimer.current);
      sirenTimer.current = window.setTimeout(() => {
        stopSiren();
        sirenTimer.current = null;
      }, SIREN_DURATION_MS);
    };

    const poll = async () => {
      try {
        const result = await apiClient.getAlerts({ isRead: false, limit: 100 });
        if (cancelled) return;

        const alerts = result.alerts || [];
        const ids = new Set<string>(alerts.map((a) => a.id));

        if (!initialized.current) {
          // Bootstrap: remember every existing unread id but don't
          // fire the siren — backlog isn't "fresh".
          seenIds.current = ids;
          initialized.current = true;
          return;
        }

        // Anything in ids that wasn't in seenIds = a brand-new
        // detection while this tab was open.
        let freshCount = 0;
        for (const id of ids) {
          if (!seenIds.current.has(id)) freshCount++;
        }
        seenIds.current = ids;

        if (freshCount > 0) {
          playSound('watchlist-hit');
          armSiren();
        }
      } catch {
        // network blip — don't change siren state
      }
    };

    poll();
    const interval = setInterval(poll, 6000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (sirenTimer.current !== null) window.clearTimeout(sirenTimer.current);
      stopSiren();
    };
  }, []);
}
