import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/connection.js';

const router = Router();

const ALLOWED_TABLES = [
  'app_settings',
  'profiles',
  'wallets',
  'buy_lana',
  'waiting_list',
  'admin_users',
  'domains',
  'domain_admins',
  'faq_items',
  'what_is_lana',
] as const;

const DOMAIN_SCOPED_TABLES = ['buy_lana', 'faq_items', 'what_is_lana'] as const;

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
