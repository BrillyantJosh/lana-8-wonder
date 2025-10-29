import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { finalizeEvent, EventTemplate } from 'npm:nostr-tools@2.17.0/pure';
import { hexToBytes } from 'npm:nostr-tools@2.17.0/utils';
import { SimplePool } from 'npm:nostr-tools@2.17.0/pool';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// HELPER FUNCTIONS - Copied from PreviewLana8Wonder.tsx
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

function getAccountConfigs(): Array<{ type: "linear" | "compound" | "passive" }> {
  return [
    { type: "linear" },    // Account 1
    { type: "linear" },    // Account 2
    { type: "compound" },  // Account 3
    { type: "compound" },  // Account 4
    { type: "compound" },  // Account 5
    { type: "passive" },   // Account 6
    { type: "passive" },   // Account 7
    { type: "passive" }    // Account 8
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
      console.log(`🔄 Connecting to ${relay}...`);
      
      return new Promise<void>((resolve) => {
        // ⏱️ TIMEOUT MECHANISM (10s)
        const timeout = setTimeout(() => {
          results.push({ 
            relay, 
            success: false, 
            error: 'Connection timeout (10s)' 
          });
          console.error(`❌ ${relay}: Timeout`);
          resolve(); // ⚠️ IMPORTANT: resolve, not reject!
        }, 10000);

        try {
          // 📤 PUBLISH TO RELAY
          const pubs = pool.publish([relay], signedEvent);
          
          // 🏁 RACE: publish vs timeout (8s inner timeout)
          Promise.race([
            Promise.all(pubs),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Publish timeout')), 8000)
            )
          ]).then(() => {
            clearTimeout(timeout);
            results.push({ relay, success: true });
            console.log(`✅ ${relay}: Successfully published`);
            resolve();
          }).catch((error) => {
            clearTimeout(timeout);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            results.push({ relay, success: false, error: errorMsg });
            console.error(`❌ ${relay}: ${errorMsg}`);
            resolve(); // ⚠️ IMPORTANT: resolve, not reject!
          });
        } catch (error) {
          clearTimeout(timeout);
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          results.push({ relay, success: false, error: errorMsg });
          console.error(`❌ ${relay}: ${errorMsg}`);
          resolve(); // ⚠️ IMPORTANT: resolve, not reject!
        }
      });
    });
    
    // ⏳ WAIT FOR ALL RELAYS TO COMPLETE OR TIMEOUT
    await Promise.all(publishPromises);
    
    // 📊 SUMMARY
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    console.log('📊 Publishing summary:', {
      eventId: signedEvent.id,
      total: results.length,
      successful: successCount,
      failed: failedCount,
      details: results
    });

    return results;
    
  } finally {
    // 🔒 CRITICAL: ALWAYS close pool
    console.log('🔒 Closing pool connections...');
    pool.close(relays);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const {
      subject_hex,
      wallets,
      amount_per_wallet,
      currency,
      exchange_rate,
      start_price,
      relays
    } = await req.json();

    console.log('📝 Creating Lana8Wonder plan for subject:', subject_hex);

    // 1. Get main publisher private key from database
    const { data: settingData, error: settingError } = await supabaseClient
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'main_publisher_private_key')
      .single();

    if (settingError || !settingData) {
      throw new Error('Failed to retrieve main publisher private key');
    }

    const mainPublisherPrivateKey = settingData.setting_value;
    console.log('🔑 Retrieved main publisher key');

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
      
      if (config.type === "linear") {
        tradingLevels = generateLinearLevels(amount_per_wallet, accountPrices[index]);
      } else if (config.type === "compound") {
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
      
      console.log(`📊 Account ${accountId} (${config.type}): ${levels.length} levels`);
      
      return {
        account_id: accountId,
        wallet,
        levels
      };
    });

    // 3. Create event template (KIND 88888)
    const eventTemplate: EventTemplate = {
      kind: 88888,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', `plan:${subject_hex}`],
        ['p', subject_hex],
        ['mpub', 'REDACTED_PUBKEY'],
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

    // 4. Sign event with main publisher key
    console.log('✍️ Signing event...');
    const privateKeyBytes = hexToBytes(mainPublisherPrivateKey);
    const signedEvent = finalizeEvent(eventTemplate, privateKeyBytes);
    console.log('✅ Event signed:', signedEvent.id);

    // 5. Publish to Nostr relays
    console.log('📤 Publishing to relays...');
    const publishResults = await publishToNostr(signedEvent, relays);
    
    const successCount = publishResults.filter(r => r.success).length;
    console.log(`📊 Published to ${successCount}/${relays.length} relays`);

    if (successCount === 0) {
      throw new Error('Failed to publish to any relay');
    }

    // 6. Update profile in database
    console.log('💾 Updating profile.published_plan...');
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ published_plan: true })
      .eq('nostr_hex_id', subject_hex);

    if (updateError) {
      console.error('⚠️ Failed to update profile:', updateError);
      // Don't throw - event was published successfully
    } else {
      console.log('✅ Profile updated: published_plan = true');
    }

    return new Response(
      JSON.stringify({
        success: true,
        event_id: signedEvent.id,
        publish_results: publishResults,
        plan: {
          subject_hex,
          accounts: accounts.length,
          total_levels: accounts.reduce((sum: number, acc: any) => sum + acc.levels.length, 0)
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMsg }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});