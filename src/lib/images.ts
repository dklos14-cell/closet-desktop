import { desktop, photoUrl } from '@/lib/desktop';
import { readImage } from '@/lib/files';

/** Where each picture is shown from (pictures live in the closet's photos folder). */
export async function signUrls(paths: string[]): Promise<Map<string, string>> {
  return new Map(paths.map((p) => [p, photoUrl(p)]));
}

/** Saves a picture (blob: or data: URI) to the photos folder under a new name; returns the name. */
export async function storePicture(uri: string, base: string): Promise<string> {
  const { bytes, contentType } = await readImage(uri);
  const ext = contentType === 'image/webp' ? 'webp' : 'png';
  const name = `${base}.${ext}`;
  await desktop().savePhoto(name, bytes);
  return name;
}

export async function deletePictures(names: (string | null | undefined)[]): Promise<void> {
  await Promise.all(names.flatMap((n) => (n ? [desktop().deletePhoto(n).catch(() => {})] : [])));
}

/** A new, unique name for a picture (without the extension). */
export function newPictureName(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A picture of one item, as the UI needs it. */
export type Thumb = { id: string; image_path: string; imageUrl: string | null };
