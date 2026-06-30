import { cn } from '@/lib/utils';

// Meteor-shower background (21st.dev). Streaks rain diagonally across the WHOLE
// viewport (spread evenly along the full width + staggered vertical starts), not
// just one corner. Tinted to the brand accent via the `--meteor` CSS var.
export function Meteors({ number = 28, className }: { number?: number; className?: string }) {
  const meteors = Array.from({ length: number }, (_, i) => i);
  return (
    <>
      {meteors.map((idx) => {
        // Spread origins across the full width, with a little jitter so the
        // pattern doesn't look like a perfect comb. Vertical start is staggered
        // above/near the top so streaks cover top→bottom as they fall.
        const left = ((idx * 100) / Math.max(number - 1, 1) + ((idx * 37) % 11) - 5).toFixed(2);
        const top = (-20 + ((idx * 53) % 60)).toFixed(2); // -20%..40%
        const delay = ((idx % 9) * 0.45).toFixed(2);
        const duration = 5 + ((idx * 7) % 6); // 5–10s
        return (
          <span
            key={'meteor' + idx}
            className={cn(
              'animate-meteor-effect absolute h-0.5 w-0.5 rounded-[9999px] rotate-[215deg]',
              "before:content-[''] before:absolute before:top-1/2 before:-translate-y-1/2 before:w-[70px] before:h-px before:bg-gradient-to-r before:from-[var(--meteor)] before:to-transparent",
              className,
            )}
            style={{
              top: top + '%',
              left: left + '%',
              animationDelay: delay + 's',
              animationDuration: duration + 's',
              background: 'var(--meteor)',
              boxShadow: '0 0 0 1px rgba(var(--brand-accent-rgb), 0.10)',
              ['--meteor' as string]: 'rgba(var(--brand-accent-rgb), 0.7)',
            }}
          />
        );
      })}
    </>
  );
}
