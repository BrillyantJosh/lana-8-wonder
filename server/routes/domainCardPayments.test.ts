import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { initializeSchema } from '../db/schema.js';
import { buildFallbackDomainConfig } from './domainConfig.js';

/**
 * Turning the credit card off is a per-domain decision. What must NOT happen is
 * a deploy making that decision for everybody: one domain takes most of its
 * orders by card, and the column's neighbour (enable_international_payments)
 * defaults to 0, so copying that pattern would have switched the card off on
 * all four domains at once.
 */
test('every seeded domain comes out of the migration with the card ON', () => {
  const db = new Database(':memory:');
  try {
    initializeSchema(db);

    const rows = db
      .prepare('SELECT domain_key, enable_card_payments FROM domains ORDER BY domain_key')
      .all() as Array<{ domain_key: string; enable_card_payments: number }>;

    assert.deepEqual(
      rows.map((r) => r.domain_key),
      ['at', 'hu', 'si', 'uk'],
      'the four domains that have their own key'
    );
    for (const row of rows) {
      assert.equal(row.enable_card_payments, 1, `${row.domain_key} must keep the card`);
    }
  } finally {
    db.close();
  }
});

/**
 * The same has to hold for a database that already existed before this change:
 * the column arrives by ALTER TABLE, and its default is what every row already
 * in the table gets.
 */
test('a domain row written before the column existed also gets the card ON', () => {
  const db = new Database(':memory:');
  try {
    // A `domains` table exactly as production carried it before this change:
    // every column it had, including the international ones, and no card
    // column. initializeSchema then takes the upgrade path a live database
    // takes — CREATE TABLE IF NOT EXISTS does nothing, and the row is reached
    // only by the ALTER.
    db.exec(`
      CREATE TABLE domains (
        domain_key TEXT PRIMARY KEY,
        hostname TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        donation_wallet_id TEXT,
        donation_wallet_private_key TEXT,
        contact_details TEXT,
        payment_link TEXT,
        nostr_hex_id_buying_lanas TEXT,
        currency_default TEXT DEFAULT 'EUR',
        show_slots_on_landing_page TEXT DEFAULT 'true',
        enable_buy_lana INTEGER DEFAULT 1,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        enable_international_payments INTEGER DEFAULT 0,
        intl_recipient_name TEXT,
        intl_bank_name TEXT,
        intl_bank_address TEXT,
        intl_iban TEXT,
        intl_swift TEXT
      );
    `);
    db.prepare('INSERT INTO domains (domain_key, hostname, display_name) VALUES (?, ?, ?)')
      .run('si', 'si.lana8wonder.com', 'Slovenia');

    initializeSchema(db);

    const row = db
      .prepare('SELECT enable_card_payments FROM domains WHERE domain_key = ?')
      .get('si') as { enable_card_payments: number };
    assert.equal(row.enable_card_payments, 1);
  } finally {
    db.close();
  }
});

/**
 * lana8wonder.com and www.lana8wonder.com carry no domain_key, so they never
 * read a `domains` row and no switch in admin settings can reach them. Their
 * answer therefore has to be the safe one — a flag they cannot be given must
 * not cost them a payment method.
 */
test('a hostname with no domain key is told the card is ON', () => {
  const fallback = buildFallbackDomainConfig({});
  assert.equal(fallback.domain_key, null);
  assert.equal(fallback.enable_card_payments, 1);
});
