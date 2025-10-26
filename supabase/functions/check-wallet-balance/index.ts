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

// Query Electrum server for wallet balance
async function queryElectrumBalance(
  walletAddress: string,
  electrumServers: ElectrumServer[]
): Promise<number> {
  for (const server of electrumServers) {
    try {
      console.log(`Querying ${server.host}:${server.port} for ${walletAddress}`);
      
      // Connect to Electrum server via TCP
      const conn = await Deno.connect({
        hostname: server.host,
        port: parseInt(server.port),
      });

      // Get script hash from address (simplified - may need proper implementation)
      const scriptHash = walletAddress; // This should be converted to script hash properly
      
      // Request balance
      const request = JSON.stringify({
        jsonrpc: '2.0',
        method: 'blockchain.scripthash.get_balance',
        params: [scriptHash],
        id: 1,
      }) + '\n';

      await conn.write(new TextEncoder().encode(request));

      // Read response
      const buffer = new Uint8Array(4096);
      const n = await conn.read(buffer);
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
