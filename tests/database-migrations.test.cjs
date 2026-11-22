'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrations = path.join(__dirname, '..', 'supabase', 'migrations');
const realtimeSql = fs.readFileSync(path.join(migrations, '20261122185125_add_folders_and_labels_to_realtime_publication.sql'), 'utf8');
const grantsSql = fs.readFileSync(path.join(migrations, '20261122185203_restrict_application_table_grants.sql'), 'utf8');

test('Realtime publication migration adds folders and labels without removing notes', () => {
  assert.match(realtimeSql, /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.folders\s*;/i);
  assert.match(realtimeSql, /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.labels\s*;/i);
  assert.doesNotMatch(realtimeSql, /drop\s+table|drop\s+publication/i);
});

test('application grants remove anon access and prevent RLS-bypassing privileges', () => {
  assert.match(grantsSql, /revoke\s+all\s+privileges[\s\S]*from\s+anon\s*,\s*authenticated\s*;/i);
  assert.match(grantsSql, /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]*to\s+authenticated\s*;/i);
  assert.doesNotMatch(grantsSql, /grant[\s\S]*\btruncate\b|grant[\s\S]*\btrigger\b|grant[\s\S]*\breferences\b/i);
});
