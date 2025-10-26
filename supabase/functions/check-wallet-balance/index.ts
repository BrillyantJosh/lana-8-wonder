import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ElectrumServer {
  host: string;
  port: string;
}

interface WalletBalanceRequest {
  wallets: string[];
  electrumServers: ElectrumServer[];
}

interface WalletBalance {
  wallet: string;
  balance: number;
  error?: string;
}

// Base58 decode helper for LANA addresses
function base58Decode(address: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let decoded = 0n;
  
  for (const char of address) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base58 character');
    decoded = decoded * 58n + BigInt(index);
  }
  
  const bytes = [];
  while (decoded > 0n) {
    bytes.unshift(Number(decoded % 256n));
    decoded = decoded / 256n;
  }
  
  // Add leading zeros
  for (const char of address) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  
  return new Uint8Array(bytes);
}

// Convert address to script hash for Electrum
async function addressToScriptHash(address: string): Promise<string> {
  try {
    const decoded = base58Decode(address);
    // Remove version byte and checksum (last 4 bytes)
    const pubkeyHash = decoded.slice(1, -4);
    
    // Create P2PKH script: OP_DUP OP_HASH160 <pubkeyHash> OP_EQUALVERIFY OP_CHECKSIG
    const script = new Uint8Array([
      0x76, // OP_DUP
      0xa9, // OP_HASH160
      0x14, // Push 20 bytes
      ...pubkeyHash,
      0x88, // OP_EQUALVERIFY
      0xac  // OP_CHECKSIG
    ]);
    
    // Double SHA256 and reverse
    const hash1 = await crypto.subtle.digest('SHA-256', script);
    const hash2 = await crypto.subtle.digest('SHA-256', hash1);
    const reversed = Array.from(new Uint8Array(hash2)).reverse();
    
    return Array.from(reversed).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error(`Error converting address ${address}:`, error);
    throw error;
  }
}

// Query Electrum server for wallet balance
async function queryElectrumBalance(
  walletAddress: string,
  electrumServers: ElectrumServer[]
): Promise<number> {
  for (const server of electrumServers) {
    try {
      console.log(`Querying ${server.host}:${server.port} for ${walletAddress}`);
      
      // Convert address to script hash
      const scriptHash = await addressToScriptHash(walletAddress);
      console.log(`Script hash for ${walletAddress}: ${scriptHash}`);
      
      // Connect to Electrum server via TCP with timeout
      const conn = await Promise.race([
        Deno.connect({
          hostname: server.host,
          port: parseInt(server.port),
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        )
      ]);

      try {
        // Request balance
        const request = JSON.stringify({
          jsonrpc: '2.0',
          method: 'blockchain.scripthash.get_balance',
          params: [scriptHash],
          id: 1,
        }) + '\n';

        await conn.write(new TextEncoder().encode(request));

        // Read response with timeout
        const buffer = new Uint8Array(4096);
        const n = await Promise.race([
          conn.read(buffer),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Read timeout')), 5000)
          )
        ]);
        
        if (!n) {
          conn.close();
          continue;
        }

        const response = new TextDecoder().decode(buffer.subarray(0, n));
        const data = JSON.parse(response);

        conn.close();

        if (data.result) {
          const confirmed = data.result.confirmed || 0;
          const unconfirmed = data.result.unconfirmed || 0;
          return (confirmed + unconfirmed) / 100000000; // Convert satoshis to LANA
        }
      } catch (error) {
        conn.close();
        throw error;
      }
    } catch (error) {
      console.error(`Error querying ${server.host}:${server.port}:`, error);
      continue;
    }
  }
  
  throw new Error('All Electrum servers failed');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallets, electrumServers }: WalletBalanceRequest = await req.json();

    if (!wallets || !Array.isArray(wallets) || wallets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid wallets array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!electrumServers || !Array.isArray(electrumServers) || electrumServers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid electrumServers array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Checking balances for ${wallets.length} wallets using ${electrumServers.length} Electrum servers`);

    const results: WalletBalance[] = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const balance = await queryElectrumBalance(wallet, electrumServers);
          return { wallet, balance };
        } catch (error) {
          console.error(`Failed to get balance for ${wallet}:`, error);
          return {
            wallet,
            balance: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const totalBalance = results.reduce((sum, r) => sum + r.balance, 0);
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;

    return new Response(
      JSON.stringify({
        success: true,
        wallets: results,
        totalBalance: Math.round(totalBalance * 100000000) / 100000000,
        successCount,
        errorCount,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in check-wallet-balance:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
