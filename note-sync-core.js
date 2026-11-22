'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MemorySyncCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fingerprintNote(note, sanitizeHtml) {
    const clean = typeof sanitizeHtml === 'function' ? sanitizeHtml : value => value;
    const source = note || {};
    return JSON.stringify({
      title: source.title || '',
      bodyHtml: clean(source.bodyHtml || ''),
      checklist: source.checklist || [],
      links: (source.links || []).map(({ id, title, url, domain, titleLocked }) =>
        ({ id, title, url, domain, titleLocked })),
      colour: source.colour || 'paper',
      pinned: !!source.pinned,
      order: Number(source.order || 0),
      folderId: source.folderId || '',
      archived: !!source.archived,
      trashed: !!source.trashed
    });
  }

  function fingerprintAttachments(note) {
    return JSON.stringify((note && note.attachments || [])
      .map(attachment => ({
        id: attachment.id,
        name: attachment.name || attachment.fileName || '',
        type: attachment.type || '',
        sizeBytes: Number(attachment.sizeBytes || 0),
        mimeType: attachment.mimeType || ''
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))));
  }


  function attachmentMetadataUpdate(existing, attachment) {
    if (!existing || existing.deleted_at) return null;
    const fileName = String((attachment && (attachment.name || attachment.fileName)) || 'Attachment');
    return existing.file_name === fileName ? null : { file_name: fileName };
  }

  function planNoteSync(localNotes, remoteNotes, pendingNoteIds, options) {
    const config = options || {};
    const fingerprint = config.fingerprint || (note => fingerprintNote(note));
    const toLocal = config.remoteToLocal || (remote => remote);
    const pending = pendingNoteIds instanceof Set ? pendingNoteIds : new Set(pendingNoteIds || []);
    const localIds = new Set((localNotes || []).map(note => note.id));
    const remoteByClientId = new Map((remoteNotes || [])
      .filter(row => row && row.client_id)
      .map(row => [row.client_id, row]));
    const local = (localNotes || []).map(note => {
      const remote = remoteByClientId.get(note.id);
      if (remote && remote.deleted_at) {
        return { local: note, remote, action: pending.has(note.id) ? 'conflict-deleted' : 'skip-deleted' };
      }
      if (remote && pending.has(note.id)) {
        return { local: note, remote, action: 'update-existing', expectedUpdatedAt: remote.updated_at };
      }
      if (remote) {
        const remoteLocal = toLocal(remote, note);
        return {
          local: note,
          remote,
          remoteLocal,
          action: 'use-remote',
          localChanged: fingerprint(note) !== fingerprint(remoteLocal)
        };
      }
      return { local: note, remote: null, action: 'insert-local' };
    });
    const remoteOnly = (remoteNotes || []).filter(row =>
      row && row.client_id && !localIds.has(row.client_id) && !row.deleted_at);
    return { local, remoteOnly };
  }


  function findMatchingConflictCopy(notes, sourceNote, fingerprint, title) {
    if (!sourceNote || typeof fingerprint !== 'function') return null;
    const expectedTitle = String(title || 'Conflict copy');
    const expectedFingerprint = fingerprint(sourceNote);
    return (notes || []).find(candidate => candidate && candidate.id !== sourceNote.id &&
      candidate.title === expectedTitle && fingerprint(candidate) === expectedFingerprint) || null;
  }

  return Object.freeze({ fingerprintNote, fingerprintAttachments, attachmentMetadataUpdate, findMatchingConflictCopy, planNoteSync });
});
