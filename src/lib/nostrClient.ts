import { SimplePool, type Filter } from 'nostr-tools';
import { readKind30889, type WalletInfo, type WalletListRecord } from './kind30889Read';

// The wallet types live in kind30889Read.ts, next to the parser that fills
// them — the freeze field (`w` tag index 6) used to be dropped here, and
// keeping the shape and the parser apart is what let that happen quietly.
export type { WalletInfo, WalletListRecord };

// The plan type lives in kind88888Read.ts for the same reason. There is no
// `fetchKind88888` any more: it returned `null` both for "no plan" and for "no
// relay answered", and both callers read that as "go and buy one". Use
// `readKind88888` and look at `state`.
export type { Lana8WonderPlan } from './kind88888Read';

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
  payment_link?: string;
  payment_methods?: Array<{
    id: string;
    scope: string;
    country: string;
    scheme: string;
    currency: string;
    label?: string;
    fields: any;
    verified?: boolean;
    primary?: boolean;
  }>;
  tags?: string[][];  // Add tags array from event
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
      profile.tags = latestEvent.tags;  // Include event tags in profile
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

/**
 * Backwards-compatible wrapper: the records, or an empty array.
 *
 * Callers that must not confuse "no relay answered" with "this person has no
 * wallets" — anything gating on a freeze — use `readKind30889` instead and
 * look at `state`. This wrapper exists for the places where an empty list and
 * a silent network genuinely lead to the same screen.
 */
export async function fetchKind30889(customerHexId: string, relayUrls: string[]): Promise<WalletListRecord[]> {
  const result = await readKind30889(customerHexId, relayUrls);
  console.log(`KIND 30889 read: ${result.state}, ${result.records.length} record(s), answered by ${result.answered.length}/${relayUrls.length} relays`);
  return result.records;
}
