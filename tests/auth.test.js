import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, AuthExpiredError } from '../js/auth.js';
import { SCOPES } from '../js/config.js';

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init && init.body ? new URLSearchParams(init.body) : null });
    const r = responses.shift();
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}

const location = { origin: 'https://example.github.io', pathname: '/ipad-panel/' };
const REDIRECT = 'https://example.github.io/ipad-panel/';

function setup({ stored, responses, now }) {
  const storage = memoryStorage(stored);
  const fetch = fakeFetch(responses || []);
  const auth = createAuth({ storage, fetch, location, crypto, clientId: 'cid', now: () => now || 1000000 });
  return { storage, fetch, auth };
}

test('beginLogin builds a PKCE authorize URL and stores the verifier', async () => {
  const { storage, auth } = setup({});
  const url = new URL(await auth.beginLogin());
  assert.equal(url.origin + url.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT);
  assert.equal(url.searchParams.get('scope'), SCOPES);
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(storage.getItem('panel.verifier').length, 64);
});

test('completeLogin exchanges the code and stores tokens', async () => {
  const { storage, fetch, auth } = setup({
    stored: { 'panel.verifier': 'v'.repeat(64) },
    responses: [{ status: 200, body: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } }],
    now: 5000,
  });
  await auth.completeLogin('abc');
  const call = fetch.calls[0];
  assert.equal(call.url, 'https://accounts.spotify.com/api/token');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(call.body.get('grant_type'), 'authorization_code');
  assert.equal(call.body.get('code'), 'abc');
  assert.equal(call.body.get('code_verifier'), 'v'.repeat(64));
  assert.equal(call.body.get('client_id'), 'cid');
  assert.equal(call.body.get('redirect_uri'), REDIRECT);
  assert.equal(storage.getItem('panel.accessToken'), 'AT');
  assert.equal(storage.getItem('panel.refreshToken'), 'RT');
  assert.equal(storage.getItem('panel.expiresAt'), String(5000 + 3600 * 1000));
  assert.equal(storage.getItem('panel.verifier'), null);
});

test('getAccessToken returns the cached token while fresh', async () => {
  const { fetch, auth } = setup({
    stored: { 'panel.accessToken': 'AT', 'panel.refreshToken': 'RT', 'panel.expiresAt': '200000' },
    now: 100000,
  });
  assert.equal(await auth.getAccessToken(), 'AT');
  assert.equal(fetch.calls.length, 0);
});

test('getAccessToken refreshes when expired and saves the rotated refresh token', async () => {
  const { storage, fetch, auth } = setup({
    stored: { 'panel.accessToken': 'OLD', 'panel.refreshToken': 'RT1', 'panel.expiresAt': '150000' },
    responses: [{ status: 200, body: { access_token: 'NEW', refresh_token: 'RT2', expires_in: 3600 } }],
    now: 100000,
  });
  assert.equal(await auth.getAccessToken(), 'NEW');
  assert.equal(fetch.calls[0].body.get('grant_type'), 'refresh_token');
  assert.equal(fetch.calls[0].body.get('refresh_token'), 'RT1');
  assert.equal(fetch.calls[0].body.get('client_id'), 'cid');
  assert.equal(storage.getItem('panel.refreshToken'), 'RT2');
});

test('getAccessToken keeps the old refresh token when none is returned', async () => {
  const { storage, auth } = setup({
    stored: { 'panel.refreshToken': 'RT1' },
    responses: [{ status: 200, body: { access_token: 'NEW', expires_in: 3600 } }],
  });
  await auth.getAccessToken();
  assert.equal(storage.getItem('panel.refreshToken'), 'RT1');
});

test('getAccessToken({ force: true }) refreshes even when fresh', async () => {
  const { fetch, auth } = setup({
    stored: { 'panel.accessToken': 'AT', 'panel.refreshToken': 'RT', 'panel.expiresAt': '9999999999' },
    responses: [{ status: 200, body: { access_token: 'NEW', expires_in: 3600 } }],
  });
  assert.equal(await auth.getAccessToken({ force: true }), 'NEW');
  assert.equal(fetch.calls.length, 1);
});

test('invalid_grant clears tokens and rejects with AuthExpiredError', async () => {
  const { storage, auth } = setup({
    stored: { 'panel.accessToken': 'AT', 'panel.refreshToken': 'RT', 'panel.expiresAt': '1' },
    responses: [{ status: 400, body: { error: 'invalid_grant' } }],
  });
  await assert.rejects(auth.getAccessToken(), AuthExpiredError);
  assert.equal(storage.getItem('panel.refreshToken'), null);
  assert.equal(storage.getItem('panel.accessToken'), null);
  assert.equal(auth.isLoggedIn(), false);
});

test('getAccessToken with no refresh token rejects with AuthExpiredError', async () => {
  const { auth } = setup({});
  await assert.rejects(auth.getAccessToken(), AuthExpiredError);
});

test('importRefreshToken logs in and exportRefreshToken returns it', () => {
  const { auth } = setup({});
  assert.equal(auth.isLoggedIn(), false);
  auth.importRefreshToken('rt');
  assert.equal(auth.isLoggedIn(), true);
  assert.equal(auth.exportRefreshToken(), 'rt');
});

test('logout clears everything', () => {
  const { storage, auth } = setup({ stored: { 'panel.refreshToken': 'RT', 'panel.accessToken': 'AT' } });
  auth.logout();
  assert.equal(auth.isLoggedIn(), false);
  assert.equal(storage.getItem('panel.accessToken'), null);
});

test('concurrent refreshes share one token request', async () => {
  const { fetch, auth } = setup({
    stored: { 'panel.refreshToken': 'RT1' },
    responses: [{ status: 200, body: { access_token: 'NEW', refresh_token: 'RT2', expires_in: 3600 } }],
  });
  const results = await Promise.all([auth.getAccessToken({ force: true }), auth.getAccessToken({ force: true })]);
  assert.deepEqual(results, ['NEW', 'NEW']);
  assert.equal(fetch.calls.length, 1);
});

test('importRefreshToken drops any old access token', async () => {
  const { storage, auth } = setup({ stored: { 'panel.accessToken': 'OLD', 'panel.expiresAt': '9999999999' } });
  auth.importRefreshToken('rt');
  assert.equal(storage.getItem('panel.accessToken'), null);
});
