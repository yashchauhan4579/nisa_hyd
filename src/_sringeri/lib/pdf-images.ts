/**
 * Pre-fetch a set of image URLs in parallel and return a URL → data: URI
 * map suitable for embedding into a @react-pdf/renderer document. Every
 * image is canvas-resized down to its declared max width so the resulting
 * PDF stays small and the embed step stays fast — original photos in this
 * codebase can be 5-10 MB DSLR JPEGs, which would otherwise dominate
 * report wall time.
 *
 * Usage:
 *   const map = await preloadPdfImages([
 *     { url: p.faceImageUrl, kind: 'roster' },
 *     { url: d.metadata.images['frame.jpg'], kind: 'frame' },
 *   ]);
 *   <Image src={map.get(url) || url} />
 */

export type PdfImageKind = 'thumb' | 'roster' | 'face' | 'frame';

const MAX_W: Record<PdfImageKind, number> = {
  thumb: 240,   // small thumbnail (e.g. ANPR vehicle row)
  roster: 220,  // roster card photo
  face: 220,    // reference / detected face crop
  frame: 640,   // full camera frame
};

const QUALITY = 0.78;
const CONCURRENCY = 8;

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

async function fetchAndResize(
  url: string,
  kind: PdfImageKind,
): Promise<[string, string | null]> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return [url, null];
    const blob = await res.blob();
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(blob);
    } catch {
      // Image format not decodable — pass through the original blob.
      return [url, await blobToDataUrl(blob)];
    }
    const targetW = MAX_W[kind];
    if (bmp.width <= targetW) {
      bmp.close();
      return [url, await blobToDataUrl(blob)];
    }
    const w = targetW;
    const h = Math.round((bmp.height * w) / bmp.width);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return [url, await blobToDataUrl(blob)];
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return [url, canvas.toDataURL('image/jpeg', QUALITY)];
  } catch {
    return [url, null];
  }
}

export interface PdfImageRequest {
  url: string;
  kind: PdfImageKind;
}

export async function preloadPdfImages(
  requests: PdfImageRequest[],
): Promise<Map<string, string>> {
  // De-duplicate URLs while keeping the LARGEST kind per URL (so a frame
  // referenced as both face and frame still gets the bigger size).
  const merged = new Map<string, PdfImageKind>();
  for (const r of requests) {
    if (!r.url) continue;
    const prev = merged.get(r.url);
    if (!prev || MAX_W[r.kind] > MAX_W[prev]) merged.set(r.url, r.kind);
  }

  const tasks = Array.from(merged.entries());
  const results: Array<[string, string | null]> = [];
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      const [url, kind] = tasks[i];
      results.push(await fetchAndResize(url, kind));
    }
  });
  await Promise.all(workers);

  const map = new Map<string, string>();
  results.forEach(([k, v]) => {
    if (v) map.set(k, v);
  });
  return map;
}
