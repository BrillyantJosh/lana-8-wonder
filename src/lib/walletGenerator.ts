import { ec as EC } from 'elliptic';
import CryptoJS from 'crypto-js';

const ec = new EC('secp256k1');

function generateRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return array;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): number[] {
  const matches = hex.match(/.{2}/g);
  if (!matches) return [];
  return matches.map(byte => parseInt(byte, 16));
}

async function sha256(hex: string): Promise<string> {
  const bytes = new Uint8Array(hexToBytes(hex));
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(hashBuffer));
}

function ripemd160(hex: string): string {
  return CryptoJS.RIPEMD160(CryptoJS.enc.Hex.parse(hex)).toString();
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
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = '1' + encoded;
  }
  return encoded;
}

async function encodeWIF(privateKeyHex: string): Promise<string> {
  // Staking format: 0xB0 prefix + private key + 0x01 compression flag → WIF starts with 'T'
  const extendedKey = "b0" + privateKeyHex + "01";
  const checksum = await sha256(await sha256(extendedKey));
  const wifHex = extendedKey + checksum.substring(0, 8);
  return base58Encode(new Uint8Array(hexToBytes(wifHex)));
}

async function generatePublicKey(privateKeyHex: string): Promise<string> {
  const keyPair = ec.keyFromPrivate(privateKeyHex);
  const pubKeyPoint = keyPair.getPublic();
  // Compressed public key: 02/03 prefix + x coordinate
  const prefix = pubKeyPoint.getY().isEven() ? "02" : "03";
  return prefix + pubKeyPoint.getX().toString(16).padStart(64, '0');
}

async function generateLanaAddress(publicKeyHex: string): Promise<string> {
  const sha256Hash = await sha256(publicKeyHex);
  const hash160 = ripemd160(sha256Hash);
  const versionedPayload = "30" + hash160;
  const checksum = await sha256(await sha256(versionedPayload));
  const finalAddress = base58Encode(new Uint8Array(hexToBytes(versionedPayload + checksum.substring(0, 8))));
  return finalAddress;
}

export interface GeneratedWallet {
  privateKey: string;
  address: string;
}

export async function generateWallet(): Promise<GeneratedWallet> {
  const privateKeyBytes = generateRandomBytes(32);
  const privateKeyHex = bytesToHex(privateKeyBytes);
  const wif = await encodeWIF(privateKeyHex);
  
  const publicKey = await generatePublicKey(privateKeyHex);
  const address = await generateLanaAddress(publicKey);
  
  return {
    privateKey: wif,
    address
  };
}

export async function generate8Wallets(): Promise<GeneratedWallet[]> {
  const wallets: GeneratedWallet[] = [];
  for (let i = 0; i < 8; i++) {
    wallets.push(await generateWallet());
  }
  return wallets;
}
