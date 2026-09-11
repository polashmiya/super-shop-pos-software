import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MAX_SIDE } from '@/services/catalogService';

/* ==========================================================================
   Product photo upload: the picked file is decoded, resized on a canvas to
   fit PRODUCT_IMAGE_MAX_SIDE and stored as a WebP data URL that is at most
   PRODUCT_IMAGE_MAX_BYTES (quality is lowered step by step when needed).
   ========================================================================== */

export type PhotoResult = { ok: true; dataUrl: string } | { ok: false; reason: 'type' | 'size' | 'read' };

const QUALITY_STEPS = [0.86, 0.78, 0.7, 0.6, 0.5, 0.4];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read')));
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(file);
  });
}

async function decode(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  await image.decode();
  return image;
}

/** Approximate decoded size of a base64 data URL in bytes. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const payload = comma >= 0 ? dataUrl.length - comma - 1 : dataUrl.length;
  return Math.ceil((payload * 3) / 4);
}

export async function prepareProductPhoto(file: File): Promise<PhotoResult> {
  if (!file.type.startsWith('image/')) return { ok: false, reason: 'type' };
  let image: HTMLImageElement;
  try {
    image = await decode(await readAsDataUrl(file));
  } catch {
    return { ok: false, reason: 'read' };
  }
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return { ok: false, reason: 'read' };

  const scale = Math.min(1, PRODUCT_IMAGE_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return { ok: false, reason: 'read' };
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of QUALITY_STEPS) {
    let dataUrl = canvas.toDataURL('image/webp', quality);
    // Browsers without WebP encoding fall back to PNG; JPEG keeps the file small.
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(dataUrl) <= PRODUCT_IMAGE_MAX_BYTES) return { ok: true, dataUrl };
  }
  return { ok: false, reason: 'size' };
}
