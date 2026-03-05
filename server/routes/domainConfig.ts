import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';

const router = Router();

// GET /api/domain-config - returns public domain config (never private key)
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;

    if (domainKey) {
      const domain = db.prepare(`
        SELECT domain_key, hostname, display_name, donation_wallet_id,
               contact_details, payment_link, nostr_hex_id_buying_lanas,
               currency_default, show_slots_on_landing_page, enable_buy_lana, active,
               CASE WHEN donation_wallet_private_key IS NOT NULL AND donation_wallet_private_key != '' THEN 1 ELSE 0 END as has_private_key
        FROM domains WHERE domain_key = ?
      `).get(domainKey);

      if (domain) {
        return res.json({ data: domain, error: null });
      }
    }

    // Fallback to app_settings for backward compat
    const settings = db.prepare(`
      SELECT setting_key, setting_value FROM app_settings
      WHERE setting_key IN ('donation_wallet_id', 'contact_details', 'nostr_hex_id_buying_lanas', 'webpage', 'show_lots_on_landing_page')
    `).all() as Array<{ setting_key: string; setting_value: string }>;

    const config: Record<string, string> = {};
    for (const s of settings) {
      config[s.setting_key] = s.setting_value;
    }

    return res.json({
      data: {
        domain_key: null,
        display_name: 'Lana8Wonder',
        donation_wallet_id: config.donation_wallet_id || '',
        contact_details: config.contact_details || '',
        nostr_hex_id_buying_lanas: config.nostr_hex_id_buying_lanas || '',
        currency_default: 'EUR',
        show_slots_on_landing_page: config.show_lots_on_landing_page || 'true',
        payment_link: '',
      },
      error: null
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// PUT /api/domain-config - update domain config (domain admins only)
router.put('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const { nostr_hex_id, ...updates } = req.body;

    if (!domainKey) {
      return res.status(400).json({ data: null, error: { message: 'No domain context' } });
    }

    if (!nostr_hex_id) {
      return res.status(400).json({ data: null, error: { message: 'nostr_hex_id required for auth' } });
    }

    // Check admin permission: domain_admins OR global admin_users
    const isDomainAdmin = db.prepare(
      'SELECT id FROM domain_admins WHERE nostr_hex_id = ? AND domain_key = ?'
    ).get(nostr_hex_id, domainKey);

    const isGlobalAdmin = db.prepare(
      'SELECT id FROM admin_users WHERE nostr_hex_id = ?'
    ).get(nostr_hex_id);

    if (!isDomainAdmin && !isGlobalAdmin) {
      return res.status(403).json({ data: null, error: { message: 'Not authorized' } });
    }

    // Allowed fields to update
    const allowedFields = [
      'donation_wallet_id', 'donation_wallet_private_key', 'contact_details',
      'payment_link', 'nostr_hex_id_buying_lanas', 'currency_default',
      'show_slots_on_landing_page', 'enable_buy_lana'
    ];

    const setCols: string[] = [];
    const setParams: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        // Skip empty private key to preserve existing value
        if (key === 'donation_wallet_private_key' && (!value || (value as string).trim() === '')) {
          continue;
        }
        setCols.push(`"${key}" = ?`);
        setParams.push(value);
      }
    }

    if (setCols.length === 0) {
      return res.status(400).json({ data: null, error: { message: 'No valid fields to update' } });
    }

    setCols.push(`"updated_at" = datetime('now')`);

    const sql = `UPDATE domains SET ${setCols.join(', ')} WHERE domain_key = ?`;
    db.prepare(sql).run(...setParams, domainKey);

    // Return updated config (without private key, but with has_private_key flag)
    const updated = db.prepare(`
      SELECT domain_key, hostname, display_name, donation_wallet_id,
             contact_details, payment_link, nostr_hex_id_buying_lanas,
             currency_default, show_slots_on_landing_page, enable_buy_lana, active,
             CASE WHEN donation_wallet_private_key IS NOT NULL AND donation_wallet_private_key != '' THEN 1 ELSE 0 END as has_private_key
      FROM domains WHERE domain_key = ?
    `).get(domainKey);

    return res.json({ data: updated, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

export default router;
