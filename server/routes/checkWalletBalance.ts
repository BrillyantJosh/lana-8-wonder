import { Router, Request, Response } from 'express';
import { fetchBatchBalances, ElectrumServer } from '../lib/electrum.js';

const router = Router();

// POST /api/check-wallet-balance
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('Electrum Balance Aggregator started');

    const { wallet_addresses, electrum_servers } = req.body;

    if (!Array.isArray(wallet_addresses) || wallet_addresses.length === 0) {
      return res.status(400).json({
        error: 'wallet_addresses array is required',
        timestamp: new Date().toISOString()
      });
    }

    if (!Array.isArray(electrum_servers) || electrum_servers.length === 0) {
      return res.status(400).json({
        error: 'electrum_servers array is required',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`Processing ${wallet_addresses.length} wallet addresses with ${electrum_servers.length} Electrum servers`);

    const servers: ElectrumServer[] = electrum_servers;

    // Process wallets in batches of 50
    const BATCH_SIZE = 50;
    const allBalances: any[] = [];

    for (let i = 0; i < wallet_addresses.length; i += BATCH_SIZE) {
      const batch = wallet_addresses.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(wallet_addresses.length / BATCH_SIZE)} with ${batch.length} addresses`);

      const batchResults = await fetchBatchBalances(servers, batch);
      allBalances.push(...batchResults);

      // Small delay between batches to prevent overwhelming the server
      if (i + BATCH_SIZE < wallet_addresses.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Calculate totals
    const totalBalance = allBalances.reduce((sum, b) => sum + b.balance, 0);
    const successCount = allBalances.filter(b => !b.error).length;
    const errorCount = allBalances.filter(b => b.error).length;

    const result = {
      success: true,
      total_balance: Math.round(totalBalance * 100) / 100,
      wallets: allBalances,
      success_count: successCount,
      error_count: errorCount,
      timestamp: new Date().toISOString()
    };

    console.log(`Electrum aggregation completed: ${successCount} success, ${errorCount} errors, total: ${result.total_balance} LANA`);

    return res.json(result);
  } catch (error) {
    console.error('Error in Electrum balance aggregator:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
