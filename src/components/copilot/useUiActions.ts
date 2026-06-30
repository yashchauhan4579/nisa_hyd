// Executes UI actions the copilot service streams back ({type:'ui', action}).
// One place to extend as new pages land (friend's alert pages, maps, ...).
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const KNOWN_ROUTES = [
  '/', '/landing', '/map',
  '/vms/liveview', '/vms/devices', '/vms/cameras', '/vms/recording', '/vms/map', '/vms/camerahealth',
  '/itms/anpr', '/itms/violations', '/itms/vcc', '/itms/tvcc', '/itms/nvcc',
  '/analytics/dashboard', '/analytics/reports', '/analytics/crowd', '/analytics/frs',
  '/crowd', '/search', '/forensics', '/alerts', '/alerts/rules',
  '/settings', '/settings/platform', '/settings/workers',
];

function injectPulseCss() {
  if (document.getElementById('irisbot-pulse-css')) return;
  const s = document.createElement('style');
  s.id = 'irisbot-pulse-css';
  s.textContent = `@keyframes irisbotPulse { 0%,100% { outline-color: rgba(245,158,11,0); } 50% { outline-color: rgba(245,158,11,0.95); } }
  .irisbot-focus { outline: 3px solid rgba(245,158,11,0.9); outline-offset: 4px; border-radius: 10px; animation: irisbotPulse 0.9s 4; }`;
  document.head.appendChild(s);
}

function findCardElement(title: string): HTMLElement | null {
  const want = title.trim().toLowerCase();
  if (!want) return null;
  const wantWords = want.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['the', 'and', 'for'].includes(w));
  if (!wantWords.length) return null;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,span,p,button,div'));
  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const el of candidates) {
    if (el.closest('.irisbot-root')) continue;
    const txt = (el.textContent || '').trim().toLowerCase();
    if (!txt || txt.length > want.length + 80) continue;
    // word-overlap score: how many requested words appear in this element's text
    let hits = 0;
    for (const w of wantWords) if (txt.includes(w)) hits++;
    const score = hits / wantWords.length - txt.length / 4000; // prefer tighter elements
    if (hits / wantWords.length >= 0.5 && score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function focusCard(title: string, tries = 20) {
  injectPulseCss();
  const el = findCardElement(title);
  if (el) {
    // highlight the card container, not the bare text node
    const card = (el.closest('[class*="rounded"],[class*="border"],section,article') as HTMLElement) || el;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('irisbot-focus');
    setTimeout(() => card.classList.remove('irisbot-focus'), 4200);
  } else if (tries > 0) {
    setTimeout(() => focusCard(title, tries - 1), 350); // page may still be loading
  }
}

export function useUiActions() {
  const navigate = useNavigate();
  return useCallback((action: { action?: string; target?: string; card?: string } | null | undefined) => {
    if (!action || !action.action) return;
    try {
      if (action.action === 'focus_card' && action.target) {
        const t = action.target.startsWith('/') ? action.target : `/${action.target}`;
        if (window.location.pathname !== t) navigate(t);
        if (action.card) setTimeout(() => focusCard(action.card as string), 450);
        return;
      }
      if (action.action === 'navigate' && action.target) {
        const t = action.target.startsWith('/') ? action.target : `/${action.target}`;
        if (KNOWN_ROUTES.includes(t) || t.startsWith('/settings/workers/')) navigate(t);
        else navigate(t); // unknown → router's catch-all redirects home
      } else if (action.action === 'set_theme' && action.target) {
        const t = action.target.toLowerCase();
        const root = document.documentElement;
        if (t === 'light' || t === 'dark') {
          root.classList.remove('light', 'dark');
          root.classList.add(t);
          try { localStorage.setItem('theme', t); } catch { /* ignore */ }
        } else {
          // forward-compat with upcoming multi-theme switcher
          root.setAttribute('data-theme', t);
          try { localStorage.setItem('theme', t); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.warn('[copilot] ui action failed', action, e);
    }
  }, [navigate]);
}
