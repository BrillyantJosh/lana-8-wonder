import { Router, Request, Response } from 'express';
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

// POST /api/send-lana-transaction
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('Starting LANA transaction...');
    const { senderAddress, recipientAddress, amount, privateKey, electrumServers } = req.body;

    console.log('Transaction parameters:', {
      senderAddress,
      recipientAddress,
      amount,
      hasPrivateKey: !!privateKey
    });

    if (!senderAddress || !recipientAddress || !privateKey || !amount) {
      throw new Error('Missing required parameters');
    }

    // Validate private key matches sender address (supports both WIF formats)
    try {
      const { privateKeyHex, isCompressed } = decodeWif(privateKey);
      const generatedPubKey = isCompressed
        ? privateKeyToCompressedPublicKey(privateKeyHex)
        : privateKeyToPublicKey(privateKeyHex);
      const expectedAddress = publicKeyToAddress(generatedPubKey);

      if (expectedAddress !== senderAddress) {
        throw new Error(
          `Private key does not match sender address. Expected: ${expectedAddress}, Got: ${senderAddress}`
        );
      }

      console.log('Private key validation passed');
    } catch (error) {
      console.error('Private key validation failed:', error);
      throw error;
    }

    // Use provided Electrum servers or defaults
    const servers: ElectrumServer[] = electrumServers && electrumServers.length > 0
      ? electrumServers
      : [
          { host: 'electrum1.lanacoin.com', port: 5097 },
          { host: 'electrum2.lanacoin.com', port: 5097 }
        ];

    console.log('Using Electrum servers:', servers);

    const utxos = await electrumCall('blockchain.address.listunspent', [senderAddress], servers);
    if (!utxos || utxos.length === 0) throw new Error('No UTXOs available');
    console.log(`Found ${utxos.length} UTXOs`);

    let amountSatoshis = Math.floor(amount * 100000000);
    const totalAvailable = utxos.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
    console.log(`Total available: ${totalAvailable} satoshis (${(totalAvailable / 100000000).toFixed(8)} LANA)`);

    // Calculate initial dynamic fee with improved estimation
    const estimatedInputCount = Math.min(
      Math.ceil(utxos.length * 0.3), // ~30% of UTXOs as realistic estimate
      10 // Max 10 for safety (prevent too high initial fee)
    );
    let outputCount = 2;
    let fee = (estimatedInputCount * 180 + outputCount * 34 + 10) * 100;
    console.log(`Initial fee estimate: ${fee} satoshis for ~${estimatedInputCount} inputs`);

    // Detect "send max" scenario: user wants to empty the wallet
    let isSendMax = false;
    if (amountSatoshis + fee > totalAvailable && amountSatoshis <= totalAvailable) {
      isSendMax = true;
      const allInputCount = Math.min(utxos.length, UTXOSelector.MAX_INPUTS);
      outputCount = 1; // No change output when emptying wallet
      fee = (allInputCount * 180 + outputCount * 34 + 10) * 100;
      amountSatoshis = totalAvailable - fee;

      if (amountSatoshis <= 0) {
        throw new Error(
          `Balance too low to cover transaction fee. ` +
          `Balance: ${(totalAvailable / 100000000).toFixed(8)} LANA, ` +
          `Fee: ${(fee / 100000000).toFixed(8)} LANA`
        );
      }

      console.log(`Send-max mode: deducting fee from amount. ` +
        `Sending ${(amountSatoshis / 100000000).toFixed(8)} LANA, ` +
        `Fee: ${(fee / 100000000).toFixed(8)} LANA (${allInputCount} inputs, ${outputCount} output)`);
    }

    // Pre-select UTXOs to know actual input count
    const totalNeeded = isSendMax ? totalAvailable : amountSatoshis + fee;
    const { selected: selectedUTXOs, totalValue } = UTXOSelector.selectUTXOs(utxos, totalNeeded);

    // Recalculate fee based on ACTUAL selected UTXOs
    const actualInputCount = selectedUTXOs.length;
    const actualFee = (actualInputCount * 180 + outputCount * 34 + 10) * 100;

    if (isSendMax) {
      fee = actualFee;
      amountSatoshis = totalValue - fee;
      console.log(`Send-max final: ${(amountSatoshis / 100000000).toFixed(8)} LANA, fee: ${(fee / 100000000).toFixed(8)} LANA`);
    } else if (actualFee > fee) {
      console.log(`Adjusting fee: ${fee} -> ${actualFee} satoshis (${actualInputCount} actual inputs)`);
      fee = actualFee;

      // Check if we still have enough balance after fee adjustment
      const newTotalNeeded = amountSatoshis + fee;
      if (totalValue < newTotalNeeded) {
        // Try send-max as fallback
        outputCount = 1;
        fee = (actualInputCount * 180 + outputCount * 34 + 10) * 100;
        amountSatoshis = totalValue - fee;
        isSendMax = true;
        console.log(`Switched to send-max: ${(amountSatoshis / 100000000).toFixed(8)} LANA, fee: ${(fee / 100000000).toFixed(8)} LANA`);

        if (amountSatoshis <= 0) {
          throw new Error(
            `Insufficient funds after fee adjustment. ` +
            `Need: ${(newTotalNeeded / 100000000).toFixed(8)} LANA, ` +
            `Have: ${(totalValue / 100000000).toFixed(8)} LANA`
          );
        }
      }
    } else {
      console.log(`Fee sufficient: ${fee} satoshis for ${actualInputCount} inputs`);
    }

    const recipients = [{ address: recipientAddress, amount: amountSatoshis }];
    console.log(`Sending ${amountSatoshis} satoshis (${(amountSatoshis / 100000000).toFixed(8)} LANA)${isSendMax ? ' [send-max]' : ''}`);

    // Build and sign transaction using the Node.js library
    // The Node.js buildSignedTx takes pre-selected UTXOs and an electrumCallFn
    const electrumCallFn = (method: string, params: any[]) => electrumCall(method, params, servers);

    const signedTx = await buildSignedTx(
      utxos,
      privateKey,
      recipients,
      fee,
      senderAddress,
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
      // Enhanced error diagnostics
      const txSize = signedTx.length / 2;
      const feeRate = (fee / txSize).toFixed(2);
      const diagnosticInfo = {
        inputCount: actualInputCount,
        outputCount,
        amount: amountSatoshis,
        fee,
        feeRate: parseFloat(feeRate),
        txSize
      };

      console.error('Transaction rejected by network:', {
        error: resultStr,
        diagnostic: diagnosticInfo
      });

      const errorMsg = [
        `Transaction broadcast failed: ${resultStr}`,
        `\nDiagnostic Info:`,
        `  Inputs: ${diagnosticInfo.inputCount}`,
        `  Outputs: ${diagnosticInfo.outputCount}`,
        `  Amount: ${(diagnosticInfo.amount / 100000000).toFixed(8)} LANA`,
        `  Fee: ${(diagnosticInfo.fee / 100000000).toFixed(8)} LANA`,
        `  Fee rate: ${diagnosticInfo.feeRate} sat/byte`,
        `  TX size: ${diagnosticInfo.txSize} bytes`,
        diagnosticInfo.feeRate < 1
          ? `\nLOW FEE RATE! Network may reject transactions below 1 sat/byte.`
          : '',
        diagnosticInfo.inputCount > 10
          ? `\nRecommendation: Consolidate UTXOs by sending all funds to yourself first.`
          : ''
      ].filter(Boolean).join('\n');

      throw new Error(errorMsg);
    }

    const txHash = resultStr.trim();
    if (!/^[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new Error(`Invalid transaction ID format: ${txHash}`);
    }

    console.log('Transaction broadcast successful:', txHash);

    return res.json({ success: true, txHash, amount: amountSatoshis, fee });
  } catch (error) {
    console.error('Transaction error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
