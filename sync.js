const CONFIG_KEY = 'focusflow.sync.config.v1';
const SESSION_KEY = 'focusflow.sync.session.v1';
const LAST_SYNC_KEY = 'focusflow.sync.last-success.v1';
const MAX_SYNC_BYTES = 4 * 1024 * 1024;

function storage(name) {
  try { return globalThis[name] || null; } catch { return null; }
}

export function validateSyncConfig(value) {
  if (!value || typeof value !== 'object') throw Error('Enter a Supabase project URL and public key.');
  let url;
  try { url = new URL(value.url); } catch { throw Error('Enter a valid Supabase project URL.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) || url.username || url.password || url.port || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw Error('Use the HTTPS project URL ending in .supabase.co from your Supabase project settings.');
  }
  const key = String(value.publicKey || '').trim();
  if (!key || key.length > 512 || key.startsWith('sb_secret_')) throw Error('Use only the Supabase publishable key or legacy anon key. Never use a secret or service-role key.');
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role && payload.role !== 'anon') throw Error('The service-role key is private. Use the publishable or anon key.');
    } catch (error) {
      if (error.message.includes('service-role')) throw error;
      throw Error('That legacy public key is not a valid JWT.');
    }
  } else if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) {
    throw Error('Use a Supabase publishable key or legacy anon key.');
  }
  return { url: url.origin, publicKey: key };
}

export function loadSyncConfig() {
  try {
    const raw = storage('localStorage')?.getItem(CONFIG_KEY);
    return raw ? validateSyncConfig(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function saveSyncConfig(value) {
  const config = validateSyncConfig(value);
  const target = storage('localStorage');
  if (!target) throw Error('Browser storage is unavailable.');
  target.setItem(CONFIG_KEY, JSON.stringify(config));
  return config;
}

export function clearSyncConfig() {
  storage('localStorage')?.removeItem(CONFIG_KEY);
  storage('localStorage')?.removeItem(LAST_SYNC_KEY);
  clearSession();
}

export function lastSyncAt() {
  try {
    const config = loadSyncConfig();
    const saved = JSON.parse(storage('localStorage')?.getItem(LAST_SYNC_KEY) || 'null');
    return config && saved?.url === config.url && typeof saved.at === 'string' && !Number.isNaN(Date.parse(saved.at)) ? saved.at : '';
  } catch { return ''; }
}

export function recordSyncSuccess(at = new Date().toISOString()) {
  const config = loadSyncConfig();
  const target = storage('localStorage');
  if (!config || !target || Number.isNaN(Date.parse(at))) return;
  target.setItem(LAST_SYNC_KEY, JSON.stringify({ url: config.url, at }));
}

export function clearLastSync() { storage('localStorage')?.removeItem(LAST_SYNC_KEY); }

function getSession() {
  try {
    const raw = storage('sessionStorage')?.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string' || typeof session.expires_at !== 'number' || typeof session.user?.id !== 'string') return null;
    return session;
  } catch { return null; }
}

function setSession(reply) {
  if (!reply?.access_token || !reply?.refresh_token || !reply?.user?.id) return null;
  const session = {
    access_token: reply.access_token,
    refresh_token: reply.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Math.max(0, Number(reply.expires_in) || 3600),
    user: { id: reply.user.id, email: reply.user.email || '' },
  };
  storage('sessionStorage')?.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() { storage('sessionStorage')?.removeItem(SESSION_KEY); }
export function sessionSnapshot() { return getSession(); }

async function request(path, { method = 'GET', body, session, prefer } = {}) {
  const hostname = globalThis.location?.hostname?.toLowerCase() || '';
  if (hostname === 'github.io' || hostname.endsWith('.github.io')) throw Error('Cloud sign-in is disabled on GitHub Pages because sibling project sites share browser storage. Use the separate Cloudflare Pages site.');
  const config = loadSyncConfig();
  if (!config) throw Error('Save a valid Supabase project URL and public key first.');
  const headers = { apikey: config.publicKey, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  if (prefer) headers.Prefer = prefer;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(`${config.url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
  } catch (error) {
    const failure = Error(error.name === 'AbortError' ? 'Sync request timed out. Your local planner is unchanged.' : 'Could not reach the sync service. Check the connection; local changes remain on this device.');
    failure.code = error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    throw failure;
  } finally { clearTimeout(timeout); }
  let payload = null;
  try { payload = await response.json(); } catch { /* empty or non-JSON response */ }
  if (!response.ok) {
    if (response.status === 401) { clearSession(); throw Error('Sign in again to continue syncing.'); }
    if (response.status === 409) throw Error('The cloud workspace changed during this action. Review sync again before choosing.');
    if (response.status === 413) throw Error('The cloud workspace is larger than the provider accepted. Your local planner is unchanged.');
    if (response.status === 429) { const error = Error('The sync service is rate limited. Wait a moment and retry.'); error.code = 'RATE_LIMIT'; throw error; }
    if (response.status >= 500) { const error = Error('The sync service is temporarily unavailable. Your local planner is unchanged.'); error.code = 'SERVER'; throw error; }
    throw Error('The sync request was rejected. Check the setup steps and database policy.');
  }
  return payload;
}

export async function signUp(email, password) {
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) throw Error('Enter a valid email address (254 characters or fewer).');
  if (password.length < 12 || password.length > 1024) throw Error('Use a password between 12 and 1024 characters.');
  const reply = await request('/auth/v1/signup', { method: 'POST', body: { email: email.trim(), password } });
  const session = setSession(reply);
  return { session, confirmationRequired: !session };
}

export async function signIn(email, password) {
  if (email.length > 254 || !email || !password || password.length > 1024) throw Error('Enter your email and password.');
  const reply = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
  const session = setSession(reply);
  if (!session) throw Error('Sign-in did not return a usable session.');
  return session;
}

export async function currentUser() {
  let session = getSession();
  if (!session) return null;
  if (session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    try {
      const reply = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
      session = setSession(reply);
      if (!session) throw Error('Session refresh failed.');
    } catch (error) {
      if (['NETWORK', 'TIMEOUT', 'SERVER', 'RATE_LIMIT'].includes(error.code)) return session;
      clearSession();
      return null;
    }
  }
  return session;
}

export async function signOut() {
  const session = getSession();
  clearSession();
  if (session) await request('/auth/v1/logout', { method: 'POST', session });
}

function checkedWorkspace(workspace) {
  const json = JSON.stringify(workspace);
  if (new TextEncoder().encode(json).byteLength > MAX_SYNC_BYTES) throw Error('Cloud sync is limited to 4 MB per workspace. Export a local backup before reducing data.');
  return JSON.parse(json);
}

export async function getCloudWorkspace(session) {
  const query = new URLSearchParams({ select: 'workspace,revision,updated_at', user_id: `eq.${session.user.id}`, limit: '1' });
  const rows = await request(`/rest/v1/user_workspaces?${query}`, { session });
  if (!Array.isArray(rows)) throw Error('The cloud service returned an unexpected response.');
  return rows[0] || null;
}

export async function putCloudWorkspace(session, workspace, expectedRevision) {
  const safeWorkspace = checkedWorkspace(workspace);
  if (expectedRevision == null) {
    const rows = await request('/rest/v1/user_workspaces?on_conflict=user_id', { method: 'POST', session, prefer: 'resolution=ignore-duplicates,return=representation', body: { user_id: session.user.id, workspace: safeWorkspace, revision: 1 } });
    if (Array.isArray(rows) && rows.length) return rows[0];
    throw Error('A cloud workspace already exists. Review sync again before choosing.');
  }
  const query = new URLSearchParams({ user_id: `eq.${session.user.id}`, revision: `eq.${expectedRevision}`, select: 'workspace,revision,updated_at' });
  const rows = await request(`/rest/v1/user_workspaces?${query}`, { method: 'PATCH', session, prefer: 'return=representation', body: { workspace: safeWorkspace, revision: expectedRevision + 1 } });
  if (Array.isArray(rows) && rows.length) return rows[0];
  throw Error('The cloud workspace changed during this action. Review sync again before choosing.');
}

export async function deleteCloudWorkspace(session, expectedRevision) {
  const query = new URLSearchParams({ user_id: `eq.${session.user.id}`, revision: `eq.${expectedRevision}`, select: 'user_id' });
  const rows = await request(`/rest/v1/user_workspaces?${query}`, { method: 'DELETE', session, prefer: 'return=representation' });
  if (!Array.isArray(rows) || rows.length !== 1) throw Error('The cloud workspace changed during this action. Review sync again before deleting.');
}

export const MAX_SYNC_BYTES_LIMIT = MAX_SYNC_BYTES;
