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
import { readFileSync } from 'fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { enrolmentFreezeVerdict, freezeBlocksEnrolment } from '../src/lib/freezePolicy';
import { refusalIsFinal } from '../src/lib/registrationRefusal';
import { MaxCapFreezeNotice } from '../src/components/MaxCapFreezeNotice';
import en from '../src/i18n/locales/en.json';
import sl from '../src/i18n/locales/sl.json';
import de from '../src/i18n/locales/de.json';
import it from '../src/i18n/locales/it.json';
import hu from '../src/i18n/locales/hu.json';

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

async function main() {
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

  // (Before the owner's rule of 18.9.2026 this fixture was frozen_max_cap. A
  // cap freeze now passes — see section J — so the blocking case is a reason
  // that still blocks.)
  const frozenBuy = evaluateWalletCheck(true, {
    registered: true,
    wallet: { wallet_id: 'LFrozen1', frozen: true, freeze_reason: 'frozen_too_wild', nostr_hex_id: 'a'.repeat(64) },
  });
  check('a wallet frozen for a blocking reason stops the wizard', frozenBuy.decision === 'frozen', frozenBuy.decision);
  check('naming the wallet', frozenBuy.wallet === 'LFrozen1');
  check('and the reason', frozenBuy.reason === 'frozen_too_wild');

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

  await ownersRule();

  console.log(`\n${pass} ok, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

/**
 * J. THE OWNER'S RULE, 18.9.2026: a cap freeze and an OWN sanction may enrol;
 * every other freeze may not; a freeze we could not read still stops.
 */
async function ownersRule() {
  console.log('\nJ. which freezes stop an enrolment');

  const v = enrolmentFreezeVerdict;
  check('not frozen → none', v(false, '') === 'none');
  check('frozen_max_cap → passes, with the way out', v(true, 'frozen_max_cap') === 'max_cap');
  check('frozen_own_person → passes', v(true, 'frozen_own_person') === 'own_person');
  check('frozen_too_wild → blocks', v(true, 'frozen_too_wild') === 'blocks');
  check('frozen_l8w → blocks', v(true, 'frozen_l8w') === 'blocks');
  check('frozen_unreg_Lanas → blocks', v(true, 'frozen_unreg_Lanas') === 'blocks');
  check('a code nobody has written yet → blocks', v(true, 'frozen_brand_new_code') === 'blocks');
  check('frozen with NO reason → blocks (the registrar\'s own rule)', v(true, '') === 'blocks' && v(true, null) === 'blocks');
  check('only the exact string passes — FROZEN_MAX_CAP blocks', v(true, 'FROZEN_MAX_CAP') === 'blocks');
  check('the legacy frozen_own is not frozen_own_person', v(true, 'frozen_own') === 'blocks');
  check('a reason on a wallet marked unfrozen still counts (registrar clears it on unfreeze)',
    v(false, 'frozen_too_wild') === 'blocks');

  console.log('\n   — the source-wallet picker, from a real 30889 tag —');
  const capTag = parseWalletTag(['w', 'LCap1', 'Main Wallet', 'LANA', '', '0', 'frozen_max_cap']);
  const ownTag = parseWalletTag(['w', 'LOwn1', 'Main Wallet', 'LANA', '', '0', 'frozen_own_person']);
  const wildTag = parseWalletTag(['w', 'LWild1', 'Main Wallet', 'LANA', '', '0', 'frozen_too_wild']);
  const oddTag = parseWalletTag(['w', 'LOdd1', 'Main Wallet', 'LANA', '', '0', 'frozen_something_new']);
  check('a cap-frozen wallet is selectable', !freezeBlocksEnrolment(capTag.frozen, capTag.freeze_reason));
  check('and is still shown as frozen, for the cap', capTag.frozen && v(capTag.frozen, capTag.freeze_reason) === 'max_cap');
  check('an OWN-sanctioned wallet is selectable', !freezeBlocksEnrolment(ownTag.frozen, ownTag.freeze_reason));
  check('a too_wild wallet is not', freezeBlocksEnrolment(wildTag.frozen, wildTag.freeze_reason));
  check('an unknown code is not', freezeBlocksEnrolment(oddTag.frozen, oddTag.freeze_reason));

  console.log('\n   — the buy wizard —');
  const w = (freeze_reason: string | null, frozen = true) =>
    evaluateWalletCheck(true, { registered: true, wallet: { wallet_id: 'LX1', frozen, freeze_reason, nostr_hex_id: 'c'.repeat(64) } });
  const capBuy = w('frozen_max_cap');
  check('cap-frozen → registered, the door opens', capBuy.decision === 'registered', capBuy.decision);
  check('carrying max_cap so the page explains it', capBuy.passedFreeze === 'max_cap', capBuy.passedFreeze);
  const ownBuy = w('frozen_own_person');
  check('OWN-sanctioned → registered', ownBuy.decision === 'registered' && ownBuy.passedFreeze === 'own_person');
  check('too_wild → frozen, the door stays shut', w('frozen_too_wild').decision === 'frozen');
  check('an unknown code → frozen', w('frozen_something_new').decision === 'frozen');
  check('frozen:true with a null reason → frozen', w(null).decision === 'frozen');
  check('an unfrozen wallet carries no passed freeze', w(null, false).passedFreeze === '');

  console.log('\n   — unreadable still fails CLOSED, whatever the reason would have been —');
  const silentCap = classifyWalletListRead({
    answered: [],
    silent: ['wss://a'],
    events: [ev('reg1', 1, [['d', 'hex'], ['status', 'active'], ['w', 'LCap1', 'Main Wallet', 'LANA', '', '0', 'frozen_max_cap']])],
  });
  check('a silent read hands out no wallets to pick, cap-frozen or not', silentCap.state === 'unreachable' && silentCap.records.length === 0);
  check('a failed registration check is still check_failed', evaluateWalletCheck(false, null, true).decision === 'check_failed');
  check('an answer with no `frozen` field is still check_failed',
    evaluateWalletCheck(true, { registered: true, wallet: { wallet_id: 'LX', freeze_reason: 'frozen_max_cap' } }).decision === 'check_failed');

  console.log('\n   — a refusal is only "final" when its freeze blocks —');
  const refusal = (frozen_wallets: string[], status = 'frozen_account') =>
    interpretRegistrationResponse(403, false, { success: false, status, error: 'Registration blocked', frozen_wallets });
  check('a refusal naming only a cap freeze does not lock the retry', !refusalIsFinal(refusal(['LCap1 (frozen_max_cap)'])));
  check('nor one naming only an OWN sanction', !refusalIsFinal(refusal(['LOwn1 (frozen_own_person)'])));
  check('a too_wild refusal does', refusalIsFinal(refusal(['LWild1 (frozen_too_wild)'])));
  check('a mix with any blocking freeze does', refusalIsFinal(refusal(['LCap1 (frozen_max_cap)', 'LWild1 (frozen_too_wild)'])));
  check('a frozen_account naming no wallet does — we cannot tell, so we do not guess',
    refusalIsFinal(refusal([])));
  check('a database error is never called final',
    !refusalIsFinal(interpretRegistrationResponse(500, false, { success: false, status: 'error', error: 'Database error while checking frozen status' })));
  check('the cap refusal is still shown, in the registrar\'s own words (task 1 stands)',
    isRefusal(refusal(['LCap1 (frozen_max_cap)'])) && refusal(['LCap1 (frozen_max_cap)']).serverText === 'Registration blocked');

  console.log('\n   — the explanation is actually there —');
  const locales: Record<string, any> = { en, sl, de, it, hu };
  for (const [lang, res] of Object.entries(locales)) {
    const f = res.freeze || {};
    check(`${lang}: the way-out title and body exist`,
      typeof f.maxCapPathTitle === 'string' && f.maxCapPathTitle.length > 0 &&
      typeof f.maxCapPathBody === 'string' && f.maxCapPathBody.includes('LanaTrace') && f.maxCapPathBody.includes('Resolve Freeze'));
  }
  check('en: no timing is promised',
    !/minute|hour|\bdays?\b|immediately|instantly|within/i.test((en as any).freeze.maxCapPathBody));

  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, sl: { translation: sl } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  const render = () => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(MaxCapFreezeNotice)));
  const enHtml = render();
  check('the notice renders the English way out',
    enHtml.includes('you can still enrol') && enHtml.includes('Resolve Freeze'), enHtml.slice(0, 200));
  await i18n.changeLanguage('sl');
  const slHtml = render();
  check('and the Slovenian one',
    slHtml.includes('vpis je vseeno mogoč') && slHtml.includes('zgornjo mejo'), slHtml.slice(0, 200));

  // The render conditions are in the pages, so read the pages. Removing the
  // notice from either screen, or going back to gating on the raw `frozen`
  // flag, fails here.
  const create = readFileSync('src/pages/CreateLana8Wonder.tsx', 'utf8');
  const buy = readFileSync('src/pages/BuyLana8Wonder.tsx', 'utf8');
  check('the picker shows the notice on phone and desktop',
    (create.match(/freezeVerdict === 'max_cap' && \(?\s*(<TableRow>[\s\S]{0,120})?<MaxCapFreezeNotice/g) || []).length === 2);
  check('the picker no longer gates on the bare `frozen` flag',
    !/!wallet\.frozen|chosen\?\.frozen\)/.test(create));
  check('the buy page shows the notice for a passed cap freeze',
    /passedFreeze === 'max_cap' && \(\s*<MaxCapFreezeNotice/.test(buy));
}

main();
