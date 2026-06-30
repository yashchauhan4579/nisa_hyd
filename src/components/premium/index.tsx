// Premium UI kit — glassmorphism cards + animated gradient pills + framer-motion primitives.
// Motion follows ui-ux-pro-max specs: 150–300ms micro-interactions, spring physics,
// 40ms stagger, transform/opacity only, reduced-motion aware.
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode, CSSProperties } from 'react';
import { useTheme, BRAND_ACCENTS } from '@/contexts/ThemeContext';

// ─── motion tokens ───
export const spring = { type: 'spring', stiffness: 380, damping: 30 } as const;
export const springSoft = { type: 'spring', stiffness: 260, damping: 26 } as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { ...springSoft } },
};

// Stagger container: children reveal 40ms apart (spec: 30–50ms).
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};

export function MotionStagger({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      variants={reduce ? undefined : staggerContainer}
      initial={reduce ? undefined : 'hidden'}
      animate={reduce ? undefined : 'show'}
    >
      {children}
    </motion.div>
  );
}

export function MotionItem({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} style={style} variants={reduce ? undefined : fadeUp}>
      {children}
    </motion.div>
  );
}

// ─── GlassCard — glassmorphism surface with hover lift + accent glow ───
export function GlassCard({
  children, className = '', accent, interactive = false, onClick, style,
}: {
  children: ReactNode; className?: string; accent?: string;
  interactive?: boolean; onClick?: () => void; style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      onClick={onClick}
      variants={fadeUp}
      whileHover={interactive && !reduce ? { y: -4, transition: spring } : undefined}
      whileTap={interactive && !reduce ? { scale: 0.985 } : undefined}
      className={`relative rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl
                  ${interactive ? 'cursor-pointer' : ''} ${className}`}
      style={{
        boxShadow: accent
          ? `0 1px 0 0 rgba(255,255,255,0.05) inset, 0 8px 32px -12px ${accent}40`
          : '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 8px 32px -16px rgba(0,0,0,0.6)',
        ...style,
      }}
    >
      {accent && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
      )}
      {children}
    </motion.div>
  );
}

// ─── GradientPill — animated gradient badge with optional icon ───
export function GradientPill({
  children, color, icon, pulse = false, className = '',
}: {
  children: ReactNode; color?: string; icon?: ReactNode; pulse?: boolean; className?: string;
}) {
  // Default accent follows the theme family. Resolved in JS (not via CSS var)
  // because the hex is string-concatenated into alpha suffixes below.
  const { themeFamily } = useTheme();
  const resolved = color ?? BRAND_ACCENTS[themeFamily].primary;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]
                  font-semibold tracking-wide ${className}`}
      style={{
        color: resolved,
        borderColor: `${resolved}55`,
        background: `linear-gradient(135deg, ${resolved}26, ${resolved}0d)`,
      }}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: resolved }} />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: resolved }} />
        </span>
      )}
      {icon}
      {children}
    </span>
  );
}

// ─── StatCard — premium KPI tile with entrance + hover, accent top-rail ───
export function StatCard({
  label, value, sub, icon, accent, className = '',
}: {
  label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: string; className?: string;
}) {
  // Theme-family-aware default; GlassCard concatenates `${accent}40`, so this
  // must stay a real hex (no var()).
  const { themeFamily } = useTheme();
  const resolved = accent ?? BRAND_ACCENTS[themeFamily].primary;
  return (
    <GlassCard accent={resolved} interactive className={`p-4 overflow-hidden ${className}`}>
      <div className="flex items-center gap-1.5 mb-3" style={{ color: resolved }}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-widest opacity-90">{label}</span>
      </div>
      <p className="text-2xl font-black tabular-nums tracking-tight text-zinc-100">{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-1">{sub}</p>}
    </GlassCard>
  );
}
