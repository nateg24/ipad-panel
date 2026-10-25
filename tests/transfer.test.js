import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTransferLink, readTransferFragment } from '../js/transfer.js';

const BASE = 'https://example.github.io/ipad-panel/';

test('a transfer link round-trips a token with URL-special characters', () => {
  const link = buildTransferLink(BASE, 'a/b+c=');
  assert.ok(link.startsWith(BASE + '#rt='));
  assert.equal(readTransferFragment(new URL(link).hash), 'a/b+c=');
});

test('fragments without a token read as null', () => {
  assert.equal(readTransferFragment(''), null);
  assert.equal(readTransferFragment('#'), null);
  assert.equal(readTransferFragment('#foo=1'), null);
  assert.equal(readTransferFragment('#rt='), null);
});

test('a mangled fragment reads as null instead of throwing', () => {
  assert.equal(readTransferFragment('#rt=abc%2'), null);
});
