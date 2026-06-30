import { useState, useEffect, type ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';

type ConfirmVariant = 'info' | 'warning' | 'danger' | 'success';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** If true, only shows OK button (alert mode) */
  alertOnly?: boolean;
}

interface QueueItem extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const queue: QueueItem[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/**
 * Custom replacement for window.confirm() / window.alert().
 * Returns a Promise<boolean> — true on confirm, false on cancel.
 *
 * Usage:
 *   const ok = await confirmDialog({ title: 'Delete?', message: 'This is permanent.', variant: 'danger' });
 *   if (ok) { ... }
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ ...opts, resolve });
    notify();
  });
}

export function alertDialog(opts: Omit<ConfirmOptions, 'alertOnly'>): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ ...opts, alertOnly: true, resolve: () => resolve() });
    notify();
  });
}

const variantConfig: Record<ConfirmVariant, { icon: ReactNode; color: string; rgb: string }> = {
  info: { icon: <Info size={22} />, color: '#66F7FF', rgb: '0, 240, 255' },
  warning: { icon: <AlertTriangle size={22} />, color: '#FFB700', rgb: '255, 183, 0' },
  danger: { icon: <AlertTriangle size={22} />, color: '#FF2A2A', rgb: '255, 42, 42' },
  success: { icon: <CheckCircle2 size={22} />, color: '#10b981', rgb: '16, 185, 129' },
};

export function ConfirmDialogHost() {
  const [, force] = useState(0);

  useEffect(() => {
    const update = () => force((n) => n + 1);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  const variant = current.variant || 'info';
  const cfg = variantConfig[variant];

  function confirm() {
    const item = queue.shift();
    item?.resolve(true);
    notify();
  }

  function cancel() {
    const item = queue.shift();
    item?.resolve(false);
    notify();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(1, 3, 6, 0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9700,
        padding: 24,
        animation: 'tact-fade-in 0.18s ease',
        fontFamily: "'Rajdhani', sans-serif",
      }}
    >
      <div
        className="tact-brackets-4"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: 'linear-gradient(180deg, rgba(5, 16, 25, 0.98) 0%, rgba(2, 8, 14, 0.98) 100%)',
          border: `1px solid rgba(${cfg.rgb}, 0.5)`,
          boxShadow: `0 32px 96px -24px rgba(0, 0, 0, 0.8), 0 0 64px -16px rgba(${cfg.rgb}, 0.3)`,
          animation: 'tact-confirm-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <span className="tact-corner tact-corner-tl" style={{ borderColor: cfg.color }} />
        <span className="tact-corner tact-corner-tr" style={{ borderColor: cfg.color }} />
        <span className="tact-corner tact-corner-bl" style={{ borderColor: cfg.color }} />
        <span className="tact-corner tact-corner-br" style={{ borderColor: cfg.color }} />

        {/* Top scanline */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)`,
            pointerEvents: 'none',
          }}
        />

        {/* Close X */}
        <button
          onClick={cancel}
          aria-label="Close"
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(0, 95, 115, 0.4)',
            background: 'rgba(0, 240, 255, 0.04)',
            color: '#9FC0C7',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            zIndex: 1,
          }}
        >
          <X size={14} strokeWidth={1.75} />
        </button>

        {/* Body */}
        <div style={{ padding: '32px 28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
          <div
            style={{
              width: 56,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid rgba(${cfg.rgb}, 0.4)`,
              background: `rgba(${cfg.rgb}, 0.08)`,
              color: cfg.color,
              filter: `drop-shadow(0 0 12px rgba(${cfg.rgb}, 0.4))`,
            }}
          >
            {cfg.icon}
          </div>

          <h2
            id="confirm-title"
            className="tact-display"
            style={{
              fontSize: 16,
              color: '#F0FBFD',
              letterSpacing: '0.12em',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {current.title}
          </h2>

          {current.message && (
            <p
              className="tact-mono"
              style={{
                fontSize: 11,
                color: '#9FC0C7',
                letterSpacing: '0.04em',
                lineHeight: 1.6,
                margin: 0,
                maxWidth: 360,
              }}
            >
              {current.message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '16px 20px 20px',
            justifyContent: 'center',
            borderTop: '1px solid rgba(0, 95, 115, 0.2)',
            background: 'rgba(0, 240, 255, 0.02)',
          }}
        >
          {!current.alertOnly && (
            <button
              type="button"
              onClick={cancel}
              style={{
                flex: 1,
                maxWidth: 160,
                height: 38,
                padding: '0 16px',
                background: 'transparent',
                border: '1px solid rgba(0, 95, 115, 0.4)',
                color: '#9FC0C7',
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 240, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.4)';
                e.currentTarget.style.color = '#DCEEF1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(0, 95, 115, 0.4)';
                e.currentTarget.style.color = '#9FC0C7';
              }}
            >
              {current.cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            type="button"
            onClick={confirm}
            autoFocus
            style={{
              flex: 1,
              maxWidth: 200,
              height: 38,
              padding: '0 16px',
              background: `linear-gradient(180deg, rgba(${cfg.rgb}, 0.2) 0%, rgba(${cfg.rgb}, 0.08) 100%)`,
              border: `1px solid rgba(${cfg.rgb}, 0.6)`,
              color: cfg.color,
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: `0 0 16px -4px rgba(${cfg.rgb}, 0.4)`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `linear-gradient(180deg, rgba(${cfg.rgb}, 0.3) 0%, rgba(${cfg.rgb}, 0.14) 100%)`;
              e.currentTarget.style.boxShadow = `0 0 24px -2px rgba(${cfg.rgb}, 0.5)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `linear-gradient(180deg, rgba(${cfg.rgb}, 0.2) 0%, rgba(${cfg.rgb}, 0.08) 100%)`;
              e.currentTarget.style.boxShadow = `0 0 16px -4px rgba(${cfg.rgb}, 0.4)`;
            }}
          >
            {current.confirmLabel || (current.alertOnly ? 'OK' : 'Confirm')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes tact-confirm-in {
          from { opacity: 0; transform: translateY(-12px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
