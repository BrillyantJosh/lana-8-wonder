/**
 * SMOKE TEST: every server module must at least LOAD.
 *
 * Copied from lana-direct-fund, where it was written after direct.lana.fund
 * went down for ~1h15 on 2026-08-02. A backtick inside a SQL comment ended the
 * JS template literal it lived in:
 *
 *   server/routes/publicApi.ts:206:45: ERROR: Expected ")" but found "paused_at"
 *
 * The server crash-looped, so its container never got an IP, so docker-gen
 * dropped the vhost, so nginx-proxy answered from the default server and served
 * a DIFFERENT site's certificate — surfacing as ERR_CERT_COMMON_NAME_INVALID
 * rather than anything that pointed at the real cause.
 *
 * lana-8-wonder is built exactly the same way, so it is exposed exactly the
 * same way — nothing here loads the server files before production:
 *   - `npm run build` is vite — the CLIENT only;
 *   - the server runs through tsx (`node --import tsx server/index.ts`) and is
 *     never compiled;
 *   - `npm run typecheck` does cover tsconfig.server.json, but it is not part of
 *     `npm test`, and it currently reports 11 pre-existing errors, so a new
 *     syntax error does not stand out;
 *   - before this file, no test imported any route module.
 *
 * So this test does the one thing that was missing: it imports every server
 * module. Any syntax error, bad import or top-level throw becomes a red test
 * instead of an outage. It deliberately asserts nothing about behaviour —
 * loading IS the assertion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every .ts under server/, minus the tests and their helpers. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'tests' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      sourceFiles(full, out);
    } else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

// server/index.ts is excluded on purpose: importing it starts the HTTP listener
// and the payment heartbeat. Everything it imports is covered below.
const indexPath = join(serverDir, 'index.ts');
const files = sourceFiles(serverDir).filter(f => f !== indexPath);

test('every server module parses and imports cleanly', async () => {
  assert.ok(files.length >= 10, `expected to find the server sources, found ${files.length}`);

  const broken: string[] = [];
  for (const f of files) {
    try {
      await import(pathToFileURL(f).href);
    } catch (err: any) {
      broken.push(`${f.replace(serverDir, 'server')} → ${String(err?.message || err).split('\n')[0]}`);
    }
  }

  assert.deepEqual(broken, [], `these modules do not load:\n  ${broken.join('\n  ')}`);
});

test('no backticks inside SQL comments — they end the template literal', async () => {
  // The specific trap, caught three times in one day on direct.lana.fund before
  // this existed: `db.prepare(...)` bodies are template literals, so a backtick
  // in a `--` comment terminates the string mid-query. Cheap to check, so check
  // it. Equivalent one-liner: grep -rn -- '--.*`' server/
  const offenders: string[] = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const comment = line.indexOf('--');
      if (comment >= 0 && line.slice(comment).includes('`')) {
        offenders.push(`${f.replace(serverDir, 'server')}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `backtick inside a SQL comment:\n  ${offenders.join('\n  ')}`);
});
