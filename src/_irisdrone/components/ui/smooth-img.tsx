import { useState, useRef, useEffect, type ImgHTMLAttributes } from 'react';
import { cn } from '@irisdrone/lib/utils';

interface SmoothImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  containerClassName?: string;
  /** Aspect ratio for the placeholder, e.g. "16/9", "9/16", "1/1" */
  aspect?: string;
  /** Show a small icon in the skeleton */
  fallbackIcon?: React.ReactNode;
}

/**
 * Image with WhatsApp-style blur-up loading:
 * - Tactical scanning skeleton while pending
 * - Image starts blurred and fades in sharp on load
 * - Graceful error state
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

  // Handle cached images that load before the effect runs
  useEffect(() => {
    setStatus('loading');
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && status === 'loading') {
      setStatus('loaded');
    }
  }, [status, src]);

  return (
    <div
      className={cn('smooth-img', containerClassName)}
      style={aspect ? { aspectRatio: aspect } : undefined}
      data-status={status}
    >
      {/* Skeleton shimmer layer — visible until image loads */}
      <div className="smooth-img-skel" aria-hidden="true">
        <div className="smooth-img-shimmer" />
        {fallbackIcon && <div className="smooth-img-icon">{fallbackIcon}</div>}
      </div>

      {/* Real image — blurred until loaded, then crisp */}
      {src && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn('smooth-img-el', className)}
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

      {/* Error state */}
      {status === 'error' && (
        <div className="smooth-img-error" aria-hidden="true">
          {fallbackIcon}
        </div>
      )}
    </div>
  );
}
