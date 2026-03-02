import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { electrumCall, ElectrumServer } from '../lib/electrum.js';
import {
  normalizeWif,
  base58CheckDecode,
  uint8ArrayToHex,
  privateKeyToPublicKey,
  publicKeyToAddress,
  UTXOSelector,
  buildSignedTx
} from '../lib/lanaTransaction.js';

const router = Router();

// Electrum configuration (shared across all domains)
const servers: ElectrumServer[] = [
  { host: 'electrum1.lanacoin.com', port: 5097 },
  { host: 'electrum2.lanacoin.com', port: 5097 }
];

// Helper: process a batch of pending payments using a given WIF key
async function processPaymentBatch(
  pendingRecords: Array<{ id: string; lana_wallet_id: string; lana_amount: number }>,
  privateKeyWIF: string,
  label: string
): Promise<any> {
  const db = getDb();

  // 1. Derive sender address from WIF
  console.log(`[${label}] Deriving sender wallet address from WIF...`);
  const normalizedKey = normalizeWif(privateKeyWIF);
  const privateKeyBytes = base58CheckDecode(normalizedKey);
  const privateKeyHex = uint8ArrayToHex(privateKeyBytes.slice(1));
  const publicKey = privateKeyToPublicKey(privateKeyHex);
  const senderAddress = publicKeyToAddress(publicKey);
  console.log(`[${label}] Sender address: ${senderAddress}`);

  // 2. Prepare recipients list (convert LANA to satoshis)
  const recipients = pendingRecords.map((record) => ({
    address: record.lana_wallet_id,
    amount: Math.round(record.lana_amount * 100000000) // Convert LANA to satoshis
  }));

  console.log(`[${label}] Processing ${recipients.length} recipients:`);
  recipients.forEach((r: any, i: number) => {
    console.log(`  ${i + 1}. ${r.address}: ${(r.amount / 100000000).toFixed(8)} LANA`);
  });

  // 3. Fetch UTXOs
  console.log(`[${label}] Fetching UTXOs for sender address...`);
  const utxos = await electrumCall('blockchain.address.listunspent', [senderAddress], servers);
  if (!utxos || utxos.length === 0) throw new Error('No UTXOs available');
  console.log(`[${label}] Found ${utxos.length} UTXOs`);

  // 4. Calculate total amount in satoshis
  const totalAmountSatoshis = recipients.reduce((sum: number, r: any) => sum + r.amount, 0);
  console.log(`[${label}] Total to send: ${totalAmountSatoshis} satoshis (${(totalAmountSatoshis / 100000000).toFixed(8)} LANA)`);

  // Calculate available balance
  const totalAvailable = utxos.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
  console.log(`[${label}] Total available: ${totalAvailable} satoshis (${(totalAvailable / 100000000).toFixed(8)} LANA)`);

  // 5. STEP 1: First select UTXOs for the base amount (without fee)
  let initialSelection = UTXOSelector.selectUTXOs(utxos, totalAmountSatoshis);
  let selectedUTXOs = initialSelection.selected;
  let totalSelected = initialSelection.totalValue;

  console.log(`[${label}] Initial selection: ${selectedUTXOs.length} UTXOs with ${totalSelected} satoshis`);

  // 6. STEP 2: Calculate fee based on ACTUAL number of selected UTXOs
  const actualOutputCount = recipients.length + 1; // recipients + change
  let baseFee = (selectedUTXOs.length * 180 + actualOutputCount * 34 + 10) * 100;
  let fee = Math.floor(baseFee * 1.5); // Add 50% safety buffer

  console.log(`[${label}] Calculated fee: ${fee} satoshis (base: ${baseFee}, 50% buffer) for ${selectedUTXOs.length} inputs, ${actualOutputCount} outputs`);

  // 7. STEP 3: Check if we have enough for amount + fee, if not, iteratively add more UTXOs
  let iterations = 0;
  const maxIterations = 10;

  while (totalSelected < totalAmountSatoshis + fee && selectedUTXOs.length < utxos.length && iterations < maxIterations) {
    iterations++;
    const needed = totalAmountSatoshis + fee;
    console.log(`[${label}] Iteration ${iterations}: Need ${needed} satoshis, have ${totalSelected} satoshis, reselecting...`);

    // Reselect with updated total needed
    const reSelection = UTXOSelector.selectUTXOs(utxos, needed);
    selectedUTXOs = reSelection.selected;
    totalSelected = reSelection.totalValue;

    // Recalculate fee based on new input count
    baseFee = (selectedUTXOs.length * 180 + actualOutputCount * 34 + 10) * 100;
    fee = Math.floor(baseFee * 1.5);

    console.log(`[${label}]    -> Selected ${selectedUTXOs.length} UTXOs, total: ${totalSelected} satoshis, new fee: ${fee} satoshis`);
  }

  // Final validation
  if (totalSelected < totalAmountSatoshis + fee) {
    throw new Error(`Insufficient funds: need ${totalAmountSatoshis + fee} satoshis, have ${totalSelected} satoshis`);
  }

  console.log(`[${label}] Final selection: ${selectedUTXOs.length} UTXOs with ${totalSelected} satoshis`);
  console.log(`[${label}] Transaction breakdown: Amount=${totalAmountSatoshis}, Fee=${fee}, Change=${totalSelected - totalAmountSatoshis - fee}`);

  // 8. Build and sign transaction
  const electrumCallFn = (method: string, params: any[]) => electrumCall(method, params, servers);

  const signedTx = await buildSignedTx(
    selectedUTXOs,
    privateKeyWIF,
    recipients,
    fee,
    senderAddress,
    electrumCallFn
  );
  console.log(`[${label}] Transaction signed successfully`);

  // 9. Broadcast transaction
  console.log(`[${label}] Broadcasting transaction...`);
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
    throw new Error(`Transaction broadcast failed: ${resultStr}`);
  }

  const txid = resultStr.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
    throw new Error(`Invalid transaction ID format: ${txid}`);
  }

  console.log(`[${label}] Transaction broadcast successful:`, txid);

  // 10. Update all processed records
  console.log(`[${label}] Updating database records...`);
  const recordIds = pendingRecords.map((r) => r.id);
  const placeholders = recordIds.map(() => '?').join(', ');
  db.prepare(
    `UPDATE buy_lana SET tx = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
  ).run(txid, ...recordIds);

  console.log(`[${label}] Successfully updated ${recordIds.length} record(s)`);

  return {
    domain: label,
    success: true,
    txid,
    processed: recordIds.length,
    recipients: recipients.length,
    total_amount: totalAmountSatoshis,
    fee
  };
}

// Exported function for use by heartbeat
export async function processPendingPayments(): Promise<any> {
  console.log('Starting per-domain pending LANA payments processing...');
  const db = getDb();
  const results: any[] = [];

  // 1. Get all active domains with WIF keys
  const domains = db.prepare(
    `SELECT domain_key, donation_wallet_private_key FROM domains WHERE active = 1 AND donation_wallet_private_key IS NOT NULL AND donation_wallet_private_key != ''`
  ).all() as Array<{ domain_key: string; donation_wallet_private_key: string }>;

  // 2. Process each domain
  for (const domain of domains) {
    try {
      const pendingRecords = db.prepare(
        `SELECT id, lana_wallet_id, lana_amount FROM buy_lana WHERE domain_key = ? AND tx IS NULL AND paid_on_account IS NOT NULL`
      ).all(domain.domain_key) as Array<{ id: string; lana_wallet_id: string; lana_amount: number }>;

      if (!pendingRecords || pendingRecords.length === 0) {
        console.log(`[${domain.domain_key}] No pending payments`);
        continue;
      }

      console.log(`[${domain.domain_key}] Processing ${pendingRecords.length} pending payment(s)`);

      const result = await processPaymentBatch(pendingRecords, domain.donation_wallet_private_key, domain.domain_key);
      results.push(result);
    } catch (error) {
      console.error(`[${domain.domain_key}] Error processing payments:`, error);
      results.push({ domain: domain.domain_key, success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // 3. Legacy fallback: process records with no domain_key using app_settings WIF
  try {
    const legacyRecords = db.prepare(
      `SELECT id, lana_wallet_id, lana_amount FROM buy_lana WHERE domain_key IS NULL AND tx IS NULL AND paid_on_account IS NOT NULL`
    ).all() as Array<{ id: string; lana_wallet_id: string; lana_amount: number }>;

    if (legacyRecords && legacyRecords.length > 0) {
      console.log(`[legacy] Processing ${legacyRecords.length} pending payment(s) from legacy records`);

      const settingRow = db.prepare(
        `SELECT setting_value FROM app_settings WHERE setting_key = ?`
      ).get('donation_wallet_id_PrivatKey') as { setting_value: string } | undefined;

      if (settingRow?.setting_value) {
        const result = await processPaymentBatch(legacyRecords, settingRow.setting_value, 'legacy');
        results.push(result);
      } else {
        console.log('[legacy] No WIF key in app_settings, skipping');
      }
    }
  } catch (error) {
    console.error('[legacy] Error processing payments:', error);
    results.push({ domain: 'legacy', success: false, error: error instanceof Error ? error.message : String(error) });
  }

  return { processed: results.length, results };
}

// POST /api/process-pending-payments
router.post('/', async (_req: Request, res: Response) => {
  try {
    const result = await processPendingPayments();
    return res.json(result);
  } catch (error) {
    console.error('Error processing pending payments:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
