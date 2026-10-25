import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime } from '../js/clock.js';

test('formatTime uses a 12-hour clock', () => {
  assert.equal(formatTime(new Date(2026, 9, 25, 19, 42)), '7:42 PM');
  assert.equal(formatTime(new Date(2026, 9, 25, 0, 5)), '12:05 AM');
  assert.equal(formatTime(new Date(2026, 9, 25, 12, 0)), '12:00 PM');
});
