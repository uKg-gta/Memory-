'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MemoryNoteState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getDefaultData() {
    return { theme: 'light', folders: [], labels: [], notes: [] };
  }

  function cloneData(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    // Older-browser fallback. Blob attachments require structuredClone support.
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeState(data, sanitizeNoteHtml) {
    const sanitize = typeof sanitizeNoteHtml === 'function' ? sanitizeNoteHtml : value => value;
    data.theme = data.theme === 'dark' ? 'dark' : 'light';
    data.folders = Array.isArray(data.folders) ? data.folders : [];
    data.folders.forEach(folder => {
      if (!folder.updatedAt) folder.updatedAt = '1970-01-01T00:00:00.000Z';
    });
    data.labels = Array.isArray(data.labels) ? data.labels : [];
    data.labels.forEach(label => {
      if (!label.colour) label.colour = 'olive';
      if (!label.updatedAt) label.updatedAt = '1970-01-01T00:00:00.000Z';
    });
    data.notes = Array.isArray(data.notes) ? data.notes : [];
    data.syncMeta = data.syncMeta || {};
    for (const key of ['pendingNoteIds', 'pendingFolderIds', 'pendingLabelIds']) {
      data.syncMeta[key] = Array.isArray(data.syncMeta[key]) ? data.syncMeta[key] : [];
    }
    data.notes.forEach(note => {
      note.bodyHtml = sanitize(note.bodyHtml || '');
      note.folderId = note.folderId || '';
      note.labelIds = Array.isArray(note.labelIds) ? note.labelIds : [];
      note.attachments = Array.isArray(note.attachments) ? note.attachments : [];
      note.links = Array.isArray(note.links) ? note.links : [];
      note.checklist = Array.isArray(note.checklist) ? note.checklist : [];
      if (!note.createdAt) note.createdAt = Date.now();
      if (!note.updatedAt) note.updatedAt = new Date(note.createdAt).toISOString();
    });
    return data;
  }

  return Object.freeze({ getDefaultData, cloneData, normalizeState });
});
