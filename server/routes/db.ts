import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/connection.js';
import { isAdminPubkey } from '../middleware/requireAdmin.js';

const router = Router();

// Tables reachable over HTTP. `app_settings` and `waiting_list` were removed on
// 2026-08-29: no frontend code has ever queried them through this router, and
// app_settings stores `main_publisher_private_key` and
// `donation_wallet_id_PrivatKey` — GET /api/db/app_settings handed those out to
// anyone who asked. Server code still reads the table directly.
const ALLOWED_TABLES = [
  'profiles',
  'wallets',
  'buy_lana',
  'admin_users',
  'domains',
  'domain_admins',
  'faq_items',
  'what_is_lana',
] as const;

// Writing to these decides who is an admin, or rewrites a domain's payout
// wallet. A write here by an outsider would hand them the keys to everything
// else, so it takes a proven admin.
const ADMIN_WRITE_TABLES = ['admin_users', 'domain_admins', 'domains'] as const;

// Columns that must never leave the server. `domains.donation_wallet_private_key`
// is the WIF that spends the domain's donation wallet; /api/domain-config has
// always been careful to return only a has_private_key flag, but this generic
// router would happily SELECT * and include the key itself.
const SECRET_COLUMNS: Record<string, readonly string[]> = {
  domains: ['donation_wallet_private_key'],
};

// Columns of a partly-public table that a caller who has NOT proved it is an
// admin may read. `domains` also carries the bank account money is wired to
// (intl_iban / intl_swift / intl_bank_name / intl_recipient_name), the
// operator's personal contact line and the payment link. GET /api/db/domains
// takes no domain filter, so ONE unauthenticated request returned every
// domain's row — a bank account and a phone number for anyone who asked.
//
// The public pages read exactly one column from this table:
// `donation_wallet_id`, to confirm where a donation is about to go
// (PreviewLana8Wonder, SendLana8WonderTransfer). The buy flow's payment
// details do NOT come from here — they come from /api/domain-config, which
// serves the single domain the buyer is on, and which still serves them to an
// anonymous buyer because the buyer must read them to pay.
const PUBLIC_COLUMNS: Record<string, readonly string[]> = {
  domains: [
    'domain_key',
    'hostname',
    'display_name',
    'donation_wallet_id',
    'currency_default',
    'show_slots_on_landing_page',
    'enable_buy_lana',
    'active',
  ],
};

const DOMAIN_SCOPED_TABLES = ['buy_lana', 'faq_items', 'what_is_lana'] as const;

function isAdminWriteTable(table: string): boolean {
  return (ADMIN_WRITE_TABLES as readonly string[]).includes(table);
}

/**
 * Drops the columns that must never leave the server, and — when `publicCols`
 * is given — every column outside the public set.
 *
 * Applied to the RESPONSE rather than to the SQL on purpose: whichever handler
 * built the row, and however it selected its columns, what goes out is filtered
 * here. A handler that falls back to SELECT * cannot leak past it.
 */
function project(table: string, data: unknown, publicCols?: readonly string[]): unknown {
  const secrets = SECRET_COLUMNS[table];
  if (!secrets && !publicCols) return data;
  if (data === null || data === undefined) return data;

  const scrub = (row: unknown): unknown => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const copy = { ...(row as Record<string, unknown>) };
    for (const col of secrets ?? []) delete copy[col];
    if (publicCols) {
      for (const col of Object.keys(copy)) {
        if (!publicCols.includes(col)) delete copy[col];
      }
    }
    return copy;
  };

  return Array.isArray(data) ? data.map(scrub) : scrub(data);
}

function isDomainScoped(table: string): boolean {
  return (DOMAIN_SCOPED_TABLES as readonly string[]).includes(table);
}

type AllowedTable = (typeof ALLOWED_TABLES)[number];

function isAllowedTable(table: string): table is AllowedTable {
  return ALLOWED_TABLES.includes(table as AllowedTable);
}

// Convert JavaScript booleans to SQLite-compatible integers (0/1)
function sanitizeValues(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = typeof val === 'boolean' ? (val ? 1 : 0) : val;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WhereClause {
  conditions: string[];
  params: unknown[];
}

/**
 * Parse query-string parameters into WHERE conditions and bound params.
 *
 * Supported patterns:
 *   eq_<col>=<val>          ->  col = ?
 *   is_<col>=null           ->  col IS NULL
 *   not_<col>_is_null=true  ->  col IS NOT NULL
 *   in_<col>=val1,val2      ->  col IN (?, ?, ...)
 *   gte_<col>=val           ->  col >= ?
 */
function buildWhere(query: Record<string, unknown>): WhereClause {
  const conditions: string[] = [];
  const params: unknown[] = [];

  for (const [key, rawValue] of Object.entries(query)) {
    const value = String(rawValue);

    // eq_<col>=<val>
    if (key.startsWith('eq_')) {
      const col = key.slice(3);
      conditions.push(`"${col}" = ?`);
      params.push(value);
      continue;
    }

    // is_<col>=null
    if (key.startsWith('is_')) {
      const col = key.slice(3);
      if (value === 'null') {
        conditions.push(`"${col}" IS NULL`);
      }
      continue;
    }

    // not_<col>_is_null=true  (col IS NOT NULL)
    if (key.startsWith('not_') && key.endsWith('_is_null')) {
      const col = key.slice(4, -8); // strip "not_" and "_is_null"
      if (value === 'true') {
        conditions.push(`"${col}" IS NOT NULL`);
      }
      continue;
    }

    // in_<col>=val1,val2
    if (key.startsWith('in_')) {
      const col = key.slice(3);
      const values = value.split(',').map((v) => v.trim());
      if (values.length > 0) {
        const placeholders = values.map(() => '?').join(', ');
        conditions.push(`"${col}" IN (${placeholders})`);
        params.push(...values);
      }
      continue;
    }

    // gte_<col>=val
    if (key.startsWith('gte_')) {
      const col = key.slice(4);
      conditions.push(`"${col}" >= ?`);
      params.push(value);
      continue;
    }
  }

  return { conditions, params };
}

function buildOrderBy(order: string | undefined): string {
  if (!order) return '';
  // Supports "col.desc", "col.asc", or comma-separated "col1.desc,col2.asc"
  const parts = order.split(',').map((segment) => {
    const [col, dir] = segment.trim().split('.');
    const direction = dir?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    return `"${col}" ${direction}`;
  });
  return ` ORDER BY ${parts.join(', ')}`;
}

function buildSelect(select: string | undefined): string {
  if (!select || select === '*') return '*';
  return select
    .split(',')
    .map((c) => `"${c.trim()}"`)
    .join(', ');
}

/**
 * Every column name the caller's query touches — in `select`, in a filter, in
 * `order`. Mirrors the prefixes `buildWhere` understands.
 *
 * A hidden column has to be unreachable as a FILTER too, not just missing from
 * the reply: `?eq_intl_iban=<guess>` and `?order=intl_iban.desc` read a column
 * the response never prints, one yes/no answer at a time.
 */
function referencedColumns(query: Record<string, string>): string[] {
  const cols: string[] = [];

  if (query.select && query.select !== '*') {
    cols.push(...query.select.split(',').map((c) => c.trim()));
  }

  for (const key of Object.keys(query)) {
    if (key.startsWith('eq_')) cols.push(key.slice(3));
    else if (key.startsWith('is_')) cols.push(key.slice(3));
    else if (key.startsWith('not_') && key.endsWith('_is_null')) cols.push(key.slice(4, -8));
    else if (key.startsWith('in_')) cols.push(key.slice(3));
    else if (key.startsWith('gte_')) cols.push(key.slice(4));
  }

  if (query.order) {
    cols.push(...query.order.split(',').map((segment) => segment.trim().split('.')[0]));
  }

  return cols.filter((c) => c.length > 0);
}

function respond(res: Response, data: unknown, error: unknown = null, count?: number) {
  const body: Record<string, unknown> = { data, error };
  if (count !== undefined) {
    body.count = count;
  }
  const status = error ? 400 : 200;
  return res.status(status).json(body);
}

function respondError(res: Response, message: string, status = 400) {
  return res.status(status).json({ data: null, error: { message } });
}

// ---------------------------------------------------------------------------
// Middleware: validate table name
// ---------------------------------------------------------------------------
router.use('/:table', (req: Request, res: Response, next) => {
  const { table } = req.params;
  if (!isAllowedTable(table)) {
    return respondError(res, `Table "${table}" is not allowed`, 403);
  }

  const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
  const caller = req.authedPubkey;
  const callerIsAdmin = !!caller && isAdminPubkey(caller, req.domainKey);

  // Privilege tables: a write decides who is an admin, or where a domain's
  // money goes. Reads stay open — the pubkey list is public anyway, and the
  // dashboard reads admin_users to decide whether to show the admin menu.
  if (isWrite && isAdminWriteTable(table)) {
    if (!caller) {
      return respondError(res, 'Authentication required: sign this request with your Nostr key.', 401);
    }
    if (!callerIsAdmin) {
      return respondError(res, `Not authorized to modify "${table}"`, 403);
    }
  }

  // buy_lana holds customer names, phone numbers and payment references. The
  // public buy flow needs exactly one read of it — "is this wallet already
  // used?" — which always names a single wallet. Anything broader (the admin
  // list view) takes a proven admin, so the customer list cannot be dumped.
  if (req.method === 'GET' && table === 'buy_lana' && !callerIsAdmin) {
    const query = req.query as Record<string, string>;
    if (!query.eq_lana_wallet_id) {
      return respondError(
        res,
        'Not authorized: reading buy_lana requires an admin, or a lana_wallet_id filter.',
        403
      );
    }
  }

  // Column scoping for a partly-public table (see PUBLIC_COLUMNS). A caller who
  // has not proved it is an admin sees the site's public facts about a domain
  // and nothing else — not the bank account, not the contact line.
  const publicCols = PUBLIC_COLUMNS[table];
  const hideNonPublic = publicCols && !callerIsAdmin ? publicCols : undefined;

  if (hideNonPublic) {
    const gated = referencedColumns(req.query as Record<string, string>)
      .find((col) => !hideNonPublic.includes(col));
    if (gated) {
      // Refused, not quietly ignored: a filter or a sort on a hidden column
      // reads it a guess at a time, however carefully the reply is scrubbed.
      return respondError(res, `Not authorized to read "${table}"."${gated}"`, 403);
    }
  }

  // Scrub secret columns — and, for a non-admin, everything outside the public
  // set — from every response this router produces, whichever handler made it.
  if (SECRET_COLUMNS[table] || hideNonPublic) {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
        const copy = { ...(body as Record<string, unknown>) };
        copy.data = project(table, copy.data, hideNonPublic);
        return originalJson(copy);
      }
      return originalJson(body);
    };
  }

  next();
});

// ---------------------------------------------------------------------------
// GET  /api/db/:table  ->  SELECT
// ---------------------------------------------------------------------------
router.get('/:table', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { table } = req.params;
    const query = req.query as Record<string, string>;

    if (table === 'profiles') {
      console.log(`[DB GET] profiles, query=`, query, `domainKey=${req.domainKey}, isDomainScoped=${isDomainScoped(table)}`);
    }

    const selectCols = buildSelect(query.select);
    const { conditions, params } = buildWhere(query);

    // Domain scoping: auto-filter by domain_key for scoped tables
    if (isDomainScoped(table) && req.domainKey) {
      conditions.push('"domain_key" = ?');
      params.push(req.domainKey);
    }

    const whereSQL = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const orderSQL = buildOrderBy(query.order);
    const limitSQL = query.limit ? ` LIMIT ${parseInt(query.limit, 10)}` : '';

    // HEAD / count mode
    if (query.head === 'true' || query.count === 'exact') {
      const countSQL = `SELECT COUNT(*) as count FROM "${table}"${whereSQL}`;
      const row = db.prepare(countSQL).get(...params) as { count: number } | undefined;
      const count = row?.count ?? 0;

      if (query.head === 'true') {
        return respond(res, null, null, count);
      }
      // count=exact without head — still return rows + count
      const sql = `SELECT ${selectCols} FROM "${table}"${whereSQL}${orderSQL}${limitSQL}`;
      const rows = db.prepare(sql).all(...params);
      return respond(res, rows, null, count);
    }

    const sql = `SELECT ${selectCols} FROM "${table}"${whereSQL}${orderSQL}${limitSQL}`;
    const rows = db.prepare(sql).all(...params);

    // single / maybeSingle
    if (query.single === 'true') {
      if (rows.length === 0) {
        return respondError(res, 'Row not found', 404);
      }
      return respond(res, rows[0]);
    }
    if (query.maybeSingle === 'true') {
      return respond(res, rows.length > 0 ? rows[0] : null);
    }

    return respond(res, rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respondError(res, message, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/db/:table  ->  INSERT
// ---------------------------------------------------------------------------
router.post('/:table', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { table } = req.params;
    const query = req.query as Record<string, string>;
    const body = req.body;

    console.log(`[DB POST] table=${table}, query=`, query, `body=`, JSON.stringify(body)?.slice(0, 500), `domainKey=${req.domainKey}`);

    if (!body || typeof body !== 'object') {
      console.error(`[DB POST] ${table}: body is missing or not an object`);
      return respondError(res, 'Request body is required');
    }

    // Handle array inserts
    const rows = Array.isArray(body) ? body : [body];
    const results: unknown[] = [];

    const insertRow = (rawRow: Record<string, unknown>) => {
      const row = sanitizeValues(rawRow);
      // Auto-inject domain_key for scoped tables
      if (isDomainScoped(table) && req.domainKey && !row.domain_key) {
        row.domain_key = req.domainKey;
      }

      // Generate ID if not provided
      if (!row.id) {
        row.id = crypto.randomUUID();
      }

      const columns = Object.keys(row);
      const colList = columns.map((c) => `"${c}"`).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((c) => row[c]);

      const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;
      console.log(`[DB POST] SQL: ${sql}, values:`, values);
      db.prepare(sql).run(...values);

      // If select is requested, fetch the inserted row back
      if (query.select) {
        const selectCols = buildSelect(query.select);
        const fetchSQL = `SELECT ${selectCols} FROM "${table}" WHERE "id" = ?`;
        return db.prepare(fetchSQL).get(row.id);
      }

      return row;
    };

    for (const row of rows) {
      results.push(insertRow(row));
    }

    const data = Array.isArray(body) ? results : results[0];

    // single pattern: .select('id').single()
    if (query.single === 'true') {
      return respond(res, Array.isArray(data) ? data[0] : data);
    }

    return respond(res, data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DB POST] ${req.params.table} ERROR:`, message);
    return respondError(res, message, 500);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/db/:table  ->  UPDATE
// ---------------------------------------------------------------------------
router.put('/:table', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { table } = req.params;
    const query = req.query as Record<string, string>;
    const body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return respondError(res, 'Request body must be a JSON object');
    }

    const { conditions, params: whereParams } = buildWhere(query);
    if (conditions.length === 0) {
      return respondError(res, 'UPDATE requires at least one filter condition');
    }

    // Sanitize booleans to SQLite-compatible integers
    const safeBody = sanitizeValues(body);

    // Build SET clause — always touch updated_at
    const setCols: string[] = [];
    const setParams: unknown[] = [];

    for (const [col, val] of Object.entries(safeBody)) {
      if (col === 'updated_at') continue; // we set it ourselves
      setCols.push(`"${col}" = ?`);
      setParams.push(val);
    }
    setCols.push(`"updated_at" = datetime('now')`);

    const whereSQL = ` WHERE ${conditions.join(' AND ')}`;
    const sql = `UPDATE "${table}" SET ${setCols.join(', ')}${whereSQL}`;
    db.prepare(sql).run(...setParams, ...whereParams);

    // Return updated rows
    const selectCols = buildSelect(query.select);
    const fetchSQL = `SELECT ${selectCols} FROM "${table}"${whereSQL}`;
    const rows = db.prepare(fetchSQL).all(...whereParams);

    if (query.single === 'true') {
      return respond(res, rows.length > 0 ? rows[0] : null);
    }
    if (query.maybeSingle === 'true') {
      return respond(res, rows.length > 0 ? rows[0] : null);
    }

    return respond(res, rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respondError(res, message, 500);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/db/:table  ->  UPSERT
// ---------------------------------------------------------------------------
router.patch('/:table', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { table } = req.params;
    const query = req.query as Record<string, string>;
    const body = req.body;

    if (!body || typeof body !== 'object') {
      return respondError(res, 'Request body is required');
    }

    // onConflict can come from query params (client QueryBuilder) or body (legacy)
    const onConflict = (query.onConflict || body.onConflict) as string | undefined;
    const rawData = body.data ?? body; // support {data, onConflict} or direct object
    const rows = Array.isArray(rawData) ? rawData : [rawData];

    const results: unknown[] = [];

    for (const rawRow of rows) {
      const row = sanitizeValues(rawRow);
      // Auto-inject domain_key for scoped tables
      if (isDomainScoped(table) && req.domainKey && !row.domain_key) {
        row.domain_key = req.domainKey;
      }

      // Generate ID if not provided
      if (!row.id) {
        row.id = crypto.randomUUID();
      }

      const columns = Object.keys(row);
      const colList = columns.map((c) => `"${c}"`).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((c) => row[c]);

      if (onConflict) {
        // INSERT ... ON CONFLICT(cols) DO UPDATE SET ...
        const conflictCols = onConflict
          .split(',')
          .map((c) => `"${c.trim()}"`)
          .join(', ');

        const updateSets = columns
          .filter((c) => !onConflict.split(',').map((x) => x.trim()).includes(c))
          .map((c) => `"${c}" = excluded."${c}"`)
          .join(', ');

        const updateClause = updateSets
          ? `${updateSets}, "updated_at" = datetime('now')`
          : `"updated_at" = datetime('now')`;

        const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})
          ON CONFLICT(${conflictCols}) DO UPDATE SET ${updateClause}`;
        db.prepare(sql).run(...values);
      } else {
        // Simple INSERT OR REPLACE
        const sql = `INSERT OR REPLACE INTO "${table}" (${colList}) VALUES (${placeholders})`;
        db.prepare(sql).run(...values);
      }

      // Fetch the upserted row
      const selectCols = buildSelect(query.select);
      const fetchSQL = `SELECT ${selectCols} FROM "${table}" WHERE "id" = ?`;
      const result = db.prepare(fetchSQL).get(row.id);
      results.push(result);
    }

    const data = Array.isArray(rawData) ? results : results[0];

    if (query.single === 'true') {
      return respond(res, Array.isArray(data) ? data[0] : data);
    }
    if (query.maybeSingle === 'true') {
      return respond(res, Array.isArray(data) ? (data[0] ?? null) : (data ?? null));
    }

    return respond(res, data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respondError(res, message, 500);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/db/:table  ->  DELETE
// ---------------------------------------------------------------------------
router.delete('/:table', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { table } = req.params;
    const query = req.query as Record<string, string>;

    const { conditions, params } = buildWhere(query);
    if (conditions.length === 0) {
      return respondError(res, 'DELETE requires at least one filter condition');
    }

    const whereSQL = ` WHERE ${conditions.join(' AND ')}`;

    // Fetch rows before deleting so we can return them
    const selectCols = buildSelect(query.select);
    const fetchSQL = `SELECT ${selectCols} FROM "${table}"${whereSQL}`;
    const rows = db.prepare(fetchSQL).all(...params);

    // Perform the delete
    const sql = `DELETE FROM "${table}"${whereSQL}`;
    const info = db.prepare(sql).run(...params);

    if (query.single === 'true') {
      return respond(res, rows.length > 0 ? rows[0] : null);
    }
    if (query.maybeSingle === 'true') {
      return respond(res, rows.length > 0 ? rows[0] : null);
    }

    return respond(res, rows, null, info.changes);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respondError(res, message, 500);
  }
});

export default router;
