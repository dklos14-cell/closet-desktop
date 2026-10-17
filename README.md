# Closet

Your clothes, outfits and a calendar of what you wore, as a program for **Mac and Windows**.
Everything is kept on your computer: no account, no login, nothing stored online, nothing to
pay for.

Move a closet between computers with one **closet file** (Profile → Closet file → Export / Import).

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
sold through Apple or Microsoft. To open it anyway:
- **Mac:** in **Applications**, **right-click Closet → Open → Open**. If there's no Open button:
  System Settings → Privacy & Security → **Open Anyway**. Still blocked? In Terminal, run
  `xattr -dr com.apple.quarantine /Applications/Closet.app`, then open it again.
- **Windows:** **More info** → **Run anyway**.

### Where your closet is saved

| Computer | Where |
|---|---|
| Mac | `~/Library/Application Support/Closet/closet/`, or a folder you choose |
| Windows | `%APPDATA%\Closet\closet\`, or a folder you choose |

Your closet is **only on that computer**. Export a copy now and then (Profile → Closet file →
**Export closet**) and keep the file in iCloud Drive, Google Drive or an email to yourself.
That file is also how you move your closet to a new computer (**Import a closet**).

---

# For the developer

Everything below is about building and changing the app.

This folder started as a copy of `../closet-app` (the old Supabase website). It's now a desktop
app only: Electron shows the app, and the closet is saved in a folder on the computer.

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

A backup from the old Closet website (**Download my closet**) is the same kind of file, so a
closet from the website can be imported here.

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
2. First time only: in Applications, **right-click Closet → Open**, then **Open** in the warning.
3. If the warning has no Open button (only OK/Done): **System Settings → Privacy & Security →
   Open Anyway**.
4. Last resort: `xattr -dr com.apple.quarantine /Applications/Closet.app` in Terminal.
5. From then on it opens normally.

**Windows**
1. Run `Closet Setup ….exe`.
2. If Windows shows "Windows protected your PC", click **More info → Run anyway**.
3. Choose where to install. A desktop shortcut is added.

### Publishing an update (everyone gets it automatically)

Installed copies don't change when you push code to GitHub. They look for a newer **GitHub
release** of this repo when they open (Profile → Updates can turn that off), and under
**Closet → Check for Updates…** (Mac) / **Help → Check for Updates…** (Windows).

1. Raise `"version"` in `package.json` (e.g. `1.1.0` → `1.2.0`). Updates are found by comparing
   this number, so it must go up.
2. `npm run dist && npm run share`
3. On GitHub: **Releases → Draft a new release**, tag `v1.2.0` (the same number), write a few
   lines about what's new (people see them in the update window), and attach these files:
   - `release/Closet-1.2.0-universal.dmg` and `release/Closet Setup 1.2.0.exe`: the updater
     downloads these;
   - `release/Closet for Mac.zip` and `release/Closet for Windows.zip`: for new people
     installing by hand.
4. Publish. Within a day everyone's Closet offers **Update now**:
   - **Mac:** downloads the .dmg, swaps the new Closet.app in and restarts. If it isn't allowed
     to change the Applications folder, it opens the .dmg and says what to do.
   - **Windows:** downloads the Setup .exe and runs it silently; Closet closes and reopens.

The repo must be **public** for this (and for the download link at the top of this page):
GitHub answers "not found" to anyone else. Nothing private is in it; closets live on each
computer, never in the repo.

Updating never touches the closet: it's in the data folder above, not inside the app.

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
  lib/outfit-picker.ts  "Pick an outfit for me": scoring pieces and how they go together
  lib/commands.ts  menu commands, Esc / ⌘S for editors, shortcut list
  lib/pick-image.ts   choosing a photo; HEIC → JPEG (the converter loads only when needed)
  lib/items.ts, outfits.ts, calendar.ts, recurring.ts, tag-store.tsx, profile-store.tsx
                   same functions as the website, reading and writing db.ts instead of Supabase
  …                screens and components: unchanged from the website
share/             the READ ME FIRST guides that go in the zips
scripts/make-share-zips.sh  npm run share
dist/              built app (npm run build:app), packed into the installers
release/           finished installers and zips (not in git: too big; attach them to a GitHub release)
```
