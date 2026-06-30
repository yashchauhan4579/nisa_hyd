import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useKeyboardShortcuts, cmdKey } from '@irisdrone/hooks/useKeyboardShortcuts';
import { Kbd, KbdGroup } from './kbd';

interface ShortcutItem {
  label: string;
  keys: string[];
}

interface ShortcutGroup {
  group: string;
  items: ShortcutItem[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    group: 'Navigation',
    items: [
      { label: 'Home / Command Center', keys: ['G', 'H'] },
      { label: 'ITMS Dashboard', keys: ['G', 'I'] },
      { label: 'Violations', keys: ['G', 'V'] },
      { label: 'ANPR', keys: ['G', 'A'] },
      { label: 'Review Center', keys: ['G', 'R'] },
      { label: 'Watchlist', keys: ['G', 'W'] },
      { label: 'Crowd Analytics', keys: ['G', 'C'] },
      { label: 'Alerts', keys: ['G', 'N'] },
      { label: 'Analytics', keys: ['G', 'L'] },
      { label: 'Settings', keys: ['G', 'S'] },
    ],
  },
  {
    group: 'Search & Find',
    items: [
      { label: 'Focus search', keys: ['/'] },
      { label: 'Focus search', keys: [cmdKey, 'K'] },
    ],
  },
  {
    group: 'Forms',
    items: [
      { label: 'Submit form', keys: ['↵'] },
      { label: 'Submit from textarea', keys: [cmdKey, '↵'] },
      { label: 'Cancel / close', keys: ['Esc'] },
    ],
  },
  {
    group: 'Help',
    items: [
      { label: 'Show keyboard shortcuts', keys: ['?'] },
      { label: 'Close overlay', keys: ['Esc'] },
    ],
  },
];

export function KeyboardHelpOverlay() {
  const { helpOpen, setHelpOpen } = useKeyboardShortcuts();

  useEffect(() => {
    if (!helpOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [helpOpen]);

  if (!helpOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => {
        if (e.target === e.currentTarget) setHelpOpen(false);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9500,
        padding: 24,
        animation: 'tact-fade-in 0.2s ease',
        fontFamily: "'Rajdhani', sans-serif",
      }}
    >
      <div
        className="tact-brackets-4"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 720,
          maxHeight: '85vh',
          background: 'linear-gradient(180deg, rgba(5, 16, 25, 0.98) 0%, rgba(2, 8, 14, 0.98) 100%)',
          border: '1px solid rgba(0, 240, 255, 0.4)',
          boxShadow: '0 32px 96px -24px rgba(0, 0, 0, 0.7), 0 0 64px -16px rgba(0, 240, 255, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <span className="tact-corner tact-corner-tl" />
        <span className="tact-corner tact-corner-tr" />
        <span className="tact-corner tact-corner-bl" />
        <span className="tact-corner tact-corner-br" />

        {/* Top scanner */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.6), transparent)',
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 14px',
            borderBottom: '1px solid rgba(0, 95, 115, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="tact-dot tact-dot--cyan" style={{ width: 6, height: 6 }} />
            <span
              className="tact-display"
              style={{
                fontSize: 12,
                color: '#66F7FF',
                letterSpacing: '0.22em',
              }}
            >
              KEYBOARD SHORTCUTS
            </span>
          </div>
          <button
            onClick={() => setHelpOpen(false)}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(0, 95, 115, 0.4)',
              background: 'rgba(0, 240, 255, 0.04)',
              color: '#9FC0C7',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 42, 42, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 42, 42, 0.5)';
              e.currentTarget.style.color = '#fca5a5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 240, 255, 0.04)';
              e.currentTarget.style.borderColor = 'rgba(0, 95, 115, 0.4)';
              e.currentTarget.style.color = '#9FC0C7';
            }}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div
          className="scroll-hidden"
          style={{
            padding: '20px 24px 24px',
            overflow: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px 32px',
          }}
        >
          {SHORTCUTS.map((group) => (
            <div key={group.group}>
              <div
                className="tact-label"
                style={{
                  fontSize: 10,
                  color: '#9FC0C7',
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: '1px solid rgba(0, 95, 115, 0.3)',
                  letterSpacing: '0.18em',
                }}
              >
                {group.group}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: '#DCEEF1',
                        fontFamily: "'Rajdhani', sans-serif",
                        letterSpacing: '0.02em',
                      }}
                    >
                      {item.label}
                    </span>
                    {item.keys.length === 1 ? (
                      <Kbd>{item.keys[0]}</Kbd>
                    ) : (
                      <KbdGroup
                        keys={item.keys}
                        separator={item.keys[0] === 'G' ? ' ' : '+'}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid rgba(0, 95, 115, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 240, 255, 0.025)',
          }}
        >
          <span
            className="tact-mono"
            style={{
              fontSize: 9,
              color: '#6E8A92',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Press <Kbd size="xs">?</Kbd> anywhere to toggle this overlay
          </span>
          <span
            className="tact-mono"
            style={{
              fontSize: 9,
              color: '#4a6b73',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            OVERSIGHT · v3
          </span>
        </div>
      </div>
    </div>
  );
}
