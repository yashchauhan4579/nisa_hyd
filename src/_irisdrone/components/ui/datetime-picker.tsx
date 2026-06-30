import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@irisdrone/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@irisdrone/components/ui/popover';
import { cn } from '@irisdrone/lib/utils';

interface DateTimePickerProps {
  // datetime-local string ("YYYY-MM-DDTHH:mm") so it slots into the same
  // state shape AnalyticsReporting already uses.
  value: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function toLocal(s: string): string {
  return s; // already YYYY-MM-DDTHH:mm
}

function fmt(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// 24h internal ↔ 12h display
function to12h(h24: number): { h12: number; ampm: 'AM' | 'PM' } {
  const ampm: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { h12, ampm };
}

function to24h(h12: number, ampm: 'AM' | 'PM'): number {
  if (ampm === 'AM') return h12 % 12;        // 12 AM → 0
  return (h12 % 12) + 12;                    // 12 PM → 12, 1 PM → 13 …
}

function splitDateTime(s: string): { date: Date | undefined; hh: string; mm: string } {
  if (!s) return { date: undefined, hh: '00', mm: '00' };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return { date: undefined, hh: '00', mm: '00' };
  return { date: d, hh: pad(d.getHours()), mm: pad(d.getMinutes()) };
}

function combine(date: Date | undefined, hh: string, mm: string): string {
  if (!date) return '';
  const h = Math.max(0, Math.min(23, parseInt(hh, 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mm, 10) || 0));
  const merged = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  return `${merged.getFullYear()}-${pad(merged.getMonth() + 1)}-${pad(merged.getDate())}T${pad(merged.getHours())}:${pad(merged.getMinutes())}`;
}

export function DateTimePicker({ value, onChange, className, placeholder = 'Pick date & time', ariaLabel }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const { date, hh, mm } = splitDateTime(toLocal(value));

  // UI uses 12-hour with AM/PM; the wire format stays 24-hour.
  const init12 = to12h(parseInt(hh, 10) || 0);
  const [hour12Str, setHour12Str] = React.useState(pad(init12.h12));
  const [minStr, setMinStr]       = React.useState(mm);
  const [ampm, setAmpm]           = React.useState<'AM' | 'PM'>(init12.ampm);

  React.useEffect(() => {
    const split = to12h(parseInt(hh, 10) || 0);
    setHour12Str(pad(split.h12));
    setAmpm(split.ampm);
    setMinStr(mm);
  }, [hh, mm]);

  const commit = (nextDate: Date | undefined, nextH12: string, nextM: string, nextAmpm: 'AM' | 'PM') => {
    const h12 = Math.max(1, Math.min(12, parseInt(nextH12, 10) || 12));
    const h24 = to24h(h12, nextAmpm);
    onChange(combine(nextDate, pad(h24), nextM));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'h-8 px-2.5 rounded-lg border border-white/10 bg-zinc-900/60',
            'text-xs text-zinc-200 hover:bg-zinc-900/80 hover:border-white/20',
            'focus:outline-none focus:ring-1 focus:ring-amber-500',
            'inline-flex items-center gap-1.5',
            className
          )}
        >
          <CalendarIcon className="w-4 h-4 text-amber-400 flex-shrink-0" strokeWidth={2} />
          <span className="whitespace-nowrap">{value ? fmt(value) : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 border-white/10 bg-zinc-950 shadow-xl">
        <Calendar
          selected={date}
          onSelect={(d) => {
            if (!d) return;
            commit(d, hour12Str, minStr, ampm);
          }}
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-white/5 bg-zinc-900/50">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Time</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={12}
              value={hour12Str}
              onChange={(e) => {
                const v = e.target.value;
                setHour12Str(v);
                commit(date, v, minStr, ampm);
              }}
              className="h-7 w-12 text-center rounded border border-white/10 bg-zinc-900 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              aria-label="Hour"
            />
            <span className="text-zinc-500 text-xs">:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={minStr}
              onChange={(e) => {
                const v = e.target.value;
                setMinStr(v);
                commit(date, hour12Str, v, ampm);
              }}
              className="h-7 w-12 text-center rounded border border-white/10 bg-zinc-900 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              aria-label="Minute"
            />
            {/* AM/PM toggle — single click flips between the two. */}
            <div className="ml-1 flex rounded border border-white/10 overflow-hidden">
              {(['AM', 'PM'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setAmpm(m);
                    commit(date, hour12Str, minStr, m);
                  }}
                  className={cn(
                    'h-7 px-2 text-[10px] font-semibold tracking-wider transition-colors',
                    ampm === m
                      ? 'bg-amber-600 text-white'
                      : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'
                  )}
                  aria-label={m === 'AM' ? 'Morning' : 'Afternoon'}
                  aria-pressed={ampm === m}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-2 h-7 px-2.5 rounded bg-amber-600 text-white text-xs hover:bg-amber-500"
            >
              Done
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
