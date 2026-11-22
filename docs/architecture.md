# Memory — Architecture and implementation notes

## Current delivery model

The current reference is a standalone HTML/CSS/JavaScript application. The app shell is served as a static web app and should be hosted on localhost or HTTPS for service-worker and PWA capabilities.

Google sign-in through Supabase Auth is required before account notes are displayed. The browser uses the Supabase publishable key only; a service-role or secret key must never be shipped to the client.

## Data authority and offline behaviour

**Supabase is the single source of truth** for account notes, folders, labels, note-label relationships, attachment metadata, and attachment binaries.

IndexedDB is a **per-account local cache**, not an independent source of truth. It holds data already downloaded to the current device so the user can read that content when offline. Offline use is read-only: creating, editing, deleting, and reorganising cloud data require a connection and a completed successful sync. The app also remains read-only while initial sync is running or when sync is in an error state.

On reconnection, the app refreshes from Supabase before enabling edits. Content that was never downloaded to a device is not available offline. Browser storage can be cleared or evicted, so offline availability is best-effort rather than guaranteed.

The Supabase Auth session may be persisted locally by the Supabase client to restore sign-in. That session storage is distinct from the cached note data.

## Account isolation

- Every account's local cache is keyed by its authenticated Supabase user ID.
- Switching accounts must not expose one account's cached notes to another account or upload one account's data into another account.
- Database tables use ownership-based row-level security.
- The attachment bucket is private; authenticated access and per-user object paths are required.
- The account reset flow deletes that account's cloud data and local cache. A server-side reset marker prevents an old offline cache on another device from being re-uploaded after reset; that device clears its stale copy on its next successful sync.

## Sync and conflict handling

- Stable client IDs map application records to database UUIDs.
- Sync includes notes, folders, labels, note-label relationships, attachment metadata, and attachment bytes in the private `memory-attachments` bucket.
- Reads are paginated.
- Deletions use tombstones so they propagate across devices.
- Notes, folders, and labels receive server-authoritative `updated_at` values through database triggers. Client device clocks are not used as the authority for version ordering.
- Local pending-change markers and compare-and-swap updates detect a cloud record that changed after the device fetched it. Concurrent note edits are preserved as conflict copies rather than silently overwriting one another.
- Supabase Realtime currently subscribes to note-row changes. Folder and label changes are discovered through the periodic refresh fallback; they are not yet covered by dedicated Realtime subscriptions.
- Realtime notifications are a prompt to refresh, not the source of truth. The client must fetch current records from Supabase.

Real browser testing is still required for simultaneous edits, auth expiry, OAuth redirects, storage upload/download, quota failures, reset propagation, and cross-device consistency. Do not claim production readiness until those tests pass.

## Attachments and backups

Attachment metadata and binary content are synchronised separately. IndexedDB retains local Blob copies for files already downloaded; Supabase Storage is authoritative for attachment files. Private attachment downloads must not be placed in the service-worker runtime cache.

Backup and restore behaviour must be tested against the current account model. A complete backup should include notes, attachments, folders, labels, archive/trash state, and preferences. Restore must validate input and handle duplicate IDs safely; do not describe backup/restore as verified until browser acceptance tests confirm it.

## PWA and caching

Required app-shell files include:

- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`
- `vendor/purify.min.js`
- `note-sanitizer.js`
- `note-sync-core.js`
- `note-storage.js`
- `note-state-core.js`
- `note-auth-core.js`

PWA installation and service workers require localhost or HTTPS. The service worker preserves an offline app shell and may cache only the exact external CDN URLs explicitly listed in its allowlist. Supabase API requests, Supabase Storage downloads/uploads, and all other non-allowlisted external requests must bypass Cache Storage.

Navigation responses replace the cached app shell only when the network response is successful. Offline testing should include first-load caching, reload while offline, navigation fallback, and updates after a new deployment.

## Application modules and automated tests

The current vanilla-JavaScript entry point remains `index.html`; the following browser modules isolate independently testable responsibilities:

- `note-auth-core.js` wraps Supabase session restoration, auth-state subscriptions, Google OAuth initiation, and sign-out.
- `note-storage.js` owns the IndexedDB open/read/write/delete lifecycle for account-keyed workspace snapshots.
- `note-state-core.js` owns default state, structured cloning, and state normalization.
- `note-sync-core.js` owns note/attachment fingerprints and deterministic local-versus-remote sync planning, including conflict classification.
- `note-sanitizer.js` owns the DOMPurify HTML boundary.

The CI workflow runs Node unit tests for state normalization, sync planning, and auth delegation, plus Playwright browser tests for IndexedDB persistence (including Blob attachments and account separation), service-worker caching, sanitization, and responsive layout. These tests validate isolated modules and browser infrastructure; they do **not** simulate a live Google OAuth provider or a real Supabase project. OAuth redirects, session expiry/refresh, real RLS enforcement, live concurrent edits, and full attachment transfer still require configured staging credentials and manual/acceptance testing.

## External link metadata

Browser-side metadata fetching can fail when a target site does not allow cross-origin requests. The URL must be saved immediately regardless. Metadata retrieval should fail gracefully. Do not promise that every website title can be fetched automatically.

## Security and privacy

- Never commit personal note data or exported backups.
- Never commit API keys or service-role credentials.
- Keep environment files ignored.
- Validate imported backup data before writing it to local storage.
- Treat note content and imported files as untrusted data; sanitize note HTML at the editor and sync boundaries.
- Keep HTML attachment previews sandboxed so embedded content cannot access the parent application.
