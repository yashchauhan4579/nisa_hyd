// ModuleAlertsLayer — wraps a module page and adds an in-module "Alerts" option:
// a DRAGGABLE floating button (drop it anywhere; the spot persists) that opens
// a slide-over drawer with that module's alert rules + recent alerts (the
// shared ModuleAlertsPanel). The drawer slides in from whichever side of the
// screen the bell currently lives on.
import { useState, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { ModuleAlertsPanel } from './ModuleAlertsPanel';
import type { AlertModule } from '@/lib/api';

const TITLES: Record<AlertModule, string> = {
  crowd: 'Crowd Alerts',
  itms: 'ITMS Alerts',
  frs: 'FRS Alerts',
  search: 'Search Alerts',
  forensics: 'Observer Alerts',
};

// Persisted bell position, in % of the page area (survives resize + reload).
const POS_KEY = 'iris_alerts_bell_pos';

function loadPos(): { x: number; y: number } {
  try {
    const s = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (s && typeof s.x === 'number' && typeof s.y === 'number') {
      return { x: Math.max(2, Math.min(98, s.x)), y: Math.max(1, Math.min(95, s.y)) };
    }
  } catch { /* corrupted — fall through */ }
  return { x: 50, y: 2 }; // default: top-center
}

export function ModuleAlertsLayer({ module, children }: { module: AlertModule; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(loadPos);
  const posRef = useRef(pos);
  posRef.current = pos;
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = { startX: e.clientX, startY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return; // click slop
    d.moved = true;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const next = {
      x: Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(1, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)),
    };
    // Keep the ref in lockstep — React batches setPos, and a fast flick could
    // reach pointerup (which persists posRef) before the state flushed.
    posRef.current = next;
    setPos(next);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      localStorage.setItem(POS_KEY, JSON.stringify(posRef.current));
    } else {
      setOpen(true); // plain click — open the drawer
    }
  };

  // The drawer appears from the side the bell lives on.
  const side: 'left' | 'right' = pos.x < 50 ? 'left' : 'right';

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {children}

      {/* Draggable Alerts bell — drag to relocate (saved), click to open */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title={`${TITLES[module]} — drag to move · click to open`}
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translateX(-50%)', touchAction: 'none' }}
        className="absolute z-[60] inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-card/90 px-4 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:border-amber-500/60 cursor-grab active:cursor-grabbing select-none"
      >
        <Bell className="h-4 w-4 text-amber-500" />
        Alerts
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="absolute inset-0 z-[70] bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className={`absolute top-0 z-[80] h-full w-full max-w-xl overflow-y-auto bg-background text-foreground shadow-2xl ${side === 'left' ? 'left-0 border-r' : 'right-0 border-l'} border-border`}
              initial={{ x: side === 'left' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: side === 'left' ? '-100%' : '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                    <Bell className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold leading-none">{TITLES[module]}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">WhatsApp alert rules for this module</p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5">
                <ModuleAlertsPanel module={module} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
