'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MemoryAttachmentPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Supabase bucket and browser guard use the same decimal 50 MB per-file ceiling.
  const MAX_FILE_BYTES = 50_000_000;
  const MAX_FILE_LABEL = '50 MB';

  function validateFile(fileOrSize) {
    const size = typeof fileOrSize === 'number'
      ? fileOrSize
      : fileOrSize && fileOrSize.size;
    if (!Number.isSafeInteger(size) || size < 0) {
      return { valid: false, reason: 'invalid-size' };
    }
    if (size > MAX_FILE_BYTES) {
      return { valid: false, reason: 'too-large' };
    }
    // File types are intentionally unrestricted by product policy.
    return { valid: true, reason: null };
  }

  return Object.freeze({ MAX_FILE_BYTES, MAX_FILE_LABEL, validateFile });
});
