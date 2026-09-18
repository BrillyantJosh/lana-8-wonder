/**
 * "WE COULD NOT CHECK" IS NOT "YOU HAVE NO PLAN".
 *
 * `fetchKind88888` returned `null` both when the relays said this person has
 * no KIND 88888 plan and when no relay answered at all — `pool.querySync`
 * resolves a total blackout to `[]` in milliseconds. The dashboard and the
 * login page read that `null` as a verdict and sent a plan holder to
 * /create-lana8wonder, the page that takes a deposit for a new plan.
 *
 * A-B test the pure verdict. C runs the REAL reader against relays started
 * here on localhost — one that refuses the connection, one that answers
 * "nothing", one that hangs up mid-read, one that never speaks, one that
 * sends a forgery — because the difference between "answered" and "silent"
 * lives in the socket handling, not in the classifier. That is where both
 * faults this file first caught were: the reader closed its subscription
 * before recording the answer (close() fires onclose synchronously, so every
 * relay that answered was scored silent), and nostr-tools' own 4.4 s fake EOSE
 * would have scored a stalled relay as one that answered. C also runs the
 * KIND 30889 wallet-list reader, which was copied from and carried both.
 * D-E pin the pages and the words.
 */
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import { SimplePool, finalizeEvent, generateSecretKey, type Event } from 'nostr-tools';
import { AddressInfo } from 'net';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import {
  classifyPlanRead,
  readKind88888,
  planFilter,
  KIND_88888_PUBLISHER,
} from '../src/lib/kind88888Read';
import { readKind30889 } from '../src/lib/kind30889Read';

let pass = 0;
let fail = 0;
function check(what: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}${detail ? ' — ' + detail : ''}`); }
}

const HOLDER = 'c'.repeat(64);
const OTHER = 'd'.repeat(64);

const PLAN = {
  subject_hex: HOLDER,
  plan_id: 'plan-1',
  coin: 'LANA',
  currency: 'EUR',
  policy: 'lana8wonder',
  accounts: [{ account_id: 1, wallet: 'LWallet1', levels: [] }],
};

const planEvent = (over: Partial<Event> & { d?: string } = {}): Event => {
  const { d, ...rest } = over;
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    kind: 88888,
    pubkey: KIND_88888_PUBLISHER,
    created_at: 1000,
    tags: [['d', d ?? `plan:${HOLDER}`], ['p', HOLDER]],
    content: JSON.stringify(PLAN),
    sig: '',
    ...rest,
  } as Event;
};

async function main() {
  console.log('\nA. silence is "we could not check", never "no plan"');

  const blackout = classifyPlanRead({ nostrHexId: HOLDER, answered: [], silent: ['wss://a', 'wss://b'], events: [] });
  check('no relay answered, nothing in hand → unreachable', blackout.state === 'unreachable', blackout.state);
  check('and no plan is handed out', blackout.plan === null);
  check('the silent relays are named for the log', blackout.silent.length === 2);

  const empty = classifyPlanRead({ nostrHexId: HOLDER, answered: ['wss://a'], silent: ['wss://b'], events: [] });
  check('a relay that answered "nothing" → empty, which is a fact', empty.state === 'empty', empty.state);

  const found = classifyPlanRead({ nostrHexId: HOLDER, answered: ['wss://a'], silent: [], events: [planEvent()] });
  check('an answered read with the plan → found', found.state === 'found', found.state);
  check('and the plan is parsed', found.plan?.plan_id === 'plan-1' && found.plan.accounts.length === 1);

  // Deliberate difference from the wallet-list read: here the event is the
  // evidence. Throwing it away would make a holder a non-holder over an EOSE.
  const inHandNoEose = classifyPlanRead({ nostrHexId: HOLDER, answered: [], silent: ['wss://a'], events: [planEvent()] });
  check('a plan in hand counts even if its relay dropped before EOSE', inHandNoEose.state === 'found', inHandNoEose.state);

  console.log('\nB. only the publisher\'s plan for THIS person counts, and the newest one');

  const spoofed = planEvent({ pubkey: 'e'.repeat(64) });
  check('a plan from another key is ignored (answered → empty)',
    classifyPlanRead({ nostrHexId: HOLDER, answered: ['wss://a'], silent: [], events: [spoofed] }).state === 'empty');
  check('…and is not mistaken for evidence when nobody answered',
    classifyPlanRead({ nostrHexId: HOLDER, answered: [], silent: ['wss://a'], events: [spoofed] }).state === 'unreachable');

  const someoneElse = planEvent({ d: `plan:${OTHER}` });
  check('another person\'s plan is not this person\'s',
    classifyPlanRead({ nostrHexId: HOLDER, answered: ['wss://a'], silent: [], events: [someoneElse] }).state === 'empty');

  const older = planEvent({ created_at: 1000, content: JSON.stringify({ ...PLAN, plan_id: 'old' }) });
  const newer = planEvent({ created_at: 2000, content: JSON.stringify({ ...PLAN, plan_id: 'new' }) });
  const both = classifyPlanRead({ nostrHexId: HOLDER, answered: ['wss://a'], silent: [], events: [older, newer] });
  check('the newest version wins, whatever order the relays delivered in', both.plan?.plan_id === 'new', both.plan?.plan_id);

  const broken = planEvent({ created_at: 3000, content: '{not json' });
  const brokenNewest = classifyPlanRead({ nostrHexId: HOLDER, answered: ['wss://a'], silent: [], events: [older, broken] });
  check('an unreadable newest plan is NOT "no plan"', brokenNewest.state !== 'empty', brokenNewest.state);
  check('…nor quietly replaced by a superseded version', brokenNewest.plan === null, brokenNewest.plan?.plan_id);
  check('…it is "we could not check"', brokenNewest.state === 'unreachable', brokenNewest.state);

  const noAccounts = planEvent({ content: JSON.stringify({ plan_id: 'x' }) });
  check('a plan with no accounts array is unreadable, not a crash on the dashboard',
    classifyPlanRead({ nostrHexId: HOLDER, answered: ['wss://a'], silent: [], events: [noAccounts] }).state === 'unreachable');

  const f = planFilter(HOLDER);
  check('the filter asks for the publisher, the person and the plan d-tag',
    f.kinds?.[0] === 88888 && f.authors?.[0] === KIND_88888_PUBLISHER &&
    f['#p']?.[0] === HOLDER && f['#d']?.[0] === `plan:${HOLDER}`);

  console.log('\nC. the real reader, against relays started on localhost');

  type Behaviour = 'eose' | 'hangup' | 'mute' | 'forgery';
  const servers: WebSocketServer[] = [];
  const startRelay = (behaviour: Behaviour) =>
    new Promise<string>((resolve) => {
      const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }, () => {
        resolve(`ws://127.0.0.1:${(wss.address() as AddressInfo).port}`);
      });
      servers.push(wss);
      wss.on('connection', (sock: WsSocket) => {
        sock.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg[0] !== 'REQ') return;
          const subId = msg[1];
          if (behaviour === 'eose') sock.send(JSON.stringify(['EOSE', subId]));
          if (behaviour === 'hangup') sock.close();
          if (behaviour === 'forgery') {
            // Correct tags, publisher's pubkey, somebody else's signature.
            const forged = finalizeEvent({
              kind: 88888,
              created_at: Math.floor(Date.now() / 1000),
              tags: [['d', `plan:${HOLDER}`], ['p', HOLDER]],
              content: JSON.stringify(PLAN),
            }, generateSecretKey());
            sock.send(JSON.stringify(['EVENT', subId, { ...forged, pubkey: KIND_88888_PUBLISHER }]));
            sock.send(JSON.stringify(['EOSE', subId]));
          }
          // 'mute' says nothing, ever.
        });
      });
    });

  // A port that was open a moment ago and is now closed: connection refused.
  const deadUrl = await startRelay('eose');
  await new Promise<void>((r) => servers.pop()!.close(() => r()));

  const eoseUrl = await startRelay('eose');
  const hangupUrl = await startRelay('hangup');
  const muteUrl = await startRelay('mute');
  const forgeryUrl = await startRelay('forgery');

  const none = await readKind88888(HOLDER, []);
  check('no relays at all → unreachable', none.state === 'unreachable', none.state);

  let t0 = Date.now();
  const dead = await readKind88888(HOLDER, [deadUrl], 5_000);
  const deadMs = Date.now() - t0;
  check('a relay that refuses the connection → unreachable', dead.state === 'unreachable', dead.state);
  check('and it is named as silent', dead.silent.length === 1 && dead.answered.length === 0);
  check('the refusal is noticed at once, not at the timeout', deadMs < 2_000, `${deadMs} ms`);

  const answeredEmpty = await readKind88888(HOLDER, [eoseUrl], 5_000);
  check('a relay that reaches EOSE with nothing → empty', answeredEmpty.state === 'empty', answeredEmpty.state);
  check('and it is counted as answered', answeredEmpty.answered.length === 1);

  const hungUp = await readKind88888(HOLDER, [hangupUrl], 5_000);
  check('a relay that hangs up before EOSE → unreachable', hungUp.state === 'unreachable', hungUp.state);

  t0 = Date.now();
  const muted = await readKind88888(HOLDER, [muteUrl], 300);
  check('a relay that never speaks → unreachable at the timeout', muted.state === 'unreachable', muted.state);
  check('and the timeout is honoured', Date.now() - t0 < 2_000, `${Date.now() - t0} ms`);

  const forgery = await readKind88888(HOLDER, [forgeryUrl], 5_000);
  check('a forged plan (publisher pubkey, wrong signature) is dropped → empty', forgery.state === 'empty', forgery.state);

  const mixed = await readKind88888(HOLDER, [deadUrl, eoseUrl, muteUrl], 300);
  check('one answer among silent relays is enough for empty', mixed.state === 'empty', mixed.state);
  check('the silent ones are still named', mixed.silent.length === 2, mixed.silent.join());

  const allSilent = await readKind88888(HOLDER, [deadUrl, hangupUrl, muteUrl], 300);
  check('every relay silent → unreachable', allSilent.state === 'unreachable', allSilent.state);

  console.log('\n   — the wallet-list reader (KIND 30889) shares the socket handling —');
  const wlAnswered = await readKind30889(HOLDER, [eoseUrl], 5_000);
  check('30889: a relay that reaches EOSE with nothing → empty', wlAnswered.state === 'empty', wlAnswered.state);
  check('30889: and it is counted as answered', wlAnswered.answered.length === 1, `${wlAnswered.answered.length} answered`);
  const wlDead = await readKind30889(HOLDER, [deadUrl, hangupUrl], 5_000);
  check('30889: refused + hung up → unreachable', wlDead.state === 'unreachable', wlDead.state);

  console.log('\n   — a relay that connects and then stalls past nostr-tools\' 4.4 s fake EOSE —');
  // Our timeout (4.8 s) is longer than the library's baseEoseTimeout (4.4 s),
  // so without `eoseTimeout` on the subscription the library would call
  // oneose first and the stall would read as "answered, nothing there".
  const [planStall, walletStall] = await Promise.all([
    readKind88888(HOLDER, [muteUrl], 4_800),
    readKind30889(HOLDER, [muteUrl], 4_800),
  ]);
  check('88888: a stall is silence, not an empty answer', planStall.state === 'unreachable', planStall.state);
  check('30889: a stall is silence, not an empty answer', walletStall.state === 'unreachable', walletStall.state);

  // Not an assertion — the premise. If nostr-tools ever stops doing this, the
  // reader is still right; this line just stops being the reason for it.
  const trapPool = new SimplePool();
  t0 = Date.now();
  const trap = await trapPool.querySync([deadUrl], planFilter(HOLDER));
  console.log(`  note querySync on a refused relay resolved to ${JSON.stringify(trap)} in ${Date.now() - t0} ms, no error`);
  try { trapPool.close([deadUrl]); } catch { /* nothing open */ }

  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));

  console.log('\nD. the pages branch on the state, and nothing else uses the old reader');

  const grep = (cmd: string) =>
    execSync(`${cmd} || true`, { encoding: 'utf8' }).split('\n').filter(Boolean);

  const oldCallers = grep('grep -rn "fetchKind88888" src server --include="*.ts" --include="*.tsx" | grep -v "^src/lib/nostrClient.ts:.*//"');
  check('no code calls fetchKind88888 any more', oldCallers.length === 0, oldCallers.join(' | '));

  const dashboard = readFileSync('src/pages/Dashboard.tsx', 'utf8');
  const login = readFileSync('src/pages/Login.tsx', 'utf8');
  check('the dashboard reads with readKind88888', dashboard.includes('readKind88888('));
  check('the dashboard has a screen for "unreachable"', dashboard.includes("planState === 'unreachable'") && dashboard.includes("t('planRead.unknownTitle')"));
  check('the dashboard redirects to plan creation only on `empty`',
    /state === 'empty'\)\s*\{[^}]*navigate\("\/create-lana8wonder"\)/.test(dashboard));
  check('login reads with readKind88888', login.includes('readKind88888('));
  check('login handles "unreachable" before the no-plan branch',
    login.indexOf("planRead.state === 'unreachable'") > 0 &&
    login.indexOf("planRead.state === 'unreachable'") < login.indexOf('navigate("/create-lana8wonder")'));

  console.log('\nE. the words exist in every language');

  for (const lang of ['en', 'sl', 'de', 'it', 'hu']) {
    const dict = JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'));
    const p = dict.planRead ?? {};
    check(`${lang}: title, body and retry are there`,
      ['unknownTitle', 'unknownBody', 'retry'].every((k) => typeof p[k] === 'string' && p[k].trim().length > 0),
      JSON.stringify(Object.keys(p)));
  }

  console.log(`\n${pass} ok, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
