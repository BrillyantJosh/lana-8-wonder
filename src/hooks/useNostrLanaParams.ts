import { useState, useEffect } from 'react';
import { SimplePool, Filter, Event } from 'nostr-tools';
import { BOOTSTRAP_RELAYS as RELAY_URLS, KIND_38888_AUTHORIZED_PUBKEY as AUTHORIZED_PUBKEY, relaysFromKind38888 } from '@/lib/relayBootstrap';

export interface ElectrumServer {
  host: string;
  port: string;
}

export interface ExchangeRates {
  EUR: number;
  USD: number;
  GBP: number;
}

export interface LanaSystemParams {
  relays: string[];
  electrum: ElectrumServer[];
  exchangeRates: ExchangeRates;
  split: string;
  version: string;
  validFrom: string;
  connectedRelays: number;
  totalRelays: number;
}

// This hook is the search for KIND 38888 itself, so it is one of the few
// places that legitimately starts from a fixed list — the bootstrap in
// @/lib/relayBootstrap, kept at the full four and free of the retired alias
// relay.lanacoin-eternity.com. Everything downstream uses `params.relays`,
// which is 38888's own answer.

export const useNostrLanaParams = () => {
  const [params, setParams] = useState<LanaSystemParams | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchParams = async () => {
      const pool = new SimplePool();
      
      try {
        setLoading(true);
        setError(null);

        const filter: Filter = {
          kinds: [38888],
          authors: [AUTHORIZED_PUBKEY],
          '#d': ['main'],
          limit: 1
        };

        const event = await pool.querySync(RELAY_URLS, filter);
        
        if (!event || event.length === 0) {
          throw new Error('No Lana System Parameters found');
        }

        // Newest wins. `event[0]` off a merged array can be one relay's stale
        // copy of the parameters, which is how a retired relay list, an old
        // split or a superseded exchange rate comes back from the dead.
        const latestEvent = [...event].sort((a, b) => b.created_at - a.created_at)[0] as Event;

        // Parse tags
        const relays = relaysFromKind38888(latestEvent);

        const electrum = latestEvent.tags
          .filter(t => t[0] === 'electrum')
          .map(t => ({ host: t[1], port: t[2] }));

        const fxTags = latestEvent.tags.filter(t => t[0] === 'fx');
        const exchangeRates: ExchangeRates = {
          EUR: parseFloat(fxTags.find(t => t[1] === 'EUR')?.[2] || '0'),
          USD: parseFloat(fxTags.find(t => t[1] === 'USD')?.[2] || '0'),
          GBP: parseFloat(fxTags.find(t => t[1] === 'GBP')?.[2] || '0')
        };

        const split = latestEvent.tags.find(t => t[0] === 'split')?.[1] || '';
        const version = latestEvent.tags.find(t => t[0] === 'version')?.[1] || '';
        const validFrom = latestEvent.tags.find(t => t[0] === 'valid_from')?.[1] || '';

        // Test relay connectivity
        const connectedRelays = RELAY_URLS.length; // Simple assumption for now

        setParams({
          relays,
          electrum,
          exchangeRates,
          split,
          version,
          validFrom,
          connectedRelays,
          totalRelays: RELAY_URLS.length
        });

      } catch (err) {
        console.error('Error fetching Lana System Parameters:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch parameters');
      } finally {
        setLoading(false);
        pool.close(RELAY_URLS);
      }
    };

    fetchParams();
  }, []);

  return { params, loading, error };
};
