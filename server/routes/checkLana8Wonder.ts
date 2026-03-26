import { Router, Request, Response } from 'express';
import { SimplePool } from 'nostr-tools/pool';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js (required by nostr-tools SimplePool)
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const router = Router();

const MAIN_PUBLISHER = 'a56253e6232b2ab5a96b60d233434d4f759ba4c858a3cc0f4ec51906dce73ae6';
const RELAYS = [
  'wss://relay.lanavault.space',
  'wss://relay.lanacoin-eternity.com',
  'wss://relay.lanaheartvoice.com'
];

// POST /api/check-lana8wonder
// Body: { nostr_hex_id: string }
// Returns: { has_plan: boolean }
router.post('/', async (req: Request, res: Response) => {
  try {
    const { nostr_hex_id } = req.body;

    if (!nostr_hex_id || typeof nostr_hex_id !== 'string') {
      return res.status(400).json({ has_plan: false, error: { message: 'nostr_hex_id is required' } });
    }

    // Validate hex format (64 char hex string)
    if (!/^[a-fA-F0-9]{64}$/.test(nostr_hex_id)) {
      return res.status(400).json({ has_plan: false, error: { message: 'Invalid nostr_hex_id format' } });
    }

    console.log(`Checking KIND 88888 for hex: ${nostr_hex_id.slice(0, 8)}...`);

    const pool = new SimplePool();

    try {
      // Query KIND 88888 with timeout
      const queryPromise = pool.querySync(RELAYS, {
        kinds: [88888],
        '#p': [nostr_hex_id],
        '#d': [`plan:${nostr_hex_id}`],
        authors: [MAIN_PUBLISHER],
        limit: 1
      });

      // 10 second timeout
      const timeoutPromise = new Promise<any[]>((resolve) => {
        setTimeout(() => resolve([]), 10000);
      });

      const events = await Promise.race([queryPromise, timeoutPromise]);

      const hasPlan = events && events.length > 0;
      console.log(`KIND 88888 check for ${nostr_hex_id.slice(0, 8)}...: ${hasPlan ? 'FOUND' : 'NOT FOUND'} (${events?.length || 0} events)`);

      return res.json({ has_plan: hasPlan });
    } finally {
      try { pool.close(RELAYS); } catch { /* ignore */ }
    }
  } catch (error) {
    console.error('Error checking KIND 88888:', error);
    return res.status(500).json({ has_plan: false, error: { message: 'Failed to check Lana8Wonder plan' } });
  }
});

export default router;
