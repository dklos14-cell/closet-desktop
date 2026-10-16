// In the browser, picked and processed images are blob: or data: URLs, which fetch() can read.

export async function readBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(uri)).arrayBuffer());
}

/** The image's bytes and type (WebP where the browser could make it, PNG otherwise). */
export async function readImage(uri: string): Promise<{ bytes: Uint8Array; contentType: 'image/png' | 'image/webp' }> {
  const blob = await (await fetch(uri)).blob();
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    contentType: blob.type === 'image/webp' ? 'image/webp' : 'image/png',
  };
}
