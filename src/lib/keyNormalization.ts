/**
 * Key Normalization Utilities
 * 
 * Handles invisible characters that cause copy/paste issues with private keys
 * Based on documentation from 100Million2Everyone.com
 */

/**
 * Normalizes a private key by removing all whitespace and zero-width characters
 * 
 * Removes:
 * - \s - All standard whitespace (spaces, tabs, newlines)
 * - \u200B - Zero-width space
 * - \u200C - Zero-width non-joiner
 * - \u200D - Zero-width joiner
 * - \uFEFF - Zero-width no-break space (BOM)
 */
export const normalizePrivateKey = (key: string): string => {
  return key.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
};

/**
 * Compares two private keys after normalization
 */
export const compareKeys = (key1: string, key2: string): boolean => {
  return normalizePrivateKey(key1) === normalizePrivateKey(key2);
};
