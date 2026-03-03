import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/connection.js';

const router = Router();

// ---------------------------------------------------------------------------
// Auth helper (reused pattern from domainConfig.ts)
// ---------------------------------------------------------------------------
function checkAdmin(db: ReturnType<typeof getDb>, nostrHexId: string, domainKey: string | undefined): boolean {
  if (!nostrHexId) return false;

  const isGlobalAdmin = db.prepare(
    'SELECT id FROM admin_users WHERE nostr_hex_id = ?'
  ).get(nostrHexId);
  if (isGlobalAdmin) return true;

  if (domainKey) {
    const isDomainAdmin = db.prepare(
      'SELECT id FROM domain_admins WHERE nostr_hex_id = ? AND domain_key = ?'
    ).get(nostrHexId, domainKey);
    if (isDomainAdmin) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// PUBLIC: GET /api/content/faq?language=en
// Returns FAQ items with fallback chain: domain+lang → domain+en → empty
// ---------------------------------------------------------------------------
router.get('/faq', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const language = (req.query.language as string) || 'en';

    if (!domainKey) {
      return res.json({ data: [], fallback: 'i18n', error: null });
    }

    // Try requested language
    let rows = db.prepare(
      'SELECT * FROM faq_items WHERE domain_key = ? AND language = ? AND active = 1 ORDER BY position ASC'
    ).all(domainKey, language);

    if (rows.length > 0) {
      return res.json({ data: rows, fallback: 'none', error: null });
    }

    // Fallback to English
    if (language !== 'en') {
      rows = db.prepare(
        'SELECT * FROM faq_items WHERE domain_key = ? AND language = ? AND active = 1 ORDER BY position ASC'
      ).all(domainKey, 'en');

      if (rows.length > 0) {
        return res.json({ data: rows, fallback: 'en', error: null });
      }
    }

    // No DB content — frontend will use i18n
    return res.json({ data: [], fallback: 'i18n', error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// ---------------------------------------------------------------------------
// PUBLIC: GET /api/content/what-is-lana?language=en
// Returns What is Lana content with fallback chain
// ---------------------------------------------------------------------------
router.get('/what-is-lana', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const language = (req.query.language as string) || 'en';

    if (!domainKey) {
      return res.json({ data: null, fallback: 'i18n', error: null });
    }

    // Try requested language
    let row = db.prepare(
      'SELECT * FROM what_is_lana WHERE domain_key = ? AND language = ? AND active = 1'
    ).get(domainKey, language);

    if (row) {
      return res.json({ data: row, fallback: 'none', error: null });
    }

    // Fallback to English
    if (language !== 'en') {
      row = db.prepare(
        'SELECT * FROM what_is_lana WHERE domain_key = ? AND language = ? AND active = 1'
      ).get(domainKey, 'en');

      if (row) {
        return res.json({ data: row, fallback: 'en', error: null });
      }
    }

    // No DB content — frontend will use i18n
    return res.json({ data: null, fallback: 'i18n', error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// ---------------------------------------------------------------------------
// ADMIN: GET /api/content/admin/faq?language=en
// Returns FAQ items for editing (no fallback — shows exact language data)
// ---------------------------------------------------------------------------
router.get('/admin/faq', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const language = (req.query.language as string) || 'en';

    if (!domainKey) {
      return res.json({ data: [], error: null });
    }

    const rows = db.prepare(
      'SELECT * FROM faq_items WHERE domain_key = ? AND language = ? ORDER BY position ASC'
    ).all(domainKey, language);

    return res.json({ data: rows, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// ---------------------------------------------------------------------------
// ADMIN: GET /api/content/admin/what-is-lana?language=en
// ---------------------------------------------------------------------------
router.get('/admin/what-is-lana', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const language = (req.query.language as string) || 'en';

    if (!domainKey) {
      return res.json({ data: null, error: null });
    }

    const row = db.prepare(
      'SELECT * FROM what_is_lana WHERE domain_key = ? AND language = ?'
    ).get(domainKey, language);

    return res.json({ data: row || null, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// ---------------------------------------------------------------------------
// ADMIN: POST /api/content/faq — create new FAQ item
// ---------------------------------------------------------------------------
router.post('/faq', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const { nostr_hex_id, question, answer, language, position, active } = req.body;

    if (!domainKey) {
      return res.status(400).json({ data: null, error: { message: 'No domain context' } });
    }

    if (!checkAdmin(db, nostr_hex_id, domainKey)) {
      return res.status(403).json({ data: null, error: { message: 'Not authorized' } });
    }

    const id = crypto.randomUUID();
    const lang = language || 'en';

    // Auto-set position to last if not provided
    const maxPos = db.prepare(
      'SELECT MAX(position) as maxPos FROM faq_items WHERE domain_key = ? AND language = ?'
    ).get(domainKey, lang) as { maxPos: number | null } | undefined;
    const pos = position ?? ((maxPos?.maxPos ?? -1) + 1);

    db.prepare(
      'INSERT INTO faq_items (id, domain_key, language, question, answer, position, active) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, domainKey, lang, question || '', answer || '', pos, active ?? 1);

    const row = db.prepare('SELECT * FROM faq_items WHERE id = ?').get(id);
    return res.json({ data: row, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// ---------------------------------------------------------------------------
// ADMIN: PUT /api/content/faq/:id — update FAQ item
// ---------------------------------------------------------------------------
router.put('/faq/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const { id } = req.params;
    const { nostr_hex_id, question, answer, position, active } = req.body;

    if (!domainKey) {
      return res.status(400).json({ data: null, error: { message: 'No domain context' } });
    }

    if (!checkAdmin(db, nostr_hex_id, domainKey)) {
      return res.status(403).json({ data: null, error: { message: 'Not authorized' } });
    }

    const setCols: string[] = [];
    const setParams: unknown[] = [];

    if (question !== undefined) { setCols.push('"question" = ?'); setParams.push(question); }
    if (answer !== undefined) { setCols.push('"answer" = ?'); setParams.push(answer); }
    if (position !== undefined) { setCols.push('"position" = ?'); setParams.push(position); }
    if (active !== undefined) { setCols.push('"active" = ?'); setParams.push(active); }
    setCols.push('"updated_at" = datetime(\'now\')');

    if (setCols.length <= 1) {
      return res.status(400).json({ data: null, error: { message: 'No fields to update' } });
    }

    db.prepare(`UPDATE faq_items SET ${setCols.join(', ')} WHERE id = ? AND domain_key = ?`).run(...setParams, id, domainKey);

    const row = db.prepare('SELECT * FROM faq_items WHERE id = ?').get(id);
    return res.json({ data: row, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// ---------------------------------------------------------------------------
// ADMIN: PUT /api/content/faq-reorder — bulk update positions
// ---------------------------------------------------------------------------
router.put('/faq-reorder', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const { nostr_hex_id, items } = req.body;

    if (!domainKey) {
      return res.status(400).json({ data: null, error: { message: 'No domain context' } });
    }

    if (!checkAdmin(db, nostr_hex_id, domainKey)) {
      return res.status(403).json({ data: null, error: { message: 'Not authorized' } });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({ data: null, error: { message: 'items array required' } });
    }

    const updateStmt = db.prepare(
      'UPDATE faq_items SET position = ?, updated_at = datetime(\'now\') WHERE id = ? AND domain_key = ?'
    );

    const transaction = db.transaction(() => {
      for (const item of items) {
        updateStmt.run(item.position, item.id, domainKey);
      }
    });
    transaction();

    return res.json({ data: { updated: items.length }, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// ---------------------------------------------------------------------------
// ADMIN: DELETE /api/content/faq/:id — delete FAQ item
// ---------------------------------------------------------------------------
router.delete('/faq/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const { id } = req.params;
    const nostr_hex_id = (req.query.nostr_hex_id as string) || req.body?.nostr_hex_id;

    if (!domainKey) {
      return res.status(400).json({ data: null, error: { message: 'No domain context' } });
    }

    if (!checkAdmin(db, nostr_hex_id, domainKey)) {
      return res.status(403).json({ data: null, error: { message: 'Not authorized' } });
    }

    const row = db.prepare('SELECT * FROM faq_items WHERE id = ? AND domain_key = ?').get(id, domainKey);
    db.prepare('DELETE FROM faq_items WHERE id = ? AND domain_key = ?').run(id, domainKey);

    return res.json({ data: row, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// ---------------------------------------------------------------------------
// ADMIN: POST /api/content/what-is-lana — upsert What is Lana content
// ---------------------------------------------------------------------------
router.post('/what-is-lana', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;
    const { nostr_hex_id, language, title, question1, question2, description, video_url } = req.body;

    if (!domainKey) {
      return res.status(400).json({ data: null, error: { message: 'No domain context' } });
    }

    if (!checkAdmin(db, nostr_hex_id, domainKey)) {
      return res.status(403).json({ data: null, error: { message: 'Not authorized' } });
    }

    const lang = language || 'en';
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO what_is_lana (id, domain_key, language, title, question1, question2, description, video_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(domain_key, language) DO UPDATE SET
        title = excluded.title,
        question1 = excluded.question1,
        question2 = excluded.question2,
        description = excluded.description,
        video_url = excluded.video_url,
        updated_at = datetime('now')
    `).run(id, domainKey, lang, title || '', question1 || '', question2 || '', description || '', video_url || '');

    const row = db.prepare(
      'SELECT * FROM what_is_lana WHERE domain_key = ? AND language = ?'
    ).get(domainKey, lang);

    return res.json({ data: row, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

export default router;
