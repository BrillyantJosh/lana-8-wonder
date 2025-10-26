import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface ElectrumServer {
  id: string;
  name: string;
  host: string;
  port: number;
  priority: number;
  is_active: boolean;
  error_count?: number;
}

interface WalletBalance {
  wallet: string;
  balance: number;
  error?: string;
}

class ElectrumBalanceAggregator {
  servers: ElectrumServer[] = [];
  supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async initialize() {
    const { data: servers, error } = await this.supabase
      .from('electrum_servers')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (error) {
      throw new Error(`Failed to load Electrum servers: ${error.message}`);
    }

    this.servers = (servers as ElectrumServer[]) || [];
    console.log(`Initialized with ${this.servers.length} active Electrum servers`);
  }

  async fetchWalletBalances(walletAddresses: string[]): Promise<WalletBalance[]> {
    if (this.servers.length === 0) {
      throw new Error('No active Electrum servers available');
    }

    console.log(`Starting balance fetch for ${walletAddresses.length} wallets`);

    // Try servers in priority order
    for (const server of this.servers) {
      try {
        console.log(`Attempting with server: ${server.name} (priority: ${server.priority})`);
        const result = await this.processBatchWithServer(server, walletAddresses);
        
        if (result.success) {
          console.log(`Batch completed with ${server.name}: ${result.balances.length} balances fetched`);
          return result.balances;
        }
      } catch (error) {
        console.warn(`Server ${server.name} failed:`, error);
        await this.updateServerStats(server.id, 0, false);
        continue;
      }
    }

    throw new Error('All Electrum servers failed');
  }

  async processBatchWithServer(server: ElectrumServer, walletAddresses: string[]) {
    const startTime = Date.now();
    const balances: WalletBalance[] = [];
    const errors: string[] = [];
    const BATCH_SIZE = 50;

    try {
      for (let i = 0; i < walletAddresses.length; i += BATCH_SIZE) {
        const batch = walletAddresses.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(walletAddresses.length / BATCH_SIZE)} with ${batch.length} addresses`);

        const batchResults = await this.fetchBatchBalances(server, batch);
        balances.push(...batchResults.balances);
        errors.push(...batchResults.errors);

        if (i + BATCH_SIZE < walletAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const responseTime = Date.now() - startTime;
      await this.updateServerStats(server.id, responseTime, true);

      return {
        success: true,
        balances,
        errors,
        server_used: server.name
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await this.updateServerStats(server.id, responseTime, false);
      throw error;
    }
  }

  async fetchBatchBalances(server: ElectrumServer, addresses: string[]): Promise<{ balances: WalletBalance[], errors: string[] }> {
    return new Promise(async (resolve, reject) => {
      let conn: Deno.TcpConn | null = null;
      const timeout = setTimeout(() => {
        if (conn) conn.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      try {
        conn = await Deno.connect({
          hostname: server.host,
          port: server.port
        });

        const balances: WalletBalance[] = [];
        const errors: string[] = [];
        let requestId = 1;

        // Send batch requests
        for (const address of addresses) {
          const request = {
            id: requestId++,
            method: "blockchain.address.get_balance",
            params: [address]
          };
          const requestData = JSON.stringify(request) + '\n';
          await conn.write(new TextEncoder().encode(requestData));
        }

        // Read responses
        const decoder = new TextDecoder();
        let buffer = '';
        const responses = new Map<number, any>();

        while (responses.size < addresses.length) {
          const chunk = new Uint8Array(4096);
          const bytesRead = await conn.read(chunk);
          if (bytesRead === null) break;

          buffer += decoder.decode(chunk.subarray(0, bytesRead));

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const response = JSON.parse(line);
                responses.set(response.id, response);
              } catch (e) {
                console.warn('Failed to parse response:', line);
              }
            }
          }
        }

        // Process responses
        for (let i = 0; i < addresses.length; i++) {
          const address = addresses[i];
          const responseId = i + 1;
          const response = responses.get(responseId);

          if (response && response.result) {
            const confirmedBalance = response.result.confirmed || 0;
            const unconfirmedBalance = response.result.unconfirmed || 0;
            const totalBalance = (confirmedBalance + unconfirmedBalance) / 100000000;

            balances.push({
              wallet: address,
              balance: Math.round(totalBalance * 100000000) / 100000000
            });
          } else {
            const errorMsg = response?.error?.message || 'No response received';
            errors.push(`${address}: ${errorMsg}`);
            balances.push({
              wallet: address,
              balance: 0,
              error: errorMsg
            });
          }
        }

        clearTimeout(timeout);
        conn.close();
        resolve({ balances, errors });
      } catch (error) {
        clearTimeout(timeout);
        if (conn) conn.close();
        reject(error);
      }
    });
  }

  async updateServerStats(serverId: string, responseTimeMs: number, success: boolean) {
    try {
      const updateData: any = {
        last_health_check: new Date().toISOString(),
        response_time_ms: responseTimeMs,
        status: success ? 'online' : 'error',
        updated_at: new Date().toISOString()
      };

      if (!success) {
        const { data: currentServer } = await this.supabase
          .from('electrum_servers')
          .select('error_count')
          .eq('id', serverId)
          .single();

        updateData.error_count = (currentServer?.error_count || 0) + 1;
        updateData.last_error_message = 'Connection or request failed';
      } else {
        updateData.error_count = 0;
        updateData.last_error_message = null;
      }

      await this.supabase
        .from('electrum_servers')
        .update(updateData)
        .eq('id', serverId);
    } catch (error) {
      console.error('Failed to update server stats:', error);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Check-wallet-balance started');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { wallets } = await req.json();

    if (!wallets || !Array.isArray(wallets) || wallets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'wallets array is required', timestamp: new Date().toISOString() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${wallets.length} wallet addresses`);

    const aggregator = new ElectrumBalanceAggregator(supabase);
    await aggregator.initialize();

    const balances = await aggregator.fetchWalletBalances(wallets);

    const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);
    const successCount = balances.filter(b => !b.error).length;
    const errorCount = balances.filter(b => b.error).length;

    const result = {
      success: true,
      wallets: balances,
      totalBalance: Math.round(totalBalance * 100000000) / 100000000,
      successCount,
      errorCount,
      timestamp: new Date().toISOString()
    };

    console.log(`Balance check completed: ${successCount} success, ${errorCount} errors, total: ${result.totalBalance} LANA`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in check-wallet-balance:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
