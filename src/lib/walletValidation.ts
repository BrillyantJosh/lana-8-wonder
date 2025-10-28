import CryptoJS from 'crypto-js';

// Utility functions
function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(hex: string): Promise<string> {
  const buffer = hexToBytes(hex);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const firstHash = await crypto.subtle.digest("SHA-256", dataBuffer);
  const secondHash = await crypto.subtle.digest("SHA-256", firstHash as ArrayBuffer);
  return new Uint8Array(secondHash);
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

/**
 * Validates a LanaCoin wallet address
 * - Must start with 'L'
 * - Must be Base58 encoded
 * - Must have valid checksum
 * - Must have version byte 0x30 (48) for LanaCoin
 */
export async function validateLanaAddress(address: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    // Check if address starts with 'L'
    if (!address.startsWith('L')) {
      return {
        valid: false,
        error: 'LanaCoin address must start with "L"'
      };
    }
    
    // Check minimum length (typical crypto address length)
    if (address.length < 26 || address.length > 35) {
      return {
        valid: false,
        error: 'Invalid address length'
      };
    }
    
    // Decode Base58
    let decoded: Uint8Array;
    try {
      decoded = base58Decode(address);
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid Base58 encoding'
      };
    }
    
    // Check decoded length (version + hash160 + checksum)
    if (decoded.length !== 25) {
      return {
        valid: false,
        error: 'Invalid decoded address length'
      };
    }
    
    // Extract components
    const payload = decoded.slice(0, -4);
    const checksum = decoded.slice(-4);
    
    // Verify version byte (0x30 = 48 for LanaCoin)
    if (payload[0] !== 0x30) {
      return {
        valid: false,
        error: 'Invalid version byte for LanaCoin'
      };
    }
    
    // Verify checksum
    const hash = await sha256d(payload);
    const expectedChecksum = hash.slice(0, 4);
    
    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== expectedChecksum[i]) {
        return {
          valid: false,
          error: 'Invalid address checksum'
        };
      }
    }
    
    return {
      valid: true
    };
    
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}
