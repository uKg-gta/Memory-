# Realtime cross-device note updates

- Added account-scoped Supabase Realtime subscriptions for note-row changes so open devices start syncing immediately instead of waiting for the 30-second polling interval.
- Reduced the local cloud-sync debounce and ensured sync requests arriving during an active sync are queued for a follow-up pass.
- Enabled the Memory `notes` table in the `supabase_realtime` publication.
- Bumped the PWA shell cache to v16.

## 2026-11-22 — Account reset
- Added a Settings reset action for the currently signed-in Google account.
- Requires typing RESET; permanently removes that account's cloud notes, folders, labels, relationships, attachment metadata and Storage files, then clears its local workspace and pending sync state.
- Keeps the Google sign-in session and appearance preference; does not affect other accounts.
- Reset is online-only and reports errors instead of silently claiming success. A cloud reset marker prevents stale offline copies on other devices from being uploaded again; those copies clear on their next successful sync.

# Changelog

## Memory.latest

- Added the standalone application entry point and supporting PWA files to the repository root.
- Added the source archive as a convenient snapshot.
- Established the current approved prototype baseline.
- Carries the local-first notes UI and PWA support files.
- Supabase sign-in and cross-device sync remain postponed.
- Requires real-device verification for storage, attachment persistence, PWA installation, and offline behaviour.

## Unreleased
- Attachment additions, removals, and metadata changes now advance the parent note's sync timestamp.
- Cross-device sync now downloads a cloud attachment when its local metadata exists but its binary is missing, instead of treating the ID alone as proof the file is present.
- Added a visible sync-failure notice and a detailed error in Settings; open, online devices now check for remote changes every 30 seconds, while background tabs do not poll.
- Bumped the PWA shell cache to v14 for the sync reliability update.
- Made Google sign-in mandatory before Memory can display or edit notes; signed-out users now see a dedicated sign-in screen.
- Removed the legacy signed-out IndexedDB workspace and old localStorage guest cache on startup. Account-specific workspaces and their offline copies remain intact.
- Removed automatic migration of signed-out notes into the first Google account; each account now opens only its own workspace.
- Bumped the PWA cache to v12 so installed copies receive the authentication gate and guest-data cleanup.
- Added visible keyboard focus indicators, reduced-motion and forced-colour support, and semantic labels for key app controls.
- Improved keyboard navigation, focus trapping/restoration, dialog semantics, and screen-reader status announcements for the editor, drawer, confirmations, and attachment preview.
- Made note cards keyboard-operable and added accessible names to checklist and link controls.
- Bumped the service-worker cache version so updated app assets can be installed.
- Added folder renaming through the folder options menu. Renaming preserves the folder ID and its notes.


## 2026-11-22 — Empty account foundation

- Replaced seeded sample content with a clean empty workspace and removed the sample-reset control.
- Bumped IndexedDB to v2 to clear prior prototype/sample records once.
- Added Supabase browser client configuration using the publishable key and Google sign-in/sign-out controls in Settings.
- Added account-owned Supabase tables and a private attachment bucket with row-level security.
- Cloud note synchronisation is not included in this batch; local-first persistence remains in place.


## 2026-11-22 — Initial account-backed note sync

- Added authenticated, user-scoped note fetch and upsert using the Memory Supabase project and the existing publishable browser key.
- Added local/cloud merge by client note ID and update timestamps; a blank cloud account does not replace local notes.
- Added soft-delete tombstones for permanently deleted notes and a manual Sync now action in Settings.
- Retained IndexedDB as the local offline copy; cloud sync retries when connectivity returns.
- Folders, labels, attachment metadata, and attachment binaries remain local-only. This milestone needs live multi-device acceptance testing before production readiness can be claimed.
- Refreshed the PWA service-worker cache version.

- Extended sync to folders, labels, note-label relationships, attachment metadata, and private attachment binaries.
- Added account-isolated local workspaces so notes from one signed-in account are not silently uploaded to another account on a shared browser.
- Added paginated cloud reads, focus/visibility sync retries, and attachment cleanup for permanently deleted notes.
- Pinned and precached Supabase JS 2.119.2; refreshed service-worker cache.


## 2026-11-22 — In-app previews and sync timestamp reliability
- Saved website links now open in Memory's in-app preview, with an explicit external-browser option. Sites that block embedded viewing may still require opening externally.
- HTML and HTM attachments now open in a sandboxed in-app iframe; scripts cannot access the parent Memory page or its origin.
- Added in-app previews for common text formats and native audio/video playback where the browser supports them. Existing PDF and image previews remain.
- New notes and changed notes now receive an explicit update timestamp before persistence and cloud upload, improving cross-device conflict detection for changes such as newly added links.
- Bumped the PWA shell cache to v13 so installed devices fetch the updated app.
