/**
 * Test helper: audit the signatures inside a signed LanaCoin transaction
 * WITHOUT trusting the code that made it. Re-parses the raw tx, rebuilds every
 * input's SIGHASH_ALL preimage independently (LanaCoin layout: version, nTime,
 * inputs, outputs, locktime), verifies each signature with `elliptic`, and
 * tries the old key-recovery formula d = z(1 − s)/(s − r) on it.
 */
import crypto from 'node:crypto';
import elliptic from 'elliptic';

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const ec = new elliptic.ec('secp256k1');

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;
function inv(a: bigint, m: bigint) {
  let [lm, hm, lo, hi] = [1n, 0n, mod(a, m), m];
  while (lo > 1n) { const r = hi / lo; [lm, hm] = [hm - lm * r, lm]; [lo, hi] = [hi - lo * r, lo]; }
  return mod(lm, m);
}
const sha256d = (b: Uint8Array) =>
  new Uint8Array(crypto.createHash('sha256').update(crypto.createHash('sha256').update(b).digest()).digest());

function varint(n: number): number[] {
  if (n < 0xfd) return [n];
  if (n <= 0xffff) return [0xfd, n & 0xff, n >> 8];
  return [0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

/** P2PKH output script for a 20-byte hash160. */
export const p2pkh = (h160: Uint8Array) => new Uint8Array([0x76, 0xa9, 0x14, ...h160, 0x88, 0xac]);

/** A raw LanaCoin funding transaction with the given outputs (one dummy input). */
export function fundingTxHex(outputs: { value: number; script: Uint8Array }[]): string {
  const b: number[] = [1, 0, 0, 0, 0x40, 0x42, 0x0f, 0x00, 1, ...crypto.randomBytes(32), 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff];
  b.push(...varint(outputs.length));
  for (const o of outputs) {
    const v = Buffer.alloc(8);
    v.writeBigUInt64LE(BigInt(o.value));
    b.push(...v, ...varint(o.script.length), ...o.script);
  }
  b.push(0, 0, 0, 0);
  return hex(new Uint8Array(b));
}

export interface AuditedSignature { input: number; r: bigint; s: bigint; z: bigint; publicKey: string; verifies: boolean; keyRecovered: boolean }

/**
 * `prevScripts[i]` = scriptPubKey of the output input i spends.
 * `privateKeys` = throwaway test keys (bigint) that may have signed; used only
 * to check whether the recovery formula lands on one of them.
 */
export function auditSignedTx(txHex: string, prevScripts: Uint8Array[], privateKeys: bigint[]): AuditedSignature[] {
  const tx = Uint8Array.from(Buffer.from(txHex, 'hex'));
  let c = 0;
  const take = (n: number) => { const out = tx.slice(c, c + n); if (out.length !== n) throw new Error('tx truncated'); c += n; return out; };
  const readVarint = () => {
    const f = tx[c++];
    if (f < 0xfd) return f;
    if (f === 0xfd) { const v = tx[c] | (tx[c + 1] << 8); c += 2; return v; }
    if (f === 0xfe) { const v = (tx[c] | (tx[c + 1] << 8) | (tx[c + 2] << 16)) + tx[c + 3] * 2 ** 24; c += 4; return v; }
    throw new Error('varint too large');
  };
  const version = take(4);
  const nTime = take(4);
  const nIn = readVarint();
  const inputs: { outpoint: Uint8Array; scriptSig: Uint8Array; sequence: Uint8Array }[] = [];
  for (let i = 0; i < nIn; i++) {
    const outpoint = take(36);
    const scriptSig = take(readVarint());
    inputs.push({ outpoint, scriptSig, sequence: take(4) });
  }
  const outStart = c;
  const nOut = readVarint();
  for (let i = 0; i < nOut; i++) { take(8); take(readVarint()); }
  const outputs = tx.slice(outStart, c);
  const locktime = take(4);
  if (c !== tx.length) throw new Error(`trailing bytes after tx (${tx.length - c})`);
  if (prevScripts.length !== nIn) throw new Error(`expected ${prevScripts.length} inputs, tx has ${nIn}`);

  return inputs.map((inp, i) => {
    const ss = inp.scriptSig;
    const sigLen = ss[0];
    const sigWithType = ss.slice(1, 1 + sigLen);
    const pubLen = ss[1 + sigLen];
    const pub = ss.slice(2 + sigLen, 2 + sigLen + pubLen);
    if (2 + sigLen + pubLen !== ss.length) throw new Error(`input ${i}: scriptSig is not <sig> <pubkey>`);
    if (sigWithType[sigWithType.length - 1] !== 0x01) throw new Error(`input ${i}: not SIGHASH_ALL`);
    const der = sigWithType.slice(0, -1);

    const pre: number[] = [...version, ...nTime, ...varint(nIn)];
    inputs.forEach((o, j) => {
      const sc = j === i ? prevScripts[i] : new Uint8Array(0);
      pre.push(...o.outpoint, ...varint(sc.length), ...sc, ...o.sequence);
    });
    pre.push(...outputs, ...locktime, 1, 0, 0, 0);
    const zBytes = sha256d(new Uint8Array(pre));
    const z = BigInt('0x' + hex(zBytes));

    const verifies = ec.keyFromPublic(hex(pub), 'hex').verify(hex(zBytes), Array.from(der));
    const rLen = der[3];
    const r = BigInt('0x' + hex(der.slice(4, 4 + rLen)));
    const s = BigInt('0x' + hex(der.slice(6 + rLen, 6 + rLen + der[5 + rLen])));
    const keyRecovered = [s, N - s].some((sv) => privateKeys.includes(mod(z * (1n - sv) * inv(mod(sv - r, N), N), N)));
    return { input: i, r, s, z, publicKey: hex(pub), verifies, keyRecovered };
  });
}
