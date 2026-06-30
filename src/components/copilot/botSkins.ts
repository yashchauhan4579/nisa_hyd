// Theme-adaptive skins for the IRIS Copilot mascot.
// Watches <html> class / data-theme reactively so any future theme the
// settings page ships (cyberpunk, old-school, ...) re-skins the bot with
// zero changes here beyond an optional named entry.
import { useEffect, useState } from 'react';

export interface BotSkin {
  key: string;
  body: string;       // body fill
  bodyEdge: string;   // body stroke
  belly: string;      // face plate
  eye: string;        // pupil / glow color
  eyeSocket: string;  // eye white area
  feet: string;
  glow: string;       // outer drop-shadow glow
  accent: string;     // antenna tip, chat accents
  accessory: 'none' | 'visor' | 'cowboyHat';
  trail?: boolean;    // neon motion trail (cyberpunk)
}

const SKINS: Record<string, BotSkin> = {
  dark: {
    key: 'dark', body: '#1c2433', bodyEdge: '#f59e0b', belly: '#0d1320',
    eye: '#fbbf24', eyeSocket: '#0a0f1a', feet: '#f59e0b',
    glow: 'rgba(245,158,11,0.45)', accent: '#f59e0b', accessory: 'none',
  },
  light: {
    key: 'light', body: '#e8edf5', bodyEdge: '#475569', belly: '#f8fafc',
    eye: '#2563eb', eyeSocket: '#dbe4f0', feet: '#475569',
    glow: 'rgba(71,85,105,0.35)', accent: '#2563eb', accessory: 'none',
  },
  cyberpunk: {
    key: 'cyberpunk', body: '#12041f', bodyEdge: '#e11ed8', belly: '#1a0b2e',
    eye: '#00f0ff', eyeSocket: '#05010d', feet: '#00f0ff',
    glow: 'rgba(225,30,216,0.65)', accent: '#00f0ff', accessory: 'visor', trail: true,
  },
  oldschool: {
    key: 'oldschool', body: '#8a6a45', bodyEdge: '#3d2b1a', belly: '#d9c39a',
    eye: '#3d2b1a', eyeSocket: '#f0e3c8', feet: '#5a4630',
    glow: 'rgba(138,106,69,0.45)', accent: '#b08850', accessory: 'cowboyHat',
  },
};
// aliases so whatever name the theme switcher uses still hits a skin
const ALIASES: Record<string, string> = {
  retro: 'oldschool', western: 'oldschool', vintage: 'oldschool', sepia: 'oldschool',
  classic: 'oldschool', neon: 'cyberpunk', cyber: 'cyberpunk', synthwave: 'cyberpunk',
};

function cssVar(name: string): string | null {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || null;
  } catch { return null; }
}

function detectThemeName(): string {
  const el = document.documentElement;
  const dt = el.getAttribute('data-theme');
  if (dt) return dt.toLowerCase();
  const known = Object.keys(SKINS).concat(Object.keys(ALIASES));
  for (const c of Array.from(el.classList)) {
    const lc = c.toLowerCase();
    if (known.includes(lc)) return lc;
  }
  try {
    const ls = localStorage.getItem('theme');
    if (ls) return ls.toLowerCase();
  } catch { /* ignore */ }
  return 'dark';
}

export function resolveSkin(): BotSkin {
  const name = detectThemeName();
  const skin = SKINS[name] || SKINS[ALIASES[name] || ''];
  if (skin) return skin;
  // Unknown future theme: derive from live CSS variables, fall back to dark.
  const primary = cssVar('--primary') || cssVar('--accent');
  if (primary) {
    const col = primary.includes(' ') && !primary.startsWith('#') ? `hsl(${primary})` : primary;
    return { ...SKINS.dark, key: name, bodyEdge: col, eye: col, feet: col, accent: col, glow: col };
  }
  return SKINS.dark;
}

export function useBotSkin(): BotSkin {
  const [skin, setSkin] = useState<BotSkin>(() => resolveSkin());
  useEffect(() => {
    const update = () => setSkin(resolveSkin());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    window.addEventListener('storage', update);
    return () => { mo.disconnect(); window.removeEventListener('storage', update); };
  }, []);
  return skin;
}
