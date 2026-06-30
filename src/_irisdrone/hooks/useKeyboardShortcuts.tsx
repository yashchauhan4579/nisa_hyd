import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export interface ShortcutDef {
  /** Display label for help overlay */
  label: string;
  /** Group label (e.g. "Navigation", "Actions") */
  group: string;
  /** Visual key chip(s) */
  keys: string[];
  /** Optional handler — if missing, item is doc-only */
  handler?: () => void;
}

interface ShortcutsContext {
  shortcuts: ShortcutDef[];
  registerShortcut: (s: ShortcutDef) => () => void;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

const Ctx = createContext<ShortcutsContext | null>(null);

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const cmdKey = isMac ? '⌘' : 'Ctrl';

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

const NAV_ROUTES: Record<string, string> = {
  h: '/',
  i: '/itms',
  v: '/itms/violations',
  a: '/itms/anpr',
  c: '/crowd',
  r: '/itms/review',
  w: '/itms/watchlist',
  s: '/settings',
  n: '/alerts',
  l: '/itms/analytics',
};

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [shortcuts, setShortcuts] = useState<ShortcutDef[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  const registerShortcut = useCallback((s: ShortcutDef) => {
    setShortcuts((prev) => [...prev, s]);
    return () => {
      setShortcuts((prev) => prev.filter((x) => x !== s));
    };
  }, []);

  // Reset chord state on route change
  useEffect(() => {
    setPendingG(false);
  }, [location.pathname]);

  // Global keyboard handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Always-on: Escape closes help overlay
      if (e.key === 'Escape' && helpOpen) {
        setHelpOpen(false);
        e.preventDefault();
        return;
      }

      const inInput = isInputFocused();

      // Cmd/Ctrl+K → focus first search input on the page (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const search =
          document.querySelector<HTMLInputElement>(
            'input[type="search"], input[placeholder*="earch" i], input[placeholder*="lookup" i]'
          );
        if (search) {
          search.focus();
          search.select();
        }
        return;
      }

      // Skip everything else if user is typing
      if (inInput) {
        // Cmd/Ctrl+Enter inside an input → click closest submit button
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          const form = (document.activeElement as HTMLElement)?.closest('form');
          if (form) {
            const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
            submit?.click();
            e.preventDefault();
          }
        }
        return;
      }

      // ? or Shift+/ → toggle help overlay
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }

      // / → focus search
      if (e.key === '/') {
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[placeholder*="earch" i], input[placeholder*="lookup" i]'
        );
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }

      // g → start nav chord
      if (e.key === 'g' && !pendingG) {
        setPendingG(true);
        // Auto-cancel after 1.5s
        setTimeout(() => setPendingG(false), 1500);
        return;
      }

      // Second key of g chord
      if (pendingG) {
        const k = e.key.toLowerCase();
        if (NAV_ROUTES[k]) {
          e.preventDefault();
          navigate(NAV_ROUTES[k]);
        }
        setPendingG(false);
        return;
      }

      // Page-specific shortcuts (registered via registerShortcut)
      // We let those components handle their own keydown listeners.
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, helpOpen, pendingG]);

  return (
    <Ctx.Provider value={{ shortcuts, registerShortcut, helpOpen, setHelpOpen }}>
      {children}
      <KbdChordHint visible={pendingG} />
    </Ctx.Provider>
  );
}

export function useKeyboardShortcuts() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useKeyboardShortcuts must be used within KeyboardShortcutsProvider');
  return ctx;
}

/** Floating hint shown when "g" chord is pending */
function KbdChordHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9000,
        padding: '10px 16px',
        background: 'rgba(2, 8, 14, 0.95)',
        border: '1px solid rgba(0, 240, 255, 0.5)',
        boxShadow: '0 0 32px -8px rgba(0, 240, 255, 0.5)',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 11,
        color: '#66F7FF',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        animation: 'tact-fade-in 0.2s ease',
      }}
    >
      <span style={{ marginRight: 10 }}>G</span>
      <span style={{ color: '#7d9fa6', marginRight: 10 }}>+</span>
      <span style={{ color: '#9FC0C7' }}>NEXT KEY: H · I · V · A · R · W · C · S · N · L</span>
    </div>
  );
}

/** Per-component shortcut registration (e.g., Review Center: a=approve, r=reject) */
export function useScopedShortcut(
  key: string,
  handler: () => void,
  opts: { label?: string; group?: string; enabled?: boolean } = {}
) {
  const { enabled = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      if (e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, handler, enabled]);
}
