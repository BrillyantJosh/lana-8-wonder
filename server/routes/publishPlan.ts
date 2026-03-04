import { Router, Request, Response } from 'express';
import { finalizeEvent } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';
import { SimplePool } from 'nostr-tools/pool';
import { getDb } from '../db/connection.js';

const router = Router();

// ============================================================================
// HELPER FUNCTIONS - Copied from PreviewLana8Wonder.tsx / Deno edge function
// ============================================================================

interface TradingLevel {
  level: number;
  triggerPrice: string;
  splitNumber: number;
  splitPrice: string;
  lanasOnSale: number;
  cashOut: string;
  remaining: number;
}

function calculateSplit(price: number): { splitNumber: number; splitPrice: number } {
  const splitPrice = Math.pow(2, Math.ceil(Math.log2(price / 0.001))) * 0.001;
  const splitNumber = Math.log2(splitPrice / 0.001) + 1;
  return { splitNumber, splitPrice };
}

function generateLinearLevels(lanas: number, startPrice: number): TradingLevel[] {
  const levels: TradingLevel[] = [];
  const lanasPerLevel = lanas / 10;
  let remaining = lanas;
  for (let i = 1; i <= 10; i++) {
    const triggerPrice = startPrice * i;
    const lanasOnSale = lanasPerLevel;
    const cashOut = triggerPrice * lanasOnSale;
    remaining -= lanasPerLevel;
    const { splitNumber, splitPrice } = calculateSplit(triggerPrice);
    levels.push({
      level: i,
      triggerPrice: triggerPrice.toFixed(5),
      splitNumber,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasOnSale.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat(remaining.toFixed(2))
    });
  }
  return levels;
}

function generateCompoundLevels(lanas: number, startPrice: number): TradingLevel[] {
  const levels: TradingLevel[] = [];
  const sellPercentages = [0, 0.25, 0.20, 0.15, 0.12, 0.09, 0.07, 0.05, 0.04, 0.03];
  let remaining = lanas;
  for (let i = 1; i <= 10; i++) {
    const triggerPrice = startPrice * i;
    const lanasOnSale = lanas * sellPercentages[i - 1];
    const cashOut = triggerPrice * lanasOnSale;
    remaining -= lanasOnSale;
    const { splitNumber, splitPrice } = calculateSplit(triggerPrice);
    levels.push({
      level: i,
      triggerPrice: triggerPrice.toFixed(5),
      splitNumber,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasOnSale.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat(remaining.toFixed(2))
    });
  }
  return levels;
}

function generatePassiveLevelsBySplit(lanas: number, startPrice: number, targetValue: number): TradingLevel[] {
  const levels: TradingLevel[] = [];
  let remaining = lanas;
  let hasReachedTarget = false;
  let previousRemaining = lanas;

  const startingSplit = calculateSplit(startPrice);

  for (let splitNum = startingSplit.splitNumber; splitNum <= 37; splitNum++) {
    const splitPrice = 0.001 * Math.pow(2, splitNum - 1);
    const actualPortfolioValue = remaining * splitPrice;

    let lanasOnSale: number;
    let cashOut: number;
    let newRemaining: number;

    if (!hasReachedTarget && actualPortfolioValue >= targetValue) {
      hasReachedTarget = true;
    }

    if (hasReachedTarget) {
      newRemaining = targetValue / splitPrice;
      lanasOnSale = previousRemaining - newRemaining;
      cashOut = lanasOnSale * splitPrice;
    } else {
      lanasOnSale = remaining * 0.01;
      cashOut = lanasOnSale * splitPrice;
      newRemaining = remaining - lanasOnSale;
    }

    levels.push({
      level: splitNum,
      triggerPrice: splitPrice.toFixed(5),
      splitNumber: splitNum,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasOnSale.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat(newRemaining.toFixed(2))
    });

    previousRemaining = newRemaining;
    remaining = newRemaining;
  }

  return levels;
}

function getAccountConfigs(): Array<{ type: 'linear' | 'compound' | 'passive' }> {
  return [
    { type: 'linear' },    // Account 1
    { type: 'linear' },    // Account 2
    { type: 'compound' },  // Account 3
    { type: 'compound' },  // Account 4
    { type: 'compound' },  // Account 5
    { type: 'passive' },   // Account 6
    { type: 'passive' },   // Account 7
    { type: 'passive' }    // Account 8
  ];
}

// Convert TradingLevel to KIND 88888 format
function convertToKind88888Level(accountId: number, level: TradingLevel, levelIndex: number): any {
  return {
    row_id: `a${accountId}-l${levelIndex + 1}`,
    level_no: level.level,
    trigger_price: parseFloat(level.triggerPrice),
    coins_to_give: level.lanasOnSale,
    cash_out: parseFloat(level.cashOut),
    remaining_lanas: level.remaining
  };
}

// Publish event to Nostr relays using SimplePool
interface PublishResult {
  relay: string;
  success: boolean;
  error?: string;
}

async function publishToNostr(
  signedEvent: any,
  relays: string[]
): Promise<PublishResult[]> {
  const pool = new SimplePool();
  const results: PublishResult[] = [];

  try {
    // Create a promise for EACH relay
    const publishPromises = relays.map(async (relay: string) => {
      console.log(`Connecting to ${relay}...`);

      return new Promise<void>((resolve) => {
        // TIMEOUT MECHANISM (10s)
        const timeout = setTimeout(() => {
          results.push({
            relay,
            success: false,
            error: 'Connection timeout (10s)'
          });
          console.error(`${relay}: Timeout`);
          resolve();
        }, 10000);

        try {
          // PUBLISH TO RELAY
          const pubs = pool.publish([relay], signedEvent);

          // RACE: publish vs timeout (8s inner timeout)
          Promise.race([
            Promise.all(pubs),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Publish timeout')), 8000)
            )
          ]).then(() => {
            clearTimeout(timeout);
            results.push({ relay, success: true });
            console.log(`${relay}: Successfully published`);
            resolve();
          }).catch((error) => {
            clearTimeout(timeout);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            results.push({ relay, success: false, error: errorMsg });
            console.error(`${relay}: ${errorMsg}`);
            resolve();
          });
        } catch (error) {
          clearTimeout(timeout);
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          results.push({ relay, success: false, error: errorMsg });
          console.error(`${relay}: ${errorMsg}`);
          resolve();
        }
      });
    });

    // WAIT FOR ALL RELAYS TO COMPLETE OR TIMEOUT
    await Promise.all(publishPromises);

    // SUMMARY
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log('Publishing summary:', {
      eventId: signedEvent.id,
      total: results.length,
      successful: successCount,
      failed: failedCount,
      details: results
    });

    return results;

  } finally {
    // CRITICAL: ALWAYS close pool
    console.log('Closing pool connections...');
    pool.close(relays);
  }
}

// ============================================================================
// KIND 38888 RELAY FETCHER — get authorized relay list from system params
// ============================================================================

const KIND_38888_AUTHORIZED_PUBKEY = '9eb71bf1e9c3189c78800e4c3831c1c1a93ab43b61118818c32e4490891a35b3';
const BOOTSTRAP_RELAYS = [
  'wss://relay.lanavault.space',
  'wss://relay.lanacoin-eternity.com'
];

async function fetchRelaysFromKind38888(): Promise<string[]> {
  console.log('Fetching relays from KIND 38888...');
  const pool = new SimplePool();

  try {
    const events = await pool.querySync(BOOTSTRAP_RELAYS, {
      kinds: [38888],
      authors: [KIND_38888_AUTHORIZED_PUBKEY],
      '#d': ['main'],
      limit: 1
    });

    if (!events || events.length === 0) {
      console.warn('No KIND 38888 event found, using bootstrap relays');
      return BOOTSTRAP_RELAYS;
    }

    const latestEvent = events[0];
    const relays = latestEvent.tags
      .filter((t: string[]) => t[0] === 'relay')
      .map((t: string[]) => t[1]);

    if (relays.length === 0) {
      console.warn('KIND 38888 has no relay tags, using bootstrap relays');
      return BOOTSTRAP_RELAYS;
    }

    console.log(`Found ${relays.length} relays from KIND 38888:`, relays);
    return relays;
  } catch (error) {
    console.error('Failed to fetch KIND 38888:', error);
    return BOOTSTRAP_RELAYS;
  } finally {
    pool.close(BOOTSTRAP_RELAYS);
  }
}

// POST /api/publish-lana8wonder-plan
router.post('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();

    // Central authority keys from environment (shared across all domains)
    const publisherPubkey = process.env.NOSTR_PUBLISHER_PUBKEY;
    const publisherPrivateKey = process.env.NOSTR_PUBLISHER_PRIVATE_KEY;

    if (!publisherPubkey || !publisherPrivateKey) {
      throw new Error('NOSTR_PUBLISHER_PUBKEY and NOSTR_PUBLISHER_PRIVATE_KEY must be set in environment');
    }

    const {
      subject_hex,
      wallets,
      amount_per_wallet,
      currency,
      exchange_rate,
      start_price
      // NOTE: relays are NOT accepted from client — always fetched from KIND 38888
    } = req.body;

    console.log('Received publish request:', {
      subject_hex,
      wallets_count: wallets?.length,
      wallets,
      currency,
      start_price,
      publisherPubkey
    });

    // VALIDATION: Ensure exactly 8 non-empty wallet addresses
    if (!wallets || !Array.isArray(wallets) || wallets.length !== 8) {
      throw new Error(`Invalid wallets: expected exactly 8 wallet addresses, got ${wallets?.length || 0}`);
    }

    const emptyWallets = wallets.filter((w: string) => !w || w.trim() === '');
    if (emptyWallets.length > 0) {
      throw new Error(`Invalid wallets: ${emptyWallets.length} wallet addresses are empty`);
    }

    console.log('Validated 8 wallet addresses');
    console.log('Creating Lana8Wonder plan for subject:', subject_hex);

    // 1. Fetch relays from KIND 38888 (authoritative source)
    const relays = await fetchRelaysFromKind38888();
    console.log(`Will publish to ${relays.length} relays from KIND 38888`);

    // 2. Generate annuity plan (matching PreviewLana8Wonder.tsx logic)
    // NOTE: start_price is ALREADY adjusted (+8%) by frontend, don't adjust again!

    const accountPrices = [
      start_price,
      start_price * 10,
      start_price * 100,
      start_price * 1000,
      start_price * 10000,
      start_price * 100000,
      start_price * 1000000,
      start_price * 10000000
    ];

    const targetValues = [
      null, null, null, null, null, // Accounts 1-5 don't need target
      1000000,   // Account 6
      10000000,  // Account 7
      88000000   // Account 8
    ];

    const accountConfigs = getAccountConfigs();

    const accounts = wallets.map((wallet: string, index: number) => {
      const accountId = index + 1;
      const config = accountConfigs[index];

      let tradingLevels: TradingLevel[];

      if (config.type === 'linear') {
        tradingLevels = generateLinearLevels(amount_per_wallet, accountPrices[index]);
      } else if (config.type === 'compound') {
        tradingLevels = generateCompoundLevels(amount_per_wallet, accountPrices[index]);
      } else { // passive
        tradingLevels = generatePassiveLevelsBySplit(
          amount_per_wallet,
          accountPrices[index],
          targetValues[index]!
        );
      }

      // Convert to KIND 88888 format
      const levels = tradingLevels.map((level, levelIndex) =>
        convertToKind88888Level(accountId, level, levelIndex)
      );

      console.log(`Account ${accountId} (${config.type}): ${levels.length} levels`);

      return {
        account_id: accountId,
        wallet,
        levels
      };
    });

    // 3. Create event template (KIND 88888)
    const eventTemplate = {
      kind: 88888,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', `plan:${subject_hex}`],
        ['p', subject_hex],
        ['mpub', publisherPubkey],
        ['coin', 'LANA'],
        ['currency', currency],
        ['policy', 'v2'],
        ['schema', '1.2.1'],
        ...wallets.map((wallet: string, index: number) =>
          ['acct', String(index + 1), wallet]
        )
      ],
      content: JSON.stringify({
        subject_hex,
        plan_id: `plan:${subject_hex}`,
        coin: 'LANA',
        currency,
        policy: 'v2',
        accounts
      })
    };

    // 4. Sign event with central authority private key (from env)
    console.log('Signing event with central authority key...');
    const privateKeyBytes = hexToBytes(publisherPrivateKey);
    const signedEvent = finalizeEvent(eventTemplate, privateKeyBytes);
    console.log('Event signed:', signedEvent.id, 'by pubkey:', signedEvent.pubkey);

    // 5. Publish to KIND 38888 relays
    console.log('Publishing to relays from KIND 38888...');
    const publishResults = await publishToNostr(signedEvent, relays);

    const successCount = publishResults.filter(r => r.success).length;
    console.log(`Published to ${successCount}/${relays.length} relays`);

    if (successCount === 0) {
      throw new Error('Failed to publish to any relay');
    }

    // 6. Update profile in database
    console.log('Updating profile.published_plan...');
    try {
      db.prepare(
        `UPDATE profiles SET published_plan = 1, updated_at = datetime('now') WHERE nostr_hex_id = ?`
      ).run(subject_hex);
      console.log('Profile updated: published_plan = true');
    } catch (updateError) {
      console.error('Failed to update profile:', updateError);
      // Don't throw - event was published successfully
    }

    return res.json({
      success: true,
      event_id: signedEvent.id,
      pubkey: signedEvent.pubkey,
      publish_results: publishResults,
      relays_used: relays,
      plan: {
        subject_hex,
        accounts: accounts.length,
        total_levels: accounts.reduce((sum: number, acc: any) => sum + acc.levels.length, 0)
      }
    });

  } catch (error) {
    console.error('Error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: errorMsg });
  }
});

export default router;
