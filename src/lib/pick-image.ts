/**
 * Lets the user choose a photo file. iPhone photos are often HEIC (.heic / .heif), which the app's
 * browser engine can't show, so those are turned into JPEG first. Returns a blob: URL of a
 * picture the app can use, or null if the user closed the window.
 */
export async function pickImage(): Promise<string | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // .heic/.heif named explicitly: Windows doesn't always count them as "images".
    input.accept = 'image/*,.heic,.heif';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return null;
  return URL.createObjectURL(await viewable(file));
}

async function viewable(file: File): Promise<Blob> {
  if (!(await isHeic(file))) return file;
  // The converter is large (3 MB), so it's only loaded when a HEIC photo is picked.
  const { heicTo } = await import('heic-to');
  try {
    return await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
  } catch {
    throw new Error('This HEIC photo could not be opened. Try exporting it from Photos as a JPEG.');
  }
}

/** HEIC/HEIF files say so in their first bytes ("ftyp" + a brand like "heic"), whatever their name. */
async function isHeic(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...head.subarray(4, 12));
  return text.startsWith('ftyp') && ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(text.slice(4));
}
