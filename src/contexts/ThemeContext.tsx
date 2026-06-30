import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

// Theme FAMILY — orthogonal to light/dark. 'amber' is the original IRIS look
// (no extra class on <html>, zero cascade risk); 'cyberpunk' adds the
// `.theme-cyberpunk` class which themes/cyberpunk.css keys off.
export type ThemeFamily = 'amber' | 'cyberpunk';

// Canonical brand accents per family, for the few JS consumers that
// string-concat hex values (canvas, `${color}55` opacity suffixes) and
// therefore can't use `var(--brand-accent)`.
export const BRAND_ACCENTS: Record<ThemeFamily, { primary: string; secondary: string }> = {
  amber: { primary: '#f59e0b', secondary: '#f97316' },
  cyberpunk: { primary: '#7C4DFF', secondary: '#FF2D95' },
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  themeFamily: ThemeFamily;
  setThemeFamily: (family: ThemeFamily) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Browser-tab favicon. We load the designed file (public/iris-favicon.svg) and
// inline it as a data-URI <link rel="icon"> — this uses the file's OWN colours
// (so editing the file reflects after a build) and busts aggressive favicon
// caches whenever its content changes. Set FAVICON_TINT_THEME=true to instead
// recolour the eye to the active brand accent (amber ↔ cyberpunk violet).
const FAVICON_TINT_THEME = true;
const FAVICON_SOURCE_HEX = '#00F0FF'; // the base colour in iris-favicon.svg

function setFaviconHref(svg: string) {
  if (typeof document === 'undefined') return;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

let faviconTemplate: string | null = null;
async function applyFaviconAccent(accent: string) {
  if (typeof document === 'undefined') return;
  try {
    if (faviconTemplate == null) {
      const res = await fetch('/iris-favicon.svg', { cache: 'no-cache' });
      faviconTemplate = res.ok ? await res.text() : '';
    }
    if (faviconTemplate) {
      const svg = FAVICON_TINT_THEME
        ? faviconTemplate.replace(new RegExp(FAVICON_SOURCE_HEX, 'gi'), accent)
        : faviconTemplate; // use the file's own colours as-is
      setFaviconHref(svg);
    }
  } catch { /* keep whatever the static <link> resolved */ }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from localStorage or system preference
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      return savedTheme;
    }
    // Default to dark to match the IRIS Command Center aesthetic.
    return 'dark';
  });

  // Theme family (amber = original look, cyberpunk = neon blue/pink skin).
  const [themeFamily, setThemeFamily] = useState<ThemeFamily>(() => {
    const saved = localStorage.getItem('themeFamily') as ThemeFamily | null;
    // Default to cyberpunk for a fresh visit; only honour an explicit amber opt-out.
    return saved === 'amber' ? 'amber' : 'cyberpunk';
  });

  useEffect(() => {
    // Apply theme to document
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    // Apply the family class. Amber = no class, so the original app is
    // untouched; cyberpunk.css keys everything off `.theme-cyberpunk`.
    const root = window.document.documentElement;
    root.classList.toggle('theme-cyberpunk', themeFamily === 'cyberpunk');
    localStorage.setItem('themeFamily', themeFamily);
    // Keep the browser-tab logo in sync with the theme accent.
    applyFaviconAccent(BRAND_ACCENTS[themeFamily].primary);
  }, [themeFamily]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, themeFamily, setThemeFamily }}>
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

