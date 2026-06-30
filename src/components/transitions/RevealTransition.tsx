import {
  createContext, useCallback, useContext, useRef, useState, type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { IrisLogo } from '../brand/IrisLogo';

// Origin "container transform": clicking a button unwraps the destination page
// from that button — a navy panel grows from the button's rect to fill the
// screen, the route swaps behind it, then the panel opens (scales + fades) to
// reveal the page. Mounted once at the app shell so it survives the navigation
// it triggers. Trigger with `useReveal().reveal('/login', rect)`.

interface Origin { x: number; y: number; w: number; h: number; }
type Phase = 'idle' | 'expand' | 'reveal';

const RevealContext = createContext<{ reveal: (to: string, origin?: Origin) => void }>({
  reveal: () => {},
});
// eslint-disable-next-line react-refresh/only-export-components
export const useReveal = () => useContext(RevealContext);

const EXPAND_EASE = [0.4, 0, 0.2, 1] as const; // accelerate-decelerate — growth reads as it travels
const REVEAL_EASE = [0.16, 1, 0.3, 1] as const; // ease-out-expo — panel opens away
const EXPAND_S = 0.6;
const REVEAL_S = 0.45;
const PANEL_BG = 'linear-gradient(135deg, #0a1622 0%, #0B1726 55%, #0f2034 100%)';

function RevealOverlay({ origin, phase, onExpanded, onRevealed }: {
  origin: Origin; phase: Phase; onExpanded: () => void; onRevealed: () => void;
}) {
  const revealing = phase === 'reveal';
  return (
    <motion.div
      className="fixed overflow-hidden"
      style={{ zIndex: 2000, background: PANEL_BG, boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}
      initial={{ top: origin.y, left: origin.x, width: origin.w, height: origin.h, borderRadius: 14, opacity: 1 }}
      animate={
        revealing
          ? { top: 0, left: 0, width: '100vw', height: '100vh', borderRadius: 0, opacity: 0, scale: 1.05 }
          : { top: 0, left: 0, width: '100vw', height: '100vh', borderRadius: 0, opacity: 1 }
      }
      transition={{ duration: revealing ? REVEAL_S : EXPAND_S, ease: revealing ? REVEAL_EASE : EXPAND_EASE }}
      onAnimationComplete={() => (phase === 'expand' ? onExpanded() : onRevealed())}
    >
      {/* IRIS aperture + warm glow, fades out as the panel opens */}
      <motion.div
        className="absolute inset-0 grid place-items-center pointer-events-none"
        animate={{ opacity: revealing ? 0 : 1 }}
        transition={{ duration: revealing ? 0.25 : 0.4, ease: 'easeOut' }}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at 50% 50%, rgba(var(--brand-accent-rgb),0.22) 0%, transparent 60%)' }}
        />
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <IrisLogo
            className="text-amber-400"
            style={{ width: 60, height: 60, filter: 'drop-shadow(0 0 16px rgba(var(--brand-accent-rgb),0.7))' }}
            strokeWidth={1.5}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function RevealProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('idle');
  const originRef = useRef<Origin>({ x: 0, y: 0, w: 0, h: 0 });
  const targetRef = useRef<string | null>(null);

  const reveal = useCallback((to: string, origin?: Origin) => {
    if (reduceMotion) { navigate(to); return; }
    // Login opens directly — no expanding-panel delay (it read as a loading
    // middleware). The login card does its own fast fade-in instead.
    if (to === '/login') { navigate(to); return; }
    if (phase !== 'idle') return;
    originRef.current = origin ?? {
      x: window.innerWidth / 2 - 60, y: window.innerHeight / 2 - 24, w: 120, h: 48,
    };
    targetRef.current = to;
    setPhase('expand');
  }, [navigate, reduceMotion, phase]);

  // Panel fills the screen → swap the route behind it, then open it.
  const onExpanded = useCallback(() => {
    if (targetRef.current) navigate(targetRef.current);
    setPhase('reveal');
  }, [navigate]);

  const onRevealed = useCallback(() => {
    targetRef.current = null;
    setPhase('idle');
  }, []);

  return (
    <RevealContext.Provider value={{ reveal }}>
      {children}
      <AnimatePresence>
        {phase !== 'idle' && (
          <RevealOverlay
            key="reveal"
            origin={originRef.current}
            phase={phase}
            onExpanded={onExpanded}
            onRevealed={onRevealed}
          />
        )}
      </AnimatePresence>
    </RevealContext.Provider>
  );
}
