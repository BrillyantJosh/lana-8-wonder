// Consolidated LANA cryptocurrency transaction library for Node.js
// Ported from Deno edge functions (send-lana-transaction, send-lana-multi-output, process-pending-buylana-payments)
// Key changes: crypto.subtle.digest -> Node.js crypto.createHash (synchronous)

import crypto from 'crypto';
import hashjs from 'hash.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// LANA mainnet version byte for addresses
const LANA_VERSION_BYTE = 0x30;

// ─── secp256k1 Point class (internal) ────────────────────────────────────────

class Point {
  x: bigint;
  y: bigint;

  constructor(x: bigint, y: bigint) {
    this.x = x;
    this.y = y;
  }

  static ZERO = new Point(0n, 0n);
  static P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
  static N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  static Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
  static Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
  static G = new Point(Point.Gx, Point.Gy);

  static mod(a: bigint, m: bigint): bigint {
    const result = a % m;
    return result >= 0n ? result : result + m;
  }

  static modInverse(a: bigint, m: bigint): bigint {
    if (a === 0n) return 0n;
    let lm = 1n, hm = 0n;
    let low = Point.mod(a, m), high = m;
    while (low > 1n) {
      const ratio = high / low;
      const nm = hm - lm * ratio;
      const nw = high - low * ratio;
      hm = lm;
      high = low;
      lm = nm;
      low = nw;
    }
    return Point.mod(lm, m);
  }

  add(other: Point): Point {
    if (this.x === 0n && this.y === 0n) return other;
    if (other.x === 0n && other.y === 0n) return this;
    if (this.x === other.x) {
      if (this.y === other.y) {
        // Point doubling
        const s = Point.mod(3n * this.x * this.x * Point.modInverse(2n * this.y, Point.P), Point.P);
        const x = Point.mod(s * s - 2n * this.x, Point.P);
        const y = Point.mod(s * (this.x - x) - this.y, Point.P);
        return new Point(x, y);
      } else {
        return Point.ZERO;
      }
    } else {
      const s = Point.mod((other.y - this.y) * Point.modInverse(other.x - this.x, Point.P), Point.P);
      const x = Point.mod(s * s - this.x - other.x, Point.P);
      const y = Point.mod(s * (this.x - x) - this.y, Point.P);
      return new Point(x, y);
    }
  }

  multiply(scalar: bigint): Point {
    if (scalar === 0n) return Point.ZERO;
    if (scalar === 1n) return this;
    let result: Point = Point.ZERO;
    let addend: Point = this;
    while (scalar > 0n) {
      if (scalar & 1n) {
        result = result.add(addend);
      }
      addend = addend.add(addend);
      scalar >>= 1n;
    }
    return result;
  }
}

// ─── Utility functions ───────────────────────────────────────────────────────

export function hexToUint8Array(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return result;
}

export function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Hash functions (synchronous Node.js crypto) ─────────────────────────────

export function sha256(data: Uint8Array): Uint8Array {
  const hash = crypto.createHash('sha256').update(Buffer.from(data)).digest();
  return new Uint8Array(hash);
}

export function sha256d(data: Uint8Array): Uint8Array {
  const hash1 = crypto.createHash('sha256').update(Buffer.from(data)).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  return new Uint8Array(hash2);
}

// ─── Base58 encoding/decoding ────────────────────────────────────────────────

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let x = BigInt('0x' + uint8ArrayToHex(bytes));
  let result = '';
  while (x > 0n) {
    const remainder = Number(x % 58n);
    result = BASE58_ALPHABET[remainder] + result;
    x = x / 58n;
  }
  // Add leading '1's for leading zero bytes
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result = '1' + result;
  }
  return result;
}

export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);
  let bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const p = BASE58_ALPHABET.indexOf(c);
    if (p < 0) throw new Error('Invalid base58 character');
    let carry = p;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Count leading '1's
  let leadingOnes = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    leadingOnes++;
  }
  const result = new Uint8Array(leadingOnes + bytes.length);
  bytes.reverse();
  result.set(bytes, leadingOnes);
  return result;
}

export function base58CheckDecode(str: string): Uint8Array {
  const decoded = base58Decode(str);
  if (decoded.length < 4) throw new Error('Invalid base58check');
  const payload = decoded.slice(0, -4);
  // Skip checksum verification (matches edge function behavior)
  return payload;
}

export function base58CheckEncode(payload: Uint8Array): string {
  const hash1 = crypto.createHash('sha256').update(Buffer.from(payload)).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  const checksum = new Uint8Array(hash2).slice(0, 4);
  const withChecksum = new Uint8Array(payload.length + 4);
  withChecksum.set(payload);
  withChecksum.set(checksum, payload.length);
  return base58Encode(withChecksum);
}

// ─── Varint / pushData encoding ──────────────────────────────────────────────

export function encodeVarint(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n]);
  } else if (n <= 0xffff) {
    const result = new Uint8Array(3);
    result[0] = 0xfd;
    result[1] = n & 0xff;
    result[2] = n >> 8 & 0xff;
    return result;
  } else {
    throw new Error('Varint too large');
  }
}

export function pushData(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(1 + data.length);
  result[0] = data.length;
  result.set(data, 1);
  return result;
}

// ─── WIF normalization ───────────────────────────────────────────────────────

export function normalizeWif(wif: string): string {
  return wif.replace(/[\s\u200B-\u200D\uFEFF\r\n]/g, '').trim();
}

// ─── Key operations ──────────────────────────────────────────────────────────

export function privateKeyToPublicKey(privateKeyHex: string): Uint8Array {
  const privateKeyBigInt = BigInt('0x' + privateKeyHex);
  const publicKeyPoint = Point.G.multiply(privateKeyBigInt);
  // Convert to uncompressed format (0x04 + x + y)
  const x = publicKeyPoint.x.toString(16).padStart(64, '0');
  const y = publicKeyPoint.y.toString(16).padStart(64, '0');
  const result = new Uint8Array(65);
  result[0] = 0x04;
  result.set(hexToUint8Array(x), 1);
  result.set(hexToUint8Array(y), 33);
  return result;
}

export function publicKeyToAddress(publicKey: Uint8Array): string {
  // Step 1: SHA-256 hash of public key
  const sha256Hash = sha256(publicKey);
  // Step 2: RIPEMD-160 hash of SHA-256 result
  const hash160Array = hashjs.ripemd160().update(Array.from(sha256Hash)).digest();
  const hash160 = new Uint8Array(hash160Array);
  // Step 3: Add version byte (0x30 for LANA mainnet)
  const payload = new Uint8Array(21);
  payload[0] = LANA_VERSION_BYTE;
  payload.set(hash160, 1);
  // Step 4: Base58Check encode (synchronous now)
  const address = base58CheckEncode(payload);
  return address;
}

// ─── DER encoding for ECDSA signature ────────────────────────────────────────

export function encodeDER(r: bigint, s: bigint): Uint8Array {
  const rHex = r.toString(16).padStart(64, '0');
  const sHex = s.toString(16).padStart(64, '0');
  const rArray = Array.from(hexToUint8Array(rHex));
  const sArray = Array.from(hexToUint8Array(sHex));
  while (rArray.length > 1 && rArray[0] === 0) rArray.shift();
  while (sArray.length > 1 && sArray[0] === 0) sArray.shift();
  if (rArray[0] >= 0x80) rArray.unshift(0);
  if (sArray[0] >= 0x80) sArray.unshift(0);
  const der = [0x30, 0x00, 0x02, rArray.length, ...rArray, 0x02, sArray.length, ...sArray];
  der[1] = der.length - 2;
  return new Uint8Array(der);
}

// ─── ECDSA signing with secp256k1 ────────────────────────────────────────────

export function signECDSA(privateKeyHex: string, messageHash: Uint8Array): Uint8Array {
  const privateKey = BigInt('0x' + privateKeyHex);
  const z = BigInt('0x' + uint8ArrayToHex(messageHash));
  const k = Point.mod(z + privateKey, Point.N);
  if (k === 0n) throw new Error('Invalid k');
  const kG = Point.G.multiply(k);
  const r = Point.mod(kG.x, Point.N);
  if (r === 0n) throw new Error('Invalid r');
  const kInv = Point.modInverse(k, Point.N);
  const s = Point.mod(kInv * (z + r * privateKey), Point.N);
  if (s === 0n) throw new Error('Invalid s');
  const finalS = s > Point.N / 2n ? Point.N - s : s;
  return encodeDER(r, finalS);
}

// ─── Raw transaction parsing ─────────────────────────────────────────────────

export function parseScriptPubkeyFromRawTx(rawHex: string, voutIndex: number): Uint8Array {
  const tx = hexToUint8Array(rawHex);
  let cursor = 0;

  const readVarint = () => {
    const first = tx[cursor++];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const value = tx[cursor] | tx[cursor + 1] << 8;
      cursor += 2;
      return value;
    }
    if (first === 0xfe) {
      const value = tx[cursor] | tx[cursor + 1] << 8 | tx[cursor + 2] << 16 | tx[cursor + 3] << 24;
      cursor += 4;
      return value;
    }
    throw new Error('Varint too large');
  };

  cursor += 4; // version
  cursor += 4; // nTime
  const vinCount = readVarint();
  console.log(`Transaction has ${vinCount} inputs`);

  // Skip inputs
  for (let i = 0; i < vinCount; i++) {
    cursor += 32; // txid
    cursor += 4; // vout
    const scriptLen = readVarint();
    cursor += scriptLen; // scriptSig
    cursor += 4; // sequence
  }

  const voutCount = readVarint();
  console.log(`Transaction has ${voutCount} outputs, looking for index ${voutIndex}`);

  if (voutIndex >= voutCount) {
    throw new Error(`vout index ${voutIndex} >= output count ${voutCount}`);
  }

  // Locate output
  for (let i = 0; i < voutCount; i++) {
    cursor += 8; // value
    const scriptLen = readVarint();
    const script = tx.slice(cursor, cursor + scriptLen);
    if (i === voutIndex) {
      console.log(`Found output ${voutIndex} with script length ${scriptLen}`);
      return script;
    }
    cursor += scriptLen;
  }

  throw new Error(`vout index ${voutIndex} not found in ${voutCount} outputs`);
}

// ─── UTXO Selector ──────────────────────────────────────────────────────────

export class UTXOSelector {
  static MAX_INPUTS = 500;
  static DUST_THRESHOLD = 500000; // 0.005 LANA = 500,000 satoshis - anything below is dust

  static selectUTXOs(utxos: any[], totalNeeded: number): { selected: any[]; totalValue: number } {
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available for selection');
    }
    console.log(`UTXO Selection: Need ${totalNeeded} satoshis from ${utxos.length} UTXOs`);
    const totalAvailable = utxos.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
    console.log(`Total available: ${totalAvailable} satoshis (${(totalAvailable / 100000000).toFixed(8)} LANA)`);

    if (totalAvailable < totalNeeded) {
      throw new Error(
        `Insufficient total UTXO value: ${totalAvailable} < ${totalNeeded} satoshis. ` +
        `Available: ${(totalAvailable / 100000000).toFixed(8)} LANA, ` +
        `Needed: ${(totalNeeded / 100000000).toFixed(8)} LANA`
      );
    }

    // Sort by value (largest first)
    const sortedUTXOs = [...utxos].sort((a: any, b: any) => b.value - a.value);

    console.log('Top 10 largest UTXOs:');
    sortedUTXOs.slice(0, 10).forEach((utxo: any, i: number) => {
      console.log(`  ${i + 1}. ${utxo.value} satoshis (${(utxo.value / 100000000).toFixed(8)} LANA) - ${utxo.tx_hash}:${utxo.tx_pos}`);
    });

    // Filter out dust UTXOs (< 500,000 satoshis)
    const nonDustUtxos = sortedUTXOs.filter((u: any) => u.value >= this.DUST_THRESHOLD);

    if (nonDustUtxos.length < sortedUTXOs.length) {
      console.log(`Filtered out ${sortedUTXOs.length - nonDustUtxos.length} dust UTXOs (< ${this.DUST_THRESHOLD} satoshis = ${(this.DUST_THRESHOLD / 100000000).toFixed(8)} LANA)`);
    }

    if (nonDustUtxos.length === 0) {
      console.warn('No non-dust UTXOs available, using all UTXOs');
    }

    const workingSet = nonDustUtxos.length > 0 ? nonDustUtxos : sortedUTXOs;

    // Strategy: Add UTXOs ONE BY ONE until we have enough (minimizes transaction size)
    console.log(`Selecting minimum UTXOs needed for ${(totalNeeded / 100000000).toFixed(8)} LANA...`);

    const selectedUTXOs: any[] = [];
    let totalSelected = 0;

    // Add UTXOs one by one until we have enough
    for (let i = 0; i < workingSet.length && selectedUTXOs.length < this.MAX_INPUTS; i++) {
      selectedUTXOs.push(workingSet[i]);
      totalSelected += workingSet[i].value;

      if (totalSelected >= totalNeeded) {
        console.log(
          `Sufficient funds reached with ${selectedUTXOs.length} UTXOs: ` +
          `total: ${(totalSelected / 100000000).toFixed(8)} LANA`
        );
        return { selected: selectedUTXOs, totalValue: totalSelected };
      }
    }

    // If still insufficient with non-dust UTXOs, try including dust
    if (nonDustUtxos.length !== sortedUTXOs.length) {
      console.log('Including dust UTXOs to meet target...');
      for (const utxo of sortedUTXOs) {
        if (selectedUTXOs.some((s: any) => s.tx_hash === utxo.tx_hash && s.tx_pos === utxo.tx_pos)) continue;
        if (selectedUTXOs.length >= this.MAX_INPUTS) break;

        selectedUTXOs.push(utxo);
        totalSelected += utxo.value;

        if (totalSelected >= totalNeeded) {
          console.log(
            `Solution with dust UTXOs: ${selectedUTXOs.length} inputs, ` +
            `total: ${(totalSelected / 100000000).toFixed(8)} LANA`
          );
          return { selected: selectedUTXOs, totalValue: totalSelected };
        }
      }
    }

    throw new Error(
      `Cannot build transaction: Need ${(totalNeeded / 100000000).toFixed(8)} LANA but ` +
      `only ${(totalSelected / 100000000).toFixed(8)} LANA available in ${selectedUTXOs.length} UTXOs. ` +
      `Total wallet balance: ${(totalAvailable / 100000000).toFixed(8)} LANA. ` +
      `Recommendation: Consolidate UTXOs first by sending all funds to yourself.`
    );
  }
}

// ─── Build and sign transaction ──────────────────────────────────────────────

export async function buildSignedTx(
  selectedUTXOs: any[],
  privateKeyWIF: string,
  recipients: any[],
  fee: number,
  changeAddress: string,
  electrumCallFn: (method: string, params: any[]) => Promise<any>
): Promise<string> {
  console.log('Building transaction with enhanced validation...');
  console.log(`Recipients: ${recipients.length} outputs`);
  console.log(`Using ${selectedUTXOs.length} pre-selected UTXOs`);

  try {
    if (!selectedUTXOs || selectedUTXOs.length === 0) throw new Error('No UTXOs provided for transaction building');
    if (recipients.length === 0) throw new Error('No recipients provided');

    const totalAmount = recipients.reduce((sum: number, recipient: any) => sum + recipient.amount, 0);
    if (totalAmount <= 0) throw new Error('Invalid total amount: must be positive');
    if (fee <= 0) throw new Error('Invalid fee: must be positive');

    const totalValue = selectedUTXOs.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
    console.log(`Total input value from ${selectedUTXOs.length} UTXOs: ${totalValue} satoshis (${(totalValue / 100000000).toFixed(8)} LANA)`);
    console.log(`Transaction breakdown: Amount=${totalAmount}, Fee=${fee}, Change=${totalValue - totalAmount - fee}`);

    // Decode private key
    const normalizedPrivateKey = normalizeWif(privateKeyWIF);
    console.log(`Private key normalized: length=${normalizedPrivateKey.length}`);
    const privateKeyBytes = base58CheckDecode(normalizedPrivateKey);
    const privateKeyHex = uint8ArrayToHex(privateKeyBytes.slice(1));
    console.log('Private key decoded successfully');

    // Generate public key
    const publicKey = privateKeyToPublicKey(privateKeyHex);
    console.log('Public key generated successfully');

    // Build recipient outputs
    const outputs: Uint8Array[] = [];
    for (const recipient of recipients) {
      const recipientHash = base58CheckDecode(recipient.address).slice(1);
      const recipientScript = new Uint8Array([0x76, 0xa9, 0x14, ...recipientHash, 0x88, 0xac]);
      const recipientValueBytes = new Uint8Array(8);
      new DataView(recipientValueBytes.buffer).setBigUint64(0, BigInt(recipient.amount), true);
      const recipientOut = new Uint8Array([
        ...recipientValueBytes,
        ...encodeVarint(recipientScript.length),
        ...recipientScript
      ]);
      outputs.push(recipientOut);
      console.log(`Output ${outputs.length}: ${recipient.address} = ${(recipient.amount / 100000000).toFixed(8)} LANA`);
    }

    // Calculate change
    const changeAmount = totalValue - totalAmount - fee;
    let outputCount = recipients.length;

    if (changeAmount > 1000) {
      const changeHash = base58CheckDecode(changeAddress).slice(1);
      const changeScript = new Uint8Array([0x76, 0xa9, 0x14, ...changeHash, 0x88, 0xac]);
      const changeValueBytes = new Uint8Array(8);
      new DataView(changeValueBytes.buffer).setBigUint64(0, BigInt(changeAmount), true);
      const changeOut = new Uint8Array([
        ...changeValueBytes,
        ...encodeVarint(changeScript.length),
        ...changeScript
      ]);
      outputs.push(changeOut);
      outputCount++;
      console.log(`Change output added: ${(changeAmount / 100000000).toFixed(8)} LANA`);
    } else if (changeAmount > 0) {
      console.log(`Change amount too small (${changeAmount}), adding to fee`);
    }

    const version = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
    const nTime = new Uint8Array(4);
    const timestamp = Math.floor(Date.now() / 1000);
    new DataView(nTime.buffer).setUint32(0, timestamp, true);
    const locktime = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    const hashType = new Uint8Array([0x01, 0x00, 0x00, 0x00]);

    // Process each input
    const signedInputs: Uint8Array[] = [];
    console.log(`Starting to process ${selectedUTXOs.length} UTXOs...`);

    // Store scriptPubkeys for all UTXOs first
    const scriptPubkeys: Uint8Array[] = [];
    for (let i = 0; i < selectedUTXOs.length; i++) {
      const utxo = selectedUTXOs[i];
      console.log(`Fetching scriptPubKey for UTXO ${i + 1}/${selectedUTXOs.length}: ${utxo.tx_hash}:${utxo.tx_pos}`);
      const rawTx = await electrumCallFn('blockchain.transaction.get', [utxo.tx_hash]);
      const scriptPubkey = parseScriptPubkeyFromRawTx(rawTx, utxo.tx_pos);
      scriptPubkeys.push(scriptPubkey);
    }

    // Now sign each input
    for (let i = 0; i < selectedUTXOs.length; i++) {
      const utxo = selectedUTXOs[i];
      console.log(`Processing UTXO ${i + 1}/${selectedUTXOs.length}: ${utxo.tx_hash}:${utxo.tx_pos}`);

      try {
        console.log(`Script pubkey for input ${i + 1}: ${scriptPubkeys[i].length} bytes`);

        // Build ALL inputs for preimage (SIGHASH_ALL)
        const preimageInputs: Uint8Array[] = [];
        for (let j = 0; j < selectedUTXOs.length; j++) {
          const uj = selectedUTXOs[j];
          const txidJ = hexToUint8Array(uj.tx_hash).reverse();
          const voutJ = new Uint8Array(4);
          new DataView(voutJ.buffer).setUint32(0, uj.tx_pos, true);

          // Only input i gets its scriptPubKey, others get empty script
          const scriptForJ = (j === i) ? scriptPubkeys[j] : new Uint8Array(0);

          const inputJ = new Uint8Array([
            ...txidJ,
            ...voutJ,
            ...encodeVarint(scriptForJ.length),
            ...scriptForJ,
            0xff, 0xff, 0xff, 0xff // sequence
          ]);
          preimageInputs.push(inputJ);
        }

        // Concatenate all preimage inputs
        const allPreimageInputs = preimageInputs.reduce((acc, cur) => {
          const out = new Uint8Array(acc.length + cur.length);
          out.set(acc);
          out.set(cur, acc.length);
          return out;
        }, new Uint8Array(0));

        // Build all outputs
        const allOutputs = new Uint8Array(outputs.reduce((total, output) => total + output.length, 0));
        let offset = 0;
        for (const output of outputs) {
          allOutputs.set(output, offset);
          offset += output.length;
        }

        // Build preimage with ALL inputs and varint counts
        const preimage = new Uint8Array([
          ...version,
          ...nTime,
          ...encodeVarint(selectedUTXOs.length),
          ...allPreimageInputs,
          ...encodeVarint(outputCount),
          ...allOutputs,
          ...locktime,
          ...hashType
        ]);

        // Sign (synchronous now)
        const sighash = sha256d(preimage);
        console.log(`Sighash computed for input ${i + 1}`);

        const signature = signECDSA(privateKeyHex, sighash);
        const signatureWithHashType = new Uint8Array([...signature, 0x01]);
        const scriptSig = new Uint8Array([
          ...pushData(signatureWithHashType),
          ...pushData(publicKey)
        ]);

        const txid = hexToUint8Array(utxo.tx_hash).reverse();
        const voutBytes = new Uint8Array(4);
        new DataView(voutBytes.buffer).setUint32(0, utxo.tx_pos, true);

        const signedInput = new Uint8Array([
          ...txid,
          ...voutBytes,
          ...encodeVarint(scriptSig.length),
          ...scriptSig,
          0xff, 0xff, 0xff, 0xff
        ]);

        signedInputs.push(signedInput);
        console.log(`Input ${i + 1} signed successfully`);
      } catch (utxoError) {
        console.error(`Failed to process UTXO ${i + 1}:`, utxoError);
        throw new Error(
          `Failed to process UTXO ${i + 1}/${selectedUTXOs.length}: ${
            utxoError instanceof Error ? utxoError.message : 'Unknown error'
          }`
        );
      }
    }

    console.log(`ALL ${selectedUTXOs.length} UTXOs PROCESSED SUCCESSFULLY!`);
    console.log(`Building final transaction from ${signedInputs.length} signed inputs...`);

    // Build final transaction
    const allInputs = new Uint8Array(signedInputs.reduce((total, input) => total + input.length, 0));
    let offset = 0;
    for (const input of signedInputs) {
      allInputs.set(input, offset);
      offset += input.length;
    }

    const allOutputs = new Uint8Array(outputs.reduce((total, output) => total + output.length, 0));
    offset = 0;
    for (const output of outputs) {
      allOutputs.set(output, offset);
      offset += output.length;
    }

    console.log(`Assembling final transaction: ${selectedUTXOs.length} inputs, ${outputCount} outputs...`);

    const finalTx = new Uint8Array([
      ...version,
      ...nTime,
      ...encodeVarint(selectedUTXOs.length),
      ...allInputs,
      ...encodeVarint(outputCount),
      ...allOutputs,
      ...locktime
    ]);

    console.log(`Final transaction assembled successfully!`);
    const finalTxHex = uint8ArrayToHex(finalTx);
    console.log(`Final transaction built: ${finalTxHex.length} chars, ${selectedUTXOs.length} inputs, ${outputCount} outputs`);
    console.log(`Transaction size: ${finalTxHex.length / 2} bytes`);

    return finalTxHex;
  } catch (error) {
    console.error('Transaction building error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown transaction error';
    throw new Error(`Failed to build transaction: ${errorMessage}`);
  }
}
