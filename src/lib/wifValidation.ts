import { ec as EC } from "elliptic";
import CryptoJS from "crypto-js";

// Utility functions
function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(hex: string): Promise<string> {
  const buffer = hexToBytes(hex);
  // Ensure we have a proper ArrayBuffer
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  // Create proper ArrayBuffer from Uint8Array
  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const firstHash = await crypto.subtle.digest("SHA-256", dataBuffer);
  const secondHash = await crypto.subtle.digest("SHA-256", firstHash as ArrayBuffer);
  return new Uint8Array(secondHash);
}

function ripemd160(data: string): string {
  return CryptoJS.RIPEMD160(CryptoJS.enc.Hex.parse(data)).toString();
}

function base58Encode(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt('0x' + bytesToHex(bytes));
  let encoded = "";
  
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    encoded = alphabet[Number(remainder)] + encoded;
  }
  
  // Handle leading zeros
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = '1' + encoded;
  }
  
  return encoded;
}

function base58Decode(encoded: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  
  for (const char of encoded) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error('Invalid Base58 character');
    num = num * 58n + BigInt(index);
  }
  
  let hex = num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  
  let bytes = hexToBytes(hex);
  
  // Handle leading '1's (zeros)
  for (const char of encoded) {
    if (char !== '1') break;
    bytes = new Uint8Array([0, ...bytes]);
  }
  
  return bytes;
}

// Convert WIF to raw private key hex — supports both Dominate (0xB0) and Staking (0x41) formats
async function wifToPrivateKey(wif: string): Promise<{ privateKeyHex: string; isCompressed: boolean }> {
  try {
    // CRITICAL: Normalize WIF to remove invisible characters (spaces, zero-width chars)
    const normalizedWif = wif.replace(/[\s\u200B-\u200D\uFEFF]/g, '');

    // Decode Base58
    const decoded = base58Decode(normalizedWif);

    // Extract components
    const payload = decoded.slice(0, -4);
    const checksum = decoded.slice(-4);

    // Verify checksum
    const hash = await sha256d(payload);
    const expectedChecksum = hash.slice(0, 4);

    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== expectedChecksum[i]) {
        throw new Error('Invalid WIF checksum');
      }
    }

    // Accept both: 0xB0 = Dominate (uncompressed), 0x41 = Staking (compressed, preferred)
    if (payload[0] !== 0xb0 && payload[0] !== 0x41) {
      throw new Error('Invalid WIF prefix for LanaCoin');
    }

    // Detect compression: 34 bytes with 0x01 flag = compressed (Staking)
    const isCompressed = payload.length === 34 && payload[33] === 0x01;

    // Extract private key (32 bytes after prefix)
    const privateKey = payload.slice(1, 33);
    return { privateKeyHex: bytesToHex(privateKey), isCompressed };

  } catch (error) {
    throw new Error(`Invalid WIF format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate uncompressed public key from private key (04 + x + y)
function generateUncompressedPublicKey(privateKeyHex: string): string {
  const ec = new EC('secp256k1');
  const keyPair = ec.keyFromPrivate(privateKeyHex);
  const pubKeyPoint = keyPair.getPublic();

  return "04" +
         pubKeyPoint.getX().toString(16).padStart(64, '0') +
         pubKeyPoint.getY().toString(16).padStart(64, '0');
}

// Generate compressed public key (02/03 + x)
function generateCompressedPublicKey(privateKeyHex: string): string {
  const ec = new EC('secp256k1');
  const keyPair = ec.keyFromPrivate(privateKeyHex);
  const pubKeyPoint = keyPair.getPublic();
  const prefix = pubKeyPoint.getY().isEven() ? "02" : "03";
  return prefix + pubKeyPoint.getX().toString(16).padStart(64, '0');
}

// Generate LanaCoin wallet address from public key
async function generateLanaAddress(publicKeyHex: string): Promise<string> {
  // Step 1: SHA-256 of public key
  const sha256Hash = await sha256(publicKeyHex);
  
  // Step 2: RIPEMD160 of SHA-256 hash
  const hash160 = ripemd160(sha256Hash);
  
  // Step 3: Add version byte (0x30 = 48 for LanaCoin)
  const versionedPayload = "30" + hash160;
  
  // Step 4: Double SHA-256 for checksum
  const firstHash = await sha256(versionedPayload);
  const checksum = await sha256(firstHash);
  
  // Step 5: Take first 4 bytes of checksum
  const finalPayload = versionedPayload + checksum.substring(0, 8);
  
  // Step 6: Base58 encode
  return base58Encode(hexToBytes(finalPayload));
}

// Main function to validate WIF and derive wallet address
export async function validateWifAndGetAddress(wif: string): Promise<{
  valid: boolean;
  walletId?: string;
  walletIdCompressed?: string;
  walletIdUncompressed?: string;
  isCompressed?: boolean;
  error?: string;
}> {
  try {
    const { privateKeyHex, isCompressed } = await wifToPrivateKey(wif);

    // Generate BOTH address types
    const compressedPubKey = generateCompressedPublicKey(privateKeyHex);
    const uncompressedPubKey = generateUncompressedPublicKey(privateKeyHex);

    const walletIdCompressed = await generateLanaAddress(compressedPubKey);
    const walletIdUncompressed = await generateLanaAddress(uncompressedPubKey);

    // Primary matches WIF format
    const walletId = isCompressed ? walletIdCompressed : walletIdUncompressed;

    return {
      valid: true,
      walletId,
      walletIdCompressed,
      walletIdUncompressed,
      isCompressed
    };

  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}

// Check if WIF matches expected wallet address (checks BOTH compressed and uncompressed)
export async function verifyWifMatchesWallet(wif: string, expectedWalletId: string): Promise<{
  matches: boolean;
  derivedWalletId?: string;
  error?: string;
}> {
  try {
    const normalizedExpectedWalletId = expectedWalletId.replace(/[\s\u200B-\u200D\uFEFF]/g, '');

    const result = await validateWifAndGetAddress(wif);

    if (!result.valid || !result.walletId) {
      return {
        matches: false,
        error: result.error || 'Failed to derive wallet address'
      };
    }

    // Check against BOTH address types (user might have registered with either format)
    const normalizedCompressed = result.walletIdCompressed?.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
    const normalizedUncompressed = result.walletIdUncompressed?.replace(/[\s\u200B-\u200D\uFEFF]/g, '');

    const matchesCompressed = normalizedCompressed === normalizedExpectedWalletId;
    const matchesUncompressed = normalizedUncompressed === normalizedExpectedWalletId;

    return {
      matches: matchesCompressed || matchesUncompressed,
      derivedWalletId: result.walletId
    };

  } catch (error) {
    return {
      matches: false,
      error: error instanceof Error ? error.message : 'Unknown verification error'
    };
  }
}
