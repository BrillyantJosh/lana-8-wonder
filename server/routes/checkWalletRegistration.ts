import { Router, Request, Response } from 'express';

const router = Router();

const LANA_REGISTER_API_URL = 'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/check';

router.post('/', async (req: Request, res: Response) => {
  try {
    const { wallet_id } = req.body;

    if (!wallet_id || typeof wallet_id !== 'string') {
      return res.status(400).json({ error: { message: 'wallet_id is required' } });
    }

    // Validate wallet format (starts with L, 26-35 chars)
    if (!wallet_id.startsWith('L') || wallet_id.length < 26 || wallet_id.length > 35) {
      return res.status(400).json({ error: { message: 'Invalid wallet address format' } });
    }

    const apiKey = process.env.LANA_REGISTER_API_KEY;
    if (!apiKey) {
      console.error('LANA_REGISTER_API_KEY not configured');
      return res.status(500).json({ error: { message: 'Registration check service not configured' } });
    }

    const response = await fetch(LANA_REGISTER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'simple_check_wallet_registration',
        api_key: apiKey,
        data: { wallet_id }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lana Register API error:', response.status, errorText);
      return res.status(response.status).json({
        error: { message: `Registration check failed: ${response.statusText}` }
      });
    }

    const data = await response.json();
    return res.json({
      registered: data.registered || false,
      wallet: data.wallet || null,
      correlation_id: data.correlation_id || null
    });
  } catch (error) {
    console.error('Error checking wallet registration:', error);
    return res.status(500).json({
      error: { message: error instanceof Error ? error.message : 'Unknown error' }
    });
  }
});

export default router;
