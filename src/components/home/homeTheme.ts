// Theme-aware palette for the 3D home hub (HomePage + Background3D).
// The hub was authored with hardcoded dark slate values inline; this centralises
// the surfaces/text/scene colors so the hub honours the light/dark selector.
// The amber accent (activeColor) is theme-independent and passed separately.

import * as THREE from 'three';
import type { ThemeFamily } from '../../contexts/ThemeContext';

export type HubTheme = 'light' | 'dark';

export interface HubPalette {
  // DOM / HTML surfaces + text (HomePage)
  fallbackBg: string;        // Suspense fallback gradient
  surface: string;           // idle module button background
  surfaceHoverFallback: string;
  surfaceStrong: string;     // submenu tile background
  centerGrad: string;        // center hub circle gradient
  centerInset: string;       // inner shadow inside the center circle (depth)
  iconIdleBg: string;        // idle icon container
  idleText: string;          // idle label / icon
  mutedText: string;         // secondary text
  faintText: string;         // tertiary text (hints)
  border: string;            // idle borders
  tileBorder: string;        // idle module-tile border (visible separation on light)
  tileShadow: string;        // idle module-tile / submenu shadow
  centerBorder: string;      // center circle idle border
  logoutBg: string;
  logoutBorder: string;
  clockText: string;
  clockShadow: string;
  typeText: string;          // typing animation
  feedLabel: string;         // "Live Event Feed" / "Input Sources"
  feedBodyText: string;      // alert body text (idle)
  feedHighlightText: string; // alert body text (flash)
  scanline: string;
  chipBg: string;            // ESC key chip
  chipBorder: string;

  // three.js scene (Background3D)
  canvasBg: string;          // <Canvas> background gradient
  starsVisible: boolean;
  sceneBlending: THREE.Blending;
  cameraBody: string;        // idle CCTV body mesh
  cameraDark: string;        // lens / mount mesh
  // scene opacity multipliers (light needs a lift since there's no dark backdrop)
  globeOpacityMul: number;
  particleOpacityMul: number;

  // Brand accents for the hub modules (hex — concatenated with alpha suffixes
  // in HomePage, so these must stay real hex values, not var()).
  moduleAccent: string;     // primary module color (amber / cyber blue)
  moduleAccentAlt: string;  // activeColor fallback (orange / cyber pink)
  // On light surfaces the bright accent fails contrast as *text* — remap to a
  // deeper ink. Keyed by the raw accent hex; empty on dark palettes.
  lightModuleRemap: Record<string, string>;
}

const dark: HubPalette = {
  fallbackBg: 'linear-gradient(135deg, #030712 0%, #0f172a 50%, #030712 100%)',
  surface: 'linear-gradient(90deg, rgba(15, 23, 42, 0.8) 0%, transparent 100%)',
  surfaceHoverFallback: 'rgba(15, 23, 42, 0.8)',
  surfaceStrong: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
  centerGrad: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
  centerInset: 'inset 0 0 40px rgba(0,0,0,0.5)',
  iconIdleBg: 'rgba(55, 65, 81, 0.5)',
  idleText: '#9ca3af',
  mutedText: '#6b7280',
  faintText: '#4b5563',
  border: 'rgba(55, 65, 81, 0.5)',
  tileBorder: 'transparent',
  tileShadow: 'none',
  centerBorder: 'rgba(55, 65, 81, 0.4)',
  logoutBg: 'rgba(15, 23, 42, 0.6)',
  logoutBorder: 'rgba(255, 255, 255, 0.1)',
  clockText: '#ffffff',
  clockShadow: '0 0 20px rgba(255,255,255,0.3)',
  typeText: '#e5e7eb',
  feedLabel: '#6b7280',
  feedBodyText: '#9ca3af',
  feedHighlightText: '#ffffff',
  scanline: 'rgba(0,0,0,0.1)',
  chipBg: 'rgba(15, 23, 42, 0.8)',
  chipBorder: 'rgba(55, 65, 81, 0.5)',

  canvasBg: 'linear-gradient(180deg, #030712 0%, #0a0a15 50%, #030712 100%)',
  starsVisible: true,
  sceneBlending: THREE.AdditiveBlending,
  cameraBody: '#374151',
  cameraDark: '#1f2937',
  globeOpacityMul: 1,
  particleOpacityMul: 1,

  moduleAccent: '#f59e0b',
  moduleAccentAlt: '#f97316',
  lightModuleRemap: {},
};

const light: HubPalette = {
  fallbackBg: 'linear-gradient(135deg, #eef1f5 0%, #f8fafc 50%, #e7ebf0 100%)',
  surface: 'linear-gradient(90deg, rgba(255, 255, 255, 0.92) 0%, rgba(255,255,255,0.55) 100%)',
  surfaceHoverFallback: 'rgba(255, 255, 255, 0.95)',
  surfaceStrong: 'linear-gradient(135deg, rgba(255, 255, 255, 0.97) 0%, rgba(241, 245, 249, 0.97) 100%)',
  centerGrad: 'linear-gradient(135deg, #ffffff 0%, #eef2f7 50%, #ffffff 100%)',
  centerInset: 'inset 0 0 30px rgba(15,23,42,0.06)',
  iconIdleBg: 'rgba(148, 163, 184, 0.20)',
  idleText: '#475569',
  mutedText: '#64748b',
  faintText: '#94a3b8',
  border: 'rgba(148, 163, 184, 0.5)',
  tileBorder: 'rgba(148, 163, 184, 0.5)',
  tileShadow: '0 4px 16px rgba(15, 23, 42, 0.1)',
  centerBorder: 'rgba(148, 163, 184, 0.55)',
  logoutBg: 'rgba(255, 255, 255, 0.7)',
  logoutBorder: 'rgba(15, 23, 42, 0.08)',
  clockText: '#0f172a',
  clockShadow: '0 1px 2px rgba(15,23,42,0.15)',
  typeText: '#1e293b',
  feedLabel: '#64748b',
  feedBodyText: '#475569',
  feedHighlightText: '#0f172a',
  scanline: 'rgba(15,23,42,0.04)',
  chipBg: 'rgba(255, 255, 255, 0.8)',
  chipBorder: 'rgba(148, 163, 184, 0.4)',

  canvasBg: 'linear-gradient(180deg, #e9edf2 0%, #f5f7fa 50%, #e4e9ef 100%)',
  starsVisible: false,
  sceneBlending: THREE.NormalBlending,
  cameraBody: '#64748b',
  cameraDark: '#94a3b8',
  globeOpacityMul: 1.8,
  particleOpacityMul: 1.6,

  moduleAccent: '#f59e0b',
  moduleAccentAlt: '#f97316',
  // Bright amber as *text* on a light surface fails contrast — deepen it
  // (amber-700 hits ~4.7:1 on white).
  lightModuleRemap: { '#f59e0b': '#b45309', '#f97316': '#c2410c', '#6b7280': '#475569' },
};

// ── Cyberpunk family — violet-slate surfaces, neon blue/pink accents ──
const cyberDark: HubPalette = {
  ...dark,
  fallbackBg: 'linear-gradient(135deg, #070310 0%, #1a0f2e 50%, #070310 100%)',
  surface: 'linear-gradient(90deg, rgba(13, 6, 24, 0.8) 0%, transparent 100%)',
  surfaceHoverFallback: 'rgba(13, 6, 24, 0.8)',
  surfaceStrong: 'linear-gradient(135deg, rgba(13, 6, 24, 0.95) 0%, rgba(26, 15, 46, 0.95) 100%)',
  centerGrad: 'linear-gradient(135deg, #0d0618 0%, #1a0f2e 50%, #0d0618 100%)',
  canvasBg: 'linear-gradient(180deg, #070310 0%, #10071e 50%, #070310 100%)',
  cameraBody: '#3b3654',
  cameraDark: '#251f3d',
  moduleAccent: '#7C4DFF',
  moduleAccentAlt: '#FF2D95',
  lightModuleRemap: {},
};

const cyberLight: HubPalette = {
  ...light,
  fallbackBg: 'linear-gradient(135deg, #edebf6 0%, #faf9fd 50%, #e8e5f2 100%)',
  surfaceStrong: 'linear-gradient(135deg, rgba(255, 255, 255, 0.97) 0%, rgba(243, 240, 250, 0.97) 100%)',
  centerGrad: 'linear-gradient(135deg, #ffffff 0%, #efecf7 50%, #ffffff 100%)',
  border: 'rgba(139, 124, 200, 0.5)',
  tileBorder: 'rgba(139, 124, 200, 0.5)',
  centerBorder: 'rgba(139, 124, 200, 0.55)',
  chipBorder: 'rgba(139, 124, 200, 0.4)',
  canvasBg: 'linear-gradient(180deg, #eae7f4 0%, #f6f4fb 50%, #e5e1f0 100%)',
  moduleAccent: '#7C4DFF',
  moduleAccentAlt: '#FF2D95',
  // Deepen the neon accents for legible text on light; amber keys kept so any
  // unresolved literal still remaps sanely.
  lightModuleRemap: {
    '#7C4DFF': '#5826C9', '#FF2D95': '#D6177A',
    '#f59e0b': '#5826C9', '#f97316': '#D6177A', '#6b7280': '#475569',
  },
};

export function getHubPalette(theme: HubTheme, family: ThemeFamily = 'amber'): HubPalette {
  if (family === 'cyberpunk') return theme === 'light' ? cyberLight : cyberDark;
  return theme === 'light' ? light : dark;
}
