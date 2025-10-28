import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { finalizeEvent, EventTemplate } from 'npm:nostr-tools@2.17.0/pure';
import { hexToBytes } from 'npm:nostr-tools@2.17.0/utils';
import { SimplePool } from 'npm:nostr-tools@2.17.0/pool';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate annuity plan levels (similar to TradingPlanCalculator)
function generateAnnuityLevels(
  accountId: number,
  initialBalance: number,
  startPrice: number,
  exchangeRate: number
): any[] {
  const levels: any[] = [];
  let remainingLanas = initialBalance;
  const numLevels = accountId <= 5 ? 10 : 8; // Accounts 1-5 have 10 levels, 6-8 have 8 levels
  
  for (let levelNo = 1; levelNo <= numLevels; levelNo++) {
    const triggerPrice = startPrice * Math.pow(2, levelNo - 1);
    const splitPercentage = levelNo === 1 ? 0.20 : 0.25;
    const coinsToGive = remainingLanas * splitPercentage;
    const cashOut = coinsToGive * triggerPrice * exchangeRate;
    
    remainingLanas -= coinsToGive;
    
    levels.push({
      row_id: `a${accountId}-l${levelNo}`,
      level_no: levelNo,
      trigger_price: triggerPrice,
      coins_to_give: coinsToGive,
      cash_out: cashOut,
      remaining_lanas: remainingLanas
    });
  }
  
  return levels;
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

    // 2. Generate annuity plan
    const accounts = wallets.map((wallet: string, index: number) => {
      const accountId = index + 1;
      const levels = generateAnnuityLevels(
        accountId,
        amount_per_wallet,
        start_price,
        exchange_rate
      );
      
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