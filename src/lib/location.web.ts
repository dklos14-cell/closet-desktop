export type Coords = { lat: number; lon: number };

let cached: { at: number; coords: Coords | null } | null = null;
const CACHE_MS = 30 * 60 * 1000;

/**
 * The device's current location, for the weather. The browser asks permission the first time.
 * Resolves null if location is blocked, unavailable (e.g. a plain http:// address) or slow, so
 * the caller can fall back to the city saved in Profile. Rounded to about 1 km for privacy.
 */
export function currentCoords(): Promise<Coords | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.coords);
  if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lon: Math.round(pos.coords.longitude * 100) / 100,
        };
        cached = { at: Date.now(), coords };
        resolve(coords);
      },
      () => {
        cached = { at: Date.now(), coords: null };
        resolve(null);
      },
      { timeout: 8000, maximumAge: CACHE_MS },
    );
  });
}
