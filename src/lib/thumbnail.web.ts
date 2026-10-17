import { toImageBlob } from '@/lib/web-image';

export const THUMB_MAX = 480;

/** A small copy of a cut-out for grids and boards (or of any photo, at most `max` px): WebP. */
export async function makeThumbnail(uri: string, max = THUMB_MAX): Promise<string> {
  const img = new Image();
  img.src = uri;
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await toImageBlob(canvas, 0.8);
  canvas.width = 0; // free the canvas memory right away (iPhone Safari has a small limit)
  canvas.height = 0;
  return URL.createObjectURL(blob);
}
