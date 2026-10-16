import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const THUMB_MAX = 480;

/** A small copy of a cut-out for grids and boards (phone apps: PNG). Web: thumbnail.web.ts. */
export async function makeThumbnail(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: THUMB_MAX });
  const result = await (await context.renderAsync()).saveAsync({ format: SaveFormat.PNG });
  return result.uri;
}
