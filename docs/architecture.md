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
- Supabase Realtime subscribes to `notes`, `folders`, and `labels` in one account-scoped channel, with a `user_id` filter on every table. Any event schedules the normal cloud sync, which fetches authoritative rows rather than applying partial event payloads.
- The client removes the previous channel when the account changes or signs out, and ignores callbacks from stale channels. The Supabase Realtime client manages connection recovery; the UI reports subscription status. A 30-second visible-tab refresh remains as a fallback for missed events or unavailable Realtime.
- Realtime notifications are a prompt to refresh, not the source of truth. The client must fetch current records from Supabase.

Real browser testing is still required for simultaneous edits, auth expiry, OAuth redirects, storage upload/download, quota failures, reset propagation, and cross-device consistency. Do not claim production readiness until those tests pass.

## Attachments and backups

Attachment metadata and binary content are synchronised separately. IndexedDB retains local Blob copies for files already downloaded; Supabase Storage is authoritative for attachment files. Private attachment downloads must not be placed in the service-worker runtime cache.

The attachment viewer is built into `index.html` and previews browser-supported images, PDFs, HTML, text/source files, audio, and video directly inside the app. PDFs use the browser's native PDF viewer in an iframe, with the Blob MIME type normalized when necessary; the PDF iframe is intentionally not sandboxed because browser-native PDF viewers may not work inside a sandbox. HTML attachment previews use an empty sandbox and cannot access the parent application. Text is inserted with `textContent`, and asynchronous text rendering is guarded against stale previews. Other file types retain an in-app download fallback. Previewing does not send private file bytes to an external viewer service or modify the original attachment.

External link previews use the separate note-link-preview.js classifier and the same in-app preview window. HTTPS image, PDF, video, and audio links load directly as image/media resources or in an iframe; YouTube and numeric Vimeo video links are converted to provider embed URLs only after validating the video ID. Generic HTTPS pages load directly in a sandboxed iframe, with a visible warning that some sites block embedding. HTTP links show an insecure-link message, invalid or credential-bearing URLs are rejected without an external anchor, and Office/archive links show an unsupported-file message. Each preview keeps an Open externally option when a valid HTTP(S) URL exists. The iframe sandbox does not grant top navigation, downloads, modal dialogs, or camera/microphone/geolocation permissions, and same-origin frames do not receive both allow-scripts and allow-same-origin.

Link previews load the destination site directly in the user's browser inside Memory; there is no server-side page reader or proxy. The destination site therefore sees the user's IP address, just as it would when opened in a browser tab. Many sites send framing restrictions and will appear blank in the preview; use Open externally for those sites. Office documents and archives are not rendered. No private attachment is sent to Google, Microsoft, or another external viewer service. Link titles are not fetched from the destination as part of previewing.

Backup and restore behaviour must be tested against the current account model. A complete backup should include notes, attachments, folders, labels, archive/trash state, and preferences. Restore must validate input and handle duplicate IDs safely; do not describe backup/restore as verified until browser acceptance tests confirm it.

## PWA and caching

Required app-shell files include:

- `index.html`
- `app.js`
- `tailwind.css`
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
- `note-editor-core.js`
- `note-attachment-policy.js`
- `note-realtime-core.js`
- `note-link-preview.js`

PWA installation and service workers require localhost or HTTPS. The service worker preserves an offline app shell and may cache only the exact external CDN URLs explicitly listed in its allowlist. Supabase API requests, Supabase Storage downloads/uploads, and all other non-allowlisted external requests must bypass Cache Storage.

Navigation responses replace the cached app shell only when the network response is successful. Offline testing should include first-load caching, reload while offline, navigation fallback, and updates after a new deployment.

## Application modules and automated tests

The current vanilla-JavaScript entry point is `index.html`, which loads the application controller from `app.js`; the following browser modules isolate independently testable responsibilities:

- `app.js` contains the application controller previously embedded in `index.html`.
- `note-auth-core.js` wraps Supabase session restoration, auth-state subscriptions, Google OAuth initiation, and sign-out.
- `note-storage.js` owns the IndexedDB open/read/write/delete lifecycle for account-keyed workspace snapshots.
- `note-state-core.js` owns default state, structured cloning, and state normalization.
- `note-sync-core.js` owns note/attachment fingerprints and deterministic local-versus-remote sync planning, including conflict classification.
- `note-editor-core.js` owns note draft creation, empty-draft detection, checklist mutations, and label toggling.
- `note-realtime-core.js` owns account-scoped Realtime channel subscriptions, stale-callback protection, and channel cleanup.
- `note-sanitizer.js` owns the DOMPurify HTML boundary.
- `note-link-preview.js` classifies external URLs and validates video-provider IDs for safe in-app previews.

The CI workflow runs Node unit tests for state normalization, sync planning, auth delegation, and static database-migration regression checks, plus Playwright browser tests for IndexedDB persistence (including Blob attachments and account separation), service-worker caching, sanitization, and responsive layout. Static migration checks do not execute SQL against a live project. These tests validate isolated modules and browser infrastructure; they do **not** simulate a live Google OAuth provider or a real Supabase project. OAuth redirects, session expiry/refresh, real RLS enforcement, live concurrent edits, and full attachment transfer still require configured staging credentials and manual/acceptance testing.

## External link metadata

Browser-side metadata fetching can fail when a target site does not allow cross-origin requests. The URL must be saved immediately regardless. Metadata retrieval should fail gracefully. Do not promise that every website title can be fetched automatically.

## Security and privacy

- Never commit personal note data or exported backups.
- Never commit API keys or service-role credentials.
- Keep environment files ignored.
- Validate imported backup data before writing it to local storage.
- Treat note content and imported files as untrusted data; sanitize note HTML at the editor and sync boundaries.
- Keep HTML attachment previews sandboxed so embedded content cannot access the parent application.
- Keep `script-src` free of `'unsafe-inline'`; externalize application code and avoid inline event-handler attributes.


## Issue 4 live verification addendum — 2026-11-22

- All five application data tables (notes, folders, labels, note_labels, and attachments) have RLS enabled with authenticated ownership policies.
- The anon role has no table privileges on those five tables. The authenticated role has only SELECT, INSERT, UPDATE, and DELETE; TRUNCATE, REFERENCES, and TRIGGER privileges were revoked. RLS remains the row-level ownership boundary.
- The live supabase_realtime publication includes notes, folders, and labels. Every client subscription has a user_id filter and refreshes from authoritative rows.
- The live publication membership and effective table privileges were checked after the November 22, 2026 migrations. This catalog inspection does not substitute for authenticated cross-account RLS integration tests.

The current Storage bucket is private. The approved attachment policy is a decimal 50 MB (50,000,000 bytes) maximum per file with no MIME-type allowlist; the application rejects files above that size both when selected and immediately before upload. File extensions and declared MIME types are not restricted. Supabase Storage must enforce the same 50,000,000-byte bucket-level ceiling, and the project's global Storage upload ceiling must be at least 50,000,000 bytes. The live bucket setting still requires confirmation through the Storage bucket configuration API or Dashboard; do not infer it from application-side checks.

The app defines a restrictive Content Security Policy using the first `<meta http-equiv="Content-Security-Policy">` element in `index.html`, because GitHub Pages cannot configure arbitrary response headers. The policy defaults to `default-src 'none'`; scripts are limited to the app origin and the pinned jsDelivr/unpkg CDNs; styles allow the app origin, Google Fonts CSS, and `'unsafe-inline'` solely for the existing inline stylesheet and style attributes; fonts are limited to `fonts.gstatic.com`; images allow same-origin, data, Blob, and HTTPS resources; media allow Blob and HTTPS resources; and frames allow Blob and HTTPS resources. `connect-src` remains limited to the app origin and the dedicated Supabase HTTPS/WebSocket origin: previews load their URL directly as a frame, image, or media resource, rather than through `fetch()`/XHR, so no HTTPS wildcard is needed in `connect-src`. Workers and the manifest are same-origin; objects and base URLs are denied; forms are same-origin only. `script-src` does not include `'unsafe-inline'` or `'unsafe-eval'`.

The application controller is externalized in `app.js`. Arbitrary cross-origin link-title metadata fetches are skipped (same-origin metadata fetches remain eligible), so link titles may need to be entered manually. External preview resources are loaded directly by the browser, and non-allowlisted external requests bypass the service worker so media range/seeking requests are handled natively. HTML attachment previews remain sandboxed; scripts in Blob documents are not enabled by the parent policy. PDF Blob previews retain the native unsandboxed iframe for browser PDF compatibility, but browser-native PDF viewer behavior varies and must be verified in supported browsers.

A meta-delivered CSP cannot enforce `frame-ancestors`, `report-uri`/reporting endpoints, or the CSP `sandbox` directive. These protections require HTTP response headers and are not represented in this policy. The policy is therefore a GitHub Pages-compatible baseline, not a substitute for response-header controls on a host that supports them.

Live Google OAuth, authenticated cross-account RLS attempts, real attachment lifecycle, interruption/recovery, and end-to-end multi-tab Realtime delivery remain unverified. The app remains a prototype until those acceptance tests and security hardening are complete.
