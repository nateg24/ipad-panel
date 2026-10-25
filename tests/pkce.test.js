import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomVerifier, codeChallenge } from '../js/pkce.js';

test('codeChallenge matches the RFC 7636 example', async () => {
  const challenge = await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', crypto.subtle);
  assert.equal(challenge, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('randomVerifier is 64 unreserved characters', () => {
  const v = randomVerifier(crypto);
  assert.equal(v.length, 64);
  assert.match(v, /^[A-Za-z0-9\-._~]+$/);
});
