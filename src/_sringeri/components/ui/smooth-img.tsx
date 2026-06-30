import { useState, useRef, useEffect, type ImgHTMLAttributes } from 'react';
import { cn } from '@sringeri/lib/utils';

interface SmoothImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  containerClassName?: string;
  /** Aspect ratio for the placeholder, e.g. "16/9", "9/16", "1/1", "4/3" */
  aspect?: string;
  /** Show a small icon in the skeleton */
  fallbackIcon?: React.ReactNode;
}

/**
 * Image with a soft blur-up load:
 *  • dark zinc placeholder + optional fallback icon while loading
 *  • image fades in when ready
 *  • shows the icon if loading fails or src is missing
 *
 * Self-contained Tailwind only — no external CSS dependency.
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

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  // Catch images cached by the browser that load before the listener attaches
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && status === 'loading') {
      setStatus('loaded');
    }
  }, [status, src]);

  const showFallback = !src || status === 'error';

  return (
    <div
      className={cn('relative w-full h-full overflow-hidden bg-zinc-900', containerClassName)}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      {(status !== 'loaded' || showFallback) && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900/80 to-zinc-950 text-zinc-700"
          aria-hidden="true"
        >
          {fallbackIcon && (
            <div className="opacity-30 [&>svg]:w-1/3 [&>svg]:h-1/3">{fallbackIcon}</div>
          )}
        </div>
      )}

      {src && !showFallback && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            className,
          )}
          onLoad={(e) => {
            setStatus('loaded');
            onLoad?.(e);
          }}
          onError={(e) => {
            setStatus('error');
            onError?.(e);
          }}
          {...rest}
        />
      )}
    </div>
  );
}
