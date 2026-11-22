'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MemoryRealtime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TABLES = Object.freeze(['notes', 'folders', 'labels']);

  function create(client, handlers) {
    const callbacks = handlers || {};
    let channel = null;
    let generation = 0;
    let userId = null;

    async function removeChannel(previous) {
      if (!previous || !client || typeof client.removeChannel !== 'function') return;
      try {
        await client.removeChannel(previous);
      } catch (error) {
        if (typeof callbacks.onRemovalError === 'function') callbacks.onRemovalError(error);
      }
    }

    async function subscribe(nextUserId) {
      const currentGeneration = ++generation;
      const previous = channel;
      channel = null;
      userId = nextUserId || null;
      await removeChannel(previous);

      if (currentGeneration !== generation || !userId || !client) return;

      let nextChannel = client.channel('memory-account-' + userId);
      for (const table of TABLES) {
        nextChannel = nextChannel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table,
          filter: 'user_id=eq.' + userId
        }, payload => {
          if (currentGeneration !== generation || channel !== nextChannel || userId !== nextUserId) return;
          if (typeof callbacks.onChange === 'function') callbacks.onChange({ table, payload, userId: nextUserId });
        });
      }

      channel = nextChannel;
      nextChannel.subscribe((status, error) => {
        if (currentGeneration !== generation || channel !== nextChannel || userId !== nextUserId) return;
        if (status === 'SUBSCRIBED') {
          if (typeof callbacks.onStatus === 'function') callbacks.onStatus('connected', status);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (typeof callbacks.onStatus === 'function') callbacks.onStatus('disconnected', status, error || null);
        }
      });
    }

    async function close() {
      generation += 1;
      userId = null;
      const previous = channel;
      channel = null;
      await removeChannel(previous);
    }

    return Object.freeze({ subscribe, close });
  }

  return Object.freeze({ create, tables: TABLES });
});
