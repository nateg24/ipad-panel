export const CLIENT_ID = '568ae5b0eec84cecb046a9534c6b6eec';
export const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';

// Green Bay, WI, rounded to city level (the repo is public).
export const LAT = 44.52;
export const LON = -88.02;

export const POLL_MS = 4000;
export const WEATHER_MS = 20 * 60 * 1000;
export const IDLE_AFTER_PAUSED_MS = 30 * 60 * 1000;

export function redirectUri(loc) {
  return loc.origin + loc.pathname;
}
