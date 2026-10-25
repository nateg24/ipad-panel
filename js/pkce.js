const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function randomVerifier(cryptoObj) {
  const bytes = cryptoObj.getRandomValues(new Uint8Array(64));
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += UNRESERVED[bytes[i] % UNRESERVED.length];
  return out;
}

export async function codeChallenge(verifier, subtle) {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
