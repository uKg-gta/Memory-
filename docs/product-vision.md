# Memory — Product vision

## One-sentence vision

A personal space for capturing everyday information quickly and finding it again reliably, across signed-in devices.

## The problem

Useful information arrives in fragments: a thought, a name, a date, a calculation, a checklist, a URL, a screenshot, a PDF, or an image. Memory should make saving these fragments easy and retrieving them dependable.

## Product principles

1. **Capture before organisation.** A note should not require a folder or label before it can be saved.
2. **Retrieval is central.** Search and clear organisation matter more than dashboards or productivity metrics.
3. **Keep the interface calm.** Avoid unnecessary controls, decorative clutter, and project-management complexity.
4. **Cloud-authoritative continuity.** A signed-in user's Supabase account is the source of truth across devices.
5. **Offline access without divergent copies.** Previously downloaded content remains readable from a per-account local cache, but offline editing is not supported.
6. **User-controlled organisation.** Folders, labels, pinning, archive, and trash should be predictable and reversible where possible.
7. **Privacy by account.** Authentication, row-level security, account-scoped local caches, and private attachment storage are foundational.

## Intended experience

- Personal, single-user notes application.
- Google sign-in and account-scoped data.
- Responsive across Android, iPad/tablets, laptops, and desktops.
- Installable PWA with offline app-shell support and read-only access to cached content.
- Light and dark themes, manually selected.
- Warm, muted Modern Hearth visual identity.
- Quick capture, optional titles, autosave, and a minimal editor while online and synchronised.

## Out of scope for the current prototype

- Multi-user collaboration
- Complex project or task management
- AI summaries and OCR
- Offline editing and queued offline writes
- Advanced search filters and content indexing inside PDFs/images
