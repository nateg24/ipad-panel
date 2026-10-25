# Living Room Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web page, hosted on GitHub Pages, that turns an iPad mini 2 (iOS 12.5.8 Safari) into a Spotify remote and weather display for the living room.

**Architecture:** Plain ES modules with no framework and no build step, served from GitHub Pages. Spotify auth uses Authorization Code + PKCE entirely in the browser, with tokens in `localStorage`. Pure logic (PKCE, auth, Spotify client, view model, weather, clock, transfer link) lives in small modules with injected `fetch`/`storage`/`crypto` so it can be unit tested with `node --test`. `app.js` does the DOM wiring and polling.

**Tech Stack:** HTML, CSS, ES2017 JavaScript modules; Node 22 `node:test` for tests; `acorn` (dev only) to enforce the ES2017 syntax ceiling; Spotify Web API; Open-Meteo; GitHub Pages via `gh`.

**Spec:** `docs/superpowers/specs/2026-10-25-living-room-panel-design.md`

## Global Constraints

- Shipped JS must parse as **ES2017** with `sourceType: "module"`: no `?.`, no `??`, no class fields, no top-level await, no object rest/spread in function params beyond ES2017.
- CSS: no flexbox `gap`, no `aspect-ratio`. Use margins/padding; grid `grid-gap` is allowed.
- No framework, no CDN scripts, no icon fonts. Weather icons are emoji.
- Runs in a regular Safari tab, **not** as a Home Screen app. Include `<meta name="viewport" content="width=device-width, initial-scale=1, minimal-ui">`.
- Spotify scopes, exactly: `user-read-playback-state user-modify-playback-state user-read-currently-playing`.
- Weather: Green Bay, WI, `LAT = 44.52`, `LON = -88.02`; °F; 12-hour clock; refresh every 20 min.
- Nothing secret in the repo: no tokens, no email addresses, no exact home location. The Spotify client ID is not secret and is committed.
- No volume control. No browsing, search or queue.
- Repo lives at `C:\Users\Nate\dev\ipad-panel`; `.superpowers/` and `node_modules/` are gitignored.

## Review Focus

1. **Refresh token revoked or invalid** (`400 invalid_grant`): the panel must show the login screen, not a blank panel or a refresh loop. Test in Task 2.
2. **Phone offline / Wi-Fi blip:** a failed poll or weather fetch keeps the last good state on screen and retries quietly. Test in Task 4 (client throws a typed `NetworkError`), with behavior in Task 6.
3. **Podcasts, ads and local files:** `item` is an episode, `item` is null with `currently_playing_type: "ad"`, or a local track with no images. The panel shows something sensible, not "undefined". Tests in Task 4.
4. **Rate limit** (`429` with `Retry-After`): polling backs off for that many seconds. Test in Task 4, behavior in Task 6.
5. **Play pressed while idle with no reachable phone:** a visible "Open Spotify on your phone" message, not a silent failure. Test in Task 4.

---

### Task 1: Scaffold, syntax guard, git repo

**Files:**
- Create: `package.json`, `.gitignore`, `tests/syntax.test.js`, `js/config.js`

**Interfaces:**
- Produces: `js/config.js` exports `CLIENT_ID` (string, empty until Task 3), `SCOPES` (string, space-separated, from Global Constraints), `LAT = 44.52`, `LON = -88.02`, `POLL_MS = 4000`, `WEATHER_MS = 20 * 60 * 1000`, `IDLE_AFTER_PAUSED_MS = 30 * 60 * 1000`, and `redirectUri(loc)` returning `loc.origin + loc.pathname`.

- [ ] **Step 1:** `git init` in `C:\Users\Nate\dev\ipad-panel`. Create `.gitignore` with `node_modules/` and `.superpowers/`. Create `package.json` with `"type": "module"`, `"private": true`, script `"test": "node --test tests/"`, and devDependency `acorn`. Run `npm install`.
- [ ] **Step 2: Write `tests/syntax.test.js`.** For every `.js` file under `js/`: `acorn.parse(src, { ecmaVersion: 2017, sourceType: 'module' })` must not throw (the test name includes the file name). For every `.css` file in the repo root: the content must not match `/(^|[^-])gap\s*:/m` or `/aspect-ratio/`.
- [ ] **Step 3:** Create `js/config.js` per the Interfaces block. Add a deliberate `a?.b` line, run `npm test`, and confirm the syntax test FAILS naming `config.js`. Remove the line, run again, and confirm it PASSES.
- [ ] **Step 4: Commit** `chore: scaffold panel with ES2017 syntax guard`.

### Task 2: PKCE and auth

**Files:**
- Create: `js/pkce.js`, `js/auth.js`, `tests/pkce.test.js`, `tests/auth.test.js`

**Interfaces:**
- Consumes: `CLIENT_ID`, `SCOPES`, `redirectUri` from `js/config.js`.
- Produces:
  - `pkce.js`: `randomVerifier(cryptoObj) -> string` (64 chars, `[A-Za-z0-9-._~]`), `codeChallenge(verifier, subtle) -> Promise<string>` (base64url SHA-256, no padding).
  - `auth.js`: `class AuthExpiredError extends Error` (ES2015 class with constructor, no fields) and `createAuth({ storage, fetch, location, crypto, clientId, now })`, which returns:
    - `beginLogin() -> Promise<string>` (the authorize URL; stores the verifier under `panel.verifier`)
    - `completeLogin(code) -> Promise<void>`
    - `getAccessToken({ force }) -> Promise<string>` (throws `AuthExpiredError` when there's no refresh token or on `invalid_grant`)
    - `isLoggedIn() -> boolean`
    - `importRefreshToken(rt) -> void`
    - `exportRefreshToken() -> string|null`
    - `logout() -> void`
  - Storage keys: `panel.refreshToken`, `panel.accessToken`, `panel.expiresAt`, `panel.verifier`.

- [ ] **Step 1: Write failing tests.**
  - `pkce.test.js`: `codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', crypto.subtle)` resolves to `'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'` (RFC 7636 vector). `randomVerifier(crypto)` has length 64 and matches `/^[A-Za-z0-9\-._~]+$/`.
  - `auth.test.js` uses an in-memory storage object and a fake `fetch` that records requests:
    - `beginLogin` URL starts with `https://accounts.spotify.com/authorize?` and has `response_type=code`, `code_challenge_method=S256`, `client_id`, `redirect_uri`, and `scope` equal to `SCOPES`. The verifier is stored.
    - `completeLogin('abc')` POSTs form-encoded to `https://accounts.spotify.com/api/token` with `grant_type=authorization_code`, `code=abc`, `code_verifier`, `client_id` and `redirect_uri`. It stores the access and refresh tokens and sets `expiresAt = now + expires_in*1000`, then removes the verifier.
    - `getAccessToken()` returns the cached token when `now < expiresAt - 60000` and makes no fetch.
    - When expired, it POSTs `grant_type=refresh_token` and stores the **new** refresh token if one is returned.
    - It keeps the old refresh token when the response doesn't include one.
    - `getAccessToken({ force: true })` refreshes even when not expired.
    - On `400 {"error":"invalid_grant"}` it clears all `panel.*` tokens and rejects with `AuthExpiredError`. **(Review Focus 1)**
    - `importRefreshToken('rt')`, then `isLoggedIn() === true` and `exportRefreshToken() === 'rt'`.
- [ ] **Step 2:** Run `npm test` and confirm the new tests FAIL (module not found).
- [ ] **Step 3:** Implement `js/pkce.js` and `js/auth.js` per the Interfaces block. Use `TextEncoder`, `subtle.digest('SHA-256')`, `btoa` over the byte string, then replace `+/` with `-_` and strip `=`. Send token requests as `application/x-www-form-urlencoded` built with `URLSearchParams(...).toString()`.
- [ ] **Step 4:** Run `npm test` and confirm all tests PASS, including the syntax guard.
- [ ] **Step 5: Commit** `feat: PKCE auth with refresh-token rotation`.

### Task 3: Deploy and spike the login on the real iPad (manual gate)

**Files:**
- Create: `index.html` (temporary spike version), `js/spike.js`
- Modify: `js/config.js` (set `CLIENT_ID`)

**Interfaces:**
- Consumes: `createAuth`, `AuthExpiredError` from `js/auth.js`.

- [ ] **Step 1: Check the GitHub account.** Confirmed 2026-10-25: personal account is **`nateg24`**; `the work account` is **work and must not be used**. Run `gh auth status` and check that `nateg24` is active; if not, `gh auth switch -u nateg24`. Set repo-local git identity: `git config user.name nateg24` and `git config user.email <nateg24's GitHub noreply address from gh api user>`. Use an HTTPS remote. Pages URL: `https://nateg24.github.io/ipad-panel/`.
- [ ] **Step 2:** Create the public repo with `gh repo create ipad-panel --public --source . --push`, then enable Pages from `main` / root with `gh api -X POST repos/<user>/ipad-panel/pages -f "source[branch]=main" -f "source[path]=/"`. Expected: the Pages URL serves a 200 within a few minutes.
- [ ] **Step 3: Nate creates the Spotify app** at https://developer.spotify.com/dashboard. Settings: Web API; redirect URI exactly the Pages URL with its trailing slash. He gives you the Client ID. Put it in `js/config.js`, then commit and push.
- [ ] **Step 4: Build the spike.** `index.html` loads `js/spike.js` as a module. On load:
  - If `?code=` is present: `completeLogin(code)`, then `history.replaceState` to drop the query.
  - If logged in: call `GET https://api.spotify.com/v1/me` and print "Logged in as <display_name>".
  - Otherwise: show a big "Log in with Spotify" button that sets `location.href = await beginLogin()`.
  - Print any error text on the page.
  - Push it.
- [ ] **Step 5: Nate tests on the iPad in Safari.** Expected: the Spotify login page renders, login succeeds, the page shows "Logged in as …", and a reload stays logged in. Record the result in the plan, in this step.
  - **If it works:** Task 5 shrinks to the "Send to iPad" link only, kept as a re-login convenience.
  - **If it fails:** Task 5 is required before the panel is usable.
- [ ] **Step 6: Commit** `spike: verify Spotify login on iOS 12 Safari`.

### Task 4: Spotify client, now-playing view model, play-from-idle

**Files:**
- Create: `js/spotify.js`, `js/now-playing.js`, `tests/spotify.test.js`, `tests/now-playing.test.js`, `tests/fixtures/playback-track.json`, `tests/fixtures/playback-episode.json`, `tests/fixtures/playback-ad.json`

**Interfaces:**
- Consumes: `getAccessToken({ force })` from Task 2.
- Produces:
  - `spotify.js`:
    - `class RateLimitError` (property `retryAfterSec`, set in the constructor), `class NetworkError`, `class NoDeviceError`
    - `createSpotify({ getAccessToken, fetch })` returning `getPlayback() -> Promise<object|null>`, `getDevices() -> Promise<Array>`, `play(deviceId?)`, `pause()`, `next()`, `previous()`, each `-> Promise<void>`
    - `playFromIdle(spotify) -> Promise<void>`
  - `now-playing.js`: `toNowPlaying(playback, pausedForMs) -> { state: 'playing'|'paused'|'idle', title: string, subtitle: string, artUrl: string|null }`

- [ ] **Step 1: Write failing tests.**
  - `spotify.test.js`, using a fake fetch:
    - `getPlayback` calls `GET https://api.spotify.com/v1/me/player?additional_types=episode` with `Authorization: Bearer <token>`.
    - A `204` response returns `null`.
    - On `401` it calls `getAccessToken({ force: true })` and retries once; a second `401` rejects.
    - `429` with `Retry-After: 7` rejects with `RateLimitError` where `retryAfterSec === 7`. **(Review Focus 4)**
    - When fetch itself rejects, it rejects with `NetworkError`. **(Review Focus 2)**
    - `next()` sends `POST /v1/me/player/next`, `previous()` sends `POST /v1/me/player/previous`, `pause()` sends `PUT /v1/me/player/pause`, and `play('d1')` sends `PUT /v1/me/player/play?device_id=d1`.
    - `playFromIdle`: picks the `is_active` device first, then the first `type === 'Smartphone'`, then the first device, and calls `play(id)`. An empty device list rejects with `NoDeviceError`. **(Review Focus 5)**
  - `now-playing.test.js`:
    - `null` → `{ state: 'idle', title: 'Nothing playing', subtitle: '', artUrl: null }`.
    - The track fixture with `is_playing: true` → `playing`, title = track name, subtitle = `"Artist A, Artist B · Album"`, artUrl = `album.images[0].url`.
    - The same fixture with `is_playing: false` and `pausedForMs = 0` → `paused`.
    - With `pausedForMs = 30*60*1000` → `idle`, but keeping the title, subtitle and art (shown dimmed).
    - The episode fixture → title = episode name, subtitle = `show.name`, art = `images[0].url`. **(Review Focus 3)**
    - The ad fixture (`item: null`, `currently_playing_type: 'ad'`) → title `'Advertisement'`, subtitle `''`, artUrl `null`. **(Review Focus 3)**
    - A track with `album.images: []` → `artUrl: null`. **(Review Focus 3)**
- [ ] **Step 2:** Run `npm test` and confirm the new tests FAIL.
- [ ] **Step 3:** Implement both modules per the Interfaces block. Error classes use ES2015 constructors (no class fields).
- [ ] **Step 4:** Run `npm test` and confirm all tests PASS.
- [ ] **Step 5: Commit** `feat: Spotify client and now-playing view model`.

### Task 5: Token transfer link ("Send to iPad")

**Files:**
- Create: `js/transfer.js`, `tests/transfer.test.js`

**Interfaces:**
- Produces: `buildTransferLink(baseUrl, refreshToken) -> string` (returns `baseUrl + '#rt=' + encodeURIComponent(rt)`) and `readTransferFragment(hash) -> string|null`.

- [ ] **Step 1: Write failing tests.**
  - The round trip `readTransferFragment(new URL(buildTransferLink(u, 'a/b+c=')).hash) === 'a/b+c='` holds.
  - `readTransferFragment('')`, `'#'` and `'#foo=1'` all return `null`.
- [ ] **Step 2:** Run the tests and confirm they FAIL.
- [ ] **Step 3:** Implement `js/transfer.js`.
- [ ] **Step 4:** Run the tests and confirm they PASS.
- [ ] **Step 5: Commit** `feat: refresh-token transfer link`.

The wiring for this lives in Task 6. On load, if `readTransferFragment(location.hash)` returns a token, call `importRefreshToken`, then `history.replaceState` to strip the hash. The settings screen shows a **Send to iPad** link with the text "Open this link in Safari on the iPad (AirDrop, Messages or email it to yourself)".

### Task 6: Panel UI, clock, weather and app wiring

**Files:**
- Create: `js/weather.js`, `js/clock.js`, `js/app.js`, `style.css`, `tests/weather.test.js`, `tests/clock.test.js`, `tests/fixtures/open-meteo.json`
- Modify: `index.html` (replace the spike), delete `js/spike.js`

**Interfaces:**
- Consumes: everything from Tasks 1, 2, 4 and 5.
- Produces:
  - `weather.js`:
    - `weatherUrl(lat, lon) -> string`. Open-Meteo `/v1/forecast` with `current=temperature_2m,weather_code`, `daily=weather_code,temperature_2m_max,temperature_2m_min`, `temperature_unit=fahrenheit`, `timezone=auto`, `forecast_days=4`.
    - `iconFor(code) -> { icon, label }`, using WMO codes: 0 ☀️ Clear; 1–2 🌤 Partly cloudy; 3 ☁️ Cloudy; 45/48 🌫 Fog; 51–67 and 80–82 🌧 Rain; 71–77 and 85–86 🌨 Snow; 95–99 ⛈ Storms; anything else ☁️.
    - `parseWeather(json) -> { now: { temp, icon, label }, hi, lo, days: [{ name, icon, hi }] }`. Temperatures are rounded integers; `days` is the next 3 days with names like `'Wed'`.
  - `clock.js`: `formatTime(date) -> '7:42 PM'`.

- [ ] **Step 1: Write failing tests.**
  - `weatherUrl(44.52, -88.02)` contains `latitude=44.52`, `longitude=-88.02` and `temperature_unit=fahrenheit`.
  - `iconFor(0).icon === '☀️'`, `iconFor(63).label === 'Rain'`, `iconFor(999).icon === '☁️'`.
  - `parseWeather(fixture)` returns the expected `now.temp`, `hi`, `lo` and a 3-item `days` with the correct weekday names. Take the fixture from a real Open-Meteo response saved during this task.
  - `formatTime(new Date(2026, 9, 25, 19, 42))` returns `'7:42 PM'`; for 00:05 it returns `'12:05 AM'`; for 12:00 it returns `'12:00 PM'`.
- [ ] **Step 2:** Run the tests and confirm they FAIL.
- [ ] **Step 3:** Implement `weather.js` and `clock.js`.
- [ ] **Step 4:** Run the tests and confirm they PASS.
- [ ] **Step 5: Build the UI.** Follow layout A from the spec. Element IDs: `#login`, `#btn-login`, `#panel`, `#art`, `#title`, `#subtitle`, `#btn-prev`, `#btn-play`, `#btn-next`, `#message`, `#time`, `#weather-now`, `#forecast`, `#btn-settings`, `#settings`, `#transfer-link`.
  - Dark background.
  - Square art about 45% of the width. Since `aspect-ratio` isn't allowed, set an explicit width and height in `vw`/`vh` for 1024×768.
  - Control buttons with at least 88px hit targets.
  - Title and subtitle clamp to 2 lines with ellipsis (`-webkit-line-clamp`).
  - A thin bottom strip.
  - The idle state adds a `.idle` class that dims the art and controls.
  - Use a placeholder gradient when `artUrl` is null.
- [ ] **Step 6: Write `app.js`.**
  - On load: handle `?code=` and `#rt=`. If not logged in, show `#login`.
  - Poll `getPlayback` every `POLL_MS` while `!document.hidden`. Track when the playback became paused so you can pass `pausedForMs`. Render only the fields that changed, and only swap `#art` src when the URL changes.
  - Any `AuthExpiredError` → show `#login`.
  - `RateLimitError` → skip polls for `retryAfterSec`.
  - `NetworkError` → keep the last render and retry next tick. **(Review Focus 1, 2, 4)**
  - Taps apply an optimistic UI change (for example, toggle the play icon) and the next poll confirms it.
  - Play while `state === 'idle'` calls `playFromIdle`. On `NoDeviceError` or any failure, show "Open Spotify on your phone" in `#message` for 8 s. **(Review Focus 5)**
  - Weather: fetch on load and every `WEATHER_MS`; on failure keep the last values.
  - Clock: update every 15 s.
  - `#btn-settings` (small and unobtrusive) toggles `#settings`, which has the transfer link (Task 5) and a Log out button.
- [ ] **Step 7: Verify in a browser.** Run `npx http-server -p 8080` (or `python -m http.server 8080`) and open http://127.0.0.1:8080 at 1024×768 in the Playwright browser (`browser_resize` 1024×768). Use `browser_evaluate` to stub `localStorage` and `fetch` with the fixtures, then screenshot each state: playing, paused, idle, ad, no-art, login.
  - Expected: matches layout A, no overflow, and long titles clamp.
  - Run `npm test`; all tests PASS.
- [ ] **Step 8: Commit** `feat: living room panel UI with weather` and push.

### Task 7: iPad setup guide and on-device check

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`.**
  - What it is, and the Pages URL.
  - How to create the Spotify app and redirect URI (for a rebuild).
  - The iPad setup steps from the spec: optional erase; speed settings; open in Safari and log in, or use Send to iPad; **don't** Add to Home Screen; Auto-Lock Never; Guided Access; battery care with a smart plug/timer.
  - `npm test` for development.
- [ ] **Step 2: Nate runs it on the iPad for real.** Checklist:
  - It shows the current track within about 5 s of playing on the phone.
  - Prev, play/pause and next all work.
  - The weather shows Green Bay in °F.
  - Turning the iPad's Wi-Fi off for 30 s and back on recovers without a reload.
  - Leaving the phone paused for over 30 min shows the dimmed idle state.
  - Record the results in this step.
- [ ] **Step 3: Commit** `docs: iPad setup guide` and push.
