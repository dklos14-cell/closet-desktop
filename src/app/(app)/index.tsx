import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chips';
import { OutfitBoard } from '@/components/outfit-board';
import { StarRating } from '@/components/star-rating';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  addEntry,
  deleteEntry,
  fetchRange,
  REACTIONS,
  setReactions,
  startOfWeek,
  toDateString,
  type CalendarEntry,
  type Reaction,
} from '@/lib/calendar';
import { peek } from '@/lib/cache';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { fetchOutfits, setFavorite, setOutfitRating, type OutfitWithItems } from '@/lib/outfits';
import { useProfile } from '@/lib/profile-store';
import { describeWeekdays, eventsOn, fetchRecurring, type RecurringEvent } from '@/lib/recurring';
import { useTags } from '@/lib/tag-store';
import { currentCoords, type Coords } from '@/lib/location';
import { adviceFor, describe, fetchWeather, type DayWeather } from '@/lib/weather';

const WINDOW_DAYS = 21; // last week, this week, next week: swipe freely within these

/**
 * Home. Above: greeting, week strip and the day's date. Middle: the day's whole outfit as
 * one picture; swipe left / right to move between days. Below: name, rating, reactions.
 */
export default function TodayScreen() {
  const theme = useTheme();
  const { byId } = useTags();
  const { profile } = useProfile();
  const weekStartsOn = profile.week_start;
  const today = toDateString(new Date());

  const [date, setDate] = useState(today);
  const [windowStart, setWindowStart] = useState(() => addDays(startOfWeek(new Date(), weekStartsOn), -7));
  const [entries, setEntries] = useState<CalendarEntry[] | null>(null);
  // Weekly repeating events and the outfits they use (shown on days with nothing logged).
  const [recurring, setRecurring] = useState<RecurringEvent[]>(() => peek<RecurringEvent[]>('recurring') ?? []);
  const [outfitById, setOutfitById] = useState<Map<string, OutfitWithItems>>(
    () => new Map((peek<OutfitWithItems[]>('outfits') ?? []).map((o) => [o.id, o])),
  );
  const [pick, setPick] = useState<{ date: string; index: number }>({ date: today, index: 0 });
  const [pageWidth, setPageWidth] = useState(0);
  const [weather, setWeather] = useState<{ key: string; days: Map<string, DayWeather> | null; error?: string } | null>(null);
  const pager = useRef<ScrollView>(null);
  // How the pager should follow the next date change: scroll smoothly, jump, or not at all
  // (when the change came from the user swiping, the pager is already there).
  const jump = useRef<'animate' | 'instant' | 'none'>('instant');
  // While the app itself is scrolling the pager to a page, ignore the scroll events it causes.
  const scrollingTo = useRef<number | null>(null);

  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => toDateString(addDays(windowStart, i)));
  const pageIndex = days.indexOf(date);

  const load = useCallback(() => {
    const first = toDateString(windowStart);
    const last = toDateString(addDays(windowStart, WINDOW_DAYS - 1));
    // Show the last-loaded days straight away, then refresh.
    const cached = peek<CalendarEntry[]>(`calendar:${first}:${last}`);
    if (cached) setEntries(cached);
    fetchRecurring()
      .then(async (events) => {
        setRecurring(events);
        if (events.some((e) => e.outfit_id)) setOutfitById(new Map((await fetchOutfits()).map((o) => [o.id, o])));
      })
      .catch(() => {});
    fetchRange(first, last)
      .then(setEntries)
      .catch((e) => showMessage('Could not load your outfits', e.message));
  }, [windowStart]);
  useFocusEffect(load);

  // Weather for where you are now; if location is off, for the city saved in Profile.
  const [here, setHere] = useState<Coords | null | undefined>(undefined); // undefined = still asking
  useEffect(() => {
    let cancelled = false;
    currentCoords().then((c) => !cancelled && setHere(c));
    return () => {
      cancelled = true;
    };
  }, []);
  const unit = profile.temp_unit;
  const lat = here ? here.lat : profile.weather_lat;
  const lon = here ? here.lon : profile.weather_lon;
  const placeLabel = here ? 'Current location' : profile.weather_place;
  const weatherKey = here !== undefined && lat != null && lon != null ? `${lat},${lon},${unit}` : null;
  useEffect(() => {
    if (lat == null || lon == null || !weatherKey) return;
    let cancelled = false;
    fetchWeather(lat, lon, unit)
      .then((days) => !cancelled && setWeather({ key: weatherKey, days }))
      .catch((e) => !cancelled && setWeather({ key: weatherKey, days: null, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [lat, lon, unit, weatherKey]);

  /** Go to a day from the week strip / arrows (swiping sets the day by itself). */
  function goTo(d: string) {
    const target = new Date(`${d}T12:00:00`);
    if (!days.includes(d)) {
      setWindowStart(addDays(startOfWeek(target, weekStartsOn), -7));
      jump.current = 'instant';
    } else {
      jump.current = 'animate';
    }
    setDate(d);
  }

  /** Scrolls the pager to a page, ignoring the scroll events that causes until it gets there. */
  const scrollPager = useCallback(
    (index: number, animated: boolean) => {
      scrollingTo.current = index;
      pager.current?.scrollTo({ x: index * pageWidth, animated });
      // Safety net in case the browser never reports reaching the exact page.
      setTimeout(() => {
        if (scrollingTo.current === index) scrollingTo.current = null;
      }, 800);
    },
    [pageWidth],
  );

  // Keep the pager showing the selected day (also once it first appears, after loading).
  const pagerReady = entries !== null && pageWidth > 0;
  useEffect(() => {
    if (!pagerReady || pageIndex < 0 || jump.current === 'none') return;
    scrollPager(pageIndex, jump.current === 'animate');
  }, [pageIndex, pagerReady, scrollPager]);

  function onSwipe(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (pageWidth === 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    if (scrollingTo.current !== null) {
      // Our own scroll (e.g. after tapping a day in the week strip): wait until it arrives.
      if (i === scrollingTo.current) scrollingTo.current = null;
      return;
    }
    if (days[i] && days[i] !== date) {
      jump.current = 'none'; // the user swiped: the pager is already on this day
      setDate(days[i]);
    }
  }

  // ---- saving ----
  function patchEntries(update: (e: CalendarEntry) => CalendarEntry) {
    setEntries((all) => all?.map(update) ?? null);
  }

  function rate(entry: CalendarEntry, rating: number | null) {
    const outfitId = entry.outfit!.id;
    // An outfit's rating is shared by every day it was worn.
    patchEntries((e) => (e.outfit?.id === outfitId ? { ...e, outfit: { ...e.outfit!, rating } } : e));
    setOutfitRating(outfitId, rating).catch((e) => showMessage('Could not save rating', e.message));
  }

  function toggleFavorite(entry: CalendarEntry) {
    const outfitId = entry.outfit!.id;
    const next = !entry.outfit!.is_favorite;
    patchEntries((e) => (e.outfit?.id === outfitId ? { ...e, outfit: { ...e.outfit!, is_favorite: next } } : e));
    setFavorite(outfitId, next).catch((e) => showMessage('Could not save', e.message));
  }

  function toggleReaction(entry: CalendarEntry, key: Reaction) {
    const next = entry.reactions.includes(key) ? entry.reactions.filter((r) => r !== key) : [...entry.reactions, key];
    patchEntries((e) => (e.id === entry.id ? { ...e, reactions: next } : e));
    setReactions(entry.id, next).catch((e) => showMessage('Could not save', e.message));
  }

  async function remove(entry: CalendarEntry) {
    if (!(await confirmAction('Remove this outfit from the day?', 'The outfit itself is kept.', 'Remove'))) return;
    deleteEntry(entry.id)
      .then(load)
      .catch((e) => showMessage('Could not remove', e.message));
  }

  // ---- what's shown ----
  const entriesOn = (d: string) => entries?.filter((e) => e.date === d) ?? [];
  /** The repeating event (with an outfit) on a day that has nothing logged yet. */
  const repeatOn = (d: string) => {
    const event = eventsOn(recurring, d)[0];
    const outfit = event?.outfit_id ? outfitById.get(event.outfit_id) : undefined;
    return event ? { event, outfit } : null;
  };
  const dayEntries = entriesOn(date);
  const shownIndex = pick.date === date ? Math.min(pick.index, Math.max(0, dayEntries.length - 1)) : 0;
  const entry = dayEntries[shownIndex];
  const isPast = date <= today; // you can only rate / react once the day has come
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    toDateString(addDays(startOfWeek(new Date(`${date}T12:00:00`), weekStartsOn), i)),
  );

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      {/* ---------- above ---------- */}
      <Text style={[styles.greeting, { color: theme.textSecondary }]}>
        {greeting()}
        {profile.display_name ? `, ${profile.display_name}` : ''}
      </Text>

      <View style={styles.stripHeader}>
        <Pressable onPress={() => goTo(shift(date, -7))} hitSlop={12} accessibilityLabel="Previous week">
          <Text style={[styles.arrow, { color: theme.tint }]}>‹</Text>
        </Pressable>
        <Text style={[styles.stripTitle, { color: theme.textSecondary }]}>
          {shortDate(weekDays[0])} – {shortDate(weekDays[6])}
        </Text>
        <Pressable onPress={() => goTo(shift(date, 7))} hitSlop={12} accessibilityLabel="Next week">
          <Text style={[styles.arrow, { color: theme.tint }]}>›</Text>
        </Pressable>
      </View>
      <View style={styles.strip}>
        {weekDays.map((d) => {
          const first = (entriesOn(d)[0]?.outfit ?? repeatOn(d)?.outfit)?.items.find((it) => it.imageUrl);
          const selected = d === date;
          return (
            <Pressable
              key={d}
              onPress={() => goTo(d)}
              accessibilityLabel={longDate(d)}
              style={[
                styles.stripDay,
                { backgroundColor: selected ? theme.tint : theme.backgroundElement },
                d === today && !selected && { borderColor: theme.tint, borderWidth: 2 },
              ]}>
              <Text style={[styles.stripWeekday, { color: selected ? '#fff' : theme.textSecondary }]}>
                {weekdayShort(d)}
              </Text>
              <Text style={[styles.stripNumber, { color: selected ? '#fff' : theme.text }]}>{Number(d.slice(8))}</Text>
              <View style={[styles.stripThumb, { backgroundColor: selected ? 'rgba(255,255,255,0.9)' : theme.background }]}>
                {first ? (
                  <Image source={{ uri: first.imageUrl!, cacheKey: first.image_path }} style={styles.fill} contentFit="contain" />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dayHeader}>
        <Text style={[styles.weekday, { color: theme.text }]}>
          {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 16 }}>
          {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          {date === today ? ' · Today' : date < today ? '' : ' · Planned'}
        </Text>
        {date !== today ? (
          <Pressable onPress={() => goTo(today)} hitSlop={8} style={styles.todayLink}>
            <Text style={{ color: theme.tint, fontWeight: '600' }}>Back to today</Text>
          </Pressable>
        ) : null}
      </View>

      <WeatherCard
        date={date}
        place={placeLabel}
        unit={unit}
        state={weather && weather.key === weatherKey ? weather : null}
        outfitWarmths={entry?.outfit?.items.map((it) => it.warmth) ?? []}
        hasLocation={here === undefined || weatherKey !== null}
      />

      {/* ---------- middle: swipe between days ---------- */}
      <View onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}>
        {entries === null || pageWidth === 0 ? (
          <ActivityIndicator style={{ marginVertical: Spacing.six }} />
        ) : (
          <ScrollView
            ref={pager}
            testID="day-pager"
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onSwipe}
            scrollEventThrottle={32}
            contentOffset={{ x: pageIndex * pageWidth, y: 0 }}
            // The pages exist only now: jump to the selected day without animating.
            onContentSizeChange={() => scrollPager(pageIndex, false)}>
            {days.map((d, i) => {
              // Only draw the day you're on and its neighbours; the rest are empty placeholders.
              if (Math.abs(i - pageIndex) > 1) {
                return <View key={d} style={[styles.page, styles.placeholder, { width: pageWidth }]} />;
              }
              const list = entriesOn(d);
              const shown = d === date ? entry : list[0];
              return (
                <View key={d} style={[styles.page, { width: pageWidth }]}>
                  {shown?.outfit ? (
                    <Pressable
                      onPress={() => router.push({ pathname: '/outfits/edit', params: { id: shown.outfit!.id } }, { withAnchor: true })}
                      style={styles.boardWrap}
                      accessibilityLabel="Open outfit">
                      <OutfitBoard items={shown.outfit.items} />
                    </Pressable>
                  ) : shown ? (
                    <View style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}>
                      <Text style={{ color: theme.textSecondary }}>This outfit was deleted.</Text>
                    </View>
                  ) : repeatOn(d)?.outfit ? (
                    <Pressable
                      onPress={() => router.push({ pathname: '/outfits/edit', params: { id: repeatOn(d)!.outfit!.id } }, { withAnchor: true })}
                      style={styles.boardWrap}
                      accessibilityLabel="Open outfit">
                      <OutfitBoard items={repeatOn(d)!.outfit!.items} />
                      <View style={[styles.repeatBadge, { backgroundColor: theme.tint }]}>
                        <Text style={styles.repeatBadgeText}>🔁 {repeatOn(d)!.event.name}</Text>
                      </View>
                    </Pressable>
                  ) : (
                    <View style={[styles.emptyCard, { backgroundColor: theme.backgroundElement }]}>
                      <Text style={styles.emptyEmoji}>👗</Text>
                      <Text style={[styles.emptyTitle, { color: theme.text }]}>
                        {d === today ? 'No outfit picked for today' : 'Nothing planned for this day'}
                      </Text>
                      <View style={styles.emptyButtons}>
                        <Button title="Pick an outfit" onPress={() => router.push({ pathname: '/calendar/log', params: { date: d } }, { withAnchor: true })} />
                        <Button
                          title="Create a new outfit"
                          variant="secondary"
                          onPress={() => router.push({ pathname: '/outfits/edit', params: { logDate: d } }, { withAnchor: true })}
                        />
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ---------- below ---------- */}
      {!entry && repeatOn(date) ? (
        <View style={[styles.info, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.outfitName, { color: theme.text }]}>🔁 {repeatOn(date)!.event.name}</Text>
          <Text style={{ color: theme.textSecondary }}>
            Repeats {describeWeekdays(repeatOn(date)!.event.weekdays, weekStartsOn)}
            {repeatOn(date)!.outfit ? ` · ${repeatOn(date)!.outfit!.name || 'Untitled outfit'}` : ' · no outfit chosen yet'}
          </Text>
          {repeatOn(date)!.outfit && isPast ? (
            <Button
              title="✓ I wore it"
              onPress={() =>
                addEntry(date, repeatOn(date)!.outfit!.id, repeatOn(date)!.event.name)
                  .then(load)
                  .catch((e) => showMessage('Could not save', e.message))
              }
            />
          ) : null}
          <Pressable onPress={() => router.push('/calendar/repeating', { withAnchor: true })} hitSlop={8}>
            <Text style={{ color: theme.tint, fontWeight: '600' }}>Edit repeating events</Text>
          </Pressable>
        </View>
      ) : null}
      {entry ? (
        <View style={[styles.info, { backgroundColor: theme.backgroundElement }]}>
          {dayEntries.length > 1 ? (
            <View style={styles.row}>
              {dayEntries.map((e, i) => (
                <Chip
                  key={e.id}
                  text={e.outfit?.name || `Outfit ${i + 1}`}
                  selected={i === shownIndex}
                  onPress={() => setPick({ date, index: i })}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.nameRow}>
            <Text style={[styles.outfitName, { color: theme.text }]} numberOfLines={2}>
              {entry.outfit ? entry.outfit.name || 'Untitled outfit' : 'Deleted outfit'}
            </Text>
            {entry.outfit ? (
              <Pressable
                onPress={() => toggleFavorite(entry)}
                hitSlop={10}
                accessibilityLabel={entry.outfit.is_favorite ? 'Remove from favorites' : 'Add to favorites'}>
                <Text style={[styles.heart, { color: entry.outfit.is_favorite ? theme.danger : theme.textSecondary }]}>
                  {entry.outfit.is_favorite ? '♥' : '♡'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {entry.outfit && entry.outfit.tagIds.length > 0 ? (
            <View style={styles.row}>
              {entry.outfit.tagIds.flatMap((id) => {
                const tag = byId.get(id);
                return tag && tag.kind !== 'favorite'
                  ? [
                      <Text key={id} style={[styles.tagPill, { color: theme.textSecondary, borderColor: theme.backgroundSelected }]}>
                        {tag.name}
                      </Text>,
                    ]
                  : [];
              })}
            </View>
          ) : null}
          {entry.note ? <Text style={{ color: theme.text }}>{entry.note}</Text> : null}

          <View style={[styles.divider, { backgroundColor: theme.background }]} />

          {isPast && entry.outfit ? (
            <>
              <StarRating value={entry.outfit.rating} onChange={(r) => rate(entry, r)} />
              <Text style={[styles.smallTitle, { color: theme.textSecondary }]}>How did it go?</Text>
              <View style={styles.row}>
                {REACTIONS.map((r) => (
                  <Chip
                    key={r.key}
                    text={`${r.emoji} ${r.label}`}
                    selected={entry.reactions.includes(r.key)}
                    onPress={() => toggleReaction(entry, r.key)}
                  />
                ))}
              </View>
            </>
          ) : (
            <Text style={{ color: theme.textSecondary }}>
              ☆ Rating and reactions open up on {weekdayLong(date)}, once you&apos;ve worn it.
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable onPress={() => router.push({ pathname: '/calendar/log', params: { date } }, { withAnchor: true })} hitSlop={8}>
              <Text style={{ color: theme.tint, fontWeight: '600' }}>+ Another outfit</Text>
            </Pressable>
            <Pressable onPress={() => remove(entry)} hitSlop={8}>
              <Text style={{ color: theme.danger }}>Remove from day</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

/** The day's forecast with a clothing tip (Open-Meteo; location set in Profile). */
function WeatherCard({
  date,
  place,
  unit,
  state,
  outfitWarmths,
  hasLocation,
}: {
  date: string;
  place: string | null;
  unit: 'fahrenheit' | 'celsius';
  state: { days: Map<string, DayWeather> | null; error?: string } | null;
  outfitWarmths: (string | null)[];
  hasLocation: boolean;
}) {
  const theme = useTheme();
  const card = [styles.weather, { backgroundColor: theme.backgroundElement }];

  if (!hasLocation) {
    return (
      <Pressable onPress={() => router.push('/profile')} style={card} accessibilityRole="button">
        <Text style={styles.weatherEmoji}>🌤️</Text>
        <Text style={[styles.flex, { color: theme.textSecondary }]}>
          See the weather here: allow location in your browser, or set a city in{' '}
          <Text style={{ color: theme.tint, fontWeight: '600' }}>Profile</Text>.
        </Text>
      </Pressable>
    );
  }
  if (!state) {
    return (
      <View style={card}>
        <ActivityIndicator />
        <Text style={{ color: theme.textSecondary }}>Getting the weather…</Text>
      </View>
    );
  }
  const day = state.days?.get(date);
  if (!day) {
    return (
      <View style={card}>
        <Text style={styles.weatherEmoji}>🌡️</Text>
        <Text style={[styles.flex, { color: theme.textSecondary }]}>
          {state.error ? `Weather unavailable (${state.error}).` : 'No forecast for this day yet (up to 16 days ahead).'}
        </Text>
      </View>
    );
  }
  const { emoji, label } = describe(day.code);
  const deg = unit === 'celsius' ? '°C' : '°F';
  return (
    <View style={card}>
      <Text style={styles.weatherEmoji}>{emoji}</Text>
      <View style={styles.flex}>
        <Text style={[styles.weatherTemps, { color: theme.text }]}>
          {day.high}° <Text style={{ color: theme.textSecondary, fontWeight: '500' }}>/ {day.low}{deg}</Text>
        </Text>
        <Text style={{ color: theme.textSecondary }}>
          {label}
          {day.rainChance != null ? ` · ${day.rainChance}% rain` : ''}
          {place ? ` · ${place}` : ''}
        </Text>
        <Text style={{ color: theme.text, marginTop: 4 }}>{adviceFor(day, unit, outfitWarmths)}</Text>
      </View>
    </View>
  );
}

function shift(date: string, days: number) {
  return toDateString(addDays(new Date(`${date}T12:00:00`), days));
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const at = (date: string) => new Date(`${date}T12:00:00`);
const longDate = (date: string) => at(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = (date: string) => at(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const weekdayShort = (date: string) => at(date).toLocaleDateString(undefined, { weekday: 'narrow' });
const weekdayLong = (date: string) => at(date).toLocaleDateString(undefined, { weekday: 'long' });

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  greeting: { fontSize: 15, fontWeight: '600' },
  stripHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stripTitle: { fontSize: 14, fontWeight: '600' },
  arrow: { fontSize: 28, paddingHorizontal: Spacing.two },
  strip: { flexDirection: 'row', gap: 6 },
  stripDay: { flex: 1, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 3, alignItems: 'center', gap: 2 },
  stripWeekday: { fontSize: 11, fontWeight: '700' },
  stripNumber: { fontSize: 16, fontWeight: '700' },
  stripThumb: { width: '100%', aspectRatio: 1, borderRadius: 8, padding: 2 },
  fill: { flex: 1 },
  dayHeader: { gap: 2 },
  weekday: { fontSize: 30, fontWeight: '800' },
  todayLink: { marginTop: Spacing.one },
  page: { paddingHorizontal: 2 },
  placeholder: { aspectRatio: 3 / 4 },
  repeatBadge: { position: 'absolute', top: Spacing.three, left: Spacing.three, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  repeatBadgeText: { color: '#fff', fontWeight: '700' },
  boardWrap: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  emptyCard: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyButtons: { alignSelf: 'stretch', gap: Spacing.two },
  info: { borderRadius: 16, padding: Spacing.three, gap: Spacing.three },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  outfitName: { flex: 1, fontSize: 22, fontWeight: '700' },
  heart: { fontSize: 28 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tagPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 13 },
  divider: { height: 1 },
  smallTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  weather: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: 16, padding: Spacing.three },
  weatherEmoji: { fontSize: 36 },
  weatherTemps: { fontSize: 22, fontWeight: '700' },
  flex: { flex: 1 },
});
