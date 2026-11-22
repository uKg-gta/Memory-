# Changelog

## Memory.latest

- Added the standalone application entry point and supporting PWA files to the repository root.
- Added the source archive as a convenient snapshot.
- Established the current approved prototype baseline.
- Carries the local-first notes UI and PWA support files.
- Supabase sign-in and cross-device sync remain postponed.
- Requires real-device verification for storage, attachment persistence, PWA installation, and offline behaviour.

## Unreleased
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
