// IRIS brand mark — a surveillance "eye" inside a twin octagon frame (matches the
// browser-tab favicon, public/iris-favicon.svg). Strokes use currentColor so the
// in-app icon themes for free (amber / cyberpunk violet) wherever it's placed.
import type { CSSProperties } from 'react';

interface IrisLogoProps {
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number; // base width at the default look; scales all strokes
}

export function IrisLogo({ className, style, strokeWidth = 2.4 }: IrisLogoProps) {
  const w = strokeWidth / 2; // 1 = favicon proportions
  return (
    <svg
      viewBox="3 3 58 58"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* outer octagon frame */}
      <path d="M32 5 L51 13 L59 32 L51 51 L32 59 L13 51 L5 32 L13 13 Z" strokeOpacity="0.85" strokeWidth={2.2 * w} />
      {/* inner dashed octagon */}
      <path d="M32 10 L47 17 L54 32 L47 47 L32 54 L17 47 L10 32 L17 17 Z" strokeOpacity="0.55" strokeWidth={1.3 * w} strokeDasharray="3 4" />
      {/* eye */}
      <path d="M14 32 Q32 18 50 32 Q32 46 14 32 Z" strokeOpacity="1" strokeWidth={2.6 * w} />
      {/* pupil */}
      <circle cx="32" cy="32" r="6.8" fill="currentColor" fillOpacity="0.14" strokeOpacity="1" strokeWidth={2.2 * w} />
      {/* catch-light */}
      <circle cx="30" cy="29.6" r="1.9" fill="currentColor" stroke="none" />
      {/* sight line */}
      <path d="M20 32 H44" strokeOpacity="0.55" strokeWidth={1.2 * w} />
    </svg>
  );
}
