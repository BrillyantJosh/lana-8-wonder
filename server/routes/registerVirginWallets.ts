import { Router, Request, Response } from 'express';

const router = Router();

const LANA_REGISTER_API_URL = 'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets';

// POST /api/register-virgin-wallets
// Server-side proxy to keep LANA_REGISTER_API_KEY out of frontend code
router.post('/', async (req: Request, res: Response) => {
  try {
    const { nostr_id_hex, wallets } = req.body;

    if (!nostr_id_hex || typeof nostr_id_hex !== 'string') {
      return res.status(400).json({ success: false, message: 'nostr_id_hex is required' });
    }

    if (!Array.isArray(wallets) || wallets.length === 0) {
      return res.status(400).json({ success: false, message: 'wallets array is required' });
    }

    // Validate each wallet entry
    for (const w of wallets) {
      if (!w.wallet_id || typeof w.wallet_id !== 'string') {
        return res.status(400).json({ success: false, message: 'Each wallet must have a wallet_id string' });
      }
    }

    const apiKey = process.env.LANA_REGISTER_API_KEY;
    if (!apiKey) {
      console.error('LANA_REGISTER_API_KEY not configured');
      return res.status(500).json({ success: false, message: 'Registration service not configured' });
    }

    console.log(`[register-virgin-wallets] Registering ${wallets.length} wallets for ${nostr_id_hex.slice(0, 12)}...`);

    const response = await fetch(LANA_REGISTER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'register_virgin_wallets_for_existing_user',
        api_key: apiKey,
        data: {
          nostr_id_hex,
          wallets
        }
      })
    });

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const textBody = await response.text();
      console.error('[register-virgin-wallets] Non-JSON response:', textBody.substring(0, 500));
      return res.status(response.status).json({
        success: false,
        message: `External API returned non-JSON response (status ${response.status})`
      });
    }

    const result = await response.json();

    // Forward the result as-is (status code and body)
    return res.status(response.status).json(result);
  } catch (error) {
    console.error('[register-virgin-wallets] Error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
