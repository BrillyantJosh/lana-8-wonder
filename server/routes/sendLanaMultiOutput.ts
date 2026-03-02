import { Router, Request, Response } from 'express';
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

// POST /api/send-lana-multi-output
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('Starting LANA multi-output transaction...');
    const { sender_address, recipients, private_key, electrum_servers } = req.body;

    console.log('Transaction parameters:', {
      sender_address,
      recipient_count: recipients?.length || 0,
      hasPrivateKey: !!private_key
    });

    if (!sender_address || !recipients || !private_key || recipients.length === 0) {
      throw new Error('Missing required parameters');
    }

    // Validate and convert recipients format (convert LANA to satoshis)
    const recipientsInSatoshis = recipients.map((recipient: any) => {
      if (!recipient.address || typeof recipient.amount !== 'number') {
        throw new Error('Invalid recipient format: must have address and amount');
      }
      // Convert LANA to satoshis: 1 LANA = 100,000,000 satoshis
      return {
        address: recipient.address,
        amount: Math.round(recipient.amount * 100000000)
      };
    });

    console.log(`Processing transaction with ${recipientsInSatoshis.length} outputs:`);
    recipientsInSatoshis.forEach((r: any, i: number) => {
      console.log(`  ${i + 1}. ${r.address}: ${(r.amount / 100000000).toFixed(8)} LANA`);
    });

    // Validate private key matches sender address
    try {
      const normalizedPrivateKey = normalizeWif(private_key);
      console.log(`Validating private key: length=${normalizedPrivateKey.length}`);
      const privateKeyBytes = base58CheckDecode(normalizedPrivateKey);
      const privateKeyHex = uint8ArrayToHex(privateKeyBytes.slice(1));
      const generatedPubKey = privateKeyToPublicKey(privateKeyHex);
      const expectedAddress = publicKeyToAddress(generatedPubKey);

      if (expectedAddress !== sender_address) {
        throw new Error(
          `Private key does not match sender address. Expected: ${expectedAddress}, Got: ${sender_address}`
        );
      }

      console.log('Private key validation passed');
    } catch (error) {
      console.error('Private key validation failed:', error);
      throw error;
    }

    const servers: ElectrumServer[] = electrum_servers && electrum_servers.length > 0
      ? electrum_servers
      : [
          { host: 'electrum1.lanacoin.com', port: 5097 },
          { host: 'electrum2.lanacoin.com', port: 5097 }
        ];

    console.log('Using Electrum servers:', servers);

    const utxos = await electrumCall('blockchain.address.listunspent', [sender_address], servers);
    if (!utxos || utxos.length === 0) throw new Error('No UTXOs available');
    console.log(`Found ${utxos.length} UTXOs`);

    // Calculate total amount in satoshis (already converted above)
    const totalAmountSatoshis = recipientsInSatoshis.reduce((sum: number, r: any) => sum + r.amount, 0);
    console.log(`Total to send: ${totalAmountSatoshis} satoshis (${(totalAmountSatoshis / 100000000).toFixed(8)} LANA)`);

    // Calculate available balance
    const totalAvailable = utxos.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
    console.log(`Total available: ${totalAvailable} satoshis (${(totalAvailable / 100000000).toFixed(8)} LANA)`);

    // STEP 1: First select UTXOs for the base amount (without fee)
    let initialSelection = UTXOSelector.selectUTXOs(utxos, totalAmountSatoshis);
    let selectedUTXOs = initialSelection.selected;
    let totalSelected = initialSelection.totalValue;

    console.log(`Initial selection: ${selectedUTXOs.length} UTXOs with ${totalSelected} satoshis`);

    // STEP 2: Calculate fee based on ACTUAL number of selected UTXOs
    const actualOutputCount = recipientsInSatoshis.length + 1; // recipients + change
    let baseFee = (selectedUTXOs.length * 180 + actualOutputCount * 34 + 10) * 100;
    let fee = Math.floor(baseFee * 1.5); // Add 50% safety buffer

    console.log(`Calculated fee: ${fee} satoshis (base: ${baseFee}, 50% buffer) for ${selectedUTXOs.length} inputs, ${actualOutputCount} outputs`);

    // STEP 3: Check if we have enough for amount + fee, if not, iteratively add more UTXOs
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

    // Build and sign transaction with pre-selected UTXOs
    const electrumCallFn = (method: string, params: any[]) => electrumCall(method, params, servers);

    const signedTx = await buildSignedTx(
      selectedUTXOs,
      private_key,
      recipientsInSatoshis,
      fee,
      sender_address,
      electrumCallFn
    );
    console.log('Transaction signed successfully');

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

    return res.json({
      success: true,
      txid,
      total_amount: totalAmountSatoshis,
      fee,
      output_count: recipientsInSatoshis.length
    });
  } catch (error) {
    console.error('Transaction error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
