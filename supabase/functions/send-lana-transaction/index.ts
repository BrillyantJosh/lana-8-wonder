import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ripemd160 } from "https://esm.sh/hash.js@1.1.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Base58 alphabet
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Base58 encoding functions
function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let x = BigInt('0x' + uint8ArrayToHex(bytes));
  let result = '';
  while(x > 0n){
    const remainder = Number(x % 58n);
    result = BASE58_ALPHABET[remainder] + result;
    x = x / 58n;
  }
  // Add leading '1's for leading zero bytes
  for(let i = 0; i < bytes.length && bytes[i] === 0; i++){
    result = '1' + result;
  }
  return result;
}

function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);
  let bytes = [0];
  for(let i = 0; i < str.length; i++){
    const c = str[i];
    const p = BASE58_ALPHABET.indexOf(c);
    if (p < 0) throw new Error('Invalid base58 character');
    let carry = p;
    for(let j = 0; j < bytes.length; j++){
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while(carry > 0){
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Count leading '1's
  let leadingOnes = 0;
  for(let i = 0; i < str.length && str[i] === '1'; i++){
    leadingOnes++;
  }
  const result = new Uint8Array(leadingOnes + bytes.length);
  bytes.reverse();
  result.set(bytes, leadingOnes);
  return result;
}

function base58CheckDecode(str: string): Uint8Array {
  const decoded = base58Decode(str);
  if (decoded.length < 4) throw new Error('Invalid base58check');
  const payload = decoded.slice(0, -4);
  // Skip checksum verification in edge function
  return payload;
}

async function base58CheckEncode(payload: Uint8Array): Promise<string> {
  const hash1 = await crypto.subtle.digest('SHA-256', new Uint8Array(payload));
  const hash2 = await crypto.subtle.digest('SHA-256', hash1);
  const checksum = new Uint8Array(hash2).slice(0, 4);
  const withChecksum = new Uint8Array(payload.length + 4);
  withChecksum.set(payload);
  withChecksum.set(checksum, payload.length);
  return base58Encode(withChecksum);
}

// SHA256 double hash
async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  const hash1 = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  const hash2 = await crypto.subtle.digest('SHA-256', hash1);
  return new Uint8Array(hash2);
}

// Utility functions
function hexToUint8Array(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for(let i = 0; i < hex.length; i += 2){
    result[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return result;
}

function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array).map((b)=>b.toString(16).padStart(2, '0')).join('');
}

// Varint encoding
function encodeVarint(n: number): Uint8Array {
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

function pushData(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(1 + data.length);
  result[0] = data.length;
  result.set(data, 1);
  return result;
}

// secp256k1 Point operations
class Point {
  x: bigint;
  y: bigint;
  
  constructor(x: bigint, y: bigint){
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
    while(low > 1n){
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
    while(scalar > 0n){
      if (scalar & 1n) {
        result = result.add(addend);
      }
      addend = addend.add(addend);
      scalar >>= 1n;
    }
    return result;
  }
}

// Convert private key to public key
function privateKeyToPublicKey(privateKeyHex: string): Uint8Array {
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

// Convert public key to LANA address
async function publicKeyToAddress(publicKey: Uint8Array): Promise<string> {
  // Step 1: SHA-256 hash of public key
  const sha256HashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(publicKey));
  const sha256Hash = new Uint8Array(sha256HashBuffer);
  // Step 2: RIPEMD-160 hash of SHA-256 result
  const hash160Array = ripemd160().update(Array.from(sha256Hash)).digest();
  const hash160 = new Uint8Array(hash160Array);
  // Step 3: Add version byte (0x30 for LANA mainnet)
  const payload = new Uint8Array(21);
  payload[0] = 0x30;
  payload.set(hash160, 1);
  // Step 4: Base58Check encode
  const address = await base58CheckEncode(payload);
  console.log('🔑 Public Key (first 16 bytes):', uint8ArrayToHex(publicKey.slice(0, 16)));
  console.log('📝 SHA-256 hash:', uint8ArrayToHex(sha256Hash));
  console.log('📝 RIPEMD-160 hash:', uint8ArrayToHex(hash160));
  console.log('📍 Generated address:', address);
  return address;
}

// Simple DER encoding for ECDSA signature
function encodeDER(r: bigint, s: bigint): Uint8Array {
  const rHex = r.toString(16).padStart(64, '0');
  const sHex = s.toString(16).padStart(64, '0');
  const rArray = Array.from(hexToUint8Array(rHex));
  const sArray = Array.from(hexToUint8Array(sHex));
  while(rArray.length > 1 && rArray[0] === 0) rArray.shift();
  while(sArray.length > 1 && sArray[0] === 0) sArray.shift();
  if (rArray[0] >= 0x80) rArray.unshift(0);
  if (sArray[0] >= 0x80) sArray.unshift(0);
  const der = [0x30, 0x00, 0x02, rArray.length, ...rArray, 0x02, sArray.length, ...sArray];
  der[1] = der.length - 2;
  return new Uint8Array(der);
}

// ECDSA signing with secp256k1
function signECDSA(privateKeyHex: string, messageHash: Uint8Array): Uint8Array {
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

// Enhanced UTXO Selection with largest-first strategy and input limit
class UTXOSelector {
  static MAX_INPUTS = 500;
  
  static selectUTXOs(utxos: any[], totalNeeded: number) {
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available for selection');
    }
    console.log(`🔍 UTXO Selection: Need ${totalNeeded} satoshis from ${utxos.length} UTXOs`);
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    console.log(`💰 Total available: ${totalAvailable} satoshis (${(totalAvailable / 100000000).toFixed(8)} LANA)`);
    
    if (totalAvailable < totalNeeded) {
      throw new Error(
        `Insufficient total UTXO value: ${totalAvailable} < ${totalNeeded} satoshis. ` +
        `Available: ${(totalAvailable / 100000000).toFixed(8)} LANA, ` +
        `Needed: ${(totalNeeded / 100000000).toFixed(8)} LANA`
      );
    }
    
    // Sort by value (largest first)
    const sortedUTXOs = [...utxos].sort((a, b) => b.value - a.value);
    
    // Log top 10 largest UTXOs
    console.log('🏆 Top 10 largest UTXOs:');
    sortedUTXOs.slice(0, 10).forEach((utxo, i) => {
      console.log(`  ${i + 1}. ${utxo.value} satoshis (${(utxo.value / 100000000).toFixed(8)} LANA) - ${utxo.tx_hash}:${utxo.tx_pos}`);
    });
    
    // Strategy 1: Single UTXO solution
    for (const utxo of sortedUTXOs) {
      if (utxo.value >= totalNeeded) {
        console.log(`✅ Single UTXO solution: ${(utxo.value / 100000000).toFixed(8)} LANA`);
        return { selected: [utxo], totalValue: utxo.value };
      }
    }
    
    // Strategy 2: Largest-first with input limit
    const selectedUTXOs = [];
    let totalSelected = 0;
    console.log(`📦 Using multi-UTXO strategy (max ${this.MAX_INPUTS} inputs)...`);
    
    for (const utxo of sortedUTXOs) {
      if (selectedUTXOs.length >= this.MAX_INPUTS) {
        console.warn(`⚠️ Reached maximum input limit (${this.MAX_INPUTS})`);
        break;
      }
      selectedUTXOs.push(utxo);
      totalSelected += utxo.value;
      
      if (selectedUTXOs.length % 50 === 0) {
        console.log(`📊 Progress: ${selectedUTXOs.length} UTXOs, ${(totalSelected / 100000000).toFixed(8)} LANA`);
      }
      
      if (totalSelected >= totalNeeded) {
        console.log(
          `✅ Multi-UTXO solution: ${selectedUTXOs.length} inputs, ` +
          `total: ${(totalSelected / 100000000).toFixed(8)} LANA`
        );
        return { selected: selectedUTXOs, totalValue: totalSelected };
      }
    }
    
    throw new Error(
      `Cannot build transaction: Need ${(totalNeeded / 100000000).toFixed(8)} LANA but ` +
      `only ${(totalSelected / 100000000).toFixed(8)} LANA available in top ${this.MAX_INPUTS} UTXOs. ` +
      `Total wallet balance: ${(totalAvailable / 100000000).toFixed(8)} LANA. ` +
      `Recommendation: Consolidate UTXOs first by sending all funds to yourself.`
    );
  }
}

// Enhanced Electrum connection with retry logic
async function connectElectrum(servers: any[], maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (const server of servers) {
      try {
        console.log(`🔌 Connecting to ${server.host}:${server.port} (attempt ${attempt + 1})`);
        const conn = await Deno.connect({ hostname: server.host, port: server.port });
        console.log(`✅ Connected to ${server.host}:${server.port}`);
        return conn;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
        console.error(`❌ Failed to connect to ${server.host}:${server.port}:`, errorMessage);
      }
    }
    if (attempt < maxRetries - 1) {
      console.log(`⏳ Waiting 1 second before retry...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Failed to connect to any Electrum server');
}

// Enhanced Electrum RPC call with timeout and retry
async function electrumCall(method: string, params: any[], servers: any[], timeout = 30000) {
  let conn = null;
  try {
    conn = await connectElectrum(servers);
    const request = { id: Date.now(), method, params };
    const requestData = JSON.stringify(request) + '\n';
    console.log(`📤 Electrum ${method}:`, params);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Electrum call timeout after ${timeout}ms`)), timeout);
    });
    
    const callPromise = (async () => {
      await conn.write(new TextEncoder().encode(requestData));
      let responseText = '';
      const buffer = new Uint8Array(8192);
      
      while (true) {
        const bytesRead = await conn.read(buffer);
        if (!bytesRead) break;
        const chunk = new TextDecoder().decode(buffer.slice(0, bytesRead));
        responseText += chunk;
        if (responseText.includes('\n')) break;
      }
      
      if (!responseText) throw new Error('No response from Electrum server');
      responseText = responseText.trim();
      console.log(`📥 Electrum response (${responseText.length} bytes):`, responseText.substring(0, 500));
      
      const response = JSON.parse(responseText);
      if (response.error) throw new Error(`Electrum error: ${JSON.stringify(response.error)}`);
      return response.result;
    })();
    
    return await Promise.race([callPromise, timeoutPromise]);
  } catch (error) {
    console.error(`❌ Electrum call error for ${method}:`, error);
    throw error;
  } finally {
    if (conn) {
      try {
        conn.close();
      } catch (e) {
        console.warn('Warning: Failed to close connection:', e);
      }
    }
  }
}

// Parse script pubkey from raw transaction
function parseScriptPubkeyFromRawTx(rawHex: string, voutIndex: number): Uint8Array {
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
  console.log(`📥 Transaction has ${vinCount} inputs`);
  
  // Skip inputs
  for (let i = 0; i < vinCount; i++) {
    cursor += 32; // txid
    cursor += 4; // vout
    const scriptLen = readVarint();
    cursor += scriptLen; // scriptSig
    cursor += 4; // sequence
  }
  
  const voutCount = readVarint();
  console.log(`📤 Transaction has ${voutCount} outputs, looking for index ${voutIndex}`);
  
  if (voutIndex >= voutCount) {
    throw new Error(`vout index ${voutIndex} >= output count ${voutCount}`);
  }
  
  // Locate output
  for (let i = 0; i < voutCount; i++) {
    cursor += 8; // value
    const scriptLen = readVarint();
    const script = tx.slice(cursor, cursor + scriptLen);
    if (i === voutIndex) {
      console.log(`✅ Found output ${voutIndex} with script length ${scriptLen}`);
      return script;
    }
    cursor += scriptLen;
  }
  
  throw new Error(`vout index ${voutIndex} not found in ${voutCount} outputs`);
}

// Build and sign transaction
async function buildSignedTx(
  utxos: any[],
  privateKeyWIF: string,
  recipients: any[],
  fee: number,
  changeAddress: string,
  servers: any[]
) {
  console.log('🔧 Building transaction with enhanced validation...');
  
  try {
    if (!utxos || utxos.length === 0) throw new Error('No UTXOs provided for transaction building');
    if (recipients.length === 0) throw new Error('No recipients provided');
    
    const totalAmount = recipients.reduce((sum: number, recipient: any) => sum + recipient.amount, 0);
    if (totalAmount <= 0) throw new Error('Invalid total amount: must be positive');
    if (fee <= 0) throw new Error('Invalid fee: must be positive');
    
    const totalNeeded = totalAmount + fee;
    const { selected: selectedUTXOs, totalValue } = UTXOSelector.selectUTXOs(utxos, totalNeeded);
    
    console.log(`💰 Selected ${selectedUTXOs.length} UTXOs with total value: ${totalValue} satoshis`);
    console.log(`💸 Transaction breakdown: Amount=${totalAmount}, Fee=${fee}, Change=${totalValue - totalNeeded}`);
    
    // Decode private key
    const privateKeyBytes = base58CheckDecode(privateKeyWIF);
    const privateKeyHex = uint8ArrayToHex(privateKeyBytes.slice(1));
    console.log('🔑 Private key decoded successfully');
    
    // Generate public key
    const publicKey = privateKeyToPublicKey(privateKeyHex);
    console.log('🔑 Public key generated successfully');
    
    // Build recipient outputs
    const outputs = [];
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
      console.log('✅ Change output added');
    } else {
      console.log('⚠️ Change amount too small, adding to fee');
    }
    
    const version = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
    const nTime = new Uint8Array(4);
    const timestamp = Math.floor(Date.now() / 1000);
    new DataView(nTime.buffer).setUint32(0, timestamp, true);
    const locktime = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    const hashType = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
    
    // Process each input
    const signedInputs = [];
    console.log(`🔄 Starting to process ${selectedUTXOs.length} UTXOs...`);
    
    // Store scriptPubkeys for all UTXOs first
    const scriptPubkeys: Uint8Array[] = [];
    for (let i = 0; i < selectedUTXOs.length; i++) {
      const utxo = selectedUTXOs[i];
      console.log(`🔍 Fetching scriptPubKey for UTXO ${i + 1}/${selectedUTXOs.length}: ${utxo.tx_hash}:${utxo.tx_pos}`);
      const rawTx = await electrumCall('blockchain.transaction.get', [utxo.tx_hash], servers);
      const scriptPubkey = parseScriptPubkeyFromRawTx(rawTx, utxo.tx_pos);
      scriptPubkeys.push(scriptPubkey);
    }
    
    // Now sign each input
    for (let i = 0; i < selectedUTXOs.length; i++) {
      const utxo = selectedUTXOs[i];
      console.log(`🔍 Processing UTXO ${i + 1}/${selectedUTXOs.length}: ${utxo.tx_hash}:${utxo.tx_pos}`);
      
      try {
        console.log(`📜 Script pubkey for input ${i + 1}: ${scriptPubkeys[i].length} bytes`);
        
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
        
        // Sign
        const sighash = await sha256d(preimage);
        console.log(`🔑 Sighash computed for input ${i + 1}`);
        
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
        console.log(`✅ Input ${i + 1} signed successfully`);
      } catch (utxoError) {
        console.error(`❌ Failed to process UTXO ${i + 1}:`, utxoError);
        throw new Error(
          `Failed to process UTXO ${i + 1}/${selectedUTXOs.length}: ${
            utxoError instanceof Error ? utxoError.message : 'Unknown error'
          }`
        );
      }
    }
    
    console.log(`✅✅✅ ALL ${selectedUTXOs.length} UTXOs PROCESSED SUCCESSFULLY!`);
    console.log(`🔨 Building final transaction from ${signedInputs.length} signed inputs...`);
    
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
    
    console.log(`📦 Assembling final transaction: ${selectedUTXOs.length} inputs, ${outputCount} outputs...`);
    
    const finalTx = new Uint8Array([
      ...version,
      ...nTime,
      ...encodeVarint(selectedUTXOs.length),
      ...allInputs,
      ...encodeVarint(outputCount),
      ...allOutputs,
      ...locktime
    ]);
    
    console.log(`✅ Final transaction assembled successfully!`);
    const finalTxHex = uint8ArrayToHex(finalTx);
    console.log(`🎯 Final transaction built: ${finalTxHex.length} chars, ${selectedUTXOs.length} inputs, ${outputCount} outputs`);
    console.log(`📊 Transaction size: ${finalTxHex.length / 2} bytes`);
    
    return { 
      txHex: finalTxHex, 
      inputCount: selectedUTXOs.length, 
      outputCount, 
      selectedUTXOs 
    };
  } catch (error) {
    console.error('❌ Transaction building error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown transaction error';
    throw new Error(`Failed to build transaction: ${errorMessage}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    console.log('🚀 Starting LANA transaction...');
    const { senderAddress, recipientAddress, amount, privateKey, electrumServers } = await req.json();
    
    console.log('📋 Transaction parameters:', {
      senderAddress,
      recipientAddress,
      amount,
      hasPrivateKey: !!privateKey
    });
    
    if (!senderAddress || !recipientAddress || !privateKey || !amount) {
      throw new Error('Missing required parameters');
    }
    
    // Validate private key matches sender address
    try {
      const privateKeyBytes = base58CheckDecode(privateKey);
      const privateKeyHex = uint8ArrayToHex(privateKeyBytes.slice(1));
      const generatedPubKey = privateKeyToPublicKey(privateKeyHex);
      const expectedAddress = await publicKeyToAddress(generatedPubKey);
      
      if (expectedAddress !== senderAddress) {
        throw new Error(
          `Private key does not match sender address. Expected: ${expectedAddress}, Got: ${senderAddress}`
        );
      }
      
      console.log('✅ Private key validation passed');
    } catch (error) {
      console.error('❌ Private key validation failed:', error);
      throw error;
    }
    
    // Use provided Electrum servers
    const servers = electrumServers && electrumServers.length > 0
      ? electrumServers
      : [
          { host: "electrum1.lanacoin.com", port: 5097 },
          { host: "electrum2.lanacoin.com", port: 5097 }
        ];
    
    console.log(`⚙️ Using Electrum servers:`, servers);
    
    const utxos = await electrumCall('blockchain.address.listunspent', [senderAddress], servers);
    if (!utxos || utxos.length === 0) throw new Error('No UTXOs available');
    console.log(`📦 Found ${utxos.length} UTXOs`);
    
    let amountSatoshis = Math.floor(amount * 100000000);
    const totalAvailable = utxos.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
    console.log(`💰 Total available: ${totalAvailable} satoshis (${(totalAvailable / 100000000).toFixed(8)} LANA)`);

    // Calculate initial dynamic fee with improved estimation
    const estimatedInputCount = Math.min(
      Math.ceil(utxos.length * 0.3), // ~30% of UTXOs as realistic estimate
      10 // Max 10 for safety (prevent too high initial fee)
    );
    let outputCount = 2;
    let fee = (estimatedInputCount * 180 + outputCount * 34 + 10) * 100;
    console.log(`💸 Initial fee estimate: ${fee} satoshis for ~${estimatedInputCount} inputs`);

    // Detect "send max" scenario: user wants to empty the wallet
    // If amount + fee exceeds total available, deduct fee from amount instead
    let isSendMax = false;
    if (amountSatoshis + fee > totalAvailable && amountSatoshis <= totalAvailable) {
      isSendMax = true;
      // Use ALL UTXOs, 1 output (no change), recalculate fee
      const allInputCount = Math.min(utxos.length, UTXOSelector.MAX_INPUTS);
      outputCount = 1; // No change output when emptying wallet
      fee = (allInputCount * 180 + outputCount * 34 + 10) * 100;
      amountSatoshis = totalAvailable - fee;

      if (amountSatoshis <= 0) {
        throw new Error(
          `Balance too low to cover transaction fee. ` +
          `Balance: ${(totalAvailable / 100000000).toFixed(8)} LANA, ` +
          `Fee: ${(fee / 100000000).toFixed(8)} LANA`
        );
      }

      console.log(`🔄 Send-max mode: deducting fee from amount. ` +
        `Sending ${(amountSatoshis / 100000000).toFixed(8)} LANA, ` +
        `Fee: ${(fee / 100000000).toFixed(8)} LANA (${allInputCount} inputs, ${outputCount} output)`);
    }

    // Pre-select UTXOs to know actual input count
    const totalNeeded = isSendMax ? totalAvailable : amountSatoshis + fee;
    const { selected: selectedUTXOs, totalValue } = UTXOSelector.selectUTXOs(utxos, totalNeeded);

    // Recalculate fee based on ACTUAL selected UTXOs
    const actualInputCount = selectedUTXOs.length;
    const actualFee = (actualInputCount * 180 + outputCount * 34 + 10) * 100;

    if (isSendMax) {
      // In send-max mode, always recalculate with actual inputs
      fee = actualFee;
      amountSatoshis = totalValue - fee;
      console.log(`🔄 Send-max final: ${(amountSatoshis / 100000000).toFixed(8)} LANA, fee: ${(fee / 100000000).toFixed(8)} LANA`);
    } else if (actualFee > fee) {
      console.log(`⚠️ Adjusting fee: ${fee} → ${actualFee} satoshis (${actualInputCount} actual inputs)`);
      fee = actualFee;

      // Check if we still have enough balance after fee adjustment
      const newTotalNeeded = amountSatoshis + fee;
      if (totalValue < newTotalNeeded) {
        // Try send-max as fallback: deduct fee from amount
        outputCount = 1;
        fee = (actualInputCount * 180 + outputCount * 34 + 10) * 100;
        amountSatoshis = totalValue - fee;
        isSendMax = true;
        console.log(`🔄 Switched to send-max: ${(amountSatoshis / 100000000).toFixed(8)} LANA, fee: ${(fee / 100000000).toFixed(8)} LANA`);

        if (amountSatoshis <= 0) {
          throw new Error(
            `Insufficient funds after fee adjustment. ` +
            `Need: ${(newTotalNeeded / 100000000).toFixed(8)} LANA, ` +
            `Have: ${(totalValue / 100000000).toFixed(8)} LANA`
          );
        }
      }
    } else {
      console.log(`✅ Fee sufficient: ${fee} satoshis for ${actualInputCount} inputs`);
    }

    const recipients = [{ address: recipientAddress, amount: amountSatoshis }];
    console.log(`💰 Sending ${amountSatoshis} satoshis (${(amountSatoshis / 100000000).toFixed(8)} LANA)${isSendMax ? ' [send-max]' : ''}`);
    
    const { txHex: signedTx, inputCount, outputCount: finalOutputCount } = await buildSignedTx(
      utxos, 
      privateKey, 
      recipients, 
      fee, 
      senderAddress, 
      servers
    );
    console.log('✍️ Transaction signed successfully');
    
    console.log('🚀 Broadcasting transaction...');
    const broadcastResult = await electrumCall('blockchain.transaction.broadcast', [signedTx], servers, 45000);
    
    if (!broadcastResult) throw new Error('Transaction broadcast failed - no result from Electrum server');
    
    let resultStr = typeof broadcastResult === 'string' ? broadcastResult : String(broadcastResult);
    
    if (
      resultStr.includes('TX rejected') ||
      resultStr.includes('code') ||
      resultStr.includes('-22') ||
      resultStr.includes('error') ||
      resultStr.includes('Error') ||
      resultStr.includes('failed') ||
      resultStr.includes('Failed')
    ) {
      // Enhanced error diagnostics
      const txSize = signedTx.length / 2;
      const feeRate = (fee / txSize).toFixed(2);
      const diagnosticInfo = {
        inputCount,
        outputCount: finalOutputCount,
        amount: amountSatoshis,
        fee,
        feeRate: parseFloat(feeRate),
        txSize
      };
      
      console.error('❌ Transaction rejected by network:', {
        error: resultStr,
        diagnostic: diagnosticInfo
      });
      
      const errorMsg = [
        `Transaction broadcast failed: ${resultStr}`,
        `\n📊 Diagnostic Info:`,
        `  • Inputs: ${diagnosticInfo.inputCount}`,
        `  • Outputs: ${diagnosticInfo.outputCount}`,
        `  • Amount: ${(diagnosticInfo.amount / 100000000).toFixed(8)} LANA`,
        `  • Fee: ${(diagnosticInfo.fee / 100000000).toFixed(8)} LANA`,
        `  • Fee rate: ${diagnosticInfo.feeRate} sat/byte`,
        `  • TX size: ${diagnosticInfo.txSize} bytes`,
        diagnosticInfo.feeRate < 1 
          ? `\n⚠️ LOW FEE RATE! Network may reject transactions below 1 sat/byte.`
          : '',
        diagnosticInfo.inputCount > 10
          ? `\n💡 Recommendation: Consolidate UTXOs by sending all funds to yourself first.`
          : ''
      ].filter(Boolean).join('\n');
      
      throw new Error(errorMsg);
    }
    
    const txHash = resultStr.trim();
    if (!/^[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error(`Invalid transaction ID format: ${txHash}`);
    }
    
    console.log('✅ Transaction broadcast successful:', txHash);
    
    return new Response(
      JSON.stringify({ success: true, txHash, amount: amountSatoshis, fee }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('❌ Transaction error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
