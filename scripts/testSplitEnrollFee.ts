/**
 * THE SPLIT ENROLMENT, END TO END, ON THE REAL ROUTE.
 *
 * No mocks of the repo's own code: the real router, the real signer, a real
 * key and a real signature. Only the chain is a stand-in, and it is a stand-in
 * the honest way — a TCP server speaking electrum's own line protocol, reached
 * through the `electrum_servers` the request already carries.
 */
import net from 'net';
import http from 'http';
import express from 'express';
import router from '../server/routes/sendLanaMultiOutput.js';
import {
  base58CheckEncode, base58CheckDecode, hexToUint8Array, uint8ArrayToHex,
  privateKeyToPublicKey, publicKeyToAddress,
} from '../server/lib/lanaTransaction.js';

const RATE = 0.128;
const L = 100_000_000;
const TOTAL = Math.round((100 / RATE) * L);      // 78,125,000,000
const PHI = Math.round((12 / RATE) * L);         //  9,375,000,000
const PER = Math.round(((100 - 12) / RATE / 8) * L); // 8,593,750,000

const key = (h: string) => {
  const priv = h.repeat(32).slice(0, 64);
  return { wif: base58CheckEncode(new Uint8Array([0xb0, ...hexToUint8Array(priv)])), addr: publicKeyToAddress(privateKeyToUncompressed(priv)) };
};
function privateKeyToUncompressed(h: string) { return privateKeyToPublicKey(h); }

const sender = key('1f');
const accounts = ['21','22','23','24','25','26','27','28'].map(key);
const donation = key('3a');

/** A previous transaction to spend: no inputs, one P2PKH output to the sender. */
function rawTx(value: number): string {
  const hash = base58CheckDecode(sender.addr).slice(1);
  const script = new Uint8Array([0x76, 0xa9, 0x14, ...hash, 0x88, 0xac]);
  const v = new Uint8Array(8);
  new DataView(v.buffer).setBigUint64(0, BigInt(value), true);
  return uint8ArrayToHex(new Uint8Array([1,0,0,0, 0,0,0,0, 0x00, 0x01, ...v, script.length, ...script]));
}

let UTXOS: any[] = [];
let broadcast: string[] = [];

const chain = net.createServer(sock => {
  sock.on('data', d => {
    for (const line of d.toString().split('\n').filter(Boolean)) {
      const req = JSON.parse(line);
      let result: any;
      if (req.method === 'blockchain.address.listunspent') result = UTXOS;
      else if (req.method === 'blockchain.transaction.get') {
        const u = UTXOS.find(u => u.tx_hash === req.params[0]);
        result = rawTx(u ? u.value : 0);
      } else if (req.method === 'blockchain.transaction.broadcast') {
        broadcast.push(req.params[0]);
        result = 'ab'.repeat(32);
      } else result = null;
      sock.write(JSON.stringify({ id: req.id, result }) + '\n');
    }
  });
});

function outputsOf(hex: string) {
  const tx = hexToUint8Array(hex);
  let o = 8;
  const ins = tx[o]; o += 1;
  for (let i = 0; i < ins; i++) { o += 36; const l = tx[o]; o += 1 + l; o += 4; }
  const n = tx[o]; o += 1;
  const out: Array<{ value: number; script: string }> = [];
  for (let i = 0; i < n; i++) {
    const value = Number(new DataView(tx.buffer, tx.byteOffset + o, 8).getBigUint64(0, true)); o += 8;
    const l = tx[o]; o += 1;
    out.push({ value, script: uint8ArrayToHex(tx.slice(o, o + l)) }); o += l;
  }
  return out;
}

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function main() {
  await new Promise<void>(r => chain.listen(0, '127.0.0.1', r));
  const chainPort = (chain.address() as any).port;

  const app = express();
  app.use(express.json());
  app.use('/api/send-lana-multi-output', router);
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  const recipients = [
    ...accounts.map(a => ({ address: a.addr, amount: PER / L })),
    { address: donation.addr, amount: PHI / L },
  ];

  const send = async (body: any) => {
    const res = await fetch(`${base}/api/send-lana-multi-output`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_address: sender.addr, recipients, private_key: sender.wif,
        electrum_servers: [{ host: '127.0.0.1', port: chainPort }], ...body,
      }),
    });
    return { status: res.status, body: await res.json() as any };
  };

  const one = (value: number) => [{ tx_hash: 'aa'.repeat(32), tx_pos: 0, value, height: 100 }];

  console.log('\nA. the buyer who paid exactly 100 — the case that could never enrol');
  UTXOS = one(TOTAL); broadcast = [];
  let r = await send({ fee_from_recipient: 8 });
  check('the transfer goes through', r.body.success === true, r.body.error || '');
  if (r.body.success) {
    const outs = outputsOf(broadcast[0]);
    check('nine outputs, no change left behind', outs.length === 9, `got ${outs.length}`);
    check('all eight accounts exact to the lanoshi', outs.slice(0, 8).every(o => o.value === PER));
    check('the fee came out of the PHI donation', outs[8].value === PHI - 79_500, `donation ${outs[8].value}`);
    check('inputs minus outputs IS the fee', TOTAL - outs.reduce((s, o) => s + o.value, 0) === 79_500);
    check('the route reports that same fee', r.body.fee === 79_500, String(r.body.fee));
  }

  console.log('\nB. the same wallet, without naming an output — the bug, still there for callers that do not opt in');
  UTXOS = one(TOTAL); broadcast = [];
  r = await send({});
  check('still refused', r.body.success === false);
  check('and refused by exactly the fee', String(r.body.error).includes('need 78125079500'), r.body.error);
  check('nothing was broadcast', broadcast.length === 0);

  console.log('\nC. a buyer who happens to hold more — change comes back to him');
  UTXOS = one(TOTAL + 5 * L); broadcast = [];
  r = await send({ fee_from_recipient: 8 });
  check('goes through', r.body.success === true, r.body.error || '');
  if (r.body.success) {
    const outs = outputsOf(broadcast[0]);
    check('ten outputs — the nine plus his change', outs.length === 10, `got ${outs.length}`);
    check('accounts still exact', outs.slice(0, 8).every(o => o.value === PER));
    const toSender = uint8ArrayToHex(base58CheckDecode(sender.addr).slice(1));
    check('the change is his', outs[9].script.includes(toSender));
    check('and it is the 5 LANA he had over', outs[9].value === 5 * L, String(outs[9].value));
  }

  console.log('\nD. an index that names nothing is refused, not guessed at');
  UTXOS = one(TOTAL); broadcast = [];
  r = await send({ fee_from_recipient: 99 });
  check('refused', r.body.success === false);
  check('and says why', String(r.body.error).includes('out of range'), r.body.error);

  console.log(`\n${pass} ok, ${fail} failed`);
  server.close(); chain.close();
  process.exit(fail === 0 ? 0 : 1);
}
main();
