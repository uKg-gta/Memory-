# Memory

**A personal space for everything worth remembering.**

Memory is a personal notes application focused on effortless capture, simple organisation, and dependable retrieval. It is being developed as a local-first, offline-capable app with a calm, minimal interface.

> **Project status:** Personal project in active prototyping. The current reference build is **Memory.latest**. It is not yet a production-ready release.

## Product principles

- **Effortless capture:** Save thoughts, links, images, files, and everyday information quickly.
- **Reliable retrieval:** Find information through fast, straightforward search.
- **Simple organisation:** Use folders, labels, pinning, archive, and trash without turning notes into a complex project-management system.
- **Local-first:** Keep notes and attachments available on the current device, including offline.
- **Privacy-conscious:** Keep cloud accounts and cross-device sync out of the initial local-first phase.

## Current prototype

The repository includes the current standalone web-app prototype:

- Responsive home board and note editor
- Light and dark themes
- Notes, pinning, colours, checklists, and basic formatting
- Folders, labels, Archive, and Trash
- Search and bulk note actions
- Attachment and link interfaces
- IndexedDB-based local persistence and backup/restore work
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
5. Only after the local application is dependable, plan Supabase authentication and cross-device synchronisation.

## Technology direction

- HTML, CSS, and JavaScript prototype
- IndexedDB for local notes and attachment data
- Progressive Web App manifest and service worker
- Supabase is reserved for a later authentication and sync phase; it is not connected in the current prototype.

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
