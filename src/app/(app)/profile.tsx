import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useResolvedScheme, useTheme } from '@/hooks/use-theme';
import { exportCloset, importCloset } from '@/lib/closet-file';
import { desktop } from '@/lib/desktop';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { pickImage } from '@/lib/pick-image';
import { useProfile, type ProfileFields } from '@/lib/profile-store';
import { searchPlaces, type Place } from '@/lib/weather';

const EMOJIS = ['🦊', '🐱', '🐻', '🐼', '🦋', '🌸', '🌻', '⭐️', '🌙', '🍓', '🫶', '👗', '👟', '🧢', '💅', '✨'];

/** Your name, picture, colors and preferences. Everything saves as soon as you change it. */
export default function ProfileScreen() {
  const theme = useTheme();
  const scheme = useResolvedScheme();
  const { profile, update, uploadAvatar } = useProfile();
  const [name, setName] = useState(profile.display_name ?? '');
  const [lastSaved, setLastSaved] = useState(profile.display_name);
  const [uploading, setUploading] = useState(false);

  // The profile loads after the screen opens; show the loaded name unless the user is typing.
  if (profile.display_name !== lastSaved) {
    setLastSaved(profile.display_name);
    setName(profile.display_name ?? '');
  }

  function save(fields: ProfileFields) {
    update(fields).catch((e) => showMessage('Could not save', e.message));
  }

  function saveName() {
    const trimmed = name.trim();
    if (trimmed === (profile.display_name ?? '')) return;
    setLastSaved(trimmed || null);
    save({ display_name: trimmed || null });
  }

  async function choosePhoto() {
    let uri: string | null;
    try {
      uri = await pickImage();
    } catch (e) {
      return showMessage('Could not open photo', (e as Error).message);
    }
    if (!uri) return;
    setUploading(true);
    try {
      await uploadAvatar(uri);
    } catch (e) {
      showMessage('Could not upload photo', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const card = [styles.card, { backgroundColor: theme.backgroundElement }];
  const title = [styles.title, { color: theme.textSecondary }];

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Avatar size={88} />
        <Text style={[styles.name, { color: theme.text }]}>{profile.display_name || 'Add your name'}</Text>
      </View>

      <View style={card}>
        <Text style={title}>Display name</Text>
        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
          placeholder="What should we call you?"
          placeholderTextColor={theme.textSecondary}
          value={name}
          onChangeText={setName}
          onSubmitEditing={saveName}
          maxLength={40}
          returnKeyType="done"
        />
        {name.trim() !== (profile.display_name ?? '') ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button title="Save name" onPress={saveName} />
            </View>
            <View style={styles.flex}>
              <Button title="Cancel" variant="secondary" onPress={() => setName(profile.display_name ?? '')} />
            </View>
          </View>
        ) : null}
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Shown in the menu and on the home screen.</Text>
      </View>

      <View style={card}>
        <Text style={title}>Profile picture</Text>
        <View style={styles.emojiGrid}>
          {EMOJIS.map((e) => {
            const chosen = !profile.avatar_path && profile.avatar_emoji === e;
            return (
              <Pressable
                key={e}
                onPress={() => save({ avatar_emoji: e, avatar_path: null })}
                accessibilityLabel={`Use ${e}`}
                style={[styles.emoji, { backgroundColor: chosen ? theme.tint : theme.background }]}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button title={uploading ? 'Uploading…' : 'Use a photo'} variant="secondary" onPress={choosePhoto} busy={uploading} />
          </View>
          {profile.avatar_path || profile.avatar_emoji ? (
            <View style={styles.flex}>
              <Button title="Remove" variant="secondary" onPress={() => save({ avatar_emoji: null, avatar_path: null })} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={card}>
        <Text style={title}>Accent color</Text>
        <View style={styles.swatches}>
          {(Object.keys(Accents) as Accent[]).map((a) => (
            <Pressable
              key={a}
              onPress={() => save({ accent: a })}
              accessibilityLabel={`${a} accent`}
              accessibilityState={{ selected: profile.accent === a }}
              style={[
                styles.swatch,
                { backgroundColor: Accents[a][scheme], borderColor: profile.accent === a ? theme.text : 'transparent' },
              ]}
            />
          ))}
        </View>
      </View>

      <View style={card}>
        <Text style={title}>Appearance</Text>
        <Segmented
          options={[
            { value: 'system', label: 'Automatic' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={profile.theme}
          onChange={(theme) => save({ theme })}
        />
      </View>

      <View style={card}>
        <Text style={title}>Week starts on</Text>
        <Segmented
          options={[
            { value: 1, label: 'Monday' },
            { value: 0, label: 'Sunday' },
          ]}
          value={profile.week_start}
          onChange={(week_start) => save({ week_start })}
        />
      </View>

      <WeatherSettings />

      <ClosetFileCard />

      <UpdatesCard />
    </ScrollView>
  );
}

/** This version, "Check for updates", and whether Closet looks for them by itself. */
function UpdatesCard() {
  const theme = useTheme();
  const [info, setInfo] = useState<{ version: string; autoUpdate: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    desktop().appInfo().then(setInfo);
  }, []);

  async function check() {
    setChecking(true);
    try {
      await desktop().checkForUpdates(); // the answer comes as a window from the desktop shell
    } finally {
      setChecking(false);
    }
  }

  function setAuto(autoUpdate: boolean) {
    setInfo((i) => (i ? { ...i, autoUpdate } : i));
    desktop()
      .setAutoUpdate(autoUpdate)
      .catch((e) => showMessage('Could not save', e.message));
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Updates</Text>
      <Text style={{ color: theme.text }}>Closet {info?.version ?? '…'}</Text>
      <Button title="Check for updates" variant="secondary" busy={checking} onPress={check} />
      <Segmented
        options={[
          { value: true, label: 'Check when Closet opens' },
          { value: false, label: 'Only when I ask' },
        ]}
        value={info?.autoUpdate ?? true}
        onChange={setAuto}
      />
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
        A new version downloads and installs in a minute, then Closet restarts. Your closet, photos
        and settings stay exactly as they are.
      </Text>
    </View>
  );
}

/** Export the closet as one file (to keep safe, or to move to another computer or the website). */
function ClosetFileCard() {
  const theme = useTheme();
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [folder, setFolder] = useState<{ path: string; isDefault: boolean; canChange: boolean } | null>(null);

  useEffect(() => {
    desktop().getDataFolder().then(setFolder);
  }, []);

  async function changeFolder(useDefault: boolean) {
    try {
      await desktop().changeDataFolder(useDefault); // the app restarts if the closet moved
    } catch (e) {
      showMessage('Could not change the folder', (e as Error).message);
    }
  }

  async function run(job: () => Promise<unknown>, failTitle: string) {
    setRunning(true);
    try {
      await job();
    } catch (e) {
      setStatus(null);
      showMessage(failTitle, (e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function startImport() {
    const ok = await confirmAction(
      'Import a closet?',
      'Everything in the file is added to this closet. Items and outfits that are already here are updated to the version in the file.',
      'Choose file',
    );
    if (!ok) return;
    await run(async () => {
      const summary = await importCloset(setStatus);
      if (!summary) return setStatus(null);
      // Reload so every screen shows the imported closet.
      setTimeout(() => window.location.reload(), 1200);
    }, 'Import failed');
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Closet file</Text>
      <Text style={{ color: theme.textSecondary }}>
        Your closet is saved on this computer. Export it as one file (items, tags, outfits, calendar
        and all photos) to keep a copy somewhere safe, email it, or move it to another computer.
        Import adds a closet file to this one.
      </Text>
      <Button title="Export closet" variant="secondary" busy={running} onPress={() => run(() => exportCloset(setStatus), 'Export failed')} />
      <Button title="Import a closet" variant="secondary" busy={running} onPress={startImport} />
      <Text style={[styles.title, { color: theme.textSecondary, marginTop: Spacing.two }]}>Saved in</Text>
      <Text style={{ color: theme.text }} selectable>
        {folder?.path ?? '…'}
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title="Show folder" variant="secondary" onPress={() => desktop().openDataFolder()} />
        </View>
        {folder?.canChange ? (
          <View style={styles.flex}>
            <Button title="Change folder…" variant="secondary" disabled={running} onPress={() => changeFolder(false)} />
          </View>
        ) : null}
      </View>
      {folder?.canChange && !folder.isDefault ? (
        <Pressable onPress={() => changeFolder(true)} accessibilityRole="button">
          <Text style={{ color: theme.tint, fontWeight: '600', textAlign: 'center', padding: 4 }}>
            Move back to the standard folder
          </Text>
        </Pressable>
      ) : null}
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
        Changing the folder moves your closet and photos there. A cloud folder (iCloud Drive, OneDrive,
        Dropbox) keeps a copy online, but only open that closet on one computer at a time.
      </Text>
      {status ? <Text style={{ color: theme.text }}>{status}</Text> : null}
    </View>
  );
}

/** Where the Today screen's weather comes from, and °F / °C. */
function WeatherSettings() {
  const theme = useTheme();
  const { profile, update } = useProfile();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);

  function save(fields: ProfileFields) {
    update(fields).catch((e) => showMessage('Could not save', e.message));
  }

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      setResults(await searchPlaces(query.trim()));
    } catch (e) {
      showMessage('Could not search', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function choose(place: Place) {
    save({
      weather_place: [place.name, place.detail.split(', ')[0]].filter(Boolean).join(', '),
      weather_lat: place.latitude,
      weather_lon: place.longitude,
    });
    setResults(null);
    setQuery('');
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Weather</Text>
      <Text style={{ color: theme.text }}>
        📍 The Today screen uses your <Text style={{ fontWeight: '700' }}>current location</Text> (your computer
        may ask once). If location is off, it uses this city instead:
      </Text>
      <Text style={{ color: theme.text, fontWeight: '600' }}>
        {profile.weather_place ? `Backup city: ${profile.weather_place}` : 'Backup city: none set'}
      </Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex, { color: theme.text, backgroundColor: theme.background }]}
          placeholder="Search your city"
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <View style={styles.searchButton}>
          <Button title="Search" variant="secondary" onPress={search} busy={busy} />
        </View>
      </View>
      {results ? (
        results.length === 0 ? (
          <Text style={{ color: theme.textSecondary }}>No places found.</Text>
        ) : (
          results.map((p) => (
            <Pressable
              key={`${p.latitude},${p.longitude}`}
              onPress={() => choose(p)}
              style={[styles.place, { backgroundColor: theme.background }]}>
              <Text style={{ color: theme.text, fontWeight: '600' }}>{p.name}</Text>
              <Text style={{ color: theme.textSecondary }}>{p.detail}</Text>
            </Pressable>
          ))
        )
      ) : null}
      {results ? (
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => {
            setResults(null);
            setQuery('');
          }}
        />
      ) : null}
      {busy ? <ActivityIndicator /> : null}
      <Segmented
        options={[
          { value: 'fahrenheit', label: '°F' },
          { value: 'celsius', label: '°C' },
        ]}
        value={profile.temp_unit}
        onChange={(temp_unit) => save({ temp_unit })}
      />
      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
        Forecast from Open-Meteo (free). Only a rounded location (about 1 km) is sent to them.
      </Text>
    </View>
  );
}

function Segmented<T extends string | number | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.background }]}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          onPress={() => onChange(o.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
          style={[styles.segmentButton, o.value === value && { backgroundColor: theme.tint }]}>
          <Text style={{ color: o.value === value ? '#fff' : theme.text, fontWeight: '600' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  header: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.three },
  name: { fontSize: 24, fontWeight: '700', marginTop: Spacing.two },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  input: { borderRadius: 10, padding: 12, fontSize: 16 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  emoji: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  searchButton: { width: 110 },
  place: { borderRadius: 10, padding: Spacing.three, gap: 2 },
  segmentButton: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
});
