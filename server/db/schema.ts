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

    CREATE TABLE IF NOT EXISTS domains (
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
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS domain_admins (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      domain_key TEXT NOT NULL REFERENCES domains(domain_key) ON DELETE CASCADE,
      nostr_hex_id TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(domain_key, nostr_hex_id)
    );

    CREATE TABLE IF NOT EXISTS faq_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      domain_key TEXT NOT NULL REFERENCES domains(domain_key) ON DELETE CASCADE,
      language TEXT NOT NULL DEFAULT 'en',
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS what_is_lana (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      domain_key TEXT NOT NULL REFERENCES domains(domain_key) ON DELETE CASCADE,
      language TEXT NOT NULL DEFAULT 'en',
      title TEXT NOT NULL,
      question1 TEXT,
      question2 TEXT,
      description TEXT,
      video_url TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(domain_key, language)
    );
  `);

  // Seed admin users
  const insertAdmin = db.prepare(`
    INSERT OR IGNORE INTO admin_users (nostr_hex_id, description)
    VALUES (?, ?)
  `);
  insertAdmin.run('56e8670aa65491f8595dc3a71c94aa7445dcdca755ca5f77c07218498a362061', 'Admin 1');
  insertAdmin.run('4f8735cf707b3980ff2ed284cda7c0fb4150cd1b137fc170a30aafd9d93e84d6', 'Admin 2');
  insertAdmin.run('ba8500d89a4e8ae475314079365f995ca221fb668ee7c63d147aa28f49838ff1', 'Global Admin AT');
  insertAdmin.run('e01368761feeb32a8fbc5b85502847ecdbbbcb1256ae35da268416c755982ca0', 'Global Admin UK/HU');

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

  // Add domain_key columns to existing tables (safe migration)
  try { db.exec('ALTER TABLE buy_lana ADD COLUMN domain_key TEXT REFERENCES domains(domain_key)'); } catch(e) { /* column already exists */ }
  try { db.exec('ALTER TABLE profiles ADD COLUMN domain_key TEXT REFERENCES domains(domain_key)'); } catch(e) { /* column already exists */ }
  try { db.exec('ALTER TABLE waiting_list ADD COLUMN domain_key TEXT REFERENCES domains(domain_key)'); } catch(e) { /* column already exists */ }

  // Add enrollment data columns to profiles (safe migration)
  try { db.exec('ALTER TABLE profiles ADD COLUMN enrollment_exchange_rate REAL'); } catch(e) { /* column already exists */ }
  try { db.exec('ALTER TABLE profiles ADD COLUMN enrollment_split INTEGER'); } catch(e) { /* column already exists */ }
  try { db.exec('ALTER TABLE profiles ADD COLUMN enrollment_currency TEXT'); } catch(e) { /* column already exists */ }
  try { db.exec("ALTER TABLE profiles ADD COLUMN is_previous_split_upgrade INTEGER DEFAULT 0"); } catch(e) { /* column already exists */ }

  // Add new columns to buy_lana (safe migration)
  try { db.exec("ALTER TABLE buy_lana ADD COLUMN split TEXT"); } catch(e) { /* column already exists */ }
  try { db.exec("ALTER TABLE buy_lana ADD COLUMN email TEXT"); } catch(e) { /* column already exists */ }
  try { db.exec("ALTER TABLE buy_lana ADD COLUMN status TEXT DEFAULT 'pending'"); } catch(e) { /* column already exists */ }

  // Migrate existing records to use status field (idempotent)
  // Records with tx → 'transferred'
  db.exec(`UPDATE buy_lana SET status = 'transferred' WHERE tx IS NOT NULL AND tx != '' AND (status IS NULL OR status = 'pending')`);
  // Records with paid_on_account but no tx → 'paid' (waiting for admin to approve)
  db.exec(`UPDATE buy_lana SET status = 'paid' WHERE paid_on_account IS NOT NULL AND paid_on_account != '' AND (tx IS NULL OR tx = '') AND (status IS NULL OR status = 'pending')`);
  // Records with no paid_on_account → ensure 'pending'
  db.exec(`UPDATE buy_lana SET status = 'pending' WHERE (paid_on_account IS NULL OR paid_on_account = '') AND (status IS NULL OR status = '')`);

  // International payments columns on domains (safe migration)
  try { db.exec("ALTER TABLE domains ADD COLUMN enable_international_payments INTEGER DEFAULT 0"); } catch(e) { /* column already exists */ }
  try { db.exec("ALTER TABLE domains ADD COLUMN intl_recipient_name TEXT"); } catch(e) { /* column already exists */ }
  try { db.exec("ALTER TABLE domains ADD COLUMN intl_bank_name TEXT"); } catch(e) { /* column already exists */ }
  try { db.exec("ALTER TABLE domains ADD COLUMN intl_bank_address TEXT"); } catch(e) { /* column already exists */ }
  try { db.exec("ALTER TABLE domains ADD COLUMN intl_iban TEXT"); } catch(e) { /* column already exists */ }
  try { db.exec("ALTER TABLE domains ADD COLUMN intl_swift TEXT"); } catch(e) { /* column already exists */ }

  // Seed domains
  const insertDomain = db.prepare(`
    INSERT OR IGNORE INTO domains (domain_key, hostname, display_name, currency_default)
    VALUES (?, ?, ?, ?)
  `);
  insertDomain.run('uk', 'uk.lana8wonder.com', 'United Kingdom', 'GBP');
  insertDomain.run('si', 'si.lana8wonder.com', 'Slovenia', 'EUR');
  insertDomain.run('hu', 'hu.lana8wonder.com', 'Hungary', 'EUR');
  insertDomain.run('at', 'at.lana8wonder.com', 'Austria', 'EUR');

  // Seed domain_admins
  const insertDomainAdmin = db.prepare(`
    INSERT OR IGNORE INTO domain_admins (domain_key, nostr_hex_id, description)
    VALUES (?, ?, ?)
  `);
  // e013... -> HU, UK
  insertDomainAdmin.run('hu', 'e01368761feeb32a8fbc5b85502847ecdbbbcb1256ae35da268416c755982ca0', 'Domain Admin HU');
  insertDomainAdmin.run('uk', 'e01368761feeb32a8fbc5b85502847ecdbbbcb1256ae35da268416c755982ca0', 'Domain Admin UK');
  // 56e8... -> UK, SI, AT
  insertDomainAdmin.run('uk', '56e8670aa65491f8595dc3a71c94aa7445dcdca755ca5f77c07218498a362061', 'Domain Admin UK');
  insertDomainAdmin.run('si', '56e8670aa65491f8595dc3a71c94aa7445dcdca755ca5f77c07218498a362061', 'Domain Admin SI');
  insertDomainAdmin.run('at', '56e8670aa65491f8595dc3a71c94aa7445dcdca755ca5f77c07218498a362061', 'Domain Admin AT');
  // 4f87... -> SI
  insertDomainAdmin.run('si', '4f8735cf707b3980ff2ed284cda7c0fb4150cd1b137fc170a30aafd9d93e84d6', 'Domain Admin SI');
  // ba85... -> AT
  insertDomainAdmin.run('at', 'ba8500d89a4e8ae475314079365f995ca221fb668ee7c63d147aa28f49838ff1', 'Domain Admin AT');

  // Migrate app_settings values to all domains (initial setup)
  db.exec(`
    UPDATE domains SET
      donation_wallet_id = COALESCE(donation_wallet_id, (SELECT setting_value FROM app_settings WHERE setting_key = 'donation_wallet_id')),
      donation_wallet_private_key = COALESCE(donation_wallet_private_key, (SELECT setting_value FROM app_settings WHERE setting_key = 'donation_wallet_id_PrivatKey')),
      contact_details = COALESCE(contact_details, (SELECT setting_value FROM app_settings WHERE setting_key = 'contact_details')),
      nostr_hex_id_buying_lanas = COALESCE(nostr_hex_id_buying_lanas, (SELECT setting_value FROM app_settings WHERE setting_key = 'nostr_hex_id_buying_lanas'))
    WHERE donation_wallet_id IS NULL OR donation_wallet_id = ''
  `);

  console.log('Database schema initialized with seed data');
}
