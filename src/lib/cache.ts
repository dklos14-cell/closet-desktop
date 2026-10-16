/**
 * Last-loaded data, kept in memory while the app is open. Screens show it instantly when you
 * come back to them, then refresh it in the background.
 */
const store = new Map<string, unknown>();

export function peek<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function remember<T>(key: string, value: T): T {
  store.set(key, value);
  return value;
}

/** Forget everything (on sign-out, so the next person doesn't see it). */
export function clearCache() {
  store.clear();
}
