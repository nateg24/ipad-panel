# Living Room Panel: Design

Date: 2026-10-25
Status: draft, awaiting approval

## Intent

Nate has an old iPad mini 2 (ME276LL/A, 16 GB, Wi-Fi, iOS 12.5.8, the final iOS for that hardware). He wants it to sit in the living room as a **Spotify remote with weather**, so he stops reaching for his phone every time he wants to skip or pause.

Current audio setup: Spotify plays **on his phone**, which streams over Bluetooth to a Bluetooth-capable turntable, which feeds a home theater system (two speakers and a sub). The phone stays the player. The iPad only sends commands and shows what's playing.

He has Spotify **Premium**, which the Spotify Web API requires for playback-control endpoints.

## Goals

- Show what's playing on Nate's Spotify account: album art, track, artist, album.
- Previous / play-pause / next buttons, large enough to hit from a glance.
- Time, current weather, and a short (about 3-day) forecast in a strip along the bottom.
- Runs all day on the iPad without babysitting: stays logged in and recovers on its own from network blips and expired tokens.
- Doesn't depend on Nate's PC being switched on.

## Non-goals

- Volume control. Spotify usually rejects volume commands for phone devices, and the home theater remote handles volume. (Claude's call, accepted by Nate.)
- Browsing, search, playlists, queue management.
- Multiple Spotify accounts or user switching.
- The iPad playing audio itself.
- Smart home control, calendar, photos.

## Anti-goals (failure even if it technically works)

- Buttons too small or laggy to use from the couch.
- Needing to log in again regularly.
- Needing the PC to be on.
- Sluggish on the iPad's A7 / 1 GB RAM: no heavy frameworks or constant animation.

## Layout (chosen: "A. Music first")

The iPad sits sideways (landscape), 1024×768 CSS px, with a dark background.

- **Main area:** album art on the left (about 45% width, square). On the right: track title, then artist · album, then the prev / play-pause / next row, all vertically centered.
- **Bottom strip** (thin, separated by a hairline): the time on the left, current conditions + temperature + today's high/low in the middle, and a 3-day mini forecast on the right.
- **Nothing playing** (no active device, or paused for a long time): the music area dims and shows "Nothing playing" (or the last track, dimmed). Clock and weather stay. When playback starts on the phone, the player returns within one poll interval. (Claude's call, accepted by Nate.)

The mockup Nate picked is at `.superpowers/brainstorm/1598-1792952756/content/layout.html` (option A).

## Constraints

### iPad / iOS 12.5.8 Safari (hard constraints)
- **No build step that emits modern syntax.** Plain ES2017 at most. No optional chaining (`?.`), no nullish coalescing (`??`), no class fields, no top-level await.
- **CSS:** no flexbox `gap` (Safari 14.1+), no `aspect-ratio` (Safari 15+). Grid `gap` is fine. Use margins or padding for flex spacing.
- **Runs in a regular Safari tab, not as a Home Screen web app.** On iOS 12 a Home Screen app has its own `localStorage`, separate from Safari's, and an OAuth redirect from inside it lands back in Safari, so the login would never reach the app. A Safari tab locked with Guided Access avoids this. The small Safari address bar is the accepted cost; hide what chrome you can (e.g. `minimal-ui` viewport hint, scroll-to-hide). (Claude's call, from the builder check.)
- Keep it light: no React or other framework, and minimal DOM churn on each poll.

### Spotify
- **Authorization Code flow with PKCE**, entirely client-side (no backend). The client ID is not a secret and can live in the repo. PKCE needs `crypto.subtle.digest('SHA-256')`, which Safari 12 supports in a secure (HTTPS) context.
- Scopes: `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`.
- Nate creates the Spotify developer app himself (Development mode is fine for one user). The redirect URI must be the HTTPS hosted page.
- Store the refresh token in `localStorage`, and save the rotated refresh token every time it's refreshed.
- Poll `GET /me/player` every few seconds while visible. Handle `204` / no active device as the "nothing playing" state. Handle `401` (refresh token), `429` (back off per `Retry-After`) and network errors (keep the last state on screen and retry quietly).
- Control endpoints: `POST /me/player/previous`, `/next`, `PUT /me/player/play`, `/pause`. Update the UI right away after a tap, then let the next poll confirm it.
- **Known risk:** Spotify's login page (accounts.spotify.com) may not render or work in iOS 12 Safari. **Spike this first.** If it fails, the fallback is to log in on another device's browser at the same hosted page, then move the refresh token to the iPad's Safari by some low-typing method with **no backend** (e.g. copy/paste via Universal Clipboard, or a link containing the token in the URL fragment opened in the iPad's Safari). The builder picks the method, but it must not require typing a long token by hand.
- **Play from idle:** if `/me/player` reports no active device, the play button looks up `GET /me/player/devices` and tries to resume on the most recent phone device by ID. If that fails, show a short message ("Open Spotify on your phone") instead of failing silently. (Claude's call, from the builder check.)

### Weather
- Open-Meteo (free, no key). Location set once in a config at the top of the code, **rounded to city level** (about 2 decimal places or the city center), because the repo will be public on GitHub Pages. Location: **Green Bay, WI** (ZIP 54303), so use about lat 44.52, lon -88.02. Refresh every 15 to 30 minutes. US units: °F and a 12-hour clock. (Claude's call, from the builder check.)

### Hosting
- Static site on GitHub Pages under Nate's **personal** GitHub account (not a work account), in a public repo. HTTPS, free, no PC needed. Plain HTML/CSS/JS files. The Pages URL (which becomes the Spotify redirect URI) depends on his GitHub username, which gets confirmed at setup time.
- Nothing secret goes in the repo: no tokens, no email addresses, no exact home location.

## iPad setup (part of the deliverable, written as steps for Nate)
1. Optional: Erase All Content and Settings, then set up as new.
2. Speed settings: Reduce Motion, Reduce Transparency, Background App Refresh off, Siri suggestions off.
3. Open the page in Safari and log in to Spotify (or use the fallback transfer). Don't use Add to Home Screen.
4. Auto-Lock: Never. Guided Access on, locked to Safari on the panel page.
5. Battery care: a smart plug or timer so it isn't held at 100% forever (it's a 2013 battery, so watch for swelling).

## Left to the builder
- File structure, polling interval (around 3 to 5 s), exact typography and colors (dark theme; Spotify green accent is fine).
- Weather icon approach (emoji or inline SVG; no icon fonts from CDNs that may not support Safari 12).
- Exact transfer method for the login fallback, within the constraint above.
- Whether to pause polling when the page is hidden.
