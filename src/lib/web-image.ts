import { encodePng } from '@/lib/png';

// iPhone photos keep 5 bits per colour channel (32,768 colours): about half the size,
// and it looks the same on a phone.
const PNG_BITS = 5;

/**
 * Canvas → image file with transparency. WebP is several times smaller than PNG, but some
 * browsers (iPhone Safari) can't create it; they quietly return PNG instead, so then we make
 * a smaller PNG ourselves.
 */
export async function toImageBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw new Error('Could not create the image');
  if (blob.type === 'image/webp') return blob;

  const { width, height } = canvas;
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  const step = 255 / ((1 << PNG_BITS) - 1);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) {
      // Invisible pixels: no hidden colour, which would only make the file bigger.
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      continue;
    }
    for (let k = 0; k < 3; k++) pixels[i + k] = Math.round(Math.round(pixels[i + k] / step) * step);
  }
  return new Blob([encodePng(pixels, width, height)], { type: 'image/png' });
}
