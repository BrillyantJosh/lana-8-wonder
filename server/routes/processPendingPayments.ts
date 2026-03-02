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

// Exported function for use by heartbeat
export async function processPendingPayments(): Promise<any> {
  console.log('Starting pending LANA payments processing...');

  const db = getDb();

  // 1. Fetch pending records from buy_lana
  console.log('Fetching pending payment records...');
  const pendingRecords = db.prepare(
    `SELECT id, lana_wallet_id, lana_amount FROM buy_lana WHERE tx IS NULL AND paid_on_account IS NOT NULL`
  ).all() as Array<{ id: string; lana_wallet_id: string; lana_amount: number }>;

  if (!pendingRecords || pendingRecords.length === 0) {
    console.log('No pending payments to process');
    return { message: 'No pending payments to process', processed: 0 };
  }

  console.log(`Found ${pendingRecords.length} pending payment(s)`);

  // 2. Get WIF private key directly from app_settings (donation_wallet_id_PrivatKey)
  console.log('Fetching WIF private key from app_settings...');
  const settingRow = db.prepare(
    `SELECT setting_value FROM app_settings WHERE setting_key = ?`
  ).get('donation_wallet_id_PrivatKey') as { setting_value: string } | undefined;

  if (!settingRow || !settingRow.setting_value) {
    throw new Error('donation_wallet_id_PrivatKey not found in app_settings');
  }

  const privateKeyWIF = settingRow.setting_value; // Already in WIF format
  console.log('WIF private key retrieved');

  // 3. Derive sender address
  console.log('Deriving sender wallet address from WIF...');
  const normalizedKey = normalizeWif(privateKeyWIF);
  const privateKeyBytes = base58CheckDecode(normalizedKey);
  const privateKeyHex = uint8ArrayToHex(privateKeyBytes.slice(1));
  const publicKey = privateKeyToPublicKey(privateKeyHex);
  const senderAddress = publicKeyToAddress(publicKey);
  console.log(`Sender address: ${senderAddress}`);

  // 4. Prepare recipients list (convert LANA to satoshis)
  const recipients = pendingRecords.map((record) => ({
    address: record.lana_wallet_id,
    amount: Math.round(record.lana_amount * 100000000) // Convert LANA to satoshis
  }));

  console.log(`Processing ${recipients.length} recipients:`);
  recipients.forEach((r: any, i: number) => {
    console.log(`  ${i + 1}. ${r.address}: ${(r.amount / 100000000).toFixed(8)} LANA`);
  });

  // 5. Electrum configuration
  const servers: ElectrumServer[] = [
    { host: 'electrum1.lanacoin.com', port: 5097 },
    { host: 'electrum2.lanacoin.com', port: 5097 }
  ];

  // 6. Fetch UTXOs
  console.log('Fetching UTXOs for sender address...');
  const utxos = await electrumCall('blockchain.address.listunspent', [senderAddress], servers);
  if (!utxos || utxos.length === 0) throw new Error('No UTXOs available');
  console.log(`Found ${utxos.length} UTXOs`);

  // 7. Calculate total amount in satoshis
  const totalAmountSatoshis = recipients.reduce((sum: number, r: any) => sum + r.amount, 0);
  console.log(`Total to send: ${totalAmountSatoshis} satoshis (${(totalAmountSatoshis / 100000000).toFixed(8)} LANA)`);

  // Calculate available balance
  const totalAvailable = utxos.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
  console.log(`Total available: ${totalAvailable} satoshis (${(totalAvailable / 100000000).toFixed(8)} LANA)`);

  // 8. STEP 1: First select UTXOs for the base amount (without fee)
  let initialSelection = UTXOSelector.selectUTXOs(utxos, totalAmountSatoshis);
  let selectedUTXOs = initialSelection.selected;
  let totalSelected = initialSelection.totalValue;

  console.log(`Initial selection: ${selectedUTXOs.length} UTXOs with ${totalSelected} satoshis`);

  // 9. STEP 2: Calculate fee based on ACTUAL number of selected UTXOs
  const actualOutputCount = recipients.length + 1; // recipients + change
  let baseFee = (selectedUTXOs.length * 180 + actualOutputCount * 34 + 10) * 100;
  let fee = Math.floor(baseFee * 1.5); // Add 50% safety buffer

  console.log(`Calculated fee: ${fee} satoshis (base: ${baseFee}, 50% buffer) for ${selectedUTXOs.length} inputs, ${actualOutputCount} outputs`);

  // 10. STEP 3: Check if we have enough for amount + fee, if not, iteratively add more UTXOs
  let iterations = 0;
  const maxIterations = 10;

  while (totalSelected < totalAmountSatoshis + fee && selectedUTXOs.length < utxos.length && iterations < maxIterations) {
    iterations++;
    const needed = totalAmountSatoshis + fee;
    console.log(`Iteration ${iterations}: Need ${needed} satoshis, have ${totalSelected} satoshis, reselecting...`);

    // Reselect with updated total needed
    const reSelection = UTXOSelector.selectUTXOs(utxos, needed);
    selectedUTXOs = reSelection.selected;
    totalSelected = reSelection.totalValue;

    // Recalculate fee based on new input count
    baseFee = (selectedUTXOs.length * 180 + actualOutputCount * 34 + 10) * 100;
    fee = Math.floor(baseFee * 1.5);

    console.log(`   -> Selected ${selectedUTXOs.length} UTXOs, total: ${totalSelected} satoshis, new fee: ${fee} satoshis`);
  }

  // Final validation
  if (totalSelected < totalAmountSatoshis + fee) {
    throw new Error(`Insufficient funds: need ${totalAmountSatoshis + fee} satoshis, have ${totalSelected} satoshis`);
  }

  console.log(`Final selection: ${selectedUTXOs.length} UTXOs with ${totalSelected} satoshis`);
  console.log(`Transaction breakdown: Amount=${totalAmountSatoshis}, Fee=${fee}, Change=${totalSelected - totalAmountSatoshis - fee}`);

  // 11. Build and sign transaction
  const electrumCallFn = (method: string, params: any[]) => electrumCall(method, params, servers);

  const signedTx = await buildSignedTx(
    selectedUTXOs,
    privateKeyWIF,
    recipients,
    fee,
    senderAddress,
    electrumCallFn
  );
  console.log('Transaction signed successfully');

  // 12. Broadcast transaction
  console.log('Broadcasting transaction...');
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

  console.log('Transaction broadcast successful:', txid);

  // 13. Update all processed records
  console.log('Updating database records...');
  const recordIds = pendingRecords.map((r) => r.id);
  const placeholders = recordIds.map(() => '?').join(', ');
  db.prepare(
    `UPDATE buy_lana SET tx = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
  ).run(txid, ...recordIds);

  console.log(`Successfully updated ${recordIds.length} record(s)`);

  return {
    success: true,
    txid,
    processed: recordIds.length,
    recipients: recipients.length,
    total_amount: totalAmountSatoshis,
    fee
  };
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
