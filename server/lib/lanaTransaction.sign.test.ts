import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildSignedTx, base58CheckEncode, base58CheckDecode,
  privateKeyToCompressedPublicKey, privateKeyToPublicKey, publicKeyToAddress,
} from './lanaTransaction.js';
import { auditSignedTx, fundingTxHex, p2pkh } from './lanaTxAudit.testutil.js';

/** A throwaway wallet — never a real one. */
function throwawayWallet(compressed: boolean) {
  const priv = crypto.randomBytes(32);
  const privHex = priv.toString('hex');
  const wif = base58CheckEncode(new Uint8Array([0xb0, ...priv, ...(compressed ? [1] : [])]));
  const pub = compressed ? privateKeyToCompressedPublicKey(privHex) : privateKeyToPublicKey(privHex);
  const address = publicKeyToAddress(pub);
  return { d: BigInt('0x' + privHex), wif, address, script: p2pkh(base58CheckDecode(address).slice(1)) };
}

describe('buildSignedTx — the transaction the server signs and broadcasts', () => {
  for (const compressed of [true, false]) {
    it(`every input verifies and no key can be computed from it (${compressed ? 'compressed' : 'uncompressed'} WIF)`, async () => {
      const from = throwawayWallet(compressed);
      const to = throwawayWallet(true);
      const raw = fundingTxHex([{ value: 3e8, script: from.script }, { value: 2e8, script: from.script }]);
      const utxos = [{ tx_hash: 'aa'.repeat(32), tx_pos: 0, value: 3e8 }, { tx_hash: 'bb'.repeat(32), tx_pos: 1, value: 2e8 }];
      const txHex = await buildSignedTx(utxos, from.wif, [{ address: to.address, amount: 4e8 }], 10000, from.address,
        async (method) => { assert.equal(method, 'blockchain.transaction.get'); return raw; });

      const sigs = auditSignedTx(txHex, [from.script, from.script], [from.d]);
      assert.equal(sigs.length, 2);
      for (const sig of sigs) {
        assert.equal(sig.verifies, true, `input ${sig.input} does not verify`);
        assert.equal(sig.keyRecovered, false, `input ${sig.input} leaks the private key`);
      }
    });
  }
});
