import { SimplePool, type Event, type Filter } from 'nostr-tools';

export interface Lana8WonderPlan {
  subject_hex: string;
  plan_id: string;
  coin: string;
  currency: string;
  policy: string;
  accounts: Array<{
    account_id: number;
    wallet: string;
    levels: Array<{
      row_id: string;
      level_no: number;
      trigger_price: number;
      coins_to_give: number;
      cash_out: number;
      remaining_lanas: number;
    }>;
  }>;
}

export async function fetchKind88888(nostrHexId: string, relayUrls: string[]): Promise<Lana8WonderPlan | null> {
  const MAIN_PUBLISHER = "REDACTED_PUBKEY";
  
  const filter: Filter = {
    kinds: [88888],
    "#p": [nostrHexId],
    "#d": [`plan:${nostrHexId}`],
    authors: [MAIN_PUBLISHER]
  };

  console.log("Fetching KIND 88888 for:", nostrHexId);
  console.log("Using relays:", relayUrls);

  const pool = new SimplePool();

  try {
    const events = await pool.querySync(relayUrls, filter);
    
    console.log(`Found ${events.length} events`);

    if (events.length === 0) {
      console.log("No KIND 88888 events found");
      return null;
    }

    // Get the newest event
    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
    
    try {
      const plan: Lana8WonderPlan = JSON.parse(latestEvent.content);
      console.log("Found plan:", plan);
      return plan;
    } catch (error) {
      console.error("Error parsing plan content:", error);
      return null;
    }
  } catch (error) {
    console.error("Error fetching from relays:", error);
    return null;
  } finally {
    pool.close(relayUrls);
  }
}
