import { Request, Response, NextFunction } from 'express';
import { verifyEvent } from 'nostr-tools/pure';

declare global {
  namespace Express {
    interface Request {
      /**
       * Nostr pubkey (hex) the caller PROVED it controls, or null.
       * Never a value the caller merely claimed in a body field.
       */
      authedPubkey?: string | null;
    }
  }
}

// A signed auth event older/newer than this is refused, so a captured header
// cannot be replayed tomorrow.
const MAX_CLOCK_SKEW_SECONDS = 300;

// NIP-98 HTTP Auth
const HTTP_AUTH_KIND = 27235;

function tagValue(event: { tags?: string[][] }, name: string): string | undefined {
  return event.tags?.find((t) => Array.isArray(t) && t[0] === name)?.[1];
}

/**
 * Reads `Authorization: Nostr <base64 event>` and, if the event is a valid
 * NIP-98 auth event for THIS request, records the signing pubkey on
 * `req.authedPubkey`.
 *
 * Why this exists: `/api/check-admin` answers "is this hex id an admin?" — a
 * question the browser asks about itself. It proves nothing about the caller,
 * because a nostr pubkey is public. Membership in `admin_users` is therefore
 * only meaningful once the caller has proved it holds the matching private
 * key, which is what this middleware establishes.
 *
 * Never rejects a request on its own — it only records identity. Routes decide
 * what they require (see requireAdmin / requireSelfOrAdmin).
 */
export function nostrAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.authedPubkey = null;

  const header = req.headers['authorization'];
  if (!header || typeof header !== 'string' || !header.startsWith('Nostr ')) {
    next();
    return;
  }

  try {
    const decoded = Buffer.from(header.slice('Nostr '.length).trim(), 'base64').toString('utf8');
    const event = JSON.parse(decoded);

    if (!event || event.kind !== HTTP_AUTH_KIND) {
      next();
      return;
    }

    // Signature must be valid — this is the whole point.
    if (!verifyEvent(event)) {
      console.warn('[nostrAuth] rejected: bad signature');
      next();
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(event.created_at)) > MAX_CLOCK_SKEW_SECONDS) {
      console.warn('[nostrAuth] rejected: stale auth event');
      next();
      return;
    }

    // Bind the signature to this method + path, so an auth header captured on a
    // harmless endpoint cannot be replayed against a dangerous one.
    const signedMethod = (tagValue(event, 'method') || '').toUpperCase();
    if (signedMethod !== req.method.toUpperCase()) {
      console.warn('[nostrAuth] rejected: method mismatch');
      next();
      return;
    }

    const signedUrl = tagValue(event, 'u');
    if (!signedUrl) {
      next();
      return;
    }

    // Compare path + query only. Host/protocol vary behind the proxy and across
    // the country subdomains, and are not what we are binding to.
    let signedPath: string;
    try {
      const parsed = new URL(signedUrl, 'http://placeholder.invalid');
      signedPath = parsed.pathname + parsed.search;
    } catch {
      next();
      return;
    }

    if (signedPath !== req.originalUrl) {
      console.warn(`[nostrAuth] rejected: url mismatch (signed ${signedPath}, got ${req.originalUrl})`);
      next();
      return;
    }

    req.authedPubkey = event.pubkey;
  } catch (err) {
    // A malformed header is simply an unauthenticated request.
    console.warn('[nostrAuth] malformed Authorization header ignored');
  }

  next();
}
