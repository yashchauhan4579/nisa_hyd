import { createContext, useContext } from 'react';
import { useTheme as useHostTheme } from '@/contexts/ThemeContext';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The host app owns the theme (amber/cyberpunk × light/dark). This vendored
  // provider only exists to satisfy sringeri components' useTheme(); proxy it to
  // the host so `theme` reflects the real light/dark choice — sringeri pages
  // (e.g. VCC) that branch on `theme === 'light'` then follow the host toggle.
  const host = useHostTheme();
  return (
    <ThemeContext.Provider value={{ theme: host.theme, toggleTheme: host.toggleTheme }}>
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
