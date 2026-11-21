MEMORY PROTOTYPE V7

Keep these files together in the same folder:
- index.html
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png

IMPORTANT
This prototype uses IndexedDB for notes and real attachment files. PWA installation
and offline caching require the app to be served from HTTPS or localhost. Opening
index.html directly as a file is useful for a quick visual inspection, but the
service worker cannot register from file:// and installation will not be available.

For local testing on a computer with Python installed:
1. Open a terminal in this folder.
2. Run: python -m http.server 8000
3. Open: http://localhost:8000/index.html
4. Reload once after the service worker has registered, then test offline mode.

For installation on Android, iPad or desktop, host the same files on an HTTPS origin.
On iPad, use Safari Share > Add to Home Screen. On Android/desktop, use the browser's
Install app / Add to Home Screen option.

DATA AND SCOPE
- Notes and attachment binaries are stored locally in IndexedDB.
- Backup export includes attachment binaries inside the JSON file (base64 encoded),
  so backups can become large when many files are attached.
- This prototype does not connect to Supabase and does not sync across devices.
- Supabase sign-in and cross-device sync remain intentionally postponed.
