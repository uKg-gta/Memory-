'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { create, tables } = require('../note-realtime-core.js');

function makeClient() {
  const channels = [];
  const removed = [];
  return {
    channels,
    removed,
    channel(name) {
      const channel = {
        name,
        subscriptions: [],
        statusCallback: null,
        on(type, filter, callback) {
          this.subscriptions.push({ type, filter, callback });
          return this;
        },
        subscribe(callback) {
          this.statusCallback = callback;
          return this;
        }
      };
      channels.push(channel);
      return channel;
    },
    async removeChannel(channel) {
      removed.push(channel);
      return 'ok';
    }
  };
}

test('one account channel subscribes to notes, folders and labels with ownership filters', async () => {
  const client = makeClient();
  const changes = [];
  const statuses = [];
  const manager = create(client, {
    onChange: change => changes.push(change),
    onStatus: (...args) => statuses.push(args)
  });

  await manager.subscribe('user-123');
  assert.equal(client.channels.length, 1);
  const channel = client.channels[0];
  assert.equal(channel.name, 'memory-account-user-123');
  assert.deepEqual(channel.subscriptions.map(item => item.filter.table), ['notes', 'folders', 'labels']);
  assert.deepEqual(tables, ['notes', 'folders', 'labels']);
  for (const subscription of channel.subscriptions) {
    assert.equal(subscription.type, 'postgres_changes');
    assert.equal(subscription.filter.event, '*');
    assert.equal(subscription.filter.schema, 'public');
    assert.equal(subscription.filter.filter, 'user_id=eq.user-123');
  }

  channel.subscriptions[1].callback({ eventType: 'UPDATE' });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].table, 'folders');
  assert.equal(changes[0].userId, 'user-123');

  channel.statusCallback('SUBSCRIBED');
  channel.statusCallback('CHANNEL_ERROR', new Error('network'));
  assert.deepEqual(statuses.map(item => item[0]), ['connected', 'disconnected']);
});

test('switching accounts removes the previous channel and ignores stale events', async () => {
  const client = makeClient();
  const changes = [];
  const manager = create(client, { onChange: change => changes.push(change) });

  await manager.subscribe('account-a');
  const oldChannel = client.channels[0];
  await manager.subscribe('account-b');
  const newChannel = client.channels[1];

  assert.deepEqual(client.removed, [oldChannel]);
  oldChannel.subscriptions[0].callback({ eventType: 'UPDATE' });
  oldChannel.statusCallback('CHANNEL_ERROR');
  assert.equal(changes.length, 0);

  newChannel.subscriptions[2].callback({ eventType: 'INSERT' });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].userId, 'account-b');
  assert.equal(changes[0].table, 'labels');
});

test('closing removes the active channel and makes late callbacks inert', async () => {
  const client = makeClient();
  const changes = [];
  const statuses = [];
  const manager = create(client, {
    onChange: change => changes.push(change),
    onStatus: (...args) => statuses.push(args)
  });

  await manager.subscribe('account-a');
  const channel = client.channels[0];
  await manager.close();

  assert.deepEqual(client.removed, [channel]);
  channel.subscriptions[0].callback({ eventType: 'DELETE' });
  channel.statusCallback('SUBSCRIBED');
  assert.equal(changes.length, 0);
  assert.equal(statuses.length, 0);
});

test('a stale in-flight subscription cannot replace a newer account channel', async () => {
  const channels = [];
  const removed = [];
  let releaseRemoval;
  const client = {
    channel(name) {
      const channel = {
        name,
        subscriptions: [],
        on(type, filter, callback) { this.subscriptions.push({ type, filter, callback }); return this; },
        subscribe(callback) { this.statusCallback = callback; return this; }
      };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) {
      removed.push(channel);
      if (!releaseRemoval) return new Promise(resolve => { releaseRemoval = resolve; });
      return Promise.resolve('ok');
    }
  };
  const manager = create(client);
  await manager.subscribe('initial-account');
  const first = manager.subscribe('slow-account');
  const second = manager.subscribe('fast-account');
  await second;
  releaseRemoval('ok');
  await first;

  assert.equal(channels.length, 2);
  assert.equal(channels[1].name, 'memory-account-fast-account');
});
