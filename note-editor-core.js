'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MemoryNoteEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createDraft(existing, options, clone) {
    if (existing) return typeof clone === 'function' ? clone(existing) : { ...existing };
    const config = options || {};
    return {
      id: config.id,
      title: '',
      bodyHtml: '',
      checklist: [],
      attachments: [],
      links: [],
      colour: 'paper',
      pinned: false,
      order: Number(config.order || 1),
      folderId: config.folderId || '',
      labelIds: Array.isArray(config.labelIds) ? [...config.labelIds] : [],
      archived: false,
      trashed: false,
      createdAt: config.createdAt || Date.now()
    };
  }

  function isDraftEmpty(draft, stripHtml) {
    if (!draft) return true;
    const hasTitle = Boolean(draft.title && draft.title.trim());
    const hasBody = Boolean(typeof stripHtml === 'function' && stripHtml(draft.bodyHtml || ''));
    const hasChecklist = (draft.checklist || []).some(item => item.text && item.text.trim());
    const hasAttachments = (draft.attachments || []).length > 0;
    const hasLinks = (draft.links || []).length > 0;
    return !(hasTitle || hasBody || hasChecklist || hasAttachments || hasLinks);
  }

  function setChecklistDone(items, id, done) {
    return (items || []).map(item => item.id === id ? { ...item, done: !!done } : item);
  }

  function setChecklistText(items, id, text) {
    return (items || []).map(item => item.id === id ? { ...item, text: String(text) } : item);
  }

  function removeChecklistItem(items, id) {
    return (items || []).filter(item => item.id !== id);
  }

  function appendChecklistItem(items, id) {
    return [...(items || []), { id, text: '', done: false }];
  }

  function toggleLabel(ids, id) {
    const current = Array.isArray(ids) ? ids : [];
    return current.includes(id) ? current.filter(value => value !== id) : [...current, id];
  }

  return Object.freeze({
    createDraft,
    isDraftEmpty,
    setChecklistDone,
    setChecklistText,
    removeChecklistItem,
    appendChecklistItem,
    toggleLabel
  });
});
