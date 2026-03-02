import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { getDb } from '../db/connection.js';

const router = Router();

export function isGlobalAdmin(db: Database.Database, nostrHexId: string): boolean {
  const row = db.prepare('SELECT id FROM admin_users WHERE nostr_hex_id = ?').get(nostrHexId);
  return !!row;
}

export function isDomainAdmin(db: Database.Database, nostrHexId: string, domainKey: string): boolean {
  const row = db.prepare(
    'SELECT id FROM domain_admins WHERE nostr_hex_id = ? AND domain_key = ?'
  ).get(nostrHexId, domainKey);
  return !!row;
}

export function getAdminDomains(db: Database.Database, nostrHexId: string): string[] {
  const rows = db.prepare('SELECT domain_key FROM domain_admins WHERE nostr_hex_id = ?').all(nostrHexId) as Array<{ domain_key: string }>;
  return rows.map(r => r.domain_key);
}

// POST /api/check-admin
// Body: { nostr_hex_id: string }
// Returns: { isGlobalAdmin: boolean, isDomainAdmin: boolean, domainKeys: string[] }
router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { nostr_hex_id } = req.body;

    if (!nostr_hex_id) {
      return res.status(400).json({ data: null, error: { message: 'nostr_hex_id is required' } });
    }

    const globalAdmin = isGlobalAdmin(db, nostr_hex_id);
    const domainKeys = getAdminDomains(db, nostr_hex_id);
    const currentDomainAdmin = req.domainKey
      ? domainKeys.includes(req.domainKey)
      : false;

    return res.json({
      data: {
        isGlobalAdmin: globalAdmin,
        isDomainAdmin: currentDomainAdmin,
        domainKeys,
        currentDomain: req.domainKey || null
      },
      error: null
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

export default router;
