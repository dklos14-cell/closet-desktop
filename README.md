# Closet

Your clothes, outfits and a calendar of what you wore, kept **on your own device**. No account,
no login, nothing stored online, nothing to pay for.

- **Mac and Windows**: a normal program you install.
- **iPhone and Android**: open the Closet link and add it to your home screen. It works offline.
- Move a closet between devices with one **closet file** (Profile → Closet file → Export / Import).

---

## 📥 Install Closet (no coding needed)

You don't need to understand anything else on this page. Ignore the green **Code** button and
the list of folders above.

### On a Mac or Windows PC

1. Open the **[latest release](https://github.com/dklos14-cell/closet-desktop/releases/latest)**
   (also under **Releases** on the right side of this page).
2. Under **Assets**, click the file for your computer to download it:
   - **Closet.for.Mac.zip**: any Mac with macOS 12 (Monterey) or newer
   - **Closet.for.Windows.zip**: Windows 10 or 11
3. Open the downloaded zip (double-click it). Inside is the installer and a
   **READ ME FIRST** file. Follow READ ME FIRST; it takes about 2 minutes.

The first time you open it, your computer warns that it can't check the app, because it isn't
sold through Apple or Microsoft. READ ME FIRST shows the two clicks to open it anyway:
- **Mac:** System Settings → Privacy & Security → **Open Anyway**.
- **Windows:** **More info** → **Run anyway**.

### On an iPhone

1. Open the Closet link (ask the person who shared this page) in **Safari**.
2. Tap **Share** (the square with the arrow) → **Add to Home Screen** → **Add**.
3. Open Closet **from the new icon** and use it from there. A closet started in a Safari tab stays
   in Safari, separate from the icon's.

### On an Android phone

1. Open the Closet link in **Chrome**.
2. Tap **⋮** → **Add to Home screen** (or **Install app**).
3. Open Closet from the new icon.

### Where your closet is saved

| Device | Where |
|---|---|
| Mac | `~/Library/Application Support/Closet/closet/`, or a folder you choose |
| Windows | `%APPDATA%\Closet\closet\`, or a folder you choose |
| iPhone / Android | Inside the Closet app's own storage on the phone |

Your closet is **only on that device**. Export a copy now and then (Profile → Closet file →
**Export closet**) and keep the file in iCloud Drive, Google Drive or an email to yourself.
That file is also how you move your closet to a new phone or computer (**Import a closet**).

On a phone, deleting the Closet icon or clearing Safari / Chrome website data deletes the closet,
so export first.

---

# For the developer

Everything below is about building and changing the app.

This folder started as a copy of `../closet-app` (the old Supabase website). The same code now
builds both the desktop app (Electron, closet saved in a folder) and the phone version (a website
you install to the home screen, closet saved in the browser's IndexedDB on the phone).

## Where the closet is kept

| | Folder |
|---|---|
| Mac | `~/Library/Application Support/Closet/closet/` |
| Windows | `%APPDATA%\Closet\closet\` |

Inside: `closet.json` (items, tags, outfits, calendar, profile), `closet.json.bak` (yesterday's
copy, just in case) and `photos/`. Profile → Closet file → **Show folder** opens it.

**Choosing another folder:** Profile → Closet file → **Change folder…**. Pick any folder
(Documents, a USB stick, iCloud Drive, OneDrive, Dropbox). The closet and photos are moved into a
`Closet` folder there and the app restarts. If the folder you pick already holds a closet (it has
a `closet.json`), the app offers to open that one instead. **Move back to the standard folder**
undoes it. The choice is remembered in `settings.json` next to the standard folder.

In a cloud folder, only open the closet on one computer at a time. Two computers changing it
at once can overwrite each other's changes.

Uninstalling the app does **not** delete this folder. Export your closet now and then and keep
the file somewhere safe (iCloud Drive, Google Drive, a USB stick, an email to yourself).

## The closet file (Export / Import)

**Profile → Closet file → Export closet** saves one `.zip`:

- `closet.json`: every table, with the same tables and columns as the website's database
  (`../closet-app/supabase/migrations`).
- `photos/`: every picture and thumbnail.

**Import a closet** adds a file to the closet that's already open. Anything that's already there
(same item or outfit) is updated to the file's version. Tags with the same name are merged. If
the closet has no name yet (a fresh install), it also takes the file's name, picture and settings.

The website's **Download my closet** makes the same kind of file, and the website has
**Import a closet** too. So you can go phone (website) → computer, computer → computer, or
computer → phone.

---

## Building and sharing the desktop app

### Run it from the code

```bash
cd closet-desktop
npm install
npm run desktop        # builds the app into dist/ and opens it in a window
```

Running from VS Code's built-in terminal? VS Code sets `ELECTRON_RUN_AS_NODE`, which stops
Electron from opening a window. Run `unset ELECTRON_RUN_AS_NODE` first (or use the Terminal app).

### Make the installers

```bash
npm run dist           # both
npm run dist:mac       # release/Closet-<version>-universal.dmg  (Intel and Apple-chip Macs)
npm run dist:win       # release/Closet Setup <version>.exe     (Windows 10/11, 64-bit)
```

Both are built on your Mac. Before sending a new version, raise `"version"` in `package.json`.

Files are large (about 230 MB for Mac, 110 MB for Windows) because each one carries its own copy of
the browser engine. The app itself is about 3 MB. To send them, use Google Drive, iCloud Drive,
Dropbox or WeTransfer and share the link; they're too big for most email.

### Make the zips to send

```bash
npm run dist && npm run share
```

This makes `release/Closet for Mac.zip` and `release/Closet for Windows.zip`. Each one holds the
installer and a plain-text guide (`share/READ ME FIRST - Mac.txt` / `- Windows.txt`) covering
install, getting started, where the closet is saved, and keeping a copy.

### Send it to someone: what they do

The app isn't signed with a paid Apple ($99/year) or Windows certificate, so both systems warn
the first time. It's safe to open:

**Mac**
1. Open the `.dmg` and drag **Closet** into **Applications**.
2. Open Closet. macOS says it can't check it → click **Done** (not "Move to Trash").
3. Open **System Settings → Privacy & Security**, scroll down, click **Open Anyway** next to
   "Closet was blocked", then confirm.
4. From then on it opens normally.

**Windows**
1. Run `Closet Setup ….exe`.
2. If Windows shows "Windows protected your PC", click **More info → Run anyway**.
3. Choose where to install. A desktop shortcut is added.

### Updating someone's app

Send them the new installer. Installing over the old one keeps their closet (it's in the folder
above, not in the app). Asking them to export first is still a good idea.

### Keeping the closet somewhere else

Start the app with the environment variable `CLOSET_DATA_DIR=/some/folder` and it uses that folder
instead (handy for testing, or a closet on a USB stick).

### A home server later

`closet.json` uses the website database's tables and column names, and every row has a UUID id.
A sync server can take the closet file as-is (`POST` the zip, or the JSON plus photos) and match
rows by id.

---

## The phone version

The same app, built as a website (`npm run build:app` → `dist/`) and hosted for free on EAS
Hosting. There's no server or database behind it; the hosting only hands out the app's files.

- **Closet storage:** `src/lib/browser-store.ts` keeps `closet.json` and the photos in the phone's
  IndexedDB and asks the browser to keep it (`navigator.storage.persist()`).
- **Offline:** `public/sw.js` (a service worker) saves the app's files on the phone. Pages come
  from the internet when online, so a new version arrives on the next open with signal.
- **Install:** `public/index.html` (page template), `public/manifest.webmanifest` and the icons in
  `public/` make Add to Home Screen work. `src/components/install-hint.tsx` tells iPhone users
  in Safari to install first.
- **Photos:** iPhone Safari opens HEIC itself; Chrome/Android get them converted to JPEG.
- **Export** downloads the closet .zip (iPhone: Files → Downloads); **Import** picks one.

Publish it:

```bash
npm run deploy:phone-test   # a test link (closet-app--xxxx.expo.app), the live site is untouched
npm run deploy:phone        # the real link, https://closet-app.expo.app (replaces the old website!)
```

`app.json` still points at the old website's EAS project, so `deploy:phone` replaces the Supabase
website at closet-app.expo.app. Anyone using that website should **Download my closet** there
first, then **Import a closet** in the new version.

Offline mode only starts on the published (https) site, not with `npm run web`.

## Project layout

```
electron/
  main.js          the window, the closet folder, Export/Import dialogs, app:// and photo:// links
  preload.js       the only computer functions the app page may use
public/            phone install + offline files (index.html template, manifest, sw.js, icons)
src/
  lib/browser-store.ts  phone version: closet in IndexedDB, Export = download, Import = file picker
  components/install-hint.tsx  "Install Closet first" banner for iPhone Safari
  lib/db.ts        the closet in memory + saving closet.json; deleting, wear counts, monthly clean-up
  lib/desktop.ts   desktop() = the Electron functions, or browser-store on a phone; photoUrl()
  lib/closet-file.ts  Export / Import of the closet .zip
  lib/pick-image.ts   choosing a photo; HEIC → JPEG (the converter loads only when needed)
  lib/items.ts, outfits.ts, calendar.ts, recurring.ts, tag-store.tsx, profile-store.tsx
                   same functions as the website, reading and writing db.ts instead of Supabase
  …                screens and components: unchanged from the website
share/             the READ ME FIRST guides that go in the zips
scripts/make-share-zips.sh  npm run share
dist/              built app (npm run build:app), packed into the installers
release/           finished installers and zips (not in git: too big; attach them to a GitHub release)
```
