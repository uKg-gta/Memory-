/* Memory note HTML boundary. Keep this file in sync with tests/security-sanitizer.html. */
(function (global) {
  'use strict';

  const SANITIZER_CONFIG = Object.freeze({
    ALLOWED_TAGS: [
      'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
      'p', 'br', 'div', 'ul', 'ol', 'li', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'pre', 'code', 'hr', 'sub', 'sup'
    ],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_TRUSTED_TYPE: false
  });

  function sanitize(html) {
    if (!global.DOMPurify || typeof global.DOMPurify.sanitize !== 'function') {
      throw new Error('DOMPurify is unavailable; refusing to process note HTML.');
    }
    return global.DOMPurify.sanitize(String(html || ''), SANITIZER_CONFIG);
  }

  function stripHtml(html) {
    const safeHtml = sanitize(html);
    const parsed = new DOMParser().parseFromString(safeHtml, 'text/html');
    return (parsed.body.textContent || '').trim();
  }

  global.MemoryNoteSanitizer = Object.freeze({ sanitize, stripHtml });
})(window);
