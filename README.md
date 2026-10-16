# Closet for Mac and Windows (closet-desktop)

The Closet app as a normal computer program. Everything the website does is here (Today, closet,
cut-out editor, outfits and the outfit board, favorites, calendar, repeating events, stats, tags,
profile, weather), but:

- **No account and no login.** It opens straight to your closet.
- **Your closet is saved on the computer**, not online. No storage limits, nothing to pay for.
- **Works without internet** (only the weather card needs a connection).
- **iPhone photos (HEIC) work**: they're turned into JPEG when you pick them.
- **Export / Import a closet file** (Profile → Closet file) to keep a copy, email it, or move it
  to another computer or to the Closet website and back.

This folder started as a copy of `../closet-app`. Changes to one don't appear in the other.

---

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

## For you (the developer)

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

## Project layout

```
electron/
  main.js          the window, the closet folder, Export/Import dialogs, app:// and photo:// links
  preload.js       the only computer functions the app page may use
src/
  lib/db.ts        the closet in memory + saving closet.json; deleting, wear counts, monthly clean-up
  lib/desktop.ts   types for the preload functions; photoUrl()
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
