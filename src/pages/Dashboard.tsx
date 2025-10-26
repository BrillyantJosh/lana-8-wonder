import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogOut, Loader2 } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { Lana8WonderPlan, fetchKind88888 } from "@/lib/nostrClient";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const Dashboard = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [plan, setPlan] = useState<Lana8WonderPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("");
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const { params } = useNostrLanaParams();

  useEffect(() => {
    const loadPlanData = async () => {
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
        const fetchedPlan = await fetchKind88888(parsedSession.nostrHexId, params.relays);
        
        if (!fetchedPlan) {
          toast.error("No annuity plan found");
          navigate("/create-lana8wonder");
          return;
        }

        setPlan(fetchedPlan);
        
        // Load balances for all wallets in the plan
        if (fetchedPlan && params?.electrum && params.electrum.length > 0) {
          loadWalletBalances(fetchedPlan);
        }
      } catch (error) {
        console.error("Error loading plan:", error);
        toast.error("Failed to load annuity plan");
      } finally {
        setLoading(false);
      }
    };

    const loadWalletBalances = async (planData: Lana8WonderPlan) => {
      setBalancesLoading(true);
      try {
        const wallets = planData.accounts.map(acc => acc.wallet);
        
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
      loadPlanData();
    }
  }, [navigate, params]);

  const handleLogout = () => {
    sessionStorage.removeItem("lana_session");
    navigate("/login");
  };

  if (!session) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your annuity plan...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Plan Found</CardTitle>
            <CardDescription>Redirecting to plan creation...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        {greeting && (
          <div className="mb-6">
            <h1 className="text-3xl font-bold">{greeting}</h1>
          </div>
        )}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold">Lana8Wonder Dashboard</h2>
            <p className="text-muted-foreground">Your Annuity Plan</p>
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
              <div>
                <p className="text-sm text-muted-foreground">Nostr npub</p>
                <p className="font-mono text-sm break-all">{session.nostrNpubId}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan Overview</CardTitle>
              <CardDescription>
                {plan.coin}/{plan.currency} • Policy {plan.policy} • Schema {plan.accounts.length} accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Accounts</p>
                  <p className="text-2xl font-bold">{plan.accounts.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Levels</p>
                  <p className="text-2xl font-bold">
                    {plan.accounts.reduce((sum, acc) => sum + acc.levels.length, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Currency</p>
                  <p className="text-2xl font-bold">{plan.currency}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Asset</p>
                  <p className="text-2xl font-bold">{plan.coin}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {plan.accounts.map((account) => (
            <Card key={account.account_id}>
              <CardHeader>
                <CardTitle>Account {account.account_id}</CardTitle>
                <CardDescription>
                  Wallet: <span className="font-mono">{account.wallet}</span> • {account.levels.length} levels
                  {balancesLoading ? (
                    <span className="ml-2 text-muted-foreground">
                      <Loader2 className="inline h-3 w-3 animate-spin" /> Loading balance...
                    </span>
                  ) : walletBalances[account.wallet] !== undefined ? (
                    <span className="ml-2 font-semibold text-primary">
                      • Balance: {walletBalances[account.wallet].toFixed(8)} LANA
                    </span>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Level</TableHead>
                        <TableHead>Trigger Price ({plan.currency})</TableHead>
                        <TableHead>Coins to Give</TableHead>
                        <TableHead>Cash Out ({plan.currency})</TableHead>
                        <TableHead>Remaining LANAs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {account.levels.map((level) => (
                        <TableRow key={level.row_id}>
                          <TableCell className="font-medium">{level.level_no}</TableCell>
                          <TableCell>{level.trigger_price.toFixed(4)}</TableCell>
                          <TableCell>{level.coins_to_give.toFixed(4)}</TableCell>
                          <TableCell>{level.cash_out.toFixed(2)}</TableCell>
                          <TableCell>{level.remaining_lanas.toFixed(4)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
