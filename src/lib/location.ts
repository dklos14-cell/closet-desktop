export type Coords = { lat: number; lon: number };

/** Phone apps: no location access yet, so the weather uses the city saved in Profile. */
export async function currentCoords(): Promise<Coords | null> {
  return null;
}
