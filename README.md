# Memory

**A personal space for everything worth remembering.**

Memory is a personal notes application focused on effortless capture, simple organisation, and dependable retrieval. The current prototype uses Google sign-in and Supabase as the authoritative home for account data, with an IndexedDB cache for read-only offline access.

> **Project status:** Personal project in active prototyping. The current reference build is **Memory.latest**. It is not yet a production-ready release.

## Product principles

- **Effortless capture:** Save thoughts, links, images, files, and everyday information quickly.
- **Reliable retrieval:** Find information through fast, straightforward search.
- **Simple organisation:** Use folders, labels, pinning, archive, and trash without turning notes into a complex project-management system.
- **Cloud-authoritative data:** Supabase is the source of truth for signed-in account data.
- **Offline continuity:** Previously downloaded content can be viewed from a per-account IndexedDB cache. Offline use is read-only; edits require a successful online sync.
- **Privacy-conscious:** Google authentication, account-scoped records, row-level security, and private attachment storage protect account data.

## Current prototype

The repository includes the current standalone web-app prototype:

- Responsive home board and note editor
- Light and dark themes
- Notes, pinning, colours, checklists, and basic formatting
- Folders, labels, Archive, and Trash
- Search and bulk note actions
- Attachment and link interfaces, with supported in-app previews
- Google sign-in through the dedicated Memory Supabase project
- Cloud sync for notes, folders, labels, note-label relationships, and private attachment files
- Per-account IndexedDB cache for previously downloaded content
- PWA manifest and service-worker support, including offline app-shell access

The app requires an authenticated Google account. Supabase is authoritative; IndexedDB is a local cache, not a separate offline-editing database. When offline, or while sync is incomplete or in an error state, cached content is read-only. Items not already downloaded to the device are not available offline.

Prototype capabilities and browser/platform support still require real-device testing. See [docs/architecture.md](docs/architecture.md), [docs/product-specification.md](docs/product-specification.md), and [docs/product-vision.md](docs/product-vision.md) for the current direction and implementation details.

## Repository layout

- `index.html` — application entry point
- `manifest.webmanifest` — installable PWA metadata
- `sw.js` — service worker and offline caching
- `icon-192.png`, `icon-512.png` — app icons
- `note-sanitizer.js` — HTML sanitization boundary
- `note-sync-core.js` — deterministic note fingerprints and sync/conflict planning
- `note-storage.js` — account-scoped IndexedDB persistence
- `note-state-core.js` — state defaults, cloning, and normalization
- `note-auth-core.js` — Supabase Google-auth adapter
- `vendor/` — locally bundled third-party browser dependencies
- `tests/` — Node unit tests and Playwright browser integration tests
- `docs/` — product vision, specification, and architecture
- `CHANGELOG.md` — chronological project changes

The individual application files are the working repository source. Any retained source archive is only a snapshot and is not an independent source of truth.

## Development roadmap

1. Complete documentation and security hardening.
2. Verify authentication, cloud sync, conflict handling, and account isolation on real devices.
3. Verify offline read-only access, app-shell recovery, and cache update behaviour.
4. Verify attachment upload/download, preview, backup, and restore behaviour.
5. Continue expanding end-to-end acceptance coverage for live Supabase, OAuth redirects, session expiry, attachment transfers, and cross-device recovery. The extracted pure modules and IndexedDB adapter already have automated unit/browser tests; the complete application remains in a vanilla-JavaScript entry point.

## Technology

- Standalone HTML, CSS, and JavaScript prototype
- Supabase Auth with Google sign-in
- Supabase database with row-level security
- Private Supabase Storage for attachment binaries
- IndexedDB for per-account cached data and attachment blobs
- PWA manifest and service worker
- Pinned external CDN assets

## Running locally

The app should be served from **localhost or HTTPS** for service-worker registration and PWA installation. Opening `index.html` directly using `file://` is suitable only for a quick visual inspection.

With Python installed:

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Keep the app's supporting files beside `index.html`, including `manifest.webmanifest`, `sw.js`, the app icons, `vendor/purify.min.js`, and `note-sanitizer.js`.

## Account, sync, and privacy

- Google sign-in is required before the app displays account notes.
- The browser uses only the Supabase publishable key. No service-role or secret key is shipped to the client.
- Supabase is authoritative for notes, folders, labels, note-label relationships, attachment metadata, and attachment files.
- IndexedDB stores a separate per-account cache of data already downloaded to that device. It supports offline reading, not offline editing or queued offline writes.
- Account-owned database records are protected by row-level security. Attachment files are stored in a private bucket and accessed through authenticated Storage operations.
- The service worker must never cache Supabase API or Storage traffic. Only explicitly allowlisted CDN assets may enter the runtime cache.
- Do not commit personal notes, exported backups, attachment data, credentials, API keys, or environment files.

## Project documents

- [Product vision](docs/product-vision.md)
- [Product specification and approved decisions](docs/product-specification.md)
- [Architecture and implementation notes](docs/architecture.md)
- [Changelog](CHANGELOG.md)

---

Built as a personal project.
