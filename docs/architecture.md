# Memory — Architecture and implementation notes

## Current delivery model

The current reference is a standalone HTML/CSS/JavaScript prototype. The app shell is served as a static web app and should be hosted on localhost or HTTPS for service-worker and PWA capabilities.

## Cloud source of truth and offline reading

Supabase is the authoritative source for notes, folders, labels, relationships, and attachment files. All data-changing actions require a successful online sync state. While offline, Memory is read-only.

IndexedDB is a per-account, read-only cache used only to display the last successfully downloaded notes and attachment blobs while offline. It is not an independent source of truth and must never upload offline edits. Cached content is refreshed from Supabase after reconnection. Items and attachments not previously downloaded on a device are unavailable offline.

The browser may retain the Supabase Auth session locally so the signed-in account can be restored; this is separate from note storage. Browser cache data may be cleared or evicted, so offline availability is best-effort.

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

## Account and cloud sync

- Supabase Auth provides Google sign-in and session restoration. The browser uses the publishable key only; never ship a service-role or secret key.
- Use only the dedicated Memory Supabase project; never alter LifeOS resources.
- IndexedDB remains the local offline store. Local workspaces are keyed by account ID so signing into another account on the same browser does not silently expose or upload the previous account's notes.
- Cloud records use stable client IDs to map the app's local string IDs to database UUID primary keys.
- Sync includes notes, folders, labels, note-label relationships, attachment metadata, and attachment bytes in the private `memory-attachments` bucket.
- Reads are paginated. Local/cloud records merge by update timestamp; permanent deletions propagate with tombstones. Online/focus/visibility events retry pending sync.
- Attachments remain in IndexedDB locally and are uploaded/downloaded through authenticated Storage operations.
- Real browser testing is still required for concurrent edits, quota failures, auth expiry, OAuth redirects, storage upload/download, restore and cross-device consistency. Do not claim production readiness until those tests pass.

## Security and privacy

- Never commit personal note data or exported backups.
- Never commit API keys or service-role credentials.
- Keep environment files ignored.
- Validate imported backup data before writing to IndexedDB.
- Treat all note content and imported files as untrusted user data.
