/**
 * THE FOUR PLACES A FREEZE USED TO GO MISSING.
 *
 * Every assertion below is anchored to something that actually happened: a
 * person tried to enrol fourteen times in two days, was refused in two or
 * three milliseconds every single time, and was told each time that her wallet
 * records were "not on the relays yet". They were not on the relays because
 * the registrar had refused to put them there, and it had said so.
 *
 * No mocks of the repo's own code — the real modules, called the way the pages
 * call them. The only stand-in is the shape of the server's answer, and that
 * shape is copied from the registrar's own source.
 */
import {
  interpretRegistrationResponse,
  isRefusal,
} from '../src/lib/registrationRefusal';
import { parseFrozenWallets, freezeReasonLabel } from '../src/lib/freezeReasons';
import {
  parseWalletTag,
  parseWalletRecords,
  classifyWalletListRead,
} from '../src/lib/kind30889Read';
import { evaluateWalletCheck } from '../src/lib/buyWalletGate';
import {
  BOOTSTRAP_RELAYS as CLIENT_RELAYS,
  RETIRED_RELAY_ALIASES,
  relaysFromKind38888,
} from '../src/lib/relayBootstrap';
import { BOOTSTRAP_RELAYS as SERVER_RELAYS } from '../server/lib/relayList.js';
import { execSync } from 'child_process';

let pass = 0;
let fail = 0;
function check(what: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${what}`); }
  else { fail++; console.log(`  FAIL ${what}${detail ? ' — ' + detail : ''}`); }
}

/** The 403 the registrar actually sends, copied from its own handler. */
const FROZEN_403 = {
  success: false,
  status: 'frozen_account',
  error:
    'Registration blocked: the source account has frozen wallets. New wallet registration is not allowed for accounts with frozen wallets.',
  frozen_wallets: ['LeRAx18hQ1zzzzzzzzzzzzzzzzzzzzzzzzz (frozen_max_cap)'],
  correlation_id: '11111111-2222-3333-4444-555555555555',
};

const ev = (pubkey: string, created_at: number, tags: string[][]) =>
  ({ id: `${pubkey}-${created_at}`, pubkey, created_at, kind: 30889, tags, content: '', sig: '' }) as any;

function main() {
  console.log('\nA. the refusal reaches the person, in the registrar\'s own words');

  const frozen = interpretRegistrationResponse(403, false, FROZEN_403);
  check('a frozen_account 403 is a refusal', isRefusal(frozen));
  check('and is recognised as a freeze, not a generic error', frozen.kind === 'frozen_account', frozen.kind);
  check('the wallet is named', frozen.frozenWallets[0]?.wallet === 'LeRAx18hQ1zzzzzzzzzzzzzzzzzzzzzzzzz',
    JSON.stringify(frozen.frozenWallets));
  check('the reason comes with it', frozen.frozenWallets[0]?.reason === 'frozen_max_cap');
  check('the reason has plain words in both languages',
    freezeReasonLabel('frozen_max_cap', (k) => k) === 'freeze.reasonMaxCap');
  check('the server\'s own sentence survives', frozen.serverText.startsWith('Registration blocked:'));
  check('the support reference survives', frozen.correlationId === FROZEN_403.correlation_id);

  console.log('\nB. an error shape nobody anticipated is still a refusal, never a relay story');

  const weird = interpretRegistrationResponse(500, false, {
    success: false,
    status: 'error',
    error: 'Database error while checking frozen status',
  });
  check('it stops the flow', isRefusal(weird));
  check('it is not mislabelled as a freeze', weird.kind === 'server_message', weird.kind);
  check('the server\'s text is shown', weird.serverText === 'Database error while checking frozen status');

  const bodyless = interpretRegistrationResponse(502, false, null);
  check('a body we could not parse still stops the flow', isRefusal(bodyless));
  check('and does not claim to know why', bodyless.serverText === '', bodyless.serverText);

  const contradictory = interpretRegistrationResponse(200, true, { success: false, message: 'nope' });
  check('a 200 whose body says success:false is a refusal', isRefusal(contradictory));

  const nested = interpretRegistrationResponse(400, false, { error: { message: 'wallet_id is required' } });
  check('a nested error message is found', nested.serverText === 'wallet_id is required', nested.serverText);

  console.log('\nC. success and "already registered" are NOT refusals');

  const ok = interpretRegistrationResponse(200, true, {
    success: true,
    data: { wallets_registered: 8, nostr_broadcasts: { successful: 8, failed: 0 } },
  });
  check('a clean success passes through', !isRefusal(ok), ok.kind);

  const already = interpretRegistrationResponse(409, false, {
    success: false,
    message: 'Wallets already registered for this user',
  });
  check('"already registered" still counts as done', !isRefusal(already), already.kind);

  console.log('\n   — and the relay message keeps the case it was written for —');
  const partialBroadcast = interpretRegistrationResponse(200, true, {
    success: true,
    data: { wallets_registered: 8, nostr_broadcasts: { successful: 3, failed: 5 } },
  });
  check('an accepted request whose events are still in flight is not a refusal',
    !isRefusal(partialBroadcast), partialBroadcast.kind);

  console.log('\nD. frozen_wallets in either shape, and never silently dropped');

  check('the registrar\'s "wallet (reason)" string',
    JSON.stringify(parseFrozenWallets(['LAbc (frozen_l8w)'])) === JSON.stringify([{ wallet: 'LAbc', reason: 'frozen_l8w' }]));
  check('the object form',
    JSON.stringify(parseFrozenWallets([{ wallet_id: 'LAbc', freeze_reason: 'frozen_too_wild' }])) ===
    JSON.stringify([{ wallet: 'LAbc', reason: 'frozen_too_wild' }]));
  check('a bare address keeps the address rather than vanishing',
    parseFrozenWallets(['LAbc'])[0]?.wallet === 'LAbc');
  check('a non-array is not a crash', parseFrozenWallets(undefined).length === 0);
  check('an unknown code is printed, not swallowed',
    freezeReasonLabel('frozen_brand_new_code', (k) => k) === 'frozen_brand_new_code');

  console.log('\nE. the KIND 30889 parser carries the freeze field');

  const frozenTag = parseWalletTag(['w', 'LFrozen1', 'Main Wallet', 'LANA', 'note', '0', 'frozen_max_cap']);
  check('field 6 reaches the model', frozenTag.freeze_reason === 'frozen_max_cap', frozenTag.freeze_reason);
  check('and sets `frozen`', frozenTag.frozen === true);

  const cleanTag = parseWalletTag(['w', 'LClean1', 'Main Wallet', 'LANA', '', '0', '']);
  check('an empty reason is not frozen', cleanTag.frozen === false);

  const legacyTag = parseWalletTag(['w', 'LOld1', 'Main Wallet', 'LANA', '', '0']);
  check('a six-field tag from before the field existed is not frozen', legacyTag.frozen === false);
  check('and the other five fields still land', legacyTag.wallet_address === 'LOld1' && legacyTag.coin === 'LANA');

  const records = parseWalletRecords([
    ev('reg1', 100, [['d', 'hex'], ['status', 'ok'], ['w', 'LA', 'Main Wallet', 'LANA', '', '0', '']]),
    ev('reg1', 200, [['d', 'hex'], ['status', 'ok'], ['w', 'LA', 'Main Wallet', 'LANA', '', '0', 'frozen_max_cap']]),
  ]);
  check('one record per registrar', records.length === 1, String(records.length));
  check('the NEWER event wins, so a fresh freeze is not undone by a stale copy',
    records[0].wallets[0].frozen === true);

  console.log('\nF. a read nobody answered is "unknown", never "not frozen"');

  const silent = classifyWalletListRead({ answered: [], silent: CLIENT_RELAYS, events: [] });
  check('no relay answered → unreachable', silent.state === 'unreachable', silent.state);
  check('and no records are handed out', silent.records.length === 0);
  check('the silent relays are named for the log', silent.silent.length === CLIENT_RELAYS.length);

  // The trap this guards: querySync resolves to [] in milliseconds when NOTHING
  // connected. If the classifier looked only at `events`, these two lines would
  // be indistinguishable — and the permissive reading is the dangerous one.
  const silentWithEvents = classifyWalletListRead({
    answered: [],
    silent: ['wss://a'],
    events: [ev('reg1', 100, [['d', 'hex'], ['status', 'ok'], ['w', 'LA', 'Main Wallet', 'LANA', '', '0', '']])],
  });
  check('silence outranks whatever happened to be in the buffer',
    silentWithEvents.state === 'unreachable', silentWithEvents.state);

  const genuinelyEmpty = classifyWalletListRead({ answered: ['wss://a'], silent: ['wss://b'], events: [] });
  check('a relay that answered "nothing" is `empty`, which is a fact',
    genuinelyEmpty.state === 'empty', genuinelyEmpty.state);

  const found = classifyWalletListRead({
    answered: ['wss://a'],
    silent: [],
    events: [ev('reg1', 100, [['d', 'hex'], ['status', 'ok'], ['w', 'LA', 'Main Wallet', 'LANA', '', '0', 'frozen_l8w']])],
  });
  check('an answered read with records is `found`', found.state === 'found');
  check('and the freeze is in it', found.records[0].wallets[0].freeze_reason === 'frozen_l8w');

  console.log('\nG. the buy wizard refuses before the money');

  const frozenBuy = evaluateWalletCheck(true, {
    registered: true,
    wallet: { wallet_id: 'LFrozen1', frozen: true, freeze_reason: 'frozen_max_cap', nostr_hex_id: 'a'.repeat(64) },
  });
  check('a frozen wallet stops the wizard', frozenBuy.decision === 'frozen', frozenBuy.decision);
  check('naming the wallet', frozenBuy.wallet === 'LFrozen1');
  check('and the reason', frozenBuy.reason === 'frozen_max_cap');

  const okBuy = evaluateWalletCheck(true, {
    registered: true,
    wallet: { wallet_id: 'LClean1', frozen: false, freeze_reason: null, nostr_hex_id: 'b'.repeat(64) },
  });
  check('an unfrozen registered wallet goes through', okBuy.decision === 'registered', okBuy.decision);

  check('an unregistered wallet is unregistered, not "frozen"',
    evaluateWalletCheck(true, { registered: false, wallet_id: 'LNope' }).decision === 'not_registered');

  console.log('\n   — fail CLOSED when the check cannot be made —');
  check('a 500 from the check is check_failed',
    evaluateWalletCheck(false, { error: { message: 'Registration check failed' } }).decision === 'check_failed');
  check('a thrown request is check_failed',
    evaluateWalletCheck(false, null, true).decision === 'check_failed');
  check('a body that is not JSON is check_failed',
    evaluateWalletCheck(true, null).decision === 'check_failed');
  check('registered but no wallet object → check_failed, not "clean"',
    evaluateWalletCheck(true, { registered: true }).decision === 'check_failed');
  check('a wallet object with no `frozen` field → check_failed, not "clean"',
    evaluateWalletCheck(true, { registered: true, wallet: { wallet_id: 'LX' } }).decision === 'check_failed');
  check('the server\'s own words survive a failed check',
    evaluateWalletCheck(false, { error: { message: 'boom' } }).serverText === 'boom');

  console.log('\nH. the relay list: four, from KIND 38888, with no retired alias');

  check('the browser and the server bootstrap from the same list',
    JSON.stringify([...CLIENT_RELAYS].sort()) === JSON.stringify([...SERVER_RELAYS].sort()),
    `${CLIENT_RELAYS.join()} vs ${SERVER_RELAYS.join()}`);
  check('four relays, as KIND 38888 publishes', CLIENT_RELAYS.length === 4, String(CLIENT_RELAYS.length));
  for (const alias of RETIRED_RELAY_ALIASES) {
    check(`the retired alias ${alias} is gone from the browser list`,
      !CLIENT_RELAYS.some(r => r.includes(alias)));
    check(`the retired alias ${alias} is gone from the server list`,
      !SERVER_RELAYS.some(r => r.includes(alias)));
  }
  for (const needed of ['relay.lovelana.org', 'relay.lana-eternity.com', 'relay.lanavault.space', 'relay.lanaheartvoice.com']) {
    check(`${needed} is present`, CLIENT_RELAYS.some(r => r.includes(needed)));
  }
  check('no duplicates — "sent to 2 of 5" came from counting one relay twice',
    new Set(CLIENT_RELAYS).size === CLIENT_RELAYS.length);

  const from38888 = relaysFromKind38888({
    tags: [['d', 'main'], ['relay', 'wss://one'], ['relay', 'wss://two'], ['fx', 'EUR', '0.128']],
  });
  check('38888\'s own tags are what a reader takes', JSON.stringify(from38888) === '["wss://one","wss://two"]');
  check('a 38888 with no relay tags returns nothing, so the caller must decide',
    relaysFromKind38888({ tags: [['d', 'main']] }).length === 0);
  check('a missing event is not a crash', relaysFromKind38888(null).length === 0);

  // Nothing in src/ or server/ may hold its own relay list any more. The four
  // server files and the one hook that did are the reason this file exists.
  console.log('\nI. no file keeps a private relay list');
  const hits = execSync(
    "grep -rn \"wss://relay\\.\" src server --include='*.ts' --include='*.tsx' || true",
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .filter(line => !line.startsWith('src/lib/relayBootstrap.ts:') && !line.startsWith('server/lib/relayList.ts:'));
  check('the only hardcoded relay addresses left are the two bootstrap files',
    hits.length === 0, hits.join(' | '));

  console.log(`\n${pass} ok, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
