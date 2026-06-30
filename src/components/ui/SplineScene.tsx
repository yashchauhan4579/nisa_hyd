import { Suspense, lazy } from 'react';

// Lazy Spline 3D scene wrapper (21st.dev). The Spline runtime is a large bundle,
// so it's code-split via lazy() and only ever imported when this component is
// rendered (cyberpunk landing only). While it loads — or if it fails — the
// caller's own background shows through behind the transparent fallback.
const Spline = lazy(() => import('@splinetool/react-spline'));

interface SplineSceneProps {
  scene: string;
  className?: string;
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center">
          <span
            className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin"
            aria-hidden="true"
          />
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}
