import { File } from 'expo-file-system';

// Reading a picked/processed image. Web version: files.web.ts.

export function readBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

/** The image's bytes and type. In the phone apps processed images are always PNG. */
export async function readImage(uri: string): Promise<{ bytes: Uint8Array; contentType: 'image/png' | 'image/webp' }> {
  return { bytes: await readBytes(uri), contentType: 'image/png' };
}
