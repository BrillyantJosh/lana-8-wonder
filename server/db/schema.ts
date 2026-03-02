import Database from 'better-sqlite3';

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      nostr_hex_id TEXT UNIQUE NOT NULL,
      wallet_registered INTEGER DEFAULT 0,
      tx TEXT,
      published_plan INTEGER DEFAULT 0,
      selected_wallet TEXT,
      allowed_upgrade INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      wallet_type TEXT,
      position INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(profile_id, wallet_address)
    );

    CREATE TABLE IF NOT EXISTS buy_lana (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      lana_wallet_id TEXT,
      lana_amount REAL,
      payee TEXT,
      reference TEXT,
      payment_method TEXT,
      phone_number TEXT,
      paid_on_account TEXT,
      tx TEXT,
      currency TEXT,
      payment_amount REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS waiting_list (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      email TEXT,
      phone_number TEXT,
      first_name TEXT,
      last_name TEXT,
      address TEXT,
      nostr_hex_id TEXT,
      wallet_id TEXT,
      has_wallet INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notified_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      nostr_hex_id TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed admin users
  const insertAdmin = db.prepare(`
    INSERT OR IGNORE INTO admin_users (nostr_hex_id, description)
    VALUES (?, ?)
  `);
  insertAdmin.run('56e8670aa65491f8595dc3a71c94aa7445dcdca755ca5f77c07218498a362061', 'Admin 1');
  insertAdmin.run('4f8735cf707b3980ff2ed284cda7c0fb4150cd1b137fc170a30aafd9d93e84d6', 'Admin 2');

  // Seed default app_settings keys
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO app_settings (setting_key, setting_value, description)
    VALUES (?, ?, ?)
  `);
  insertSetting.run('main_publisher_private_key', '', 'Nostr signing key for publishing plans');
  insertSetting.run('donation_wallet_id', '', 'LANA donation wallet address');
  insertSetting.run('donation_wallet_id_PrivatKey', '', 'WIF private key for donation wallet');
  insertSetting.run('contact_details', '', 'Contact details for buyers');
  insertSetting.run('nostr_hex_id_buying_lanas', '', 'Nostr hex ID for buying LANA');
  insertSetting.run('webpage', '', 'Webpage URL');
  insertSetting.run('show_lots_on_landing_page', 'true', 'Show available slots on landing page');
  insertSetting.run('effective_exchange_rate', '', 'Current effective exchange rate');

  console.log('Database schema initialized with seed data');
}
