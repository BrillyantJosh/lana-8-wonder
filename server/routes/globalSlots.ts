import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { electrumCall, ElectrumServer } from '../lib/electrum.js';
import { SimplePool } from 'nostr-tools';

const router = Router();

const servers: ElectrumServer[] = [
  { host: 'electrum1.lanacoin.com', port: 5097 },
  { host: 'electrum2.lanacoin.com', port: 5097 }
];

const KIND_38888_PUBKEY = '9eb71bf1e9c3189c78800e4c3831c1c1a93ab43b61118818c32e4490891a35b3';
const RELAYS = ['wss://relay.lanavault.space', 'wss://relay.lanacoin-eternity.com'];

// Cache exchange rates for 5 minutes to avoid hammering Nostr relays
let cachedRates: Record<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getExchangeRates(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedRates;
  }

  const pool = new SimplePool();
  try {
    const events = await pool.querySync(RELAYS, {
      kinds: [38888],
      authors: [KIND_38888_PUBKEY],
      '#d': ['main'],
      limit: 1
    });

    if (!events || events.length === 0) {
      throw new Error('No KIND 38888 event found');
    }

    const fxTags = events[0].tags.filter((t: string[]) => t[0] === 'fx');
    const rates: Record<string, number> = {};
    for (const tag of fxTags) {
      rates[tag[1]] = parseFloat(tag[2]);
    }

    cachedRates = rates;
    cacheTimestamp = Date.now();
    return rates;
  } finally {
    pool.close(RELAYS);
  }
}

// GET /api/global-slots
// Returns slot availability for all active domains (used by GlobalLanding)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();

    // 1. Get all active domains with wallets
    const domains = db.prepare(`
      SELECT domain_key, donation_wallet_id, currency_default, enable_buy_lana
      FROM domains WHERE active = 1 AND donation_wallet_id IS NOT NULL AND donation_wallet_id != ''
    `).all() as Array<{
      domain_key: string;
      donation_wallet_id: string;
      currency_default: string;
      enable_buy_lana: number;
    }>;

    // 2. Fetch exchange rates from KIND 38888
    let exchangeRates: Record<string, number>;
    try {
      exchangeRates = await getExchangeRates();
    } catch (err) {
      console.error('Failed to fetch exchange rates for global-slots:', err);
      // Return empty availability if we can't get rates
      const result: Record<string, { slots: number; currency: string }> = {};
      for (const d of domains) {
        result[d.domain_key] = { slots: 0, currency: d.currency_default || 'EUR' };
      }
      return res.json({ data: result, error: null });
    }

    // 3. Fetch wallet balances (deduplicate wallets shared across domains)
    const uniqueWallets = [...new Set(domains.map(d => d.donation_wallet_id))];
    const balanceMap: Record<string, { satoshis: number; utxos: number }> = {};

    for (const wallet of uniqueWallets) {
      try {
        const utxos = await electrumCall('blockchain.address.listunspent', [wallet], servers);
        const utxoList = utxos || [];
        balanceMap[wallet] = {
          satoshis: utxoList.reduce((sum: number, u: any) => sum + u.value, 0),
          utxos: utxoList.length
        };
      } catch (err) {
        console.error(`Failed to fetch balance for ${wallet}:`, err);
        balanceMap[wallet] = { satoshis: 0, utxos: 0 };
      }
    }

    // 4. Calculate slots per domain
    const result: Record<string, { slots: number; currency: string }> = {};

    for (const domain of domains) {
      const currency = (domain.currency_default || 'EUR').toUpperCase();
      const rate = exchangeRates[currency] || 0;

      if (!domain.enable_buy_lana || rate === 0) {
        result[domain.domain_key] = { slots: 0, currency };
        continue;
      }

      const balance = balanceMap[domain.donation_wallet_id];
      if (!balance || balance.satoshis === 0) {
        result[domain.domain_key] = { slots: 0, currency };
        continue;
      }

      // Same slot calculation as AdminBuyLana
      const lanaPerSlot = Math.floor(100 / rate);
      if (lanaPerSlot <= 0) {
        result[domain.domain_key] = { slots: 0, currency };
        continue;
      }

      const lanaPerSlotSatoshis = lanaPerSlot * 100000000;
      let slots = 0;
      let cumSatoshis = 0;

      while (true) {
        const nextCum = cumSatoshis + lanaPerSlotSatoshis;
        const estFeeInputs = Math.min(balance.utxos, 500);
        const estFeeOutputs = slots + 1 + 1;
        const estFee = Math.floor((estFeeInputs * 180 + estFeeOutputs * 34 + 10) * 100 * 1.5);
        if (nextCum + estFee > balance.satoshis) break;
        slots++;
        cumSatoshis = nextCum;
        if (slots > 999) break;
      }

      result[domain.domain_key] = { slots, currency };
    }

    return res.json({ data: result, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error in global-slots:', message);
    return res.status(500).json({ data: null, error: { message } });
  }
});

export default router;
