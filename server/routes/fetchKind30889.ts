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

      // 15 second timeout — resolves to a MARKER, not to [], so that a silent
      // relay is never reported as "this person has no registration". An
      // unreadable record is not an absent one: callers decide whether to
      // register wallets based on this answer, and a false "absent" here is
      // what lets a second set of eight wallets be created for someone who
      // already has one. Same convention as /api/check-lana8wonder.
      const TIMEOUT_MARKER = null;
      const timeoutPromise = new Promise<any[] | null>((resolve) => {
        setTimeout(() => resolve(TIMEOUT_MARKER), 15000);
      });

      const events = await Promise.race([queryPromise, timeoutPromise]);

      if (events === TIMEOUT_MARKER) {
        console.warn(`KIND 30889 for ${nostr_hex_id.slice(0, 8)}...: RELAY TIMEOUT (indeterminate)`);
        return res.status(504).json({
          found: null,
          wallets: [],
          l8w_wallets: [],
          status: null,
          error: { message: 'Relay query timed out — registration status unknown' }
        });
      }

      if (!events || events.length === 0) {
        return res.json({ found: false, wallets: [], l8w_wallets: [], status: null });
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
    // found: null, never false — a failed read says nothing about whether a
    // registration exists.
    return res.status(500).json({
      found: null,
      wallets: [],
      l8w_wallets: [],
      error: { message: 'Failed to fetch KIND 30889' }
    });
  }
});

export default router;
