import { useState, useRef, useEffect, type ImgHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SmoothImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** classes for the wrapper (sizing / rounding / aspect live here) */
  containerClassName?: string;
  /** Aspect ratio for the placeholder, e.g. "16/9", "9/16", "1/1" */
  aspect?: string;
  /** Icon shown in the skeleton + error states */
  fallbackIcon?: ReactNode;
}

/**
 * Shell-native blur-up image (WhatsApp-style): a pulsing skeleton holds the box
 * while the image streams in, then the image fades from blurred → crisp on load.
 * Self-contained (Tailwind only, no external CSS), so it drops into any atcc-shell
 * page — unlike the fork SmoothImg which depends on tactical.css `.smooth-img*`.
 * `loading="lazy"` + `decoding="async"` keep off-screen frames from blocking paint.
 */
export function SmoothImg({
  src,
  alt,
  className,
  containerClassName,
  aspect,
  fallbackIcon,
  onLoad,
  onError,
  ...rest
}: SmoothImgProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imgRef = useRef<HTMLImageElement>(null);

  // reset when the source changes
  useEffect(() => { setStatus('loading'); }, [src]);

  // catch images already in the browser cache (load fires before React attaches)
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && status === 'loading') setStatus('loaded');
  }, [status, src]);

  return (
    <div
      className={cn('relative overflow-hidden bg-muted/40', containerClassName)}
      style={aspect ? { aspectRatio: aspect } : undefined}
      data-status={status}
    >
      {status !== 'loaded' && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/30 to-muted/60" aria-hidden="true">
          {fallbackIcon && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">{fallbackIcon}</div>
          )}
        </div>
      )}
      {src && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            'transition-[filter,opacity] duration-500 ease-out',
            status === 'loaded' ? 'opacity-100 blur-0' : 'opacity-0 blur-md',
            className,
          )}
          onLoad={(e) => { setStatus('loaded'); onLoad?.(e); }}
          onError={(e) => { setStatus('error'); onError?.(e); }}
          {...rest}
        />
      )}
    </div>
  );
}

export default SmoothImg;
