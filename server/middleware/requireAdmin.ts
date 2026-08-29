import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/connection.js';
import { isGlobalAdmin, isDomainAdmin } from '../routes/adminAuth.js';

/**
 * The admin gate. Authorization comes from the SAME tables `/api/check-admin`
 * has always consulted (`admin_users` / `domain_admins`) — this adds no second
 * source of admin-ness. What it adds is the missing half: the caller must have
 * PROVED (via nostrAuthMiddleware) that it holds the key for the pubkey being
 * checked, instead of naming an admin's public hex id in a body field.
 */
export function isAdminPubkey(pubkey: string, domainKey: string | null | undefined): boolean {
  const db = getDb();
  if (isGlobalAdmin(db, pubkey)) return true;
  if (domainKey && isDomainAdmin(db, pubkey, domainKey)) return true;
  return false;
}

/** Refuses anyone who is not a proven global admin or admin of this domain. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void | Response {
  const pubkey = req.authedPubkey;

  if (!pubkey) {
    return res.status(401).json({
      data: null,
      error: { message: 'Authentication required: sign this request with your Nostr key.' }
    });
  }

  if (!isAdminPubkey(pubkey, req.domainKey)) {
    return res.status(403).json({ data: null, error: { message: 'Not authorized' } });
  }

  next();
}

/**
 * For operations an ordinary person legitimately performs ON THEMSELVES, and an
 * admin performs on someone else — publishing a plan, registering wallets.
 *
 * `getSubject` pulls the person the request acts upon out of the body. The
 * caller must either BE that person (proven) or be an admin.
 */
export function requireSelfOrAdmin(getSubject: (req: Request) => unknown) {
  return function selfOrAdmin(req: Request, res: Response, next: NextFunction): void | Response {
    const pubkey = req.authedPubkey;

    if (!pubkey) {
      return res.status(401).json({
        data: null,
        error: { message: 'Authentication required: sign this request with your Nostr key.' }
      });
    }

    const subject = getSubject(req);
    if (typeof subject === 'string' && subject.toLowerCase() === pubkey.toLowerCase()) {
      return next();
    }

    if (isAdminPubkey(pubkey, req.domainKey)) return next();

    return res.status(403).json({
      data: null,
      error: { message: 'Not authorized: you may only act on your own account.' }
    });
  };
}
