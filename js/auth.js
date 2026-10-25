import { SCOPES, redirectUri } from './config.js';
import { randomVerifier, codeChallenge } from './pkce.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const KEYS = {
  refresh: 'panel.refreshToken',
  access: 'panel.accessToken',
  expiresAt: 'panel.expiresAt',
  verifier: 'panel.verifier',
};
// Refresh a minute early so a request never goes out with a token about to expire.
const EXPIRY_MARGIN_MS = 60000;

export class AuthExpiredError extends Error {
  constructor(message) {
    super(message || 'Spotify login expired');
    this.name = 'AuthExpiredError';
  }
}

export function createAuth({ storage, fetch, location, crypto, clientId, now }) {
  const clock = now || Date.now;

  function clearTokens() {
    storage.removeItem(KEYS.refresh);
    storage.removeItem(KEYS.access);
    storage.removeItem(KEYS.expiresAt);
  }

  function saveTokens(body) {
    storage.setItem(KEYS.access, body.access_token);
    storage.setItem(KEYS.expiresAt, clock() + body.expires_in * 1000);
    if (body.refresh_token) storage.setItem(KEYS.refresh, body.refresh_token);
  }

  async function postToken(params) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(Object.assign({ client_id: clientId }, params)).toString(),
    });
    const body = await res.json();
    return { res, body };
  }

  async function beginLogin() {
    const verifier = randomVerifier(crypto);
    storage.setItem(KEYS.verifier, verifier);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SCOPES,
      redirect_uri: redirectUri(location),
      code_challenge_method: 'S256',
      code_challenge: await codeChallenge(verifier, crypto.subtle),
    });
    return 'https://accounts.spotify.com/authorize?' + params.toString();
  }

  async function completeLogin(code) {
    const { res, body } = await postToken({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri(location),
      code_verifier: storage.getItem(KEYS.verifier) || '',
    });
    if (!res.ok) throw new Error('Spotify login failed: ' + (body.error_description || body.error || res.status));
    saveTokens(body);
    storage.removeItem(KEYS.verifier);
  }

  // One refresh at a time: Spotify rotates refresh tokens, so two parallel
  // refreshes with the same token can invalidate each other.
  let refreshing = null;

  async function getAccessToken(opts) {
    const force = opts && opts.force;
    const access = storage.getItem(KEYS.access);
    const expiresAt = Number(storage.getItem(KEYS.expiresAt) || 0);
    if (!force && access && clock() < expiresAt - EXPIRY_MARGIN_MS) return access;

    if (!refreshing) {
      refreshing = refreshAccessToken().then(
        (token) => { refreshing = null; return token; },
        (e) => { refreshing = null; throw e; }
      );
    }
    return refreshing;
  }

  async function refreshAccessToken() {
    const refresh = storage.getItem(KEYS.refresh);
    if (!refresh) throw new AuthExpiredError();
    const { res, body } = await postToken({ grant_type: 'refresh_token', refresh_token: refresh });
    if (body.error === 'invalid_grant') {
      clearTokens();
      throw new AuthExpiredError();
    }
    if (!res.ok) throw new Error('Token refresh failed: ' + res.status);
    saveTokens(body);
    return body.access_token;
  }

  return {
    beginLogin,
    completeLogin,
    getAccessToken,
    isLoggedIn: () => !!storage.getItem(KEYS.refresh),
    importRefreshToken: (rt) => {
      clearTokens();
      storage.setItem(KEYS.refresh, rt);
    },
    exportRefreshToken: () => storage.getItem(KEYS.refresh),
    logout: () => {
      clearTokens();
      storage.removeItem(KEYS.verifier);
    },
  };
}
