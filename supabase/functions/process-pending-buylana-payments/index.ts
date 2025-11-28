import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ===== Crypto Utilities =====
function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return arr;
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(s: string): Uint8Array {
  let num = 0n;
  for (const c of s) {
    const idx = BASE58_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error('Invalid base58 character');
    num = num * 58n + BigInt(idx);
  }
  const hex = num.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
  let decoded = hexToUint8Array(paddedHex);
  for (const c of s) {
    if (c !== '1') break;
    decoded = new Uint8Array([0, ...decoded]);
  }
  return decoded;
}

function base58Encode(data: Uint8Array): string {
  let num = 0n;
  for (const b of data) num = num * 256n + BigInt(b);
  if (num === 0n) return '1';
  let encoded = '';
  while (num > 0n) {
    encoded = BASE58_ALPHABET[Number(num % 58n)] + encoded;
    num = num / 58n;
  }
  for (const b of data) {
    if (b !== 0) break;
    encoded = '1' + encoded;
  }
  return encoded;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buffer = new Uint8Array(data);
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(hash);
}

async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  return sha256(await sha256(data));
}

async function ripemd160(data: Uint8Array): Promise<Uint8Array> {
  const wasmCode = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 12, 2, 96, 2, 127, 127, 0, 96, 1, 127, 1, 127, 3, 3, 2, 0, 1,
    5, 3, 1, 0, 1, 7, 17, 2, 6, 109, 101, 109, 111, 114, 121, 2, 0, 4, 104, 97, 115, 104, 0, 1, 10,
    236, 2, 2, 19, 0, 65, 0, 65, 128, 128, 192, 133, 7, 54, 2, 0, 65, 4, 65, 239, 205, 171, 152, 7,
    54, 2, 0, 65, 8, 65, 152, 222, 30, 54, 2, 0, 65, 12, 65, 199, 173, 229, 198, 3, 54, 2, 0, 65,
    16, 65, 198, 161, 213, 196, 1, 54, 2, 0, 11, 212, 2, 1, 13, 127, 32, 0, 40, 2, 0, 33, 1, 32, 0,
    40, 2, 4, 33, 2, 32, 0, 40, 2, 8, 33, 3, 32, 0, 40, 2, 12, 33, 4, 32, 0, 40, 2, 16, 33, 5, 65,
    0, 33, 6, 3, 64, 32, 1, 32, 2, 32, 3, 115, 32, 4, 113, 32, 3, 115, 106, 32, 6, 65, 2, 116, 32,
    0, 106, 40, 2, 20, 106, 106, 34, 7, 65, 11, 116, 32, 7, 65, 21, 118, 114, 33, 7, 32, 5, 32, 1,
    106, 34, 8, 65, 10, 116, 32, 8, 65, 22, 118, 114, 33, 1, 32, 7, 32, 4, 106, 33, 5, 32, 3, 33,
    4, 32, 2, 33, 3, 32, 1, 33, 2, 32, 6, 65, 1, 106, 34, 6, 65, 16, 71, 13, 0, 11, 65, 0, 33, 6,
    3, 64, 32, 1, 32, 2, 32, 4, 114, 32, 3, 113, 32, 4, 32, 3, 113, 114, 106, 32, 6, 65, 2, 116,
    32, 0, 106, 40, 2, 20, 106, 65, 159, 142, 208, 208, 0, 106, 34, 7, 65, 11, 116, 32, 7, 65, 21,
    118, 114, 33, 7, 32, 5, 32, 1, 106, 34, 8, 65, 10, 116, 32, 8, 65, 22, 118, 114, 33, 1, 32, 7,
    32, 4, 106, 33, 5, 32, 3, 33, 4, 32, 2, 33, 3, 32, 1, 33, 2, 32, 6, 65, 7, 106, 65, 15, 113,
    34, 6, 65, 5, 71, 13, 0, 11, 65, 0, 33, 6, 3, 64, 32, 1, 32, 2, 32, 3, 114, 32, 4, 113, 32, 3,
    32, 4, 113, 114, 106, 32, 6, 65, 2, 116, 32, 0, 106, 40, 2, 20, 106, 65, 242, 195, 198, 162, 1,
    106, 34, 7, 65, 11, 116, 32, 7, 65, 21, 118, 114, 33, 7, 32, 5, 32, 1, 106, 34, 8, 65, 10, 116,
    32, 8, 65, 22, 118, 114, 33, 1, 32, 7, 32, 4, 106, 33, 5, 32, 3, 33, 4, 32, 2, 33, 3, 32, 1,
    33, 2, 32, 6, 65, 3, 106, 65, 15, 113, 34, 6, 65, 13, 71, 13, 0, 11, 32, 0, 32, 0, 40, 2, 0,
    32, 1, 106, 54, 2, 0, 32, 0, 32, 0, 40, 2, 4, 32, 2, 106, 54, 2, 4, 32, 0, 32, 0, 40, 2, 8, 32,
    3, 106, 54, 2, 8, 32, 0, 32, 0, 40, 2, 12, 32, 4, 106, 54, 2, 12, 32, 0, 32, 0, 40, 2, 16, 32,
    5, 106, 54, 2, 16, 32, 0, 11,
  ]);
  const wasmModule = await WebAssembly.instantiate(wasmCode);
  const instance = wasmModule.instance as any;
  const mem = new Uint8Array(instance.exports.memory.buffer);
  const dataLen = data.length;
  const totalLen = dataLen + 1 + (64 - ((dataLen + 9) % 64));
  mem.set(data, 20);
  mem[20 + dataLen] = 0x80;
  for (let i = 20 + dataLen + 1; i < 20 + totalLen - 8; i++) mem[i] = 0;
  const bitLen = dataLen * 8;
  for (let i = 0; i < 8; i++) mem[20 + totalLen - 8 + i] = (bitLen >>> (i * 8)) & 0xff;
  for (let offset = 0; offset < totalLen; offset += 64) {
    instance.exports.hash(0, 20 + offset);
  }
  return mem.slice(0, 20);
}

async function base58CheckDecode(s: string): Promise<Uint8Array> {
  const decoded = base58Decode(s);
  if (decoded.length < 5) throw new Error('Invalid base58check');
  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const hash = await sha256d(payload);
  if (!checksum.every((b, i) => b === hash[i])) throw new Error('Invalid checksum');
  return payload.slice(1);
}

async function base58CheckEncode(payload: Uint8Array): Promise<string> {
  const hash = await sha256d(payload);
  const checksum = hash.slice(0, 4);
  const data = new Uint8Array([...payload, ...checksum]);
  return base58Encode(data);
}

// Convert HEX private key to WIF format (LanaCoin prefix = 0xB0)
async function hexPrivateKeyToWIF(hexKey: string): Promise<string> {
  const prefix = new Uint8Array([0xB0]); // LanaCoin WIF prefix
  const privateKeyBytes = hexToUint8Array(hexKey);
  const payload = new Uint8Array(prefix.length + privateKeyBytes.length);
  payload.set(prefix);
  payload.set(privateKeyBytes, prefix.length);
  return await base58CheckEncode(payload);
}

// ===== Elliptic Curve Point Class =====
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

class Point {
  constructor(public x: bigint | null, public y: bigint | null) {}

  static G = new Point(Gx, Gy);

  add(other: Point): Point {
    if (this.x === null) return other;
    if (other.x === null) return this;
    if (this.x === other.x) {
      if (this.y === other.y) return this.double();
      return new Point(null, null);
    }
    const slope = (mod(other.y! - this.y!, P) * modInverse(mod(other.x - this.x, P), P)) % P;
    const x3 = mod(slope * slope - this.x - other.x, P);
    const y3 = mod(slope * (this.x - x3) - this.y!, P);
    return new Point(x3, y3);
  }

  double(): Point {
    if (this.y === 0n) return new Point(null, null);
    const slope = (mod(3n * this.x! * this.x! * modInverse(2n * this.y!, P), P)) % P;
    const x3 = mod(slope * slope - 2n * this.x!, P);
    const y3 = mod(slope * (this.x! - x3) - this.y!, P);
    return new Point(x3, y3);
  }

  multiply(scalar: bigint): Point {
    let result: Point = new Point(null, null);
    let addend: Point = this;
    while (scalar > 0n) {
      if (scalar & 1n) result = result.add(addend);
      addend = addend.double();
      scalar >>= 1n;
    }
    return result;
  }
}

function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const quotient = old_r / r;
    [old_r, r] = [r, old_r - quotient * r];
    [old_s, s] = [s, old_s - quotient * s];
  }
  return mod(old_s, m);
}

function privateKeyToPublicKey(privateKeyHex: string): Uint8Array {
  const d = BigInt('0x' + privateKeyHex);
  const point = Point.G.multiply(d);
  const x = point.x!.toString(16).padStart(64, '0');
  const y = point.y!.toString(16).padStart(64, '0');
  const prefix = point.y! % 2n === 0n ? '02' : '03';
  return hexToUint8Array(prefix + x);
}

async function publicKeyToAddress(publicKey: Uint8Array): Promise<string> {
  const hash = await sha256(publicKey);
  const ripemd = await ripemd160(hash);
  const prefix = new Uint8Array([0x30]);
  const payload = new Uint8Array([...prefix, ...ripemd]);
  return await base58CheckEncode(payload);
}

// ===== ECDSA Signing =====
function signECDSA(messageHash: Uint8Array, privateKeyHex: string): { r: bigint; s: bigint } {
  const z = BigInt('0x' + uint8ArrayToHex(messageHash));
  const d = BigInt('0x' + privateKeyHex);
  let k: bigint;
  let r: bigint = 0n;
  let s: bigint = 0n;
  do {
    k = BigInt('0x' + uint8ArrayToHex(crypto.getRandomValues(new Uint8Array(32)))) % (N - 1n) + 1n;
    const R = Point.G.multiply(k);
    r = R.x! % N;
    if (r === 0n) continue;
    s = (modInverse(k, N) * (z + r * d)) % N;
  } while (r === 0n || s === 0n);
  if (s > N / 2n) s = N - s;
  return { r, s };
}

function encodeDERSignature(r: bigint, s: bigint): Uint8Array {
  const encodeInt = (n: bigint) => {
    let hex = n.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    let bytes = hexToUint8Array(hex);
    if (bytes[0] & 0x80) bytes = new Uint8Array([0, ...bytes]);
    return new Uint8Array([0x02, bytes.length, ...bytes]);
  };
  const rEnc = encodeInt(r);
  const sEnc = encodeInt(s);
  const seq = new Uint8Array([...rEnc, ...sEnc]);
  return new Uint8Array([0x30, seq.length, ...seq]);
}

// ===== UTXO Selection =====
interface UTXO {
  txid: string;
  vout: number;
  value: number;
}

class UTXOSelector {
  constructor(private utxos: UTXO[]) {}

  select(targetSatoshis: number): UTXO[] {
    const sorted = [...this.utxos]
      .filter((u) => u.value >= 10000)
      .sort((a, b) => b.value - a.value);
    const selected: UTXO[] = [];
    let total = 0;
    for (const utxo of sorted) {
      selected.push(utxo);
      total += utxo.value;
      if (total >= targetSatoshis) break;
    }
    return selected;
  }

  getTotalValue(): number {
    return this.utxos.reduce((sum, u) => sum + u.value, 0);
  }
}

// ===== Electrum Communication =====
function connectElectrum(
  host: string,
  port: number,
  protocol: string
): Promise<Deno.TlsConn | Deno.TcpConn> {
  if (protocol === 'ssl') {
    return Deno.connectTls({ hostname: host, port });
  } else {
    return Deno.connect({ hostname: host, port });
  }
}

async function electrumCall(conn: Deno.TlsConn | Deno.TcpConn, method: string, params: any[]) {
  const request = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) + '\n';
  await conn.write(new TextEncoder().encode(request));
  const buf = new Uint8Array(1024 * 1024);
  const n = await conn.read(buf);
  if (!n) throw new Error('No response from Electrum');
  const response = new TextDecoder().decode(buf.slice(0, n));
  const lines = response.trim().split('\n');
  const json = JSON.parse(lines[lines.length - 1]);
  if (json.error) throw new Error(`Electrum error: ${JSON.stringify(json.error)}`);
  return json.result;
}

function parseScriptPubkeyFromRawTx(rawTxHex: string, vout: number): string {
  let idx = 8;
  const vinCount = parseInt(rawTxHex.substr(idx, 2), 16);
  idx += 2;
  for (let i = 0; i < vinCount; i++) {
    idx += 64 + 8;
    const scriptLen = parseInt(rawTxHex.substr(idx, 2), 16);
    idx += 2 + scriptLen * 2 + 8;
  }
  const voutCount = parseInt(rawTxHex.substr(idx, 2), 16);
  idx += 2;
  for (let i = 0; i < voutCount; i++) {
    const value = rawTxHex.substr(idx, 16);
    idx += 16;
    const scriptLen = parseInt(rawTxHex.substr(idx, 2), 16);
    idx += 2;
    const scriptPubKey = rawTxHex.substr(idx, scriptLen * 2);
    if (i === vout) return scriptPubKey;
    idx += scriptLen * 2;
  }
  throw new Error('vout not found');
}

// ===== Build Signed Transaction =====
async function buildSignedTx(
  senderAddress: string,
  recipients: Array<{ address: string; amountLANA: number }>,
  privateKeyWIF: string,
  utxos: UTXO[],
  feePerKB: number,
  electrumHost: string,
  electrumPort: number,
  electrumProtocol: string
): Promise<string> {
  const privateKeyBytes = await base58CheckDecode(privateKeyWIF);
  const privateKeyHex = uint8ArrayToHex(privateKeyBytes);
  const publicKey = privateKeyToPublicKey(privateKeyHex);

  // Build recipient outputs
  const outputs: Array<{ address: string; value: number }> = [];
  for (const recipient of recipients) {
    const satoshis = Math.floor(recipient.amountLANA * 100000000);
    outputs.push({ address: recipient.address, value: satoshis });
  }

  // Calculate total output value
  const totalOutput = outputs.reduce((sum, o) => sum + o.value, 0);

  // Estimate fee
  const estimatedSize = 10 + utxos.length * 150 + outputs.length * 34 + 34 + 10;
  const estimatedFee = Math.ceil((estimatedSize / 1000) * feePerKB);

  // Calculate change
  const totalInput = utxos.reduce((sum, u) => sum + u.value, 0);
  const changeValue = totalInput - totalOutput - estimatedFee;

  if (changeValue < 0) {
    throw new Error(`Insufficient funds. Need ${totalOutput + estimatedFee}, have ${totalInput}`);
  }

  // Add change output if significant
  if (changeValue >= 10000) {
    outputs.push({ address: senderAddress, value: changeValue });
  }

  // Fetch scriptPubKeys for all UTXOs
  const conn = await connectElectrum(electrumHost, electrumPort, electrumProtocol);
  const scriptPubKeys: string[] = [];
  
  try {
    for (const utxo of utxos) {
      const rawTx = await electrumCall(conn, 'blockchain.transaction.get', [utxo.txid]);
      const scriptPubKey = parseScriptPubkeyFromRawTx(rawTx, utxo.vout);
      scriptPubKeys.push(scriptPubKey);
    }
  } finally {
    conn.close();
  }

  // Build transaction hex
  let txHex = '01000000'; // version
  txHex += utxos.length.toString(16).padStart(2, '0'); // vin count

  // Add inputs (unsigned)
  for (const utxo of utxos) {
    txHex += utxo.txid.match(/../g)!.reverse().join('');
    txHex += utxo.vout.toString(16).padStart(8, '0').match(/../g)!.reverse().join('');
    txHex += '00'; // scriptSig length (empty for now)
    txHex += 'ffffffff'; // sequence
  }

  // Add outputs
  txHex += outputs.length.toString(16).padStart(2, '0');
  for (const output of outputs) {
    const valueLittleEndian = output.value
      .toString(16)
      .padStart(16, '0')
      .match(/../g)!
      .reverse()
      .join('');
    txHex += valueLittleEndian;
    const decoded = await base58CheckDecode(output.address);
    const scriptPubKey = '76a914' + uint8ArrayToHex(decoded) + '88ac';
    const scriptLen = (scriptPubKey.length / 2).toString(16).padStart(2, '0');
    txHex += scriptLen + scriptPubKey;
  }

  txHex += '00000000'; // locktime

  // Sign each input
  const signedInputs: string[] = [];
  for (let i = 0; i < utxos.length; i++) {
    const scriptPubKey = scriptPubKeys[i];
    let txCopy = '01000000';
    txCopy += utxos.length.toString(16).padStart(2, '0');

    for (let j = 0; j < utxos.length; j++) {
      txCopy += utxos[j].txid.match(/../g)!.reverse().join('');
      txCopy += utxos[j].vout.toString(16).padStart(8, '0').match(/../g)!.reverse().join('');
      if (j === i) {
        const scriptLen = (scriptPubKey.length / 2).toString(16).padStart(2, '0');
        txCopy += scriptLen + scriptPubKey;
      } else {
        txCopy += '00';
      }
      txCopy += 'ffffffff';
    }

    txCopy += outputs.length.toString(16).padStart(2, '0');
    for (const output of outputs) {
      const valueLittleEndian = output.value
        .toString(16)
        .padStart(16, '0')
        .match(/../g)!
        .reverse()
        .join('');
      txCopy += valueLittleEndian;
      const decoded = await base58CheckDecode(output.address);
      const scriptPubKeyOut = '76a914' + uint8ArrayToHex(decoded) + '88ac';
      const scriptLen = (scriptPubKeyOut.length / 2).toString(16).padStart(2, '0');
      txCopy += scriptLen + scriptPubKeyOut;
    }

    txCopy += '00000000';
    txCopy += '01000000'; // SIGHASH_ALL

    const txBytes = hexToUint8Array(txCopy);
    const messageHash = await sha256d(txBytes);
    const { r, s } = signECDSA(messageHash, privateKeyHex);
    const derSig = encodeDERSignature(r, s);
    const sigWithHashType = new Uint8Array([...derSig, 0x01]);
    const scriptSig =
      sigWithHashType.length.toString(16).padStart(2, '0') +
      uint8ArrayToHex(sigWithHashType) +
      publicKey.length.toString(16).padStart(2, '0') +
      uint8ArrayToHex(publicKey);

    signedInputs.push(scriptSig);
  }

  // Build final signed transaction
  let signedTxHex = '01000000';
  signedTxHex += utxos.length.toString(16).padStart(2, '0');

  for (let i = 0; i < utxos.length; i++) {
    signedTxHex += utxos[i].txid.match(/../g)!.reverse().join('');
    signedTxHex += utxos[i].vout.toString(16).padStart(8, '0').match(/../g)!.reverse().join('');
    const scriptSigLen = (signedInputs[i].length / 2).toString(16).padStart(2, '0');
    signedTxHex += scriptSigLen + signedInputs[i];
    signedTxHex += 'ffffffff';
  }

  signedTxHex += outputs.length.toString(16).padStart(2, '0');
  for (const output of outputs) {
    const valueLittleEndian = output.value
      .toString(16)
      .padStart(16, '0')
      .match(/../g)!
      .reverse()
      .join('');
    signedTxHex += valueLittleEndian;
    const decoded = await base58CheckDecode(output.address);
    const scriptPubKey = '76a914' + uint8ArrayToHex(decoded) + '88ac';
    const scriptLen = (scriptPubKey.length / 2).toString(16).padStart(2, '0');
    signedTxHex += scriptLen + scriptPubKey;
  }

  signedTxHex += '00000000';

  return signedTxHex;
}

// ===== Main Handler =====
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🔄 Starting pending LANA payments processing...');

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch pending records from buy_lana
    console.log('📋 Fetching pending payment records...');
    const { data: pendingRecords, error: fetchError } = await supabase
      .from('buy_lana')
      .select('id, lana_wallet_id, lana_amount')
      .is('tx', null)
      .not('paid_on_account', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching pending records:', fetchError);
      throw fetchError;
    }

    if (!pendingRecords || pendingRecords.length === 0) {
      console.log('✅ No pending payments to process');
      return new Response(
        JSON.stringify({ message: 'No pending payments to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`📦 Found ${pendingRecords.length} pending payment(s)`);

    // 2. Get private key from app_settings
    console.log('🔑 Fetching private key from app_settings...');
    const { data: settingData, error: settingError } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'main_publisher_private_key')
      .single();

    if (settingError || !settingData) {
      console.error('❌ Error fetching private key:', settingError);
      throw new Error('Private key not found in app_settings');
    }

    const hexPrivateKey = settingData.setting_value;
    console.log('✅ Private key retrieved');

    // 3. Convert HEX to WIF
    console.log('🔄 Converting HEX private key to WIF format...');
    const privateKeyWIF = await hexPrivateKeyToWIF(hexPrivateKey);

    // 4. Derive sender address
    console.log('🏦 Deriving sender wallet address...');
    const publicKey = privateKeyToPublicKey(hexPrivateKey);
    const senderAddress = await publicKeyToAddress(publicKey);
    console.log(`✅ Sender address: ${senderAddress}`);

    // 5. Prepare recipients list
    const recipients = pendingRecords.map((record) => ({
      address: record.lana_wallet_id,
      amountLANA: record.lana_amount,
    }));

    console.log('📋 Recipients:', recipients);

    // 6. Electrum configuration
    const electrumHost = 'node1.lana.cash';
    const electrumPort = 50002;
    const electrumProtocol = 'ssl';
    const feePerKB = 1000;

    // 7. Fetch UTXOs
    console.log('💰 Fetching UTXOs for sender address...');
    const conn1 = await connectElectrum(electrumHost, electrumPort, electrumProtocol);
    let utxos: UTXO[];
    
    try {
      const scriptHash = uint8ArrayToHex(
        (await sha256(hexToUint8Array('76a914' + uint8ArrayToHex(await base58CheckDecode(senderAddress)) + '88ac')))
          .reverse()
      );
      const utxoList = await electrumCall(conn1, 'blockchain.scripthash.listunspent', [scriptHash]);
      utxos = utxoList.map((u: any) => ({
        txid: u.tx_hash,
        vout: u.tx_pos,
        value: u.value,
      }));
    } finally {
      conn1.close();
    }

    console.log(`✅ Found ${utxos.length} UTXOs`);

    if (utxos.length === 0) {
      throw new Error('No UTXOs available for sender address');
    }

    // 8. Calculate required amount
    const totalOutputSatoshis = recipients.reduce((sum, r) => sum + Math.floor(r.amountLANA * 100000000), 0);
    const estimatedSize = 10 + utxos.length * 150 + (recipients.length + 1) * 34 + 10;
    const estimatedFee = Math.ceil((estimatedSize / 1000) * feePerKB);
    const requiredSatoshis = totalOutputSatoshis + estimatedFee;

    console.log(`💵 Total output: ${totalOutputSatoshis} sats, Est. fee: ${estimatedFee} sats`);

    // 9. Select UTXOs
    const selector = new UTXOSelector(utxos);
    const selectedUtxos = selector.select(requiredSatoshis);

    if (selectedUtxos.length === 0) {
      throw new Error(`Insufficient funds. Need ${requiredSatoshis} sats`);
    }

    console.log(`✅ Selected ${selectedUtxos.length} UTXO(s)`);

    // 10. Build and sign transaction
    console.log('🔨 Building and signing transaction...');
    const signedTxHex = await buildSignedTx(
      senderAddress,
      recipients,
      privateKeyWIF,
      selectedUtxos,
      feePerKB,
      electrumHost,
      electrumPort,
      electrumProtocol
    );

    console.log('✅ Transaction signed');

    // 11. Broadcast transaction
    console.log('📡 Broadcasting transaction...');
    const conn2 = await connectElectrum(electrumHost, electrumPort, electrumProtocol);
    let txid: string;
    
    try {
      txid = await electrumCall(conn2, 'blockchain.transaction.broadcast', [signedTxHex]);
    } finally {
      conn2.close();
    }

    console.log(`✅ Transaction broadcasted! TXID: ${txid}`);

    // 12. Update all processed records
    console.log('💾 Updating database records...');
    const recordIds = pendingRecords.map((r) => r.id);
    const { error: updateError } = await supabase
      .from('buy_lana')
      .update({ tx: txid, updated_at: new Date().toISOString() })
      .in('id', recordIds);

    if (updateError) {
      console.error('❌ Error updating records:', updateError);
      throw updateError;
    }

    console.log(`✅ Successfully updated ${recordIds.length} record(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        txid,
        processed: recordIds.length,
        recipients: recipients.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('❌ Error processing pending payments:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
