import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { electrumCall, ElectrumServer } from '../lib/electrum.js';
import {
  decodeWif,
  privateKeyToPublicKey,
  privateKeyToCompressedPublicKey,
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
// Now with balance pre-check: only processes as many records as the wallet balance allows
async function processPaymentBatch(
  allPendingRecords: Array<{ id: string; lana_wallet_id: string; lana_amount: number }>,
  privateKeyWIF: string,
  label: string
): Promise<any> {
  const db = getDb();

  // 1. Derive sender address from WIF (supports both Dominate and Staking formats)
  console.log(`[${label}] Deriving sender wallet address from WIF...`);
  const { privateKeyHex, isCompressed } = decodeWif(privateKeyWIF);
  const publicKey = isCompressed
    ? privateKeyToCompressedPublicKey(privateKeyHex)
    : privateKeyToPublicKey(privateKeyHex);
  const senderAddress = publicKeyToAddress(publicKey);
  console.log(`[${label}] Sender address: ${senderAddress} (${isCompressed ? 'Staking/compressed' : 'Dominate/uncompressed'})`);

  // 2. Fetch UTXOs and check available balance FIRST
  console.log(`[${label}] Fetching UTXOs for balance check...`);
  const utxos = await electrumCall('blockchain.address.listunspent', [senderAddress], servers);
  if (!utxos || utxos.length === 0) throw new Error('No UTXOs available');

  const totalAvailableSatoshis = utxos.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
  console.log(`[${label}] Wallet balance: ${utxos.length} UTXOs, ${(totalAvailableSatoshis / 100000000).toFixed(8)} LANA`);

  // 3. Pre-filter: determine which records we can afford
  // Process in FIFO order (oldest first, as ordered by created_at from query)
  // Use conservative fee estimate to avoid selecting records we can't actually pay for
  let cumulativeAmountSatoshis = 0;
  const affordableRecords: typeof allPendingRecords = [];
  const skippedRecords: typeof allPendingRecords = [];

  for (const record of allPendingRecords) {
    const amountSatoshis = Math.round(record.lana_amount * 100000000);
    const newCumulative = cumulativeAmountSatoshis + amountSatoshis;

    // Conservative fee estimate: assume up to all UTXOs as inputs (max 500)
    // Fee = (inputs * 180 + outputs * 34 + 10) * 100 satoshis/byte * 1.5 safety buffer
    const estInputs = Math.min(utxos.length, UTXOSelector.MAX_INPUTS);
    const estOutputs = affordableRecords.length + 1 + 1; // +1 for this record, +1 for change
    const estFee = Math.floor((estInputs * 180 + estOutputs * 34 + 10) * 100 * 1.5);

    if (newCumulative + estFee > totalAvailableSatoshis) {
      console.log(
        `[${label}] ⚠ Insufficient balance for record ${record.id}: ` +
        `need ${((newCumulative + estFee) / 100000000).toFixed(8)} LANA ` +
        `but only ${(totalAvailableSatoshis / 100000000).toFixed(8)} available — skipping`
      );
      skippedRecords.push(record);
      continue; // Try next record (smaller amounts might still fit)
    }

    affordableRecords.push(record);
    cumulativeAmountSatoshis = newCumulative;
  }

  if (affordableRecords.length === 0) {
    const totalNeeded = allPendingRecords.reduce((sum, r) => sum + r.lana_amount, 0);
    throw new Error(
      `Insufficient balance for ANY pending payment. ` +
      `Wallet has ${(totalAvailableSatoshis / 100000000).toFixed(8)} LANA ` +
      `but ${allPendingRecords.length} pending record(s) need ${totalNeeded.toFixed(8)} LANA total.`
    );
  }

  if (skippedRecords.length > 0) {
    console.log(
      `[${label}] ⚠ PARTIAL BATCH: processing ${affordableRecords.length} of ${allPendingRecords.length} records ` +
      `(${skippedRecords.length} deferred — will retry next heartbeat when balance allows)`
    );
  }

  // 4. Prepare recipients list from affordable records only
  const recipients = affordableRecords.map((record) => ({
    address: record.lana_wallet_id,
    amount: Math.round(record.lana_amount * 100000000) // Convert LANA to satoshis
  }));

  console.log(`[${label}] Processing ${recipients.length} recipients:`);
  recipients.forEach((r: any, i: number) => {
    console.log(`  ${i + 1}. ${r.address}: ${(r.amount / 100000000).toFixed(8)} LANA`);
  });

  // 5. Calculate total amount in satoshis
  const totalAmountSatoshis = recipients.reduce((sum: number, r: any) => sum + r.amount, 0);
  console.log(`[${label}] Total to send: ${totalAmountSatoshis} satoshis (${(totalAmountSatoshis / 100000000).toFixed(8)} LANA)`);
  console.log(`[${label}] Total available: ${totalAvailableSatoshis} satoshis (${(totalAvailableSatoshis / 100000000).toFixed(8)} LANA)`);

  // 6. Select UTXOs for the base amount (without fee)
  let initialSelection = UTXOSelector.selectUTXOs(utxos, totalAmountSatoshis);
  let selectedUTXOs = initialSelection.selected;
  let totalSelected = initialSelection.totalValue;

  console.log(`[${label}] Initial UTXO selection: ${selectedUTXOs.length} UTXOs with ${totalSelected} satoshis`);

  // 7. Calculate fee based on ACTUAL number of selected UTXOs
  const actualOutputCount = recipients.length + 1; // recipients + change
  let baseFee = (selectedUTXOs.length * 180 + actualOutputCount * 34 + 10) * 100;
  let fee = Math.floor(baseFee * 1.5); // Add 50% safety buffer

  console.log(`[${label}] Calculated fee: ${fee} satoshis (base: ${baseFee}, 50% buffer) for ${selectedUTXOs.length} inputs, ${actualOutputCount} outputs`);

  // 8. Iteratively add more UTXOs if needed for amount + fee
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

  console.log(`[${label}] Final selection: ${selectedUTXOs.length} UTXOs (supports up to ${UTXOSelector.MAX_INPUTS} inputs)`);
  console.log(`[${label}] Transaction breakdown: Amount=${totalAmountSatoshis}, Fee=${fee}, Change=${totalSelected - totalAmountSatoshis - fee}`);

  // 9. Build and sign transaction
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

  // 10. Broadcast transaction
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

  console.log(`[${label}] ✅ Transaction broadcast successful:`, txid);

  // 11. Update only the PROCESSED records — set tx + status = 'transferred'
  console.log(`[${label}] Updating database records...`);
  const recordIds = affordableRecords.map((r) => r.id);
  const placeholders = recordIds.map(() => '?').join(', ');
  db.prepare(
    `UPDATE buy_lana SET tx = ?, status = 'transferred', updated_at = datetime('now') WHERE id IN (${placeholders})`
  ).run(txid, ...recordIds);

  console.log(`[${label}] ✅ Successfully updated ${recordIds.length} record(s)`);
  if (skippedRecords.length > 0) {
    console.log(`[${label}] ⏳ ${skippedRecords.length} record(s) remain in 'approved' status — will retry next heartbeat`);
  }

  return {
    domain: label,
    success: true,
    txid,
    processed: recordIds.length,
    skipped: skippedRecords.length,
    recipients: recipients.length,
    total_amount: totalAmountSatoshis,
    fee,
    wallet_balance: totalAvailableSatoshis,
    utxo_count: utxos.length
  };
}

// Exported function for use by heartbeat
export async function processPendingPayments(): Promise<any> {
  console.log('Starting per-domain pending LANA payments processing...');
  const db = getDb();
  const results: any[] = [];

  // 1. Get ALL active domains to check wallet configuration
  const allDomains = db.prepare(
    `SELECT domain_key, donation_wallet_id,
            CASE WHEN donation_wallet_private_key IS NOT NULL AND donation_wallet_private_key != '' THEN 1 ELSE 0 END as has_private_key,
            CASE WHEN donation_wallet_id IS NOT NULL AND donation_wallet_id != '' THEN 1 ELSE 0 END as has_wallet
     FROM domains WHERE active = 1`
  ).all() as Array<{ domain_key: string; has_private_key: number; has_wallet: number; donation_wallet_id: string }>;

  // 2. Log domains missing wallet configuration
  const misconfiguredDomains = allDomains.filter(d => !d.has_private_key || !d.has_wallet);
  if (misconfiguredDomains.length > 0) {
    for (const d of misconfiguredDomains) {
      // Check if this domain has approved records waiting
      const approvedCount = (db.prepare(
        `SELECT COUNT(*) as cnt FROM buy_lana WHERE domain_key = ? AND status = 'approved' AND tx IS NULL`
      ).get(d.domain_key) as { cnt: number })?.cnt || 0;

      if (approvedCount > 0) {
        if (!d.has_wallet) {
          console.warn(`[${d.domain_key}] ⚠ BLOCKED: ${approvedCount} approved payment(s) waiting but NO WALLET ADDRESS configured!`);
        }
        if (!d.has_private_key) {
          console.warn(`[${d.domain_key}] ⚠ BLOCKED: ${approvedCount} approved payment(s) waiting but NO PRIVATE KEY configured!`);
        }
      }
    }
  }

  // 3. Get domains with valid wallet configuration
  const configuredDomains = db.prepare(
    `SELECT domain_key, donation_wallet_private_key FROM domains
     WHERE active = 1 AND donation_wallet_private_key IS NOT NULL AND donation_wallet_private_key != ''`
  ).all() as Array<{ domain_key: string; donation_wallet_private_key: string }>;

  // 4. Process each domain INDEPENDENTLY (strict domain isolation)
  for (const domain of configuredDomains) {
    try {
      // Query records strictly for THIS domain only (ORDER BY created_at ASC = FIFO)
      const pendingRecords = db.prepare(
        `SELECT id, lana_wallet_id, lana_amount FROM buy_lana
         WHERE domain_key = ? AND status = 'approved' AND tx IS NULL
         ORDER BY created_at ASC`
      ).all(domain.domain_key) as Array<{ id: string; lana_wallet_id: string; lana_amount: number }>;

      if (!pendingRecords || pendingRecords.length === 0) {
        continue; // No pending payments for this domain — silent skip
      }

      console.log(`[${domain.domain_key}] Found ${pendingRecords.length} approved payment(s) to process`);

      // Each domain uses ONLY its own WIF key → its own wallet → its own UTXOs
      // No cross-domain payments possible by design
      const result = await processPaymentBatch(pendingRecords, domain.donation_wallet_private_key, domain.domain_key);
      results.push(result);
    } catch (error) {
      console.error(`[${domain.domain_key}] Error processing payments:`, error);
      results.push({ domain: domain.domain_key, success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // 5. Legacy fallback: process records with no domain_key using app_settings WIF
  try {
    const legacyRecords = db.prepare(
      `SELECT id, lana_wallet_id, lana_amount FROM buy_lana
       WHERE domain_key IS NULL AND status = 'approved' AND tx IS NULL
       ORDER BY created_at ASC`
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

// GET /api/process-pending-payments/domain-status
// Returns wallet configuration status for the current domain (used by admin panel)
router.get('/domain-status', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;

    if (!domainKey) {
      return res.json({ data: { configured: false, reason: 'no_domain_context' }, error: null });
    }

    const domain = db.prepare(`
      SELECT domain_key, donation_wallet_id,
             CASE WHEN donation_wallet_private_key IS NOT NULL AND donation_wallet_private_key != '' THEN 1 ELSE 0 END as has_private_key,
             CASE WHEN donation_wallet_id IS NOT NULL AND donation_wallet_id != '' THEN 1 ELSE 0 END as has_wallet
      FROM domains WHERE domain_key = ?
    `).get(domainKey) as { domain_key: string; donation_wallet_id: string; has_private_key: number; has_wallet: number } | undefined;

    if (!domain) {
      return res.json({ data: { configured: false, reason: 'domain_not_found' }, error: null });
    }

    const configured = domain.has_private_key === 1 && domain.has_wallet === 1;
    const missingItems: string[] = [];
    if (!domain.has_wallet) missingItems.push('donation_wallet_id');
    if (!domain.has_private_key) missingItems.push('donation_wallet_private_key');

    return res.json({
      data: {
        configured,
        has_wallet: domain.has_wallet === 1,
        has_private_key: domain.has_private_key === 1,
        wallet_address: domain.donation_wallet_id || null,
        missing: missingItems
      },
      error: null
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ data: null, error: { message } });
  }
});

// GET /api/process-pending-payments/wallet-balance
// Returns the current UTXO-based balance of the domain's donation wallet (used by admin panel)
router.get('/wallet-balance', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const domainKey = req.domainKey;

    if (!domainKey) {
      return res.json({ data: null, error: { message: 'No domain context' } });
    }

    const domain = db.prepare(
      `SELECT donation_wallet_id FROM domains WHERE domain_key = ? AND active = 1`
    ).get(domainKey) as { donation_wallet_id: string } | undefined;

    if (!domain || !domain.donation_wallet_id) {
      return res.json({ data: null, error: { message: 'No wallet configured for this domain' } });
    }

    const walletAddress = domain.donation_wallet_id;

    // Fetch UTXOs via Electrum
    const utxos = await electrumCall('blockchain.address.listunspent', [walletAddress], servers);
    const utxoList = utxos || [];
    const balanceSatoshis = utxoList.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
    const balanceLana = balanceSatoshis / 100000000;

    return res.json({
      data: {
        wallet_address: walletAddress,
        balance_lana: Math.round(balanceLana * 100000000) / 100000000,
        balance_satoshis: balanceSatoshis,
        utxo_count: utxoList.length
      },
      error: null
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error fetching wallet balance:', message);
    return res.status(500).json({ data: null, error: { message } });
  }
});

export default router;
