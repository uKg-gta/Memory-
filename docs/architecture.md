# Memory — Architecture and implementation notes

## Current delivery model

The current reference is a standalone HTML/CSS/JavaScript prototype. The app shell is served as a static web app and should be hosted on localhost or HTTPS for service-worker and PWA capabilities.

## Local data

IndexedDB is the intended local persistence layer for:
- Notes and editor content
- Attachment blobs and metadata
- Folders and labels
- Pin state, note colours, and manual ordering
- Archive and Trash state
- User preferences, including theme

The prototype must be tested in real browsers for transaction safety, quota handling, schema upgrades, and recovery. Browser storage can be cleared by users or evicted under some conditions; users should be encouraged to export backups.

## Attachments and backups

Attachment records should retain actual Blob/File data. A full export must include binary attachment data (for example, base64-encoded in a JSON backup or a more efficient archive format). Restore must validate the backup format and handle duplicate IDs safely.

## PWA and offline

Required files:
- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`

PWA installation and service workers require localhost or HTTPS. Offline testing must include first-load caching, reload while offline, navigation fallback, and updates after a new deployment. External CDNs and remote fonts may not be available offline unless deliberately cached or replaced with local assets.

## External link metadata

Browser-side metadata fetching can fail when a target site does not allow cross-origin requests. The URL must be saved immediately regardless. Metadata retrieval should fail gracefully and retry when connectivity returns. Do not promise that every website title can be fetched automatically.

## Future cloud phase

Supabase authentication, database, file storage, and cross-device sync are intentionally postponed. Before adding sync, define identity mapping, conflict resolution, attachment upload strategy, deletion propagation, and offline queue semantics. Use only the dedicated Memory Supabase project; never alter LifeOS resources.

## Security and privacy

- Never commit personal note data or exported backups.
- Never commit API keys or service-role credentials.
- Keep environment files ignored.
- Validate imported backup data before writing to IndexedDB.
- Treat all note content and imported files as untrusted user data.
