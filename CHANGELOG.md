# Changelog

Changes are listed in chronological order, oldest first. The November 22, 2026 work was completed in a concentrated development session; the entries below share that calendar date because that is the date recorded in the repository history. Times are UTC where commit timestamps were verified.

## Prototype foundation

- Added the standalone HTML/CSS/JavaScript application and PWA shell.
- Established the Memory.latest interface, note editor, folders, labels, Archive, Trash, search, themes, and responsive layouts.
- Added IndexedDB persistence, attachment handling, backup/restore interfaces, and the service-worker app shell.
- Added product vision, product specification, and architecture documentation.

## 2026-11-22 — Account and cloud foundation

- Replaced seeded sample content with a clean account workspace and added the Supabase project configuration using the publishable browser key.
- Added Google sign-in through Supabase Auth and account-owned database tables protected by row-level security.
- Added a private attachment Storage bucket and account-scoped local workspaces.
- Added authenticated cloud sync for notes, then extended it to folders, labels, note-label relationships, attachment metadata, and attachment binaries.
- Added paginated reads, deletion tombstones, sync retries, and cleanup for permanently deleted notes.
- Added account reset for the signed-in account, including cloud and local cleanup and a server reset marker to prevent stale offline copies from being re-uploaded.
- Added in-app previews for supported links and attachments, including sandboxed HTML previews.

## 2026-11-22 10:03 UTC — Realtime note refresh

- Added account-scoped Supabase Realtime notifications for note-row changes.
- Kept a 30-second refresh fallback and queued another sync when a notification arrives during an active sync.
- Enabled the notes table in the Supabase Realtime publication.

## 2026-11-22 10:12 UTC — Cloud-authoritative, offline-read-only mode

- Made Supabase the authoritative source for notes, folders, labels, relationships, and attachment files.
- Kept IndexedDB as a per-account cache for previously downloaded content.
- Disabled data-changing actions while offline, while initial sync is running, or when sync has failed.
- Preserved read-only access to cached content and the offline app shell.
- Bumped the PWA shell cache to v17.

## 2026-11-22 10:20 UTC — Sync-loop correction

- Fixed equal-timestamp merge handling so matching versions do not repeatedly upload and trigger another sync.
- Kept the 30-second visible-tab refresh fallback.

## 2026-11-22 10:23 UTC — Concurrent-write protection

- Added compare-and-swap updates so an existing cloud note is updated only when its server version still matches the version fetched at sync start.
- Preserved simultaneous note edits as conflict copies rather than silently overwriting a competing change.
- Added duplicate-ID handling for concurrent inserts.
- Debounced bursts of Realtime notifications while retaining the fallback refresh.

## 2026-11-22 14:32 UTC — Note HTML sanitization

- Bundled DOMPurify locally so sanitization is available without a network dependency.
- Added a central note HTML sanitizer and applied it at editor, local-load, cloud-sync, paste, merge, and save boundaries.
- Added a browser security harness for malicious note HTML cases.
- Added the sanitizer's license notices and precached its local files in the app shell.

## 2026-11-22 14:34 UTC — Service-worker cache allowlist

- Restricted runtime caching to four exact, explicitly configured CDN asset URLs.
- Made Supabase API and Storage requests network-only.
- Made all other non-allowlisted external requests bypass Cache Storage.
- Prevented unsuccessful navigation responses from replacing the cached offline app shell.
- Bumped the service-worker cache version to v19.

## 2026-11-22 14:44 UTC — Server-authoritative sync versions

- Added a Supabase migration that assigns server-generated `updated_at` values to notes, folders, and labels.
- Replaced device-clock-based conflict ordering with server-version checks and pending local-change tracking.
- Preserved concurrent note edits as conflict copies and merged server timestamps back into the local cache.
- Updated account reset-marker handling to use server-generated versions.
- Bumped the PWA shell cache to v20.

## 2026-11-22 — Testability and module boundaries

- Extracted note sync fingerprints and deterministic local/remote conflict planning into `note-sync-core.js`.
- Extracted account-scoped IndexedDB read/write/delete operations into `note-storage.js`.
- Extracted state defaults, cloning, and normalization into `note-state-core.js`.
- Extracted Supabase session/OAuth/sign-out delegation into `note-auth-core.js`.
- Extracted note draft, empty-draft, checklist, and label model operations into `note-editor-core.js`.
- Added unit tests for state normalization, sync planning, and auth delegation, plus browser integration tests for IndexedDB account isolation and Blob persistence.
- Added the new modules to the service-worker app shell and CI test workflow.
- Documented the limits of the automated coverage: live OAuth, Supabase RLS, concurrent project-backed sync, and complete attachment transfers still need staging/acceptance testing.

## 2026-11-22 — Realtime folder and label updates

- Extended the account-scoped Supabase Realtime channel to listen for changes in notes, folders, and labels.
- Routed all events through the existing authoritative cloud sync rather than trusting partial event payloads.
- Added stale-callback protection and channel cleanup on account switching and sign-out.
- Waited for an in-flight account sync to finish before switching the active local workspace, preventing late writes from crossing account boundaries.
- Added connection status to account settings and retained the periodic visible-tab refresh as a fallback.
- Added automated tests for subscription filters, event routing, account changes, stale callbacks, and cleanup.

## Verification notes

- JavaScript syntax and selected static checks have been run during development.
- Browser security harness tests and real-device acceptance tests remain separate verification steps; a passing syntax check is not evidence that those browser scenarios have passed.
- The app remains a prototype and should not be described as production-ready until authentication, sync, conflict handling, offline behaviour, attachment transfers, account reset, and recovery have passed real-browser testing.


## 2026-11-22 18:51 UTC — Live Realtime publication correction

- The live supabase_realtime publication initially contained only public.notes, even though the client subscribed to three tables.
- Added public.folders and public.labels to the publication and verified all three memberships in the live PostgreSQL catalog.
- Added the matching migration to the repository.

## 2026-11-22 18:52 UTC — Application table least-privilege grants

- Found that anon and authenticated had broad table privileges, including TRUNCATE, on all five application data tables. RLS does not protect against TRUNCATE.
- Revoked all table privileges from anon; revoked broad privileges from authenticated and granted only SELECT, INSERT, UPDATE, and DELETE.
- Verified effective privileges for all five tables: anon has none, and authenticated has CRUD without TRUNCATE or TRIGGER.
- Added the matching migration to the repository.

## Issue 4 verification status

- The latest pre-remediation GitHub Actions run passed the configured Node and Playwright workflow, including responsive checks across Chromium, Firefox, and WebKit. This isolated suite does not prove live Supabase or Google OAuth behaviour.
- The live database catalog was inspected read-only except for the two narrowly scoped migrations above. No production user records or attachments were used for destructive testing.
- Live Google OAuth, authenticated cross-account RLS attempts, real attachment lifecycle, interruption/recovery, and end-to-end multi-tab Realtime delivery remain unverified.
- The current Storage bucket has no per-bucket file-size limit or MIME allowlist. The app also has no configured Content Security Policy. These are production hardening gaps.
- The app remains a prototype and must not be described as production-ready until the outstanding live acceptance tests and security hardening are completed.


## Issue 4 — Migration regression coverage

- Added deterministic Node tests that guard the two production migrations: Realtime publication membership and least-privilege application table grants.
- Added the migration regression tests to the GitHub Actions security-verification workflow. These are static migration checks, not live database integration tests.


## 2026-11-23 — Attachment upload policy

- Approved a decimal 50 MB (50,000,000 bytes) maximum per attachment, with all file types accepted (no MIME allowlist).
- Added a shared policy module and client-side rejection for files above the limit.
- Added a second size guard immediately before Supabase Storage upload so imported/restored or otherwise injected Blobs cannot bypass the UI check.
- Added unit coverage for the exact limit, oversized files, invalid sizes, and unrestricted file types; wired it into CI.
- Bumped the service-worker shell cache to v30 and precached the new policy module.
- The live Storage bucket remains private. Its bucket-level size ceiling and the project-wide ceiling must be set/verified in Supabase Storage; app-side validation is not a substitute for server enforcement.


## 2026-11-23 — Universal in-app attachment previews

- Added a local-only preview engine for image, audio, video, PDF, text/source, SVG, font, DOCX, XLSX, PPTX, and ZIP attachments.
- Added local OOXML text/table/slide extraction for modern Word, Excel, and PowerPoint files; macros and embedded scripts are not executed.
- Added a safe metadata, readable-text, and hexadecimal inspector as the in-app fallback for unsupported, legacy, or opaque formats, so accepted files no longer end at a “preview unavailable” screen.
- Kept uploaded file bytes inside the browser during preview; no external document-viewer service is used.
- Added the preview module to the offline app shell, updated Tailwind scanning, and added browser regression coverage for text, DOCX extraction, PDF sandboxing, and binary fallback.
- Known renderer limits: legacy DOC/XLS/PPT, RAR/7z archives, and 3D model formats currently use the inspector fallback rather than full document/archive rendering or a 3D viewport. Audio/video playback depends on browser codec support.


## 2026-11-23 — Restore the built-in attachment viewer

- Restored the original in-app attachment preview flow for images, PDFs, HTML, text/source files, audio, and video after the universal preview module regressed the PDF experience.
- PDFs again use the browser's native viewer in the in-app iframe; PDF MIME is normalized when the uploaded Blob lacks the correct type.
- Kept HTML previews sandboxed, text previews use `textContent`, and stale asynchronous previews are ignored.
- Removed the unused universal preview module from the loaded app shell and bumped the service-worker cache to v33.

## 2026-11-23 — Manual cloud sync

- Added a persistent Sync control beside the search field and a matching control inside the note editor.
- Kept one initial cloud sync after sign-in on each app launch; removed automatic syncs triggered by the 30-second timer, app focus/visibility, local autosave, Realtime notifications, and network reconnection.
- Realtime changes now mark cloud updates as available without starting a sync.
- Manual sync keeps an already-editable editor active and reconciles the open draft after the cloud merge; concurrent edits are preserved as conflict copies.
- Preserved the existing read-only policy before the initial successful sync, while offline, and after a sync failure.
- Updated the product specification to reflect the manual-sync policy.
- Bumped the PWA shell cache to v34 so installed apps receive the updated sync controls and behavior.


## 2026-11-23 — Content Security Policy and attachment source cleanup

- Added a restrictive meta-delivered Content Security Policy as the first element in the document head; no inline script execution is permitted.
- Extracted the application controller into `app.js`, added it to the service-worker shell, and bumped the cache to v35.
- Restricted link metadata fetching to same-origin URLs and replaced remote website iframes with an explicit open-externally fallback.
- Documented meta-CSP limitations: it cannot enforce `frame-ancestors`, `report-uri`, or `sandbox`.
- Audited the root-level `note-attachment-preview.js`: it is the superseded universal preview engine, is not loaded or cached, and is contradicted by the changelog's restored built-in viewer. Removed the stale duplicate; the built-in preview implementation in `app.js` is the single source of truth.


## 2026-11-23 — HTTPS link previews and attachment options

- Added strict URL classification for HTTPS image, PDF, video, audio, generic page, YouTube/Vimeo embed, unsupported Office/archive, insecure HTTP, and invalid links.
- Opened supported links in Memory's preview window with a visible embedding hint, safe sandbox attributes, loading/error/offline states, and an Open externally option. Invalid links receive no external anchor.
- Replaced the attachment kebab action with a floating Preview / Download / Rename / Remove menu, including keyboard navigation, viewport-aware placement, read-only access, and validated in-app renaming.
- Made attachment renames update the existing attachment metadata row's file_name field through the existing client sync path; no schema or policy changes were made.
- Loosened only frame-src, img-src, and media-src for HTTPS previews. connect-src remains restricted to same-origin and Supabase.
- Changed non-allowlisted external service-worker requests to native browser pass-through, kept Supabase traffic explicitly network-only, added note-link-preview.js to the shell, and bumped the PWA cache to v36.
- Added Node classifier/sync coverage and Playwright coverage for HTTPS previews, CSP, attachment menu keyboard/read-only/rename/remove flows, and viewport placement.
- Known limits: pages that block framing may appear blank; Office/archive links are not previewed; link titles still are not fetched from external websites.


## 2026-11-23 — Layout and sync recovery

- Restored the last known-good production Tailwind stylesheet after the generated stylesheet omitted grid and responsive grid utilities, breaking the note-card layout.
- Made sync conflict-copy creation idempotent so a repeated reconciliation reuses an identical existing copy instead of creating another duplicate.
- Bumped the service-worker cache to v37 so installed PWAs fetch the restored stylesheet and updated sync code.
- Added regression tests for the responsive note grid and conflict-copy reuse.
