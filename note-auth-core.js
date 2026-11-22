'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MemoryNoteAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create(client, getRedirectUrl) {
    if (!client || !client.auth) return null;
    return Object.freeze({
      getSession() {
        return client.auth.getSession();
      },
      onAuthStateChange(callback) {
        return client.auth.onAuthStateChange(callback);
      },
      signInWithGoogle() {
        const redirectTo = typeof getRedirectUrl === 'function' ? getRedirectUrl() : undefined;
        return client.auth.signInWithOAuth({
          provider: 'google',
          options: redirectTo ? { redirectTo } : {}
        });
      },
      signOut() {
        return client.auth.signOut();
      }
    });
  }

  return Object.freeze({ create });
});
