// Moves a Spotify login to another device via a link. The token rides in the
// URL fragment, which browsers never send to the server.
export function buildTransferLink(baseUrl, refreshToken) {
  return baseUrl + '#rt=' + encodeURIComponent(refreshToken);
}

export function readTransferFragment(hash) {
  const match = /^#rt=(.+)$/.exec(hash || '');
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (e) {
    return null; // truncated or mangled link
  }
}
