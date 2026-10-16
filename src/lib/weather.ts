/**
 * Weather from Open-Meteo (open-meteo.com): free for personal use, no account or key.
 * Only the saved location's coordinates are sent to them.
 */

export type TempUnit = 'fahrenheit' | 'celsius';

export type DayWeather = {
  date: string; // YYYY-MM-DD
  code: number; // WMO weather code
  high: number;
  low: number;
  rainChance: number | null; // %
};

export type Place = { name: string; detail: string; latitude: number; longitude: number };

const cache = new Map<string, { at: number; days: Map<string, DayWeather> }>();
const CACHE_MS = 30 * 60 * 1000;

/** Daily weather for the past 2 weeks and the next 16 days, by date. Cached for 30 minutes. */
export async function fetchWeather(lat: number, lon: number, unit: TempUnit): Promise<Map<string, DayWeather>> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${unit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.days;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    temperature_unit: unit,
    past_days: '14',
    forecast_days: '16',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Weather service error (${res.status})`);
  const json = await res.json();
  const d = json.daily as {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
  const days = new Map<string, DayWeather>();
  d.time.forEach((date, i) => {
    if (d.temperature_2m_max[i] == null) return;
    days.set(date, {
      date,
      code: d.weather_code[i],
      high: Math.round(d.temperature_2m_max[i]),
      low: Math.round(d.temperature_2m_min[i]),
      rainChance: d.precipitation_probability_max?.[i] ?? null,
    });
  });
  cache.set(key, { at: Date.now(), days });
  return days;
}

/** City search for the Profile screen. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error(`Place search error (${res.status})`);
  const json = await res.json();
  return ((json.results ?? []) as { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[]).map(
    (r) => ({
      name: r.name,
      detail: [r.admin1, r.country].filter(Boolean).join(', '),
      latitude: r.latitude,
      longitude: r.longitude,
    }),
  );
}

/** WMO weather code → emoji + words. */
export function describe(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Clear' };
  if (code <= 2) return { emoji: '🌤️', label: 'Partly cloudy' };
  if (code === 3) return { emoji: '☁️', label: 'Cloudy' };
  if (code <= 48) return { emoji: '🌫️', label: 'Fog' };
  if (code <= 57) return { emoji: '🌦️', label: 'Drizzle' };
  if (code <= 67) return { emoji: '🌧️', label: 'Rain' };
  if (code <= 77) return { emoji: '🌨️', label: 'Snow' };
  if (code <= 82) return { emoji: '🌧️', label: 'Showers' };
  if (code <= 86) return { emoji: '🌨️', label: 'Snow showers' };
  return { emoji: '⛈️', label: 'Thunderstorms' };
}

/** What weight of clothes the day calls for, using the warmest part of the day. */
export function warmthFor(day: DayWeather, unit: TempUnit): 'light' | 'medium' | 'heavy' {
  const high = unit === 'celsius' ? day.high : ((day.high - 32) * 5) / 9; // compare in °C
  return high >= 24 ? 'light' : high >= 13 ? 'medium' : 'heavy';
}

/** A short clothing tip, comparing the forecast with the outfit's warmth (if it has any). */
export function adviceFor(day: DayWeather, unit: TempUnit, outfitWarmths: (string | null)[]): string {
  const need = warmthFor(day, unit);
  const tips: string[] = [];
  const order = { light: 0, medium: 1, heavy: 2 } as const;
  const known = outfitWarmths.filter((w): w is keyof typeof order => w === 'light' || w === 'medium' || w === 'heavy');
  if (known.length > 0) {
    const warmest = Math.max(...known.map((w) => order[w]));
    if (warmest < order[need]) tips.push(need === 'heavy' ? 'It’s cold: this outfit may be too light, add a warm layer.' : 'It’s cooler: bring a layer.');
    else if (need === 'light' && warmest === 2) tips.push('It’s warm: this outfit may be too heavy.');
    else tips.push('This outfit suits the weather.');
  } else {
    tips.push(need === 'heavy' ? 'Cold day: dress warm.' : need === 'medium' ? 'Mild day: a light layer will do.' : 'Warm day: dress light.');
  }
  if ((day.rainChance ?? 0) >= 50) tips.push('☂️ Rain likely: bring an umbrella.');
  return tips.join(' ');
}
