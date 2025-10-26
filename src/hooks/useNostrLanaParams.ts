import { useState, useEffect } from 'react';
import { SimplePool, Filter, Event } from 'nostr-tools';

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

const AUTHORIZED_PUBKEY = '9eb71bf1e9c3189c78800e4c3831c1c1a93ab43b61118818c32e4490891a35b3';
const RELAY_URLS = [
  'wss://relay.lanavault.space',
  'wss://relay.lanacoin-eternity.com'
];

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

        const latestEvent = event[0] as Event;

        // Parse tags
        const relays = latestEvent.tags
          .filter(t => t[0] === 'relay')
          .map(t => t[1]);

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
