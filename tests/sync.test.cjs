const test = require('node:test');
const assert = require('node:assert/strict');

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const publicKey = `sb_publishable_${'a'.repeat(32)}`;
const projectUrl = 'https://focusflow-test.supabase.co';
const session = { access_token: 'access.test', refresh_token: 'refresh.test', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'user-123', email: 'student@example.com' } };
let Sync;

test.before(async () => {
  global.localStorage = new MemoryStorage();
  global.sessionStorage = new MemoryStorage();
  Sync = await import('../sync.js');
});

test.afterEach(() => {
  global.localStorage = new MemoryStorage();
  global.sessionStorage = new MemoryStorage();
  global.fetch = undefined;
  delete global.location;
});

test('provider configuration accepts only HTTPS Supabase hosts and public keys', () => {
  assert.deepEqual(Sync.validateSyncConfig({ url: projectUrl, publicKey }), { url: projectUrl, publicKey });
  for (const url of ['http://focusflow-test.supabase.co', 'https://evil.example', 'https://u:p@focusflow-test.supabase.co', 'https://focusflow-test.supabase.co/path']) {
    assert.throws(() => Sync.validateSyncConfig({ url, publicKey }));
  }
  assert.throws(() => Sync.validateSyncConfig({ url: projectUrl, publicKey: 'sb_secret_private' }), /Never use a secret/);
  const serviceRole = `eyJ.${btoa(JSON.stringify({ role: 'service_role' })).replace(/=/g, '')}.sig`;
  assert.throws(() => Sync.validateSyncConfig({ url: projectUrl, publicKey: serviceRole }), /service-role key is private/);
});

test('last successful sync is stored per provider without storing credentials', () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  assert.equal(Sync.lastSyncAt(), '');
  Sync.recordSyncSuccess('2026-10-28T10:00:00.000Z');
  assert.equal(Sync.lastSyncAt(), '2026-10-28T10:00:00.000Z');
  assert.equal(global.localStorage.getItem('focusflow.sync.last-success.v1').includes(publicKey), false);
  Sync.saveSyncConfig({ url: 'https://other-project.supabase.co', publicKey });
  assert.equal(Sync.lastSyncAt(), '');
  Sync.clearLastSync();
});

test('automatic sync requires opt-in and a reviewed sync baseline', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  assert.equal(Sync.automaticSyncEnabled(session.user.id), false);
  assert.throws(() => Sync.setAutomaticSyncEnabled(true, session.user.id), /manually/);
  const workspace = { version: 2, tasks: [{ id: 'a', title: 'Read' }] };
  const row = { revision: 4, updated_at: '2026-10-28T10:00:00.000Z' };
  await Sync.recordSyncCursor(row, workspace, session.user.id);
  assert.equal(Sync.getSyncCursor(session.user.id).revision, 4);
  Sync.setAutomaticSyncEnabled(true, session.user.id);
  assert.equal(Sync.automaticSyncEnabled(session.user.id), true);
  assert.equal(Sync.automaticSyncEnabled('different-user'), false);
  assert.equal(Sync.getSyncCursor(session.user.id).digest.length, 64);
  assert.equal(Sync.getSyncCursor('different-user'), null);
  assert.equal(Sync.getSyncCursor(session.user.id).digest, await Sync.workspaceDigest({ tasks: [{ title: 'Read', id: 'a' }], version: 2 }));
  assert.equal(await Sync.workspaceDigest({ ...workspace, ui: { page: 'tasks' }, timer: { remaining: 10 } }), await Sync.workspaceDigest({ ...workspace, ui: { page: 'dashboard' }, timer: { remaining: 30 } }));
  Sync.setAutomaticSyncEnabled(false, session.user.id);
  assert.equal(Sync.automaticSyncEnabled(session.user.id), false);
  assert.equal(Sync.getSyncCursor(session.user.id).revision, 4);
});

test('changing provider clears its sync cursor and disables automatic sync', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  await Sync.recordSyncCursor({ revision: 1 }, { version: 2, tasks: [] }, session.user.id);
  Sync.setAutomaticSyncEnabled(true, session.user.id);
  Sync.saveSyncConfig({ url: 'https://other-project.supabase.co', publicKey });
  assert.equal(Sync.automaticSyncEnabled(session.user.id), false);
  assert.equal(Sync.getSyncCursor(session.user.id), null);
});

test('public project settings persist while session tokens stay in session storage', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  global.fetch = async () => Response.json({ ...session, expires_in: 3600 });
  await Sync.signIn(session.user.email, 'a-long-test-password');
  assert.equal(global.localStorage.getItem('focusflow.sync.config.v1').includes('access_token'), false);
  assert.equal(global.sessionStorage.getItem('focusflow.sync.session.v1').includes('refresh.test'), true);
});

test('email confirmation and sign-out never persist a password and clear the local session promptly', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  global.fetch = async () => Response.json({ user: { id: session.user.id, email: session.user.email }, confirmation_sent_at: '2026-10-28T00:00:00Z' });
  const signup = await Sync.signUp(session.user.email, 'a-long-test-password');
  assert.equal(signup.confirmationRequired, true);
  assert.equal(global.sessionStorage.getItem('focusflow.sync.session.v1'), null);
  assert.equal(global.localStorage.getItem('focusflow.sync.config.v1').includes('a-long-test-password'), false);

  global.fetch = async () => Response.json({ ...session, expires_in: 3600 });
  await Sync.signIn(session.user.email, 'a-long-test-password');
  let release;
  global.fetch = () => new Promise(resolve => { release = resolve; });
  const signingOut = Sync.signOut();
  assert.equal(global.sessionStorage.getItem('focusflow.sync.session.v1'), null);
  release(new Response(null, { status: 204 }));
  await signingOut;
});

test('an expired session remains available for retry when refresh is offline', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  global.sessionStorage.setItem('focusflow.sync.session.v1', JSON.stringify({ ...session, expires_at: 1 }));
  global.fetch = async () => { throw new TypeError('offline'); };
  const retryable = await Sync.currentUser();
  assert.equal(retryable.user.id, session.user.id);
  assert.ok(global.sessionStorage.getItem('focusflow.sync.session.v1'));
});

test('cloud authentication and data requests are blocked on shared github.io origins', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  global.location = { hostname: 'sanjaykumar286028.github.io' };
  let calls = 0;
  global.fetch = async () => { calls++; return Response.json({}); };
  await assert.rejects(Sync.signIn(session.user.email, 'a-long-test-password'), /disabled on GitHub Pages/);
  assert.equal(calls, 0);
  assert.equal(global.sessionStorage.getItem('focusflow.sync.session.v1'), null);
});

test('sync reads are filtered to the authenticated row and never send browser cookies', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json([]); };
  assert.equal(await Sync.getCloudWorkspace(session), null);
  const call = calls[0];
  assert.match(call.url, /user_id=eq\.user-123/);
  assert.equal(call.options.headers.Authorization, 'Bearer access.test');
  assert.equal(call.options.headers.apikey, publicKey);
  assert.equal(call.options.credentials, 'omit');
  assert.equal(call.options.cache, 'no-store');
});

test('cloud writes use an initial insert or revision-checked compare-and-swap', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  const workspace = { version: 2, tasks: [], schedule: [], notes: [], subjects: [] };
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json([{ workspace, revision: 6, updated_at: '2026-10-28T00:00:00Z' }]);
  };
  await Sync.putCloudWorkspace(session, workspace, 5);
  const patchCall = calls[0];
  assert.match(patchCall.url, /revision=eq\.5/);
  assert.equal(patchCall.options.method, 'PATCH');
  assert.equal(JSON.parse(patchCall.options.body).revision, 6);
  assert.equal(patchCall.options.headers.Prefer, 'return=representation');
  calls.length = 0;
  await Sync.putCloudWorkspace(session, workspace, null);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(JSON.parse(calls[0].options.body).user_id, session.user.id);
  assert.match(calls[0].options.headers.Prefer, /ignore-duplicates/);
});

test('concurrent cloud edits and oversized payloads fail without a write', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  let calls = 0;
  global.fetch = async () => { calls++; return Response.json([]); };
  await assert.rejects(Sync.putCloudWorkspace(session, { version: 2, tasks: [], schedule: [], notes: [], subjects: [] }, 7), /changed/);
  await assert.rejects(Sync.putCloudWorkspace(session, { version: 2, large: 'x'.repeat(Sync.MAX_SYNC_BYTES_LIMIT) }, null), /4 MB/);
  assert.equal(calls, 1);
});

test('cloud deletion is restricted to the user and the reviewed revision', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  let call;
  global.fetch = async (url, options) => { call = { url: String(url), options }; return Response.json([{ user_id: session.user.id }]); };
  await Sync.deleteCloudWorkspace(session, 9);
  assert.match(call.url, /user_id=eq\.user-123/);
  assert.match(call.url, /revision=eq\.9/);
  assert.equal(call.options.method, 'DELETE');
});

test('rate-limit retry honors a bounded Retry-After value', async () => {
  Sync.saveSyncConfig({ url: projectUrl, publicKey });
  global.fetch = async () => new Response(JSON.stringify({ message: 'rate limited' }), { status: 429, headers: { 'Retry-After': '3' } });
  await assert.rejects(Sync.getCloudWorkspace(session), error => error.code === 'RATE_LIMIT' && error.retryAfterMs === 3000);
});

test('the migration enforces a user-owned row and bounded workspace payloads', async () => {
  const fs = require('node:fs');
  const sql = fs.readFileSync('supabase/migrations/202610280001_user_workspaces.sql', 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /auth\.uid\(\)[\s\S]+?user_id/);
  assert.match(sql, /references auth\.users\s*\(id\) on delete cascade/i);
  assert.match(sql, /octet_length\(workspace::text\) <= 4194304/i);
  assert.doesNotMatch(sql, /service_role|sb_secret_/i);
});
