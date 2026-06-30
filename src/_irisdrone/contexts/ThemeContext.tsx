import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
export type AccentColor = 'cyan' | 'amber' | 'emerald' | 'rose' | 'violet';

interface AccentSpec {
  bright: string;     // primary glowy color, like #66F7FF
  base: string;       // mid color
  dim: string;        // border/dim color
  rgb: string;        // "0, 240, 255" for rgba()
}

const ACCENT_MAP: Record<AccentColor, AccentSpec> = {
  cyan:    { bright: '#66F7FF', base: '#00F0FF', dim: '#005F73', rgb: '0, 240, 255' },
  amber:   { bright: '#FCD34D', base: '#FFB700', dim: '#7C5800', rgb: '255, 183, 0' },
  emerald: { bright: '#6EE7B7', base: '#10B981', dim: '#065F46', rgb: '16, 185, 129' },
  rose:    { bright: '#FB7185', base: '#F43F5E', dim: '#7F1D1D', rgb: '244, 63, 94' },
  violet:  { bright: '#C4B5FD', base: '#f59e0b', dim: '#4C1D95', rgb: '139, 92, 246' },
};

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accent: AccentColor;
  setAccent: (a: AccentColor) => void;
  toggleTheme: () => void;
  accents: typeof ACCENT_MAP;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'iris_accent';
const THEME_KEY = 'iris_theme';

function applyAccent(spec: AccentSpec) {
  const root = window.document.documentElement;
  root.style.setProperty('--tact-cyan', spec.base);
  root.style.setProperty('--tact-cyan-bright', spec.bright);
  root.style.setProperty('--tact-cyan-dim', spec.dim);
  root.style.setProperty('--tact-accent-rgb', spec.rgb);
  // Also update the CSS-variable based shadcn tokens
  root.style.setProperty('--primary', spec.base);
  root.style.setProperty('--ring', spec.base);
  root.style.setProperty('--sidebar-primary', spec.base);
  root.style.setProperty('--sidebar-ring', spec.base);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_KEY) : null) as Theme | null;
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  });

  const [accent, setAccentState] = useState<AccentColor>(() => {
    const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as AccentColor | null;
    return stored && ACCENT_MAP[stored] ? stored : 'cyan';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  useEffect(() => {
    applyAccent(ACCENT_MAP[accent]);
    try { localStorage.setItem(STORAGE_KEY, accent); } catch {}
  }, [accent]);

  const setAccent = (a: AccentColor) => setAccentState(a);
  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent, toggleTheme, accents: ACCENT_MAP }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
