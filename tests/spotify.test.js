import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpotify, playFromIdle, RateLimitError, NetworkError, NoDeviceError } from '../js/spotify.js';

function response(status, body, headers) {
  const h = headers || {};
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (k in h ? h[k] : null) },
    json: async () => body,
  };
}

function setup(responses) {
  const calls = [];
  const tokenCalls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: (init && init.method) || 'GET', auth: init && init.headers && init.headers.Authorization });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  const getAccessToken = async (opts) => {
    tokenCalls.push(opts || {});
    return opts && opts.force ? 'T2' : 'T1';
  };
  return { calls, tokenCalls, spotify: createSpotify({ getAccessToken, fetch }) };
}

const API = 'https://api.spotify.com/v1/me/player';

test('getPlayback requests the player with episodes and a bearer token', async () => {
  const { calls, spotify } = setup([response(200, { is_playing: true })]);
  assert.deepEqual(await spotify.getPlayback(), { is_playing: true });
  assert.equal(calls[0].url, API + '?additional_types=episode');
  assert.equal(calls[0].auth, 'Bearer T1');
});

test('getPlayback returns null on 204 (nothing active)', async () => {
  const { spotify } = setup([response(204)]);
  assert.equal(await spotify.getPlayback(), null);
});

test('a 401 forces a token refresh and retries once', async () => {
  const { calls, tokenCalls, spotify } = setup([response(401), response(200, { ok: 1 })]);
  assert.deepEqual(await spotify.getPlayback(), { ok: 1 });
  assert.equal(tokenCalls[1].force, true);
  assert.equal(calls[1].auth, 'Bearer T2');
});

test('a second 401 rejects', async () => {
  const { spotify } = setup([response(401), response(401)]);
  await assert.rejects(spotify.getPlayback());
});

test('429 rejects with RateLimitError carrying Retry-After', async () => {
  const { spotify } = setup([response(429, {}, { 'Retry-After': '7' })]);
  await assert.rejects(spotify.getPlayback(), (e) => e instanceof RateLimitError && e.retryAfterSec === 7);
});

test('429 without a readable Retry-After defaults to 5 seconds', async () => {
  const { spotify } = setup([response(429, {})]);
  await assert.rejects(spotify.getPlayback(), (e) => e instanceof RateLimitError && e.retryAfterSec === 5);
});

test('a failed fetch rejects with NetworkError', async () => {
  const { spotify } = setup([new TypeError('Load failed')]);
  await assert.rejects(spotify.getPlayback(), NetworkError);
});

test('controls hit the right endpoints and methods', async () => {
  const { calls, spotify } = setup([response(204), response(204), response(204), response(204)]);
  await spotify.next();
  await spotify.previous();
  await spotify.pause();
  await spotify.play('d1');
  assert.deepEqual(calls.map((c) => c.method + ' ' + c.url), [
    'POST ' + API + '/next',
    'POST ' + API + '/previous',
    'PUT ' + API + '/pause',
    'PUT ' + API + '/play?device_id=d1',
  ]);
});

test('play with no device id targets the active device', async () => {
  const { calls, spotify } = setup([response(204)]);
  await spotify.play();
  assert.equal(calls[0].url, API + '/play');
});

function fakeSpotify(devices) {
  const played = [];
  return { played, getDevices: async () => devices, play: async (id) => { played.push(id); } };
}

test('playFromIdle prefers the active device', async () => {
  const s = fakeSpotify([{ id: 'pc', type: 'Computer' }, { id: 'tv', type: 'TV', is_active: true }, { id: 'ph', type: 'Smartphone' }]);
  await playFromIdle(s);
  assert.deepEqual(s.played, ['tv']);
});

test('playFromIdle falls back to the first smartphone', async () => {
  const s = fakeSpotify([{ id: 'pc', type: 'Computer' }, { id: 'ph', type: 'Smartphone' }]);
  await playFromIdle(s);
  assert.deepEqual(s.played, ['ph']);
});

test('playFromIdle falls back to the first device', async () => {
  const s = fakeSpotify([{ id: 'pc', type: 'Computer' }]);
  await playFromIdle(s);
  assert.deepEqual(s.played, ['pc']);
});

test('playFromIdle with no devices rejects with NoDeviceError', async () => {
  await assert.rejects(playFromIdle(fakeSpotify([])), NoDeviceError);
});

test('getDevices returns the devices array', async () => {
  const { calls, spotify } = setup([response(200, { devices: [{ id: 'a' }] })]);
  assert.deepEqual(await spotify.getDevices(), [{ id: 'a' }]);
  assert.equal(calls[0].url, API + '/devices');
});

test('a control answered with 200 and an empty body resolves', async () => {
  const empty = response(200);
  empty.json = async () => { throw new SyntaxError('Unexpected end of JSON input'); };
  const { spotify } = setup([empty]);
  await spotify.next();
});
