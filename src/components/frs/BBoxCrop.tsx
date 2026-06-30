import { useState, useEffect } from 'react';

// Renders the face region out of a full annotated frame using the detection's
// bbox — pure CSS (percentage scale + translate), no canvas. Used wherever a
// detection has no `faceSnapshotUrl` (edges that don't ship face_crop.jpg) but
// does carry `fullSnapshotUrl` + bbox.
//
// bbox formats seen in the wild:
//   • metadata.bbox_normalized = [x1,y1,x2,y2] in 0..1  (sringeri edge — preferred:
//     resolution-independent, survives the edge's frame resize)
//   • bbox = [x1,y1,x2,y2] pixels in the ORIGINAL stream resolution (sringeri edge)
//   • bbox = [x1,y1,x2,y2] already normalized (≤ 1.5 heuristic)
//   • bbox = {x,y,w,h} normalized (our mock fixtures)
// Pixel boxes are normalized against the loaded image's natural size — only
// approximate when the edge resized the saved frame, but a loose crop beats a
// black tile.

interface BBoxCropProps {
  src: string;
  bbox: unknown;
  bboxNormalized?: unknown;
  /** Context padding as a fraction of box size per side. Default 1.0 → the
   *  crop window is 300% of the original bounding box (operator spec). */
  pad?: number;
  className?: string;
  fallback?: React.ReactNode;
  onError?: () => void;
}

type Norm = { x1: number; y1: number; x2: number; y2: number };

const isNumArr = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length >= n && v.slice(0, n).every((x) => typeof x === 'number' && isFinite(x));

function normalize(bbox: unknown, bboxNormalized: unknown, natural: { w: number; h: number } | null): Norm | null {
  if (isNumArr(bboxNormalized, 4)) {
    const [x1, y1, x2, y2] = bboxNormalized as number[];
    return { x1, y1, x2, y2 };
  }
  if (isNumArr(bbox, 4)) {
    const [a, b, c, d] = bbox as number[];
    if (Math.max(a, b, c, d) <= 1.5) return { x1: a, y1: b, x2: c, y2: d };
    // pixel coords — need the image's natural size
    if (natural && natural.w > 0 && natural.h > 0) {
      return { x1: a / natural.w, y1: b / natural.h, x2: c / natural.w, y2: d / natural.h };
    }
    return null; // wait for onLoad
  }
  if (bbox && typeof bbox === 'object' && !Array.isArray(bbox)) {
    const o = bbox as Record<string, unknown>;
    const x = o.x, y = o.y, w = o.w ?? o.width, h = o.h ?? o.height;
    if ([x, y, w, h].every((v) => typeof v === 'number' && isFinite(v as number))) {
      const nx = x as number, ny = y as number, nw = w as number, nh = h as number;
      if (Math.max(nx + nw, ny + nh) <= 1.5) return { x1: nx, y1: ny, x2: nx + nw, y2: ny + nh };
      if (natural && natural.w > 0 && natural.h > 0) {
        return { x1: nx / natural.w, y1: ny / natural.h, x2: (nx + nw) / natural.w, y2: (ny + nh) / natural.h };
      }
      return null;
    }
  }
  return null;
}

export function BBoxCrop({ src, bbox, bboxNormalized, pad = 1.0, className, fallback, onError }: BBoxCropProps) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  // The viewer reuses one BBoxCrop across a changing feed — without this reset
  // a single 404'd image latched `failed` and the inset showed the fallback
  // icon for every detection after it.
  useEffect(() => { setFailed(false); setNatural(null); }, [src]);

  const raw = normalize(bbox, bboxNormalized, natural);
  let box: Norm | null = null;
  if (raw) {
    // Crop window = bbox + pad on every side (pad=1.0 → 300% of the bbox),
    // expanded around the center and clamped to the frame.
    let { x1, y1, x2, y2 } = raw;
    const w = x2 - x1, h = y2 - y1;
    x1 = Math.max(0, x1 - w * pad); y1 = Math.max(0, y1 - h * pad);
    x2 = Math.min(1, x2 + w * pad); y2 = Math.min(1, y2 + h * pad);
    // Degenerate floor only (avoid zero/negative boxes from clamping).
    if (x2 - x1 > 0.005 && y2 - y1 > 0.005) box = { x1, y1, x2, y2 };
  }

  if (failed || (!box && natural)) {
    // image errored, or loaded but the bbox is unusable
    return <div className={`relative overflow-hidden ${className ?? ''}`}>{fallback ?? null}</div>;
  }

  const w = box ? box.x2 - box.x1 : 1;
  const h = box ? box.y2 - box.y1 : 1;

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (!natural || natural.w !== img.naturalWidth || natural.h !== img.naturalHeight) {
            setNatural({ w: img.naturalWidth, h: img.naturalHeight });
          }
        }}
        onError={() => { setFailed(true); onError?.(); }}
        // While the box is unknown (pixel bbox before load) show the full frame;
        // once normalized, scale so the bbox fills the container.
        className="absolute max-w-none select-none"
        style={box ? {
          width: `${100 / w}%`,
          height: `${100 / h}%`,
          left: `${(-box.x1 / w) * 100}%`,
          top: `${(-box.y1 / h) * 100}%`,
        } : { inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}

export default BBoxCrop;
