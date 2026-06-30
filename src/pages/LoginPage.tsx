import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { IrisLogo } from '../components/brand/IrisLogo';
import { useAuth } from '../contexts/AuthContext';
import { ParticleField } from '../components/ParticleField';
import { Meteors } from '../components/ui/Meteors';
import { RippleButton } from '../components/ui/multi-type-ripple-buttons';
import '../styles/magicbox-landing.css';

// White/black MagicBox-Hub login: frosted white card on a light cream surface,
// black #0B1726 accents + button. De-branded for IRIS, with an ambient rising
// particle field, a drifting amber/navy aurora background, and a smooth
// ease-out card entrance that settles in as the login gate finishes opening.

// Pop in from the middle: scale up from the center with a spring + fade +
// de-blur (no top-down slide), so the card "appears" rather than drops in.
const card: Variants = {
  hidden: { opacity: 0, scale: 0.82, filter: 'blur(10px)' },
  show: {
    opacity: 1, scale: 1, filter: 'blur(0px)',
    transition: {
      type: 'spring', stiffness: 180, damping: 18, mass: 0.9,
      when: 'beforeChildren', staggerChildren: 0.05, delayChildren: 0.12,
    },
  },
};
const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

// Soft drifting colour fields behind the particles — premium ambient depth.
const AURORA = [
  { c: 'rgba(var(--brand-accent-rgb),0.30)', top: '6%', left: '12%', size: 520, dur: 17, dx: 60, dy: 40 },
  { c: 'rgba(11,23,38,0.16)', top: '48%', left: '62%', size: 600, dur: 21, dx: -70, dy: -50 },
  { c: 'rgba(var(--brand-accent-2-rgb),0.16)', top: '60%', left: '20%', size: 460, dur: 24, dx: 50, dy: -60 },
];

function Aurora() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {AURORA.map((a, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            top: a.top, left: a.left, width: a.size, height: a.size,
            background: `radial-gradient(circle, ${a.c} 0%, transparent 68%)`,
            filter: 'blur(40px)',
          }}
          animate={{ x: [0, a.dx, 0], y: [0, a.dy, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: a.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ username: username.trim(), password });
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-bg min-h-screen relative overflow-hidden grid place-items-center px-6 py-12">
      <div className="mb-grain" aria-hidden="true" />
      <div className="mb-grid" aria-hidden="true" />
      <Aurora />
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <Meteors number={22} />
      </div>
      <ParticleField className="absolute inset-0 w-full h-full pointer-events-none" />
      {/* soft vignette so the card reads clearly above the particles —
          theme-aware (cream in light, deep slate in dark) */}
      <div className="absolute inset-0 pointer-events-none hidden dark:block"
        style={{ background: 'radial-gradient(circle at 50% 45%, rgba(6,8,16,0.55) 0%, rgba(6,8,16,0) 55%)' }} aria-hidden="true" />
      <div className="absolute inset-0 pointer-events-none dark:hidden"
        style={{ background: 'radial-gradient(circle at 50% 45%, rgba(244,243,241,0.55) 0%, rgba(244,243,241,0) 55%)' }} aria-hidden="true" />

      <motion.div
        className="relative w-full max-w-md"
        style={{ zIndex: 10 }}
        variants={card}
        initial="hidden"
        animate="show"
      >
        {/* gradient ring + brand glow */}
        <div className="rounded-2xl bg-gradient-to-b from-[rgba(var(--brand-accent-rgb),0.45)] via-border to-border/30 p-px shadow-[0_40px_90px_-30px_rgba(var(--brand-accent-rgb),0.4),0_24px_60px_-30px_rgba(10,25,45,0.5)]">
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/90 backdrop-blur-xl p-10">
          {/* top hairline sheen + soft brand halo behind the logo */}
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--brand-accent-rgb),0.7)] to-transparent" aria-hidden="true" />
          <div className="pointer-events-none absolute left-1/2 top-[-70px] h-44 w-44 -translate-x-1/2 rounded-full" aria-hidden="true"
            style={{ background: 'radial-gradient(circle, rgba(var(--brand-accent-rgb),0.20) 0%, transparent 70%)' }} />

        <motion.div variants={item} className="relative flex items-center justify-center">
          <span className="relative grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-primary to-[rgb(var(--brand-accent-2-rgb))] shadow-[0_14px_38px_-8px_rgba(var(--brand-accent-rgb),0.7)] ring-1 ring-white/25">
            <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/25 to-transparent" aria-hidden="true" />
            <IrisLogo className="relative h-12 w-12 text-primary-foreground" strokeWidth={1.7} />
          </span>
        </motion.div>

        <motion.div variants={item} className="mt-6 text-center">
          <div className="text-3xl font-bold tracking-tight text-foreground" style={{ letterSpacing: '0.02em' }}>
            IRIS
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground font-mono tracking-[0.24em]">
            SECURE ACCESS
          </div>
        </motion.div>

        <form onSubmit={submit} className="mt-8 space-y-5">
          {error && (
            <motion.div variants={item} className="text-sm text-red-600 dark:text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg px-4 py-3 font-medium">
              {error}
            </motion.div>
          )}
          <motion.div variants={item}>
            <label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">Username</label>
            <input
              value={username} onChange={(e) => setUsername(e.target.value)}
              autoComplete="username" placeholder="commandcentre" required
              className="mt-2 w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </motion.div>
          <motion.div variants={item}>
            <label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="••••••••" required
              className="mt-2 w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </motion.div>
          <motion.div variants={item}>
            <RippleButton
              type="submit"
              variant="ghost"
              disabled={loading}
              rippleColor="rgba(var(--brand-accent-rgb),0.55)"
              className="w-full inline-flex items-center justify-center h-12 !rounded-lg !bg-primary hover:!opacity-90 transition-opacity duration-200 !text-sm font-bold !text-primary-foreground disabled:opacity-60 shadow-[0_16px_32px_-12px_rgba(var(--brand-accent-rgb),0.5)] border border-primary/30"
            >
              <span style={{ letterSpacing: '0.08em' }}>{loading ? 'SIGNING IN...' : 'SIGN IN'}</span>
            </RippleButton>
          </motion.div>
        </form>

        <motion.div variants={item} className="mt-8 pt-6 border-t border-border text-center text-sm text-muted-foreground font-medium tracking-wide">
          <Link to="/landing" className="hover:text-foreground transition-colors">← Back to Home</Link>
        </motion.div>
        </div>
        </div>
      </motion.div>
    </div>
  );
}
