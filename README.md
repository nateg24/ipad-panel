# Living Room Panel

A Spotify remote and weather display for an old iPad mini 2 (iOS 12). It runs in Safari at
**https://nateg24.github.io/ipad-panel/**.

Spotify keeps playing on your phone; the iPad just shows what's playing and sends
previous / play-pause / next. Weather is Green Bay, WI, from [Open-Meteo](https://open-meteo.com/).

## Logging in on the iPad

Spotify's login page doesn't work in iOS 12 Safari, so log in somewhere else and send it over:

1. On your phone or computer, open the page above and tap **Log in with Spotify**.
2. Tap **⚙︎** (bottom right), then **Move login to iPad**. That device logs out and shows a link.
3. Long-press the link and share it to the iPad (AirDrop, Messages or email), then open it in **Safari** on the iPad.
4. Delete the message or email: the link contains your Spotify login. Safari may also keep it in History.

Don't use Add to Home Screen: a Home Screen app on iOS 12 has its own storage and won't see the login.

## iPad setup

- **Speed:** Settings → Accessibility → Reduce Motion on, Reduce Transparency on.
  Settings → General → Background App Refresh off. Siri & Search: suggestions off.
- **Stay on:** Settings → Display & Brightness → Auto-Lock → Never.
- **Lock it to the panel:** Settings → General → Accessibility → Guided Access → on, set a passcode.
  Open the panel in Safari, triple-click the Home button, tap **Start**. Triple-click again to exit.
- **Battery care:** it's a 2013 battery. Put the charger on a smart plug or timer so it isn't held
  at 100% around the clock, and stop using it if the screen starts lifting.

## Spotify app (only needed for a rebuild)

The Client ID in `js/config.js` comes from an app at https://developer.spotify.com/dashboard with
**Web API** enabled and redirect URI `https://nateg24.github.io/ipad-panel/` (trailing slash included).
The Client ID isn't secret; there is no client secret in this project.

## Development

Plain HTML/CSS/JS modules, no build step. The code must stay within what iOS 12 Safari supports:
ES2017 syntax, no flexbox gaps, no aspect-ratio. `npm test` checks both.

```
npm install
npm test
python -m http.server 8080   # then open http://127.0.0.1:8080
```
