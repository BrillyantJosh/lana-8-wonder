import { finalizeEvent } from 'nostr-tools/pure';

/**
 * Proof that the caller holds the private key behind its nostr identity.
 *
 * The server used to accept a plain `nostr_hex_id` in the request body as
 * "authentication". A nostr pubkey is public, so that asked the caller to name
 * an admin rather than to be one. Every privileged request now carries a
 * NIP-98 auth event signed with the key already in the session, and the server
 * verifies the signature before it consults admin_users / domain_admins.
 */

const HTTP_AUTH_KIND = 27235;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function getSessionPrivateKey(): string | null {
  try {
    const raw = sessionStorage.getItem('lana_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    const key = session?.privateKeyHex;
    return typeof key === 'string' && key.length === 64 ? key : null;
  } catch {
    return null;
  }
}

/**
 * Builds the Authorization header for one request. Returns {} when nobody is
 * logged in — public endpoints keep working for anonymous visitors, and the
 * server decides what it requires.
 *
 * `url` must be the exact URL being fetched: the signature is bound to the
 * path and query, so a header cannot be lifted onto a different endpoint.
 */
export function nostrAuthHeaders(url: string, method: string): Record<string, string> {
  const privateKeyHex = getSessionPrivateKey();
  if (!privateKeyHex) return {};

  try {
    const absolute = new URL(url, window.location.origin);
    const signed = finalizeEvent(
      {
        kind: HTTP_AUTH_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['u', absolute.pathname + absolute.search],
          ['method', method.toUpperCase()],
        ],
        content: '',
      },
      hexToBytes(privateKeyHex)
    );

    return { Authorization: `Nostr ${btoa(JSON.stringify(signed))}` };
  } catch (err) {
    console.error('[nostrAuth] could not sign request:', err);
    return {};
  }
}
