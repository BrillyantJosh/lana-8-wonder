import { Router, Request, Response } from 'express';
import { SimplePool } from 'nostr-tools/pool';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const router = Router();

const RELAYS = [
  'wss://relay.lanavault.space',
  'wss://relay.lanacoin-eternity.com',
  'wss://relay.lanaheartvoice.com'
];

// POST /api/admin/fetch-kind30889
// Body: { nostr_hex_id: string }
// Returns: { wallets: WalletInfo[], status: string, registrar_pubkey: string }
router.post('/', async (req: Request, res: Response) => {
  try {
    const { nostr_hex_id } = req.body;

    if (!nostr_hex_id || !/^[a-fA-F0-9]{64}$/.test(nostr_hex_id)) {
      return res.status(400).json({ error: { message: 'Valid nostr_hex_id required' } });
    }

    console.log(`Fetching KIND 30889 for: ${nostr_hex_id.slice(0, 8)}...`);

    const pool = new SimplePool();

    try {
      const queryPromise = pool.querySync(RELAYS, {
        kinds: [30889],
        '#d': [nostr_hex_id]
      });

      const timeoutPromise = new Promise<any[]>((resolve) => {
        setTimeout(() => resolve([]), 15000);
      });

      const events = await Promise.race([queryPromise, timeoutPromise]);

      if (!events || events.length === 0) {
        return res.json({ found: false, wallets: [], status: null });
      }

      // Dedup: keep latest event per registrar (pubkey)
      const latestByRegistrar = new Map<string, typeof events[0]>();
      for (const event of events) {
        const existing = latestByRegistrar.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) {
          latestByRegistrar.set(event.pubkey, event);
        }
      }

      // Collect all wallets from all registrars
      const allWallets: any[] = [];
      let status = '';
      let registrarPubkey = '';

      for (const event of latestByRegistrar.values()) {
        const statusTag = event.tags.find((t: string[]) => t[0] === 'status');
        const walletTags = event.tags.filter((t: string[]) => t[0] === 'w');

        if (statusTag) status = statusTag[1];
        registrarPubkey = event.pubkey;

        for (const tag of walletTags) {
          allWallets.push({
            wallet_address: tag[1] || '',
            wallet_type: tag[2] || '',
            coin: tag[3] || 'LANA',
            note: tag[4] || '',
            unregistered_lanoshi: parseInt(tag[5] || '0', 10)
          });
        }
      }

      // Filter only Lana8Wonder wallets
      const l8wWallets = allWallets.filter(w =>
        w.wallet_type === 'Lana8Wonder' || w.wallet_type === 'lana8wonder'
      );

      console.log(`KIND 30889: found ${allWallets.length} total wallets, ${l8wWallets.length} Lana8Wonder wallets`);

      return res.json({
        found: true,
        wallets: allWallets,
        l8w_wallets: l8wWallets,
        status,
        registrar_pubkey: registrarPubkey
      });
    } finally {
      try { pool.close(RELAYS); } catch { /* ignore */ }
    }
  } catch (error) {
    console.error('Error fetching KIND 30889:', error);
    return res.status(500).json({ error: { message: 'Failed to fetch KIND 30889' } });
  }
});

export default router;
