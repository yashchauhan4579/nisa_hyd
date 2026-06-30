import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { MoveRight } from 'lucide-react';
import { IrisLogo } from '../components/brand/IrisLogo';
import { useReveal } from '../components/transitions/RevealTransition';
import { RippleButton } from '../components/ui/multi-type-ripple-buttons';
import { SplineScene } from '../components/ui/SplineScene';
import { useTheme } from '../contexts/ThemeContext';
import '../styles/magicbox-landing.css';

// Cyberpunk landing only — a real 3D Spline scene behind the hero. Lazy-loaded
// (see SplineScene). Self-hosted from public/ (no external Spline CDN at runtime
// → works offline + no long loader); the .splinecode is self-contained (textures
// embedded). To swap scenes, replace public/robot.splinecode.
const SPLINE_SCENE = '/robot.splinecode';

// Public entry — MagicBox-Hub aesthetic (white/black, light cream surface with
// grain + grid + drifting tiles, frosted black CTA), de-branded for IRIS, with
// the 21st.dev animated rotating-word hero.

const ROTATING = ['cameras', 'traffic', 'crowds', 'violations', 'faces'];

const BOXES = [
  { left: '3%', top: '12%', r: '-4deg', dur: '18s', delay: '-2s', opacity: 0.5, scale: 1.1 },
  { left: '12%', top: '70%', r: '6deg', dur: '20s', delay: '-6s', opacity: 0.4, scale: 0.95 },
  { left: '78%', top: '14%', r: '7deg', dur: '19s', delay: '-5s', opacity: 0.42, scale: 1.0 },
  { left: '86%', top: '60%', r: '-3deg', dur: '21s', delay: '-9s', opacity: 0.3, scale: 0.9 },
  { left: '46%', top: '80%', r: '4deg', dur: '24s', delay: '-12s', opacity: 0.25, scale: 1.15 },
];

function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <span className="rounded-xl bg-primary grid place-items-center shrink-0"
      style={{ width: size, height: size }}>
      <IrisLogo className="text-primary-foreground" style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={2} />
    </span>
  );
}

export function LandingPage() {
  const { reveal } = useReveal();
  const { themeFamily } = useTheme();
  const cyber = themeFamily === 'cyberpunk';
  // The 3D robot scene now backs BOTH themes; a colorize+glow filter recolors the
  // grey robot mesh to match the active brand — violet/pink for cyberpunk, amber/
  // gold for the default IRIS look.
  const robotFilter = cyber
    ? 'brightness(0.92) contrast(1.06) sepia(0.6) hue-rotate(228deg) saturate(2.6) ' +
      'drop-shadow(0 0 45px rgba(124,77,255,0.55)) drop-shadow(0 0 95px rgba(255,45,149,0.2))'
    : 'brightness(1.0) contrast(1.05) sepia(0.68) hue-rotate(-10deg) saturate(2.4) ' +
      'drop-shadow(0 0 45px rgba(245,158,11,0.5)) drop-shadow(0 0 95px rgba(249,115,22,0.18))';
  const goLogin = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    reveal('/login', { x: r.left, y: r.top, w: r.width, h: r.height });
  };
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(() => ROTATING, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setTitleNumber((n) => (n === titles.length - 1 ? 0 : n + 1));
    }, 2000);
    return () => clearTimeout(id);
  }, [titleNumber, titles]);

  return (
    <div className="mb-bg h-screen relative overflow-hidden flex flex-col">
      <div className="mb-grain" aria-hidden="true" />
      <div className="mb-grid" aria-hidden="true" />
      {/* Amber keeps its drifting tiles as a faint underlay; the 3D robot scene
          sits above them on every theme. */}
      {!cyber && (
        <div className="mb-float-layer" aria-hidden="true">
          {BOXES.map((b, i) => (
            <div key={i} className="mb-float"
              style={{ left: b.left, top: b.top, opacity: b.opacity, ['--dur' as string]: b.dur, ['--delay' as string]: b.delay }}>
              <div className="mb-box" style={{ transform: `scale(${b.scale}) rotate(${b.r})` }} />
            </div>
          ))}
        </div>
      )}
      {/* A real 3D Spline scene behind the hero (both themes). Pointer events stay
          ENABLED so the robot's head/eyes track the cursor; the hero text layer is
          pointer-events-none (below) so moves pass through, while the buttons
          re-enable pointer events to stay clickable. The recolor filter (above)
          tints the grey robot to the active brand accent. */}
      <div
        className="absolute inset-0 z-[4]"
        aria-hidden="true"
        style={{
          opacity: 0.92,
          filter: robotFilter,
          WebkitMaskImage: 'radial-gradient(130% 95% at 50% 44%, #000 38%, transparent 82%)',
          maskImage: 'radial-gradient(130% 95% at 50% 44%, #000 38%, transparent 82%)',
        }}
      >
        <SplineScene scene={SPLINE_SCENE} className="w-full h-full" />
      </div>

      {/* Header — just the logo + wordmark (Sign in removed; the CTA below opens
          login). Click-through in cyber mode so the robot tracks the cursor. */}
      <header className={`relative z-10 shrink-0 pointer-events-none`}>
        <div className="max-w-7xl mx-auto px-6 pt-8 flex items-center">
          <div className="flex items-center gap-3 text-foreground">
            <BrandMark size={44} />
            <span className="text-2xl font-bold tracking-wide">IRIS</span>
          </div>
        </div>
      </header>

      {/* Center — animated rotating-word hero (21st.dev) + CTA. Biased ~20% down
          so the top of the 3D robot reads clearly above the headline. Click-
          through in cyber mode (so cursor reaches the robot); CTA re-enables. */}
      <div className={`relative z-10 flex-1 flex flex-col items-center justify-start text-center px-6 pt-[30vh] pointer-events-none`}>
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.05] max-w-3xl">
          <span>One console for the city&rsquo;s</span>
          <span className="relative flex w-full justify-center overflow-hidden text-center pt-1 md:pb-2 md:pt-2">
            &nbsp;
            {titles.map((title, index) => (
              <motion.span
                key={index}
                className="absolute font-bold text-primary"
                initial={{ opacity: 0, y: -100 }}
                transition={{ type: 'spring', stiffness: 50 }}
                animate={titleNumber === index
                  ? { y: 0, opacity: 1 }
                  : { y: titleNumber > index ? -150 : 150, opacity: 0 }}
              >
                {title}
              </motion.span>
            ))}
          </span>
        </h1>

        <RippleButton
          type="button"
          variant="ghost"
          onClick={goLogin}
          rippleColor="rgba(var(--brand-accent-rgb),0.5)"
          className="mb-cta pointer-events-auto mt-12 group inline-flex items-center justify-center h-14 !px-10 !py-0 !rounded-xl !text-base font-bold !text-primary-foreground !bg-primary hover:!opacity-90 border border-foreground/15 transition-all duration-300 hover:scale-105"
        >
          <span className="inline-flex items-center" style={{ letterSpacing: '0.06em' }}>
            Login to Console
            <MoveRight className="ml-3 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </RippleButton>
      </div>

      {/* Footer */}
      <footer className={`relative z-10 shrink-0 py-5 pointer-events-none`}>
        <p className="text-center text-[10px] text-muted-foreground font-mono tracking-[0.18em]">
          IRIS COMMAND CONSOLE
        </p>
      </footer>
    </div>
  );
}
