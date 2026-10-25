import { CLIENT_ID, LAT, LON, POLL_MS, WEATHER_MS, redirectUri } from './config.js';
import { createAuth, AuthExpiredError } from './auth.js';
import { createSpotify, playFromIdle, backoffMs, RateLimitError, NetworkError } from './spotify.js';
import { toNowPlaying } from './now-playing.js';
import { weatherUrl, parseWeather } from './weather.js';
import { formatTime } from './clock.js';
import { buildTransferLink, readTransferFragment } from './transfer.js';

const $ = (id) => document.getElementById(id);
const fetchFn = window.fetch.bind(window);

const auth = createAuth({
  storage: window.localStorage,
  fetch: fetchFn,
  location: window.location,
  crypto: window.crypto,
  clientId: CLIENT_ID,
});
const spotify = createSpotify({ getAccessToken: auth.getAccessToken, fetch: fetchFn });

let last = null;
let pausedSince = null;
let backoffUntil = 0;
let rateLimitStrikes = 0;
let pollTimer = null;
let messageTimer = null;

// ---- screens ----

function showLogin(msg) {
  clearTimeout(pollTimer);
  $('panel').hidden = true;
  $('settings').hidden = true;
  $('login').hidden = false;
  $('login-msg').textContent = msg || '';
}

function showPanel() {
  $('login').hidden = true;
  $('panel').hidden = false;
}

function flash(msg) {
  $('message').textContent = msg;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { $('message').textContent = ''; }, 8000);
}

// ---- now playing ----

function render(np) {
  if (!last || last.title !== np.title) $('title').textContent = np.title;
  if (!last || last.subtitle !== np.subtitle) $('subtitle').textContent = np.subtitle;
  if (!last || last.artUrl !== np.artUrl) {
    const art = $('art');
    if (np.artUrl) art.src = np.artUrl;
    else art.removeAttribute('src');
    art.hidden = !np.artUrl;
  }
  $('panel').className = np.state;
  last = np;
}

function handleError(e) {
  if (e instanceof AuthExpiredError) return showLogin('Your Spotify login expired. Please log in again.');
  if (e instanceof RateLimitError) {
    backoffUntil = Date.now() + backoffMs(e.retryAfterSec, rateLimitStrikes);
    rateLimitStrikes++;
    return;
  }
  // Network blips keep the last screen up and retry on the next tick.
  if (!(e instanceof NetworkError)) console.error(e);
}

async function poll() {
  if (document.hidden || Date.now() < backoffUntil) return;
  try {
    const playback = await spotify.getPlayback();
    rateLimitStrikes = 0;
    if (playback && !playback.is_playing) {
      if (pausedSince === null) pausedSince = Date.now();
    } else {
      pausedSince = null;
    }
    render(toNowPlaying(playback, pausedSince === null ? 0 : Date.now() - pausedSince));
  } catch (e) {
    handleError(e);
  }
}

function loop() {
  clearTimeout(pollTimer);
  poll().then(() => {
    if (!$('panel').hidden) pollTimer = setTimeout(loop, POLL_MS);
  });
}

// Re-check soon after a tap so the screen catches up with Spotify.
function refreshSoon() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(loop, 700);
}

async function control(fn) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AuthExpiredError) return showLogin('Your Spotify login expired. Please log in again.');
    if (e instanceof NetworkError) flash('No connection — try again in a moment.');
    else if (e instanceof RateLimitError) flash('Spotify is busy — try again shortly.');
    else flash('Open Spotify on your phone.');
  }
  refreshSoon();
}

function onPlayPause() {
  if (last && last.state === 'playing') {
    render(Object.assign({}, last, { state: 'paused' }));
    return control(() => spotify.pause());
  }
  if (!last || last.state === 'idle') return control(() => playFromIdle(spotify));
  render(Object.assign({}, last, { state: 'playing' }));
  return control(() => spotify.play());
}

// ---- clock & weather ----

function tickClock() {
  $('time').textContent = formatTime(new Date());
}

async function updateWeather() {
  try {
    const res = await fetchFn(weatherUrl(LAT, LON));
    if (!res.ok) return;
    const w = parseWeather(await res.json());
    $('weather-now').textContent = `${w.now.icon} ${w.now.temp}° · H ${w.hi} L ${w.lo}`;
    $('forecast').textContent = w.days.map((d) => `${d.name} ${d.icon} ${d.hi}°`).join('   ');
  } catch (e) {
    // Keep the last forecast on screen; the next refresh will try again.
  }
}

// ---- settings ----

function openSettings() {
  $('handoff').hidden = false;
  $('handoff-done').hidden = true;
  $('settings').hidden = false;
}

// Hands the login to the iPad: the link carries the only live copy of the
// refresh token, so the two devices can't rotate it out from under each other.
function handOff() {
  const link = buildTransferLink(redirectUri(window.location), auth.exportRefreshToken() || '');
  clearTimeout(pollTimer);
  auth.logout();
  $('transfer-link').href = link;
  $('handoff').hidden = true;
  $('handoff-done').hidden = false;
}

function importFromHash() {
  const transferred = readTransferFragment(window.location.hash);
  if (!transferred) return false;
  auth.importRefreshToken(transferred);
  history.replaceState(null, '', window.location.pathname);
  return true;
}

// ---- startup ----

async function start() {
  $('btn-prev').onclick = () => control(() => spotify.previous());
  $('btn-next').onclick = () => control(() => spotify.next());
  $('btn-play').onclick = onPlayPause;
  $('btn-settings').onclick = openSettings;
  $('btn-handoff').onclick = handOff;
  $('btn-close').onclick = () => {
    $('settings').hidden = true;
    if (!auth.isLoggedIn()) showLogin('Logged out. The login was moved to the iPad.');
  };
  $('btn-logout').onclick = () => { auth.logout(); showLogin('Logged out.'); };
  // A transfer link pasted into this same tab only changes the hash, so no reload happens.
  window.addEventListener('hashchange', () => {
    if (importFromHash()) window.location.reload();
  });
  $('btn-login').onclick = async () => { window.location.href = await auth.beginLogin(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('panel').hidden) loop(); });

  tickClock();
  setInterval(tickClock, 15000);
  updateWeather();
  setInterval(updateWeather, WEATHER_MS);

  importFromHash();

  const params = new URLSearchParams(window.location.search);
  if (params.get('code') || params.get('error')) {
    history.replaceState(null, '', window.location.pathname);
    if (params.get('error')) return showLogin('Spotify login was cancelled (' + params.get('error') + ').');
    try {
      await auth.completeLogin(params.get('code'));
    } catch (e) {
      return showLogin(e.message);
    }
  }

  if (!CLIENT_ID) return showLogin('Setup needed: no Spotify Client ID yet.');
  if (!auth.isLoggedIn()) return showLogin();
  showPanel();
  loop();
}

start().catch((e) => showLogin('Something went wrong: ' + (e && e.message ? e.message : e)));
