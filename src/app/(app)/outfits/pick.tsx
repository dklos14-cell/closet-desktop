import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chips';
import { HeaderCancel } from '@/components/header-cancel';
import { OutfitBoard, resolveLayouts } from '@/components/outfit-board';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addEntry, toDateString } from '@/lib/calendar';
import { useEditorShortcuts } from '@/lib/commands';
import { showMessage } from '@/lib/dialogs';
import { fetchItems, fetchWearStats, type ItemWithUrl } from '@/lib/items';
import { isTyping } from '@/lib/keys';
import { currentCoords } from '@/lib/location';
import { goBack } from '@/lib/navigation';
import type { Slot } from '@/lib/outfit-board';
import {
  addableSlots,
  buildPool,
  harmony,
  makeScorer,
  pickOutfit,
  PICK_SLOTS,
  rerollSlot,
  SLOT_NAMES,
  type Picked,
  type Piece,
  type PickOptions,
  type Scorer,
} from '@/lib/outfit-picker';
import { saveOutfit } from '@/lib/outfits';
import { useProfile } from '@/lib/profile-store';
import { useTags } from '@/lib/tag-store';
import type { Warmth } from '@/lib/tags';
import { describe, fetchWeather, warmthFor, type DayWeather } from '@/lib/weather';

type WeatherChoice = 'auto' | Warmth | 'any';
const WARMTH_WORDS: Record<Warmth, string> = { light: 'Warm day', medium: 'Mild day', heavy: 'Cold day' };

/**
 * "Pick an outfit for me": choose an occasion, a style and the weather (or let the forecast
 * decide), and Closet puts an outfit together from what's ready to wear. Don't like a piece?
 * Reroll just that one, or keep (lock) the ones you like and shuffle the rest.
 */
export default function PickOutfitScreen() {
  const theme = useTheme();
  const { byId, ofKind } = useTags();
  const { profile } = useProfile();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = toDateString(new Date());
  const date = params.date ?? today;

  const [pool, setPool] = useState<Piece[] | null>(null);
  const [occasionId, setOccasionId] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [weatherChoice, setWeatherChoice] = useState<WeatherChoice>('auto');
  const [forecast, setForecast] = useState<DayWeather | null | undefined>(undefined); // undefined = loading
  const [picked, setPicked] = useState<Picked>({});
  const [locked, setLocked] = useState<Set<Slot>>(new Set());
  // Items already shown in each slot, so Reroll keeps bringing something new.
  const [seen] = useState(() => new Map<Slot, Set<string>>());
  const [saving, setSaving] = useState<'save' | 'wear' | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    Promise.all([fetchItems(), fetchWearStats()])
      .then(([items, wear]) => setPool(buildPool(items, byId, wear)))
      .catch((e) => {
        showMessage('Could not load your closet', e.message);
        goBack('/outfits');
      });
  }, [byId]);

  // The forecast for the day (current location, else the city in Profile).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const here = await currentCoords();
      const lat = here?.lat ?? profile.weather_lat;
      const lon = here?.lon ?? profile.weather_lon;
      if (lat == null || lon == null) return setForecast(null);
      const days = await fetchWeather(lat, lon, profile.temp_unit);
      if (!cancelled) setForecast(days.get(date) ?? null);
    })().catch(() => !cancelled && setForecast(null));
    return () => {
      cancelled = true;
    };
  }, [date, profile.weather_lat, profile.weather_lon, profile.temp_unit]);

  const warmth: Warmth | null =
    weatherChoice === 'any' ? null : weatherChoice === 'auto' ? (forecast ? warmthFor(forecast, profile.temp_unit) : null) : weatherChoice;
  const opts: PickOptions = useMemo(() => ({ occasionId, styleId, warmth, date }), [occasionId, styleId, warmth, date]);
  const scorer = useMemo(() => (pool ? makeScorer(pool, opts, byId) : null), [pool, opts, byId]);

  function lockedPicks(): Picked {
    return Object.fromEntries([...locked].map((slot) => [slot, picked[slot]]).filter(([, id]) => id));
  }

  /** A new outfit (locked pieces stay). `fresh`: prefer pieces other than the ones shown now. */
  function shuffle(fresh = true) {
    if (!pool || !scorer) return;
    const current = fresh ? new Set(Object.values(picked).map((id) => id!)) : new Set<string>();
    const next = pickOutfit(pool, scorer, opts, lockedPicks(), current);
    setPicked(next ?? {});
    for (const [slot, id] of Object.entries(next ?? {})) seenIn(slot as Slot).add(id!);
  }

  function seenIn(slot: Slot) {
    if (!seen.has(slot)) seen.set(slot, new Set());
    return seen.get(slot)!;
  }

  // A new outfit whenever the closet loads or the options change (locked pieces stay).
  const [shuffledFor, setShuffledFor] = useState<Scorer | null>(null);
  if (scorer && scorer !== shuffledFor) {
    setShuffledFor(scorer);
    shuffle(false); // the best fit for the new choices

  }

  function reroll(slot: Slot) {
    if (!pool || !scorer) return;
    const id = rerollSlot(pool, scorer, picked, slot, seenIn(slot));
    if (!id) return showMessage('Nothing else to try', `That's the only ${SLOT_NAMES[slot].toLowerCase()} that's ready to wear.`);
    seenIn(slot).add(id);
    setPicked((p) => ({ ...p, [slot]: id }));
    setLocked((l) => new Set([...l].filter((s) => s !== slot)));
  }

  function toggleLock(slot: Slot) {
    setLocked((l) => (l.has(slot) ? new Set([...l].filter((s) => s !== slot)) : new Set([...l, slot])));
  }

  function remove(slot: Slot) {
    setPicked((p) => {
      const next = { ...p };
      delete next[slot];
      return next;
    });
    setLocked((l) => new Set([...l].filter((s) => s !== slot)));
  }

  function add(slot: Slot) {
    if (!pool || !scorer) return;
    const id = rerollSlot(pool, scorer, { ...picked, [slot]: undefined }, slot, seenIn(slot));
    if (id) {
      seenIn(slot).add(id);
      setPicked((p) => ({ ...p, [slot]: id }));
    }
  }

  const slots = PICK_SLOTS.filter((s) => picked[s]);
  const pieces = slots.map((s) => scorer?.piece(picked[s]!)).filter((p): p is Piece => !!p);
  const boardItems: ItemWithUrl[] = pieces.map((p) => p.item);
  const notes = scorer ? harmony(pieces, opts, byId).notes : [];

  async function save(wear: boolean) {
    if (pieces.length === 0) return;
    setSaving(wear ? 'wear' : 'save');
    try {
      const occasion = occasionId ? byId.get(occasionId)?.name : null;
      const when = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const id = await saveOutfit(
        null,
        {
          name: `${occasion ?? 'Picked'} · ${when}`,
          rating: null,
          is_favorite: false,
          tagIds: occasionId ? [occasionId] : [],
          folder_id: null,
          show_photo: false,
        },
        boardItems.map((it) => it.id),
        resolveLayouts(boardItems, byId),
      );
      if (wear) {
        await addEntry(date, id, null);
        router.navigate('/');
      } else {
        // Open it, to adjust the board or file it in a folder.
        router.replace({ pathname: '/outfits/edit', params: { id } });
      }
    } catch (e) {
      showMessage('Could not save', (e as Error).message);
      setSaving(null);
    }
  }

  useEditorShortcuts({ save: () => save(false), cancel: () => goBack('/outfits') });

  // Space: shuffle · 1-9: reroll that piece · Shift+1-9: keep / unkeep it · Enter: save.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || saving) return;
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (e.key === ' ') shuffle();
    else if (digit && slots[Number(digit[1]) - 1]) {
      const slot = slots[Number(digit[1]) - 1];
      if (e.shiftKey) toggleLock(slot);
      else reroll(slot);
    } else if (e.key === 'Enter') save(false);
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (!pool || !scorer) return <ActivityIndicator style={{ flex: 1, backgroundColor: theme.background }} />;

  const wide = width >= 820;
  const forecastText = forecast
    ? `${describe(forecast.code).emoji} ${forecast.high}°/${forecast.low}° → ${WARMTH_WORDS[warmthFor(forecast, profile.temp_unit)].toLowerCase()}`
    : forecast === null
      ? 'no forecast (set a city in Profile)'
      : 'getting the forecast…';
  const dayLabel =
    date === today ? 'today' : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const enough = pool.some((p) => p.slot === 'dress') || (pool.some((p) => p.slot === 'top') && pool.some((p) => p.slot === 'bottom'));

  const options = (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Occasion</Text>
      <View style={styles.row}>
        <Chip text="Any" selected={!occasionId} onPress={() => setOccasionId(null)} />
        {ofKind('occasion').map((t) => (
          <Chip key={t.id} text={t.name} selected={occasionId === t.id} onPress={() => setOccasionId(occasionId === t.id ? null : t.id)} />
        ))}
      </View>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Style</Text>
      <View style={styles.row}>
        <Chip text="Any" selected={!styleId} onPress={() => setStyleId(null)} />
        {ofKind('style').map((t) => (
          <Chip key={t.id} text={t.name} selected={styleId === t.id} onPress={() => setStyleId(styleId === t.id ? null : t.id)} />
        ))}
      </View>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Weather</Text>
      <View style={styles.row}>
        <Chip text={`Forecast: ${forecastText}`} selected={weatherChoice === 'auto'} onPress={() => setWeatherChoice('auto')} />
        <Chip text="☀️ Warm" selected={weatherChoice === 'light'} onPress={() => setWeatherChoice('light')} />
        <Chip text="🍂 Mild" selected={weatherChoice === 'medium'} onPress={() => setWeatherChoice('medium')} />
        <Chip text="❄️ Cold" selected={weatherChoice === 'heavy'} onPress={() => setWeatherChoice('heavy')} />
        <Chip text="Don't mind" selected={weatherChoice === 'any'} onPress={() => setWeatherChoice('any')} />
      </View>
    </View>
  );

  const pieceList = (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>The pieces</Text>
      {slots.map((slot, i) => {
        const piece = scorer.piece(picked[slot]!)!;
        const { reasons } = scorer.single(piece.item.id);
        const isLocked = locked.has(slot);
        const label = piece.item.name || piece.item.tagIds.flatMap((id) => byId.get(id)?.kind === 'type' ? [byId.get(id)!.name] : []).join(', ');
        return (
          <View key={slot} style={[styles.piece, { backgroundColor: theme.backgroundElement, borderColor: isLocked ? theme.tint : 'transparent' }]}>
            <Text style={[styles.number, { color: theme.textSecondary }]}>{i + 1}</Text>
            <View style={[styles.thumb, { backgroundColor: theme.background }]}>
              {piece.item.imageUrl ? (
                <Image source={{ uri: piece.item.imageUrl, cacheKey: piece.item.image_path }} style={styles.fill} contentFit="contain" />
              ) : null}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.slotName, { color: theme.text }]} numberOfLines={1}>
                {SLOT_NAMES[slot]}
                {label ? <Text style={{ color: theme.textSecondary, fontWeight: '400' }}> · {label}</Text> : null}
              </Text>
              {reasons.length ? (
                <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={2}>
                  {reasons.join(' · ')}
                </Text>
              ) : null}
            </View>
            <View style={styles.pieceButtons}>
              <Chip text={isLocked ? '🔒 Kept' : '🔓 Keep'} selected={isLocked} onPress={() => toggleLock(slot)} />
              <Chip text="🔄 Another" selected={false} onPress={() => reroll(slot)} />
              <Chip text="✕" selected={false} onPress={() => remove(slot)} />
            </View>
          </View>
        );
      })}
      {addableSlots(pool, picked).length ? (
        <View style={styles.row}>
          {addableSlots(pool, picked).map((slot) => (
            <Chip key={slot} text={`+ ${SLOT_NAMES[slot]}`} selected={false} onPress={() => add(slot)} />
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Pick an outfit for me', headerLeft: () => <HeaderCancel onPress={() => goBack('/outfits')} /> }} />
      {!enough ? (
        <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Not enough to pick from yet</Text>
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
            Closet needs at least a top and bottoms (or a dress) that are ready to wear, each with a Type tag
            (T-shirt, Jeans, Dress…). Colors, Style, Occasion, Season and Warmth tags make the picks better.
          </Text>
          <Button title="Go to my closet" onPress={() => router.navigate('/closet')} />
        </View>
      ) : (
        <View style={[styles.columns, wide && styles.columnsWide]}>
          <View style={[styles.boardColumn, wide && { width: Math.min(420, width * 0.42) }]}>
            <Text style={[styles.heading, { color: theme.text }]}>An outfit for {dayLabel}</Text>
            <OutfitBoard items={boardItems} />
            {notes.length ? <Text style={{ color: theme.textSecondary }}>✨ {notes.join(' · ')}</Text> : null}
            <Button title="🔀 Shuffle (Space)" variant="secondary" onPress={() => shuffle()} disabled={saving !== null} />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button title="Save outfit" onPress={() => save(false)} busy={saving === 'save'} disabled={saving !== null || pieces.length === 0} />
              </View>
              <View style={styles.flex}>
                <Button
                  title={date === today ? 'Wear it today' : 'Plan it for that day'}
                  variant="secondary"
                  onPress={() => save(true)}
                  busy={saving === 'wear'}
                  disabled={saving !== null || pieces.length === 0}
                />
              </View>
            </View>
          </View>
          <View style={[styles.flex, styles.section]}>
            {options}
            {pieceList}
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              Space shuffle · 1-{Math.max(1, slots.length)} another piece · Shift+number keep it · Enter save · Esc close
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six, width: '100%', maxWidth: 1100, alignSelf: 'center' },
  columns: { gap: Spacing.four },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  boardColumn: { gap: Spacing.three },
  heading: { fontSize: 22, fontWeight: '700' },
  section: { gap: Spacing.two },
  title: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  piece: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 14, padding: Spacing.two, borderWidth: 2 },
  number: { width: 14, textAlign: 'center', fontWeight: '700' },
  thumb: { width: 56, height: 56, borderRadius: 10, padding: 3 },
  fill: { flex: 1 },
  flex: { flex: 1 },
  slotName: { fontSize: 15, fontWeight: '700' },
  pieceButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, justifyContent: 'flex-end', maxWidth: 270 },
  empty: { borderRadius: 16, padding: Spacing.four, gap: Spacing.three, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
});
