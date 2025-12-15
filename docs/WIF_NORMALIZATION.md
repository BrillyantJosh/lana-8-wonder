# WIF Key Normalization - Technical Documentation

## Overview

WIF (Wallet Import Format) private keys can contain invisible characters when copied from various sources (QR scanners, PDFs, websites, messaging apps). These characters cause Base58 decoding to fail with "Invalid base58 character" errors.

## The Problem

When users copy/paste or scan WIF keys, invisible characters can be introduced:

| Character | Unicode | Source |
|-----------|---------|--------|
| Space | `\s` | Copy/paste, manual entry |
| Newline | `\n`, `\r` | QR scanners, text files |
| Zero-width space | `\u200B` | Web pages, rich text |
| Zero-width non-joiner | `\u200C` | Unicode text processing |
| Zero-width joiner | `\u200D` | Unicode text processing |
| BOM (Byte Order Mark) | `\uFEFF` | Text editors, file encoding |

## Solution: Normalization Function

### JavaScript/TypeScript Implementation

```typescript
/**
 * Normalizes a WIF private key by removing all invisible characters
 * that can cause Base58 decoding failures.
 * 
 * @param wif - The WIF private key string (potentially with invisible chars)
 * @returns Clean WIF string ready for Base58 decoding
 */
function normalizeWif(wif: string): string {
  return wif.replace(/[\s\u200B-\u200D\uFEFF\r\n]/g, '').trim();
}
```

### Regex Breakdown

```
[\s\u200B-\u200D\uFEFF\r\n]
│  │           │     │  │
│  │           │     │  └─ Carriage return + newline
│  │           │     └──── BOM (Byte Order Mark)
│  │           └────────── Zero-width chars range (200B, 200C, 200D)
│  └────────────────────── All standard whitespace (space, tab, etc.)
└───────────────────────── Character class
```

## Usage Examples

### Frontend Validation

```typescript
import { normalizeWif } from '@/lib/keyNormalization';

async function validateWif(wif: string): Promise<boolean> {
  const normalized = normalizeWif(wif);
  
  // Now safe to Base58 decode
  try {
    const decoded = base58Decode(normalized);
    return true;
  } catch (error) {
    return false;
  }
}
```

### Edge Function / Backend

```typescript
// Deno edge function example
function normalizeWif(wif: string): string {
  return wif.replace(/[\s\u200B-\u200D\uFEFF\r\n]/g, '').trim();
}

// Use before any Base58 operation
const normalizedKey = normalizeWif(private_key);
const privateKeyBytes = base58CheckDecode(normalizedKey);
```

### QR Code Scanning

```typescript
function onQrCodeScanned(scannedValue: string) {
  // QR scanners often append \n at the end
  const cleanWif = normalizeWif(scannedValue);
  processWif(cleanWif);
}
```

## Debug Logging (Recommended)

For troubleshooting, log key metadata without exposing the actual key:

```typescript
const normalized = normalizeWif(wif);
console.log(`🔑 Key normalized: length=${normalized.length}, first=${normalized[0]}, last=${normalized[normalized.length-1]}`);
```

## Integration Checklist

When implementing WIF handling, apply normalization at these points:

- [ ] **Login/Authentication forms** - Before validating user input
- [ ] **QR code scanners** - Immediately after scanning
- [ ] **Transaction signing** - Before decoding private key
- [ ] **Key validation endpoints** - Before Base58 operations
- [ ] **Import/Export functions** - When reading keys from files

## Testing

Test your implementation with these edge cases:

```typescript
// Test cases
const testCases = [
  "6v7y8KLxbYtvcp1PRQXLQBX5778cHVtvhfyjZorLsxp8P9MS97A",           // Clean
  "6v7y8KLxbYtvcp1PRQXLQBX5778cHVtvhfyjZorLsxp8P9MS97A\n",          // Trailing newline
  " 6v7y8KLxbYtvcp1PRQXLQBX5778cHVtvhfyjZorLsxp8P9MS97A ",          // Spaces
  "6v7y8KLxbYtvcp1PRQXLQBX5778cHVtvhfyjZorLsxp8P9MS97A\u200B",      // Zero-width space
  "\uFEFF6v7y8KLxbYtvcp1PRQXLQBX5778cHVtvhfyjZorLsxp8P9MS97A",      // BOM prefix
];

testCases.forEach(wif => {
  const normalized = normalizeWif(wif);
  console.log(`Input length: ${wif.length}, Normalized length: ${normalized.length}`);
});
```

## Related Files in This Project

- `src/lib/keyNormalization.ts` - Frontend normalization utilities
- `src/lib/wifValidation.ts` - WIF validation with normalization
- `supabase/functions/send-lana-multi-output/index.ts` - Backend normalization
- `supabase/functions/send-lana-transaction/index.ts` - Backend normalization

## Security Notes

1. **Never log full private keys** - Only log length and first/last character
2. **Apply normalization early** - Before any validation or storage
3. **Consistent handling** - Use the same normalization on frontend and backend
