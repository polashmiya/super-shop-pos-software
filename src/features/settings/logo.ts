/* ==========================================================================
   Store logo upload: any common image → PNG data URL that fits in
   256 × 256 px (kept small because it is stored in the settings table and
   embedded in every printed receipt).
   ========================================================================== */

export const LOGO_MAX_PX = 256;
export const LOGO_MAX_FILE_MB = 5;

export type LogoProblem = 'invalid' | 'tooLarge';

export class LogoError extends Error {
  constructor(readonly problem: LogoProblem) {
    super(problem);
    this.name = 'LogoError';
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new LogoError('invalid')));
    reader.onerror = () => reject(new LogoError('invalid'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new LogoError('invalid'));
    image.src = source;
  });
}

/** Reads an image file and returns a PNG data URL no larger than LOGO_MAX_PX on either side. */
export async function imageFileToLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new LogoError('invalid');
  if (file.size > LOGO_MAX_FILE_MB * 1024 * 1024) throw new LogoError('tooLarge');
  const image = await loadImage(await readAsDataUrl(file));
  // SVGs without a size report 0 × 0: draw them at the maximum size.
  const naturalWidth = image.naturalWidth || LOGO_MAX_PX;
  const naturalHeight = image.naturalHeight || LOGO_MAX_PX;
  const scale = Math.min(1, LOGO_MAX_PX / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new LogoError('invalid');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}
