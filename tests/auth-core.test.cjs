'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../note-auth-core.js');

test('auth adapter restores session and forwards auth state changes', async () => {
  const session = { user: { id: 'account-1' } };
  let stateListener;
  const client = {
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      onAuthStateChange(callback) { stateListener = callback; return { data: { subscription: 'subscription' } }; }
    }
  };
  const auth = create(client, () => 'https://memory.example/');
  const restored = await auth.getSession();
  assert.equal(restored.data.session.user.id, 'account-1');

  let observed;
  const subscription = auth.onAuthStateChange((event, nextSession) => { observed = { event, nextSession }; });
  stateListener('SIGNED_IN', session);
  assert.deepEqual(observed, { event: 'SIGNED_IN', nextSession: session });
  assert.equal(subscription.data.subscription, 'subscription');
});

test('Google sign-in uses the configured redirect URL and provider', async () => {
  let request;
  const client = { auth: { async signInWithOAuth(value) { request = value; return { error: null }; } } };
  const auth = create(client, () => 'https://memory.example/notes');
  const result = await auth.signInWithGoogle();

  assert.deepEqual(request, {
    provider: 'google',
    options: { redirectTo: 'https://memory.example/notes' }
  });
  assert.equal(result.error, null);
});

test('sign-out delegates to Supabase and preserves returned errors', async () => {
  const expected = { message: 'network unavailable' };
  const client = { auth: { async signOut() { return { error: expected }; } } };
  const auth = create(client);
  const result = await auth.signOut();
  assert.equal(result.error, expected);
});

test('auth adapter is unavailable without a Supabase auth client', () => {
  assert.equal(create(null), null);
  assert.equal(create({}), null);
});
