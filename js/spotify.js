const API = 'https://api.spotify.com/v1/me/player';
// Spotify may not expose Retry-After to the browser; back off this long when it's unreadable.
const DEFAULT_RETRY_AFTER_SEC = 5;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

// Doubles the wait on each consecutive rate limit (strikes = 0 for the first).
export function backoffMs(retryAfterSec, strikes) {
  return Math.min(MAX_BACKOFF_MS, Math.max(retryAfterSec * 1000, DEFAULT_RETRY_AFTER_SEC * 1000 * Math.pow(2, strikes)));
}

export class RateLimitError extends Error {
  constructor(retryAfterSec) {
    super('Rate limited by Spotify');
    this.name = 'RateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

export class NetworkError extends Error {
  constructor(cause) {
    super('Network error: ' + (cause && cause.message ? cause.message : cause));
    this.name = 'NetworkError';
  }
}

export class NoDeviceError extends Error {
  constructor() {
    super('No Spotify device available');
    this.name = 'NoDeviceError';
  }
}

export function createSpotify({ getAccessToken, fetch }) {
  async function send(method, path, force) {
    const token = await getAccessToken(force ? { force: true } : undefined);
    let res;
    try {
      res = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + token } });
    } catch (e) {
      throw new NetworkError(e);
    }
    if (res.status === 401 && !force) return send(method, path, true);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After'), 10);
      throw new RateLimitError(retryAfter > 0 ? retryAfter : DEFAULT_RETRY_AFTER_SEC);
    }
    if (!res.ok) throw new Error('Spotify ' + method + ' ' + path + ' failed: ' + res.status);
    // Control endpoints can answer 200 with an empty body, so only GETs are parsed.
    if (res.status === 204 || method !== 'GET') return null;
    return res.json();
  }

  return {
    getPlayback: () => send('GET', '?additional_types=episode'),
    getDevices: () => send('GET', '/devices').then((body) => (body && body.devices) || []),
    play: (deviceId) => send('PUT', '/play' + (deviceId ? '?device_id=' + encodeURIComponent(deviceId) : '')),
    pause: () => send('PUT', '/pause'),
    next: () => send('POST', '/next'),
    previous: () => send('POST', '/previous'),
  };
}

export async function playFromIdle(spotify) {
  const devices = await spotify.getDevices();
  const device =
    devices.find((d) => d.is_active) ||
    devices.find((d) => d.type === 'Smartphone') ||
    devices[0];
  if (!device) throw new NoDeviceError();
  await spotify.play(device.id);
}
