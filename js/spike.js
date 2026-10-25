// Throwaway: proves Spotify login works in iOS 12 Safari. Replaced in Task 6.
import { CLIENT_ID } from './config.js';
import { createAuth } from './auth.js';

const out = document.getElementById('out');
const btn = document.getElementById('btn-login');
const show = (msg) => { out.textContent = msg; };

const auth = createAuth({
  storage: localStorage,
  fetch: window.fetch.bind(window),
  location: window.location,
  crypto: window.crypto,
  clientId: CLIENT_ID,
});

async function main() {
  if (!CLIENT_ID) return show('No Spotify Client ID set yet.');
  const code = new URLSearchParams(location.search).get('code');
  if (code) {
    await auth.completeLogin(code);
    history.replaceState(null, '', location.pathname);
  }
  if (!auth.isLoggedIn()) {
    btn.hidden = false;
    btn.onclick = async () => { location.href = await auth.beginLogin(); };
    return show('Not logged in.');
  }
  const token = await auth.getAccessToken();
  const res = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: 'Bearer ' + token } });
  const me = await res.json();
  show('✅ Logged in as ' + (me.display_name || me.id) + '\n\nReload the page — it should stay logged in.');
}

main().catch((e) => show('❌ ' + (e && e.message ? e.message : String(e))));
