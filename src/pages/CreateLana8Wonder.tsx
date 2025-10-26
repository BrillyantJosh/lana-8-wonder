import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogOut, Plus, Loader2, Wallet } from "lucide-react";
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
      
      // Set greeting with profile name
      const displayName = parsedSession.profileDisplayName || parsedSession.profileName || "User";
      setGreeting(`Hello, ${displayName}!`);

      if (!params?.relays || params.relays.length === 0) {
        toast.error("No relays available");
        setLoading(false);
        return;
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
        const { data, error } = await supabase.functions.invoke('check-wallet-balance', {
          body: {
            wallets,
            electrumServers: params?.electrum || [],
          },
        });

        if (error) throw error;

        if (data?.success && data?.wallets) {
          const balances: Record<string, number> = {};
          data.wallets.forEach((w: any) => {
            balances[w.wallet] = w.balance || 0;
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
              <CardTitle>No Annuity Plan Found</CardTitle>
              <CardDescription>
                You don't have an existing Lana8Wonder annuity plan. Create one to start managing your LANA tokens across 8 accounts with multiple price levels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Plan Structure:</h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• 8 accounts with dedicated wallets</li>
                    <li>• Accounts 1-5: 10 levels each</li>
                    <li>• Accounts 6-8: minimum 8 levels each</li>
                    <li>• Total: minimum 74 annuity levels</li>
                    <li>• EUR/LANA price triggers for automatic releases</li>
                  </ul>
                </div>

                <Button className="w-full" size="lg">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Annuity Plan (Coming Soon)
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Plan creation interface will be available soon
                </p>
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
                Select wallets from this list when creating your annuity plan
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allWallets.map((wallet, idx) => (
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
                        </TableRow>
                      ))}
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
