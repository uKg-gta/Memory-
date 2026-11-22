# Memory

**A personal space for everything worth remembering.**

Memory is a personal notes application focused on effortless capture, simple organisation, and dependable retrieval. It is being developed as a local-first, offline-capable app with a calm, minimal interface.

> **Project status:** Personal project in active prototyping. The current reference build is **Memory.latest**. It is not yet a production-ready release.

## Product principles

- **Effortless capture:** Save thoughts, links, images, files, and everyday information quickly.
- **Reliable retrieval:** Find information through fast, straightforward search.
- **Simple organisation:** Use folders, labels, pinning, archive, and trash without turning notes into a complex project-management system.
- **Local-first:** Keep notes and attachments available on the current device, including offline.
- **Privacy-conscious:** Use account-scoped cloud access with row-level security while retaining a local offline copy.

## Current prototype

The repository includes the current standalone web-app prototype:

- Responsive home board and note editor
- Light and dark themes
- Notes, pinning, colours, checklists, and basic formatting
- Folders, labels, Archive, and Trash
- Search and bulk note actions
- Attachment and link interfaces
- IndexedDB-based local persistence and backup/restore
- Google sign-in through the dedicated Memory Supabase project
- Cloud sync for notes, folders, labels, note-label relationships, and attachment files with local-first merge
- PWA manifest and service-worker support files

Prototype capabilities and browser/platform support still require real-device testing. See [docs/architecture.md](docs/architecture.md) and [docs/product-specification.md](docs/product-specification.md) for scope and decisions.

## Repository layout

- `index.html` — application entry point
- `manifest.webmanifest` — installable PWA metadata
- `sw.js` — service worker and offline caching
- `icon-192.png`, `icon-512.png` — app icons
- `docs/` — product vision, specification, and architecture
- `CHANGELOG.md` — notable project changes

The uploaded source archive is retained as a convenient snapshot; the individual application files above are the working repository source.

## Development roadmap

1. Stabilise the local-first application and IndexedDB data model.
2. Verify attachment persistence, previews, backup, and restore.
3. Verify PWA installation and offline behaviour on Android, iPad, and desktop.
4. Test accessibility, responsive layouts, data recovery, and browser compatibility.
5. Verify account authentication, cloud note sync, offline recovery, and conflict handling on real devices.

## Technology direction

- HTML, CSS, and JavaScript prototype
- IndexedDB for local notes and attachment data
- Progressive Web App manifest and service worker
- Supabase Auth and the Memory cloud database provide account access and sync for notes, folders, labels, relationships, and attachments. Local IndexedDB remains the offline source on each device.

## Running locally

The app should be served from **localhost or HTTPS** for service-worker registration and PWA installation. Opening `index.html` directly using `file://` is suitable only for a quick visual inspection.

With Python installed:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Keep the app's supporting files beside `index.html`:

- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`

## Privacy and repository hygiene

Do not commit personal notes, exported backups, attachment data, credentials, API keys, or environment files. The repository contains application source and project documentation—not personal Memory data.

## Project documents

- [Product vision](docs/product-vision.md)
- [Product specification and approved decisions](docs/product-specification.md)
- [Architecture and implementation notes](docs/architecture.md)
- [Changelog](CHANGELOG.md)

---

Built as a personal project.


## Account and initial sync foundation (November 2026)

- Memory now starts with an empty local workspace. The IndexedDB v2 upgrade clears previous prototype/demo records once; legacy prototype localStorage data is no longer imported.
- The dedicated Memory Supabase project has account-owned notes, folders, labels, note-label relationships, attachment metadata, and a private attachment bucket protected by row-level security.
- The browser uses only the Supabase publishable key. No service-role or secret key is shipped to the client.
- Google sign-in/sign-out controls are available in Settings. Google OAuth must be enabled in Supabase Auth with a Google OAuth web client and the deployed app URL added to the redirect allowlist.
- Google session restoration is handled by Supabase Auth. The Settings screen reports sync status and offers a manual sync action.
- Sync covers notes, folders, labels, note-label relationships, attachment metadata, and attachment binaries. Local IndexedDB copies are retained.
- Local workspaces are isolated by signed-in account on a shared browser profile; a first-time sign-in can claim the pre-account local workspace, while switching accounts loads a separate local workspace.
- Sync uses client IDs, timestamp comparisons, deletion tombstones, paginated reads, and retries when the device reconnects or the app regains focus.
- Folders, labels, note-label relationships, attachment metadata, and attachment binaries are included in the sync implementation. IndexedDB retains local attachment Blobs. The sync code has passed JavaScript syntax validation and the database schema/policies have been inspected. Live multi-device/browser acceptance testing is still required; it is not yet a production-ready release.
