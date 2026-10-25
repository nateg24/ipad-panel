import { IDLE_AFTER_PAUSED_MS } from './config.js';

function firstImage(images) {
  return images && images.length ? images[0].url : null;
}

function describe(playback) {
  const item = playback.item;
  if (!item) {
    const title = playback.currently_playing_type === 'ad' ? 'Advertisement' : 'Unknown';
    return { title, subtitle: '', artUrl: null };
  }
  if (item.type === 'episode') {
    return { title: item.name, subtitle: item.show ? item.show.name : '', artUrl: firstImage(item.images) };
  }
  const artists = (item.artists || []).map((a) => a.name).join(', ');
  const album = item.album ? item.album.name : '';
  return {
    title: item.name,
    subtitle: [artists, album].filter(Boolean).join(' · '),
    artUrl: firstImage(item.album && item.album.images),
  };
}

export function toNowPlaying(playback, pausedForMs) {
  if (!playback) return { state: 'idle', title: 'Nothing playing', subtitle: '', artUrl: null };
  let state = 'playing';
  if (!playback.is_playing) state = pausedForMs >= IDLE_AFTER_PAUSED_MS ? 'idle' : 'paused';
  return Object.assign({ state }, describe(playback));
}
