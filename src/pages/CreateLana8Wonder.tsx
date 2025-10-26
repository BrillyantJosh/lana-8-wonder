import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogOut, Loader2, Wallet, AlertCircle } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { fetchKind30889, type WalletListRecord } from "@/lib/nostrClient";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const CreateLana8Wonder = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [walletRecords, setWalletRecords] = useState<WalletListRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("");
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<{ EUR: number; USD: number; GBP: number } | null>(null);
  const [planCurrency, setPlanCurrency] = useState<string>("EUR");
  const { params } = useNostrLanaParams();

  useEffect(() => {
    const loadWallets = async () => {
      const sessionData = sessionStorage.getItem("lana_session");
      if (!sessionData) {
        navigate("/login");
        return;
      }

      const parsedSession: LanaSession = JSON.parse(sessionData);
      setSession(parsedSession);
      
      // Set currency from profile (Kind 0)
      if (parsedSession.currency) {
        setPlanCurrency(parsedSession.currency);
      }
      
      // Set greeting with profile name
      const displayName = parsedSession.profileDisplayName || parsedSession.profileName || "User";
      setGreeting(`Hello, ${displayName}!`);

      if (!params?.relays || params.relays.length === 0) {
        toast.error("No relays available");
        setLoading(false);
        return;
      }

      // Set exchange rates from params
      if (params?.exchangeRates) {
        setExchangeRates(params.exchangeRates);
      }

      try {
        const records = await fetchKind30889(parsedSession.nostrHexId, params.relays);
        setWalletRecords(records);
        
        // Load balances for all wallets
        if (records.length > 0 && params?.electrum && params.electrum.length > 0) {
          const allWalletAddresses = records.flatMap(r => 
            r.wallets.map(w => w.wallet_address)
          );
          loadWalletBalances(allWalletAddresses);
        }
      } catch (error) {
        console.error("Error loading wallets:", error);
        toast.error("Failed to load wallet list");
      } finally {
        setLoading(false);
      }
    };

    const loadWalletBalances = async (wallets: string[]) => {
      setBalancesLoading(true);
      try {
        console.log('Sending to edge function:', {
          wallet_addresses: wallets,
          electrum_servers: params?.electrum,
          electrum_count: params?.electrum?.length
        });
        
        const { data, error } = await supabase.functions.invoke('check-wallet-balance', {
          body: { 
            wallet_addresses: wallets,
            electrum_servers: params?.electrum || []
          },
        });

        console.log('Edge function response:', { data, error });

        if (error) throw error;

        if (data?.success && data?.wallets) {
          const balances: Record<string, number> = {};
          data.wallets.forEach((w: any) => {
            balances[w.wallet_id] = w.balance || 0;
          });
          setWalletBalances(balances);
        }
      } catch (error) {
        console.error("Error loading wallet balances:", error);
        toast.error("Failed to load wallet balances");
      } finally {
        setBalancesLoading(false);
      }
    };

    if (params?.relays) {
      loadWallets();
    }
  }, [navigate, params]);

  const handleLogout = () => {
    sessionStorage.removeItem("lana_session");
    navigate("/login");
  };

  if (!session) return null;

  const allWallets = walletRecords.flatMap(record => 
    record.wallets.map(wallet => ({
      ...wallet,
      status: record.status,
      registrar: record.registrar_pubkey
    }))
  );

  // Calculate minimum required LANA balance (100 currency units / exchange rate)
  const getMinimumRequiredBalance = (currency: string = "EUR"): number => {
    if (!exchangeRates) return 0;
    const rate = exchangeRates[currency as keyof typeof exchangeRates];
    if (!rate || rate === 0) return 0;
    return 100 / rate;
  };

  const minimumRequired = getMinimumRequiredBalance(planCurrency);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        {greeting && (
          <div className="mb-6">
            <h1 className="text-3xl font-bold">{greeting}</h1>
          </div>
        )}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold">Create Lana8Wonder Plan</h2>
            <p className="text-muted-foreground">Set up your annuity structure</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        <div className="grid gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Wallet ID</p>
                <p className="font-mono text-sm break-all">{session.walletId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nostr HEX ID</p>
                <p className="font-mono text-sm break-all">{session.nostrHexId}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                <CardTitle>Your Registered Wallets</CardTitle>
              </div>
              <CardDescription>
                Select wallets from this list when creating your annuity plan.
                {minimumRequired > 0 && (
                  <span className="block mt-1 text-foreground">
                    Minimum required balance: <strong>{minimumRequired.toFixed(4)} LANA</strong> (100 {planCurrency} ÷ current exchange rate)
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : allWallets.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No wallets found for your account</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Contact your registrar to add wallets
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-semibold">Wallet Address</TableHead>
                        <TableHead className="font-semibold">Wallet Type</TableHead>
                        <TableHead className="font-semibold">Balance (LANA)</TableHead>
                        <TableHead className="font-semibold">Note</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allWallets.map((wallet, idx) => {
                        const currentBalance = walletBalances[wallet.wallet_address] || 0;
                        const hasEnoughBalance = minimumRequired === 0 || currentBalance >= minimumRequired;
                        
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{wallet.wallet_address}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                {wallet.wallet_type}
                              </span>
                            </TableCell>
                            <TableCell>
                              {balancesLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : walletBalances[wallet.wallet_address] !== undefined ? (
                                <span className="font-semibold">
                                  {walletBalances[wallet.wallet_address].toFixed(8)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{wallet.note || "—"}</TableCell>
                            <TableCell>
                              {!balancesLoading && minimumRequired > 0 && (
                                hasEnoughBalance ? (
                                  <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white">
                                    ✓ Sufficient
                                  </Badge>
                                ) : (
                                  <div className="space-y-1">
                                    <Badge variant="destructive" className="flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      Insufficient
                                    </Badge>
                                    <p className="text-xs text-muted-foreground">
                                      Min: {minimumRequired.toFixed(4)} LANA
                                    </p>
                                  </div>
                                )
                              )}
                            </TableCell>
                            <TableCell>
                              {!balancesLoading && hasEnoughBalance && minimumRequired > 0 && (
                                <Button 
                                  size="sm"
                                  onClick={() => navigate('/assign-lana8wonder', { 
                                    state: { 
                                      sourceWallet: wallet.wallet_address,
                                      balance: currentBalance
                                    } 
                                  })}
                                >
                                  Assign to Lana 8 Wonder
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CreateLana8Wonder;
