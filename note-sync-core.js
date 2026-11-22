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

  return Object.freeze({ fingerprintNote, fingerprintAttachments });
});
