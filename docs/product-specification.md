# Memory — Product specification

This document records the product decisions approved for the current direction. It is a working specification, not a claim that every feature is already implemented.

## Home and navigation

- Keep the current Memory.latest visual foundation.
- Home uses a responsive notes board: two columns on mobile, more columns on larger screens; uniform card heights.
- Home note cards retain their title, footer label, pin indicator, and current two-line title treatment.
- Pinned notes appear first; remaining notes follow manual order. Editing does not reorder notes.
- Dragging starts from a small handle and must work with touch and mouse.
- The sidebar retains the Memory logo and navigation counts. Remove the sidebar footer text.
- Navigation includes Home, All notes, Folders, Labels, Archive, Trash, and Settings.
- Mobile uses a left slide-out drawer; desktop uses a visible sidebar.
- Empty state should remain subtle.

## Note editor

- Full-screen on mobile; centred pop-up on tablet and desktop.
- Optional title; writing can begin directly in the body.
- Autosave while typing, visible save status, and Done to close.
- Keep the current minimal Attachment, Add link, and More toolbar.
- Basic formatting: bold, italic, underline, bulleted lists, numbered lists, and checklists.
- Completed checklist items stay in place and show strikethrough.
- Note colours use the muted Modern Hearth palette; warm paper is default.
- Creation date only, shown inside the editor in DD/MM/YYYY format.
- More menu retains Pin/Unpin, Archive, Delete, Duplicate, and Text formatting.
- Deleting a note requires confirmation and sends it to Trash. Archiving is immediate.
- Removing an attachment requires confirmation.
- Attachments appear as compact rows with filename, type, size, and more-options control. Images do not use large embedded previews.
- Open attachments in an in-app preview where supported, with download/open-externally options.
- Link cards show website title, domain, and external-link action only; no thumbnails. Fetch metadata automatically when possible and retry after connectivity returns.

## Folders and labels

- A note belongs to one folder at a time.
- Folders are one level only; no nesting.
- Unfiled appears as a folder-like section.
- Individual note moves are immediate. Bulk moves require confirmation and offer Unfiled as a destination.
- Moving a note does not remove its labels.
- Deleting a folder requires confirmation; its notes move to Trash. Restoring those notes places them in Unfiled, without recreating the deleted folder.
- A note can have multiple labels.
- Labels use five muted colours: olive, navy, rust, pink, and grey.
- New labels default to muted olive.
- Changing a label colour updates all notes using that label.
- Deleting a label requires confirmation; remove it from associated notes but keep those notes.
- Labels appear as soft-tinted cards with name and note count. Opening a label shows all notes with that label.
- Label views use normal Memory ordering.
- Bulk selection operates within one section at a time.

## Archive, Trash, and bulk actions

- Archive and Trash are separate.
- Archived notes are excluded from normal search and can be restored.
- Deleted notes move to Trash and can be restored; permanent deletion is manual.
- Archive is immediate for individual and bulk actions.
- Delete requires confirmation for individual and bulk actions.
- Bulk move requires confirmation and displays count and destination.
- Bulk pin/unpin and colour changes are immediate.
- Bulk archive/delete/move confirmations identify the number of notes affected.

## Search

- Search updates instantly while typing.
- Search titles, note body, checklist text, attachment names/types, link metadata, folder names, and labels.
- Do not search inside PDF contents or perform OCR on images in the initial scope.
- Normal search excludes Archive and Trash.
- Exact word matches rank ahead of partial matches.
- Rank by relevance; use normal Memory order (pinned first, then manual order) to break equal-relevance ties.
- Keep the search UI simple: no advanced filters.
- Clearing search returns to the section that was open before searching.

## Storage, offline, and backup

- Use IndexedDB for all local application data, including notes, attachments, folders, labels, preferences, and organisation state.
- Store actual attachment bytes, not metadata only.
- Local data should survive refresh and app restart.
- Build an installable PWA with offline app-shell support and local editing.
- Export and restore a complete backup including notes, attachments, folders, labels, archive/trash state, and preferences.
- Verify persistence, restore, and offline behaviour on real browsers/devices before calling the app production-ready.

## Appearance and settings

- Keep the current font.
- Light and dark themes only; no automatic system theme mode.
- First launch defaults to light mode.
- Remember the user's manually selected theme.
- Settings use one continuous simple list.
- Keep the approved Modern Hearth palette and muted visual language.

## Future phase

- Add real sign-in and cross-device synchronisation using the separate Memory Supabase project only after the local-first app is complete and tested.
- Do not connect to or modify the LifeOS Supabase project.
