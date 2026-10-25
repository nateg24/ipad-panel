import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toNowPlaying } from '../js/now-playing.js';

const fixture = (name) => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
const THIRTY_MIN = 30 * 60 * 1000;

test('no playback is idle with "Nothing playing"', () => {
  assert.deepEqual(toNowPlaying(null, 0), { state: 'idle', title: 'Nothing playing', subtitle: '', artUrl: null });
});

test('a playing track shows title, artists · album and the largest art', () => {
  assert.deepEqual(toNowPlaying(fixture('playback-track.json'), 0), {
    state: 'playing',
    title: 'Dreams',
    subtitle: 'Artist A, Artist B · Album',
    artUrl: 'https://i.scdn.co/image/large',
  });
});

test('a recently paused track is paused', () => {
  const p = Object.assign(fixture('playback-track.json'), { is_playing: false });
  assert.equal(toNowPlaying(p, 0).state, 'paused');
});

test('a track paused for 30 minutes is idle but keeps its info', () => {
  const p = Object.assign(fixture('playback-track.json'), { is_playing: false });
  const np = toNowPlaying(p, THIRTY_MIN);
  assert.equal(np.state, 'idle');
  assert.equal(np.title, 'Dreams');
  assert.equal(np.artUrl, 'https://i.scdn.co/image/large');
});

test('a podcast episode shows the episode and show names', () => {
  assert.deepEqual(toNowPlaying(fixture('playback-episode.json'), 0), {
    state: 'playing',
    title: 'Episode 12',
    subtitle: 'Some Podcast',
    artUrl: 'https://i.scdn.co/image/episode',
  });
});

test('an ad shows "Advertisement" with no art', () => {
  assert.deepEqual(toNowPlaying(fixture('playback-ad.json'), 0), {
    state: 'playing',
    title: 'Advertisement',
    subtitle: '',
    artUrl: null,
  });
});

test('a track with no album images has no art', () => {
  const p = fixture('playback-track.json');
  p.item.album.images = [];
  assert.equal(toNowPlaying(p, 0).artUrl, null);
});
