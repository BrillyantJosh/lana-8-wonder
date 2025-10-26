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

export interface WalletInfo {
  wallet_address: string;
  wallet_type: string;
  coin: string;
  note: string;
  unregistered_lanoshi: number;
}

export interface WalletListRecord {
  customer_hex: string;
  status: string;
  wallets: WalletInfo[];
  registrar_pubkey: string;
}

export interface LanaProfile {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  website?: string;
  location?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  currency?: string;
  language?: string;
  lanoshi2lash?: string;
  lanaWalletID?: string;
  whoAreYou?: string;
  orgasmic_profile?: string;
  bankName?: string;
  bankAddress?: string;
  bankSWIFT?: string;
  bankAccount?: string;
}

export async function fetchKind0Profile(nostrHexId: string, relayUrls: string[]): Promise<LanaProfile | null> {
  const filter: Filter = {
    kinds: [0],
    authors: [nostrHexId],
    limit: 1
  };

  console.log("Fetching KIND 0 profile for:", nostrHexId);
  console.log("Using relays:", relayUrls);

  const pool = new SimplePool();

  try {
    const events = await pool.querySync(relayUrls, filter);
    
    console.log(`Found ${events.length} profile events`);

    if (events.length === 0) {
      console.log("No KIND 0 profile found");
      return null;
    }

    // Get the newest event
    const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
    
    // Check for lang tag (optional warning, not blocking)
    const langTag = latestEvent.tags.find(t => t[0] === "lang");
    if (!langTag || !langTag[1]) {
      console.warn("Profile missing recommended lang tag");
    }
    
    try {
      const profile: LanaProfile = JSON.parse(latestEvent.content);
      console.log("Found profile:", profile);
      return profile;
    } catch (error) {
      console.error("Error parsing profile content:", error);
      return null;
    }
  } catch (error) {
    console.error("Error fetching KIND 0 profile:", error);
    return null;
  } finally {
    pool.close(relayUrls);
  }
}

export async function fetchKind30889(customerHexId: string, relayUrls: string[]): Promise<WalletListRecord[]> {
  const filter: Filter = {
    kinds: [30889],
    "#d": [customerHexId]
  };

  console.log("Fetching KIND 30889 for:", customerHexId);
  console.log("Using relays:", relayUrls);

  const pool = new SimplePool();

  try {
    const events = await pool.querySync(relayUrls, filter);
    
    console.log(`Found ${events.length} wallet list events`);

    if (events.length === 0) {
      console.log("No KIND 30889 events found");
      return [];
    }

    const records: WalletListRecord[] = [];

    for (const event of events) {
      const dTag = event.tags.find(t => t[0] === "d");
      const statusTag = event.tags.find(t => t[0] === "status");
      const walletTags = event.tags.filter(t => t[0] === "w");

      if (!dTag || !statusTag) continue;

      const wallets: WalletInfo[] = walletTags.map(tag => ({
        wallet_address: tag[1] || "",
        wallet_type: tag[2] || "",
        coin: tag[3] || "LANA",
        note: tag[4] || "",
        unregistered_lanoshi: parseInt(tag[5] || "0", 10)
      }));

      records.push({
        customer_hex: dTag[1],
        status: statusTag[1],
        wallets,
        registrar_pubkey: event.pubkey
      });
    }

    console.log("Parsed wallet records:", records);
    return records;
  } catch (error) {
    console.error("Error fetching KIND 30889:", error);
    return [];
  } finally {
    pool.close(relayUrls);
  }
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
