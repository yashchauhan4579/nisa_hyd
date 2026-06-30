// Shared timestamp helpers for IRIS Forensics. Frames carry `ts` like
// "20260608_215654_024550" (YYYYMMDD_HHMMSS_micros), which `new Date(ts)` cannot
// parse → was rendering "Invalid Date". parseTs handles that compact form.

export function parseTs(ts?: string | null): Date | null {
  if (!ts) return null;
  const m = String(ts).match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (m) {
    const [, Y, Mo, D, H, Mi, S] = m;
    return new Date(+Y, +Mo - 1, +D, +H, +Mi, +S);
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

// "08 Jun · 21:56:54"
export function formatTs(ts?: string | null): string {
  const d = parseTs(ts);
  if (!d) return '—';
  const date = d.toLocaleDateString([], { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

// just the clock, for compact captions
export function formatClock(ts?: string | null): string {
  const d = parseTs(ts);
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';
}

export function tsMillis(ts?: string | null): number {
  const d = parseTs(ts);
  return d ? d.getTime() : 0;
}
