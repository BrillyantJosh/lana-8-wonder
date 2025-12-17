import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogOut, Loader2, Send, CheckCircle2, TrendingUp } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { Lana8WonderPlan, fetchKind88888 } from "@/lib/nostrClient";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSelector } from "@/components/LanguageSelector";

// Helper function to format numbers with thousands separator
const formatNumber = (value: number, decimals: number = 4): string => {
  return new Intl.NumberFormat('sl-SI', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [plan, setPlan] = useState<Lana8WonderPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("");
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasUpgradeAllowance, setHasUpgradeAllowance] = useState(false);
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
      const wallets = planData.accounts.map(acc => acc.wallet);
      
      // Guard: Don't call edge function with empty array
      if (!wallets || wallets.length === 0) {
        console.log('No wallets to check balances for');
        return;
      }
      
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
      loadPlanData();
    }
  }, [navigate, params]);

  // Check if user is admin and has upgrade allowance
  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        const sessionData = sessionStorage.getItem('lana_session');
        
        if (!sessionData) {
          setIsAdmin(false);
          setHasUpgradeAllowance(false);
          return;
        }

        const session = JSON.parse(sessionData);
        const userNostrHexId = session.nostrHexId as string | undefined;

        if (!userNostrHexId) {
          setIsAdmin(false);
          setHasUpgradeAllowance(false);
          return;
        }

        // Check admin status
        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('id')
          .eq('nostr_hex_id', userNostrHexId)
          .maybeSingle();

        setIsAdmin(!!adminUser);

        // Check upgrade allowance
        const { data: profile } = await supabase
          .from('profiles')
          .select('allowed_upgrade')
          .eq('nostr_hex_id', userNostrHexId)
          .maybeSingle();

        setHasUpgradeAllowance(profile?.allowed_upgrade === true);
      } catch (error) {
        console.error('Error checking user status:', error);
        setIsAdmin(false);
        setHasUpgradeAllowance(false);
      }
    };

    checkUserStatus();
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("lana_session");
    navigate("/login");
  };

  const handleSendLana = (accountId: number, wallet: string, amount: number) => {
    // Navigate to send-lana page with params
    const params = new URLSearchParams({
      accountId: accountId.toString(),
      wallet: wallet,
      amount: amount.toString()
    });
    navigate(`/send-lana?${params}`);
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
    <div className="min-h-screen bg-background p-2 sm:p-4">
      <div className="max-w-7xl mx-auto">
        {greeting && (
          <div className="mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{greeting}</h1>
          </div>
        )}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">Lana8Wonder Dashboard</h2>
            <p className="text-sm text-muted-foreground">Your Annuity Plan</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto items-center flex-wrap">
            <LanguageSelector />
            {hasUpgradeAllowance && (
              <Button 
                onClick={() => navigate('/upgrade-split')}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800"
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                Upgrade Split
              </Button>
            )}
            {isAdmin && (
              <Button 
                variant="secondary" 
                onClick={() => navigate('/admin-buy-lana')}
                className="flex-1 sm:flex-initial"
              >
                Admin Panel
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={handleLogout} 
              className="flex-1 sm:flex-initial"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        <div className="grid gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Wallet ID</p>
                <p className="font-mono text-xs sm:text-sm break-all">{session.walletId}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Nostr HEX ID</p>
                <p className="font-mono text-xs sm:text-sm break-all">{session.nostrHexId}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Nostr npub</p>
                <p className="font-mono text-xs sm:text-sm break-all">{session.nostrNpubId}</p>
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Accounts</p>
                  <p className="text-xl sm:text-2xl font-bold">{plan.accounts.length}</p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Levels</p>
                  <p className="text-xl sm:text-2xl font-bold">
                    {plan.accounts.reduce((sum, acc) => sum + acc.levels.length, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Currency</p>
                  <p className="text-xl sm:text-2xl font-bold">{plan.currency}</p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Asset</p>
                  <p className="text-xl sm:text-2xl font-bold">{plan.coin}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {(() => {
            const currentExchangeRate = params?.exchangeRates?.[plan.currency as keyof typeof params.exchangeRates] || 0;
            
            // Calculate withdrawal amounts for each account
            const withdrawalInfo = plan.accounts.map(account => {
              const currentBalance = walletBalances[account.wallet] || 0;
              
              // Find the last triggered level (highest trigger price that is <= current exchange rate)
              const triggeredLevels = account.levels.filter(
                level => currentExchangeRate > 0 && level.trigger_price <= currentExchangeRate
              ).sort((a, b) => b.trigger_price - a.trigger_price);
              
              const lastTriggeredLevel = triggeredLevels[0];
              
              if (!lastTriggeredLevel || currentBalance === 0) {
                return null;
              }
              
              const requiredBalance = lastTriggeredLevel.remaining_lanas;
              const withdrawalAmount = currentBalance - requiredBalance;
              
              // Apply 2% tolerance - only show withdrawal if amount exceeds 2% of required balance
              const tolerance = requiredBalance * 0.02;
              if (withdrawalAmount > tolerance) {
                return {
                  accountId: account.account_id,
                  currentBalance,
                  requiredBalance,
                  withdrawalAmount,
                  triggeredCount: triggeredLevels.length
                };
              }
              
              return null;
            }).filter(Boolean);

            if (withdrawalInfo.length === 0) {
              return null;
            }

            const totalWithdrawal = withdrawalInfo.reduce((sum, info) => sum + (info?.withdrawalAmount || 0), 0);

            return (
              <Card className="border-green-500/50 bg-green-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-green-600">💰</span>
                    Withdrawal Required
                  </CardTitle>
                  <CardDescription>
                    Based on current {plan.currency} exchange rate: {formatNumber(currentExchangeRate, 4)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {withdrawalInfo.map((info) => {
                      if (!info) return null;
                      const account = plan.accounts.find(acc => acc.account_id === info.accountId);
                      
                      return (
                        <div key={info.accountId} className="border rounded-lg p-3 sm:p-4 bg-background">
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-2">
                            <div className="flex-1 w-full">
                              <p className="font-semibold text-base sm:text-lg">Account {info.accountId}</p>
                              <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                                {info.triggeredCount} level{info.triggeredCount !== 1 ? 's' : ''} triggered
                              </p>
                              {account && (
                                <p className="text-xs font-mono text-muted-foreground break-all">
                                  From: {account.wallet}
                                </p>
                              )}
                            </div>
                            <div className="text-left sm:text-right w-full sm:w-auto">
                              <p className="text-xl sm:text-2xl font-bold text-green-600">
                                {formatNumber(info.withdrawalAmount, 4)} LANA
                              </p>
                              <p className="text-xs text-muted-foreground mb-2">to withdraw</p>
                              <Button 
                                size="sm"
                                onClick={() => handleSendLana(info.accountId, account?.wallet || "", info.withdrawalAmount)}
                                className="w-full sm:w-auto"
                              >
                                <Send className="mr-2 h-4 w-4" />
                                Send LANA
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm mt-3 pt-3 border-t">
                            <div>
                              <p className="text-muted-foreground">Current Balance:</p>
                              <p className="font-mono text-xs sm:text-sm">{formatNumber(info.currentBalance, 4)} LANA</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Required Balance:</p>
                              <p className="font-mono text-xs sm:text-sm">{formatNumber(info.requiredBalance, 4)} LANA</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {withdrawalInfo.length > 1 && (
                      <div className="border-t pt-4 mt-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <p className="font-semibold text-base sm:text-lg">Total Withdrawal Required:</p>
                          <p className="text-2xl sm:text-3xl font-bold text-green-600">
                            {formatNumber(totalWithdrawal, 4)} LANA
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        <div className="space-y-6">
          {plan.accounts.map((account) => {
            // Get current exchange rate for the plan currency
            const currentExchangeRate = params?.exchangeRates?.[plan.currency as keyof typeof params.exchangeRates] || 0;
            
            return (
              <Card key={account.account_id}>
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl">Account {account.account_id}</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    <div className="space-y-1">
                      <div>Wallet: <span className="font-mono break-all">{account.wallet}</span></div>
                      <div>{account.levels.length} levels
                        {balancesLoading ? (
                          <span className="ml-2 text-muted-foreground">
                            <Loader2 className="inline h-3 w-3 animate-spin" /> Loading...
                          </span>
                        ) : walletBalances[account.wallet] !== undefined ? (
                          <span className="ml-2 font-semibold text-primary">
                            • Balance: {formatNumber(walletBalances[account.wallet], 8)} LANA
                          </span>
                        ) : null}
                      </div>
                      {currentExchangeRate > 0 && (
                        <div className="text-muted-foreground">
                          Current {plan.currency} rate: {formatNumber(currentExchangeRate, 4)}
                        </div>
                      )}
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <Table className="min-w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm whitespace-nowrap">Level</TableHead>
                          <TableHead className="text-xs sm:text-sm whitespace-nowrap">Trigger ({plan.currency})</TableHead>
                          <TableHead className="text-xs sm:text-sm whitespace-nowrap">Coins</TableHead>
                          <TableHead className="text-xs sm:text-sm whitespace-nowrap">Cash Out</TableHead>
                          <TableHead className="text-xs sm:text-sm whitespace-nowrap">Remaining</TableHead>
                          <TableHead className="text-xs sm:text-sm whitespace-nowrap">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {account.levels.map((level) => {
                          // Check if trigger price is reached
                          const isTriggered = currentExchangeRate > 0 && level.trigger_price <= currentExchangeRate;
                          
                          // Check if level has been paid out with 2% tolerance
                          // If balance is at or below remaining_lanas (with tolerance), it means withdrawal happened
                          const currentBalance = walletBalances[account.wallet] || 0;
                          const tolerance = level.remaining_lanas * 0.02;
                          const isPaidOut = isTriggered && currentBalance <= (level.remaining_lanas + tolerance) && !balancesLoading;
                          
                          return (
                            <TableRow 
                              key={level.row_id}
                              className={isTriggered ? "bg-green-500/10 hover:bg-green-500/20" : ""}
                            >
                              <TableCell className="font-medium text-xs sm:text-sm">{level.level_no}</TableCell>
                              <TableCell className={`text-xs sm:text-sm ${isTriggered ? "font-semibold text-green-600" : ""}`}>
                                {formatNumber(level.trigger_price, 4)}
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm">{formatNumber(level.coins_to_give, 4)}</TableCell>
                              <TableCell className="text-xs sm:text-sm">{formatNumber(level.cash_out, 2)}</TableCell>
                              <TableCell className="text-xs sm:text-sm">{formatNumber(level.remaining_lanas, 4)}</TableCell>
                              <TableCell>
                                {isPaidOut && (
                                  <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white text-xs whitespace-nowrap">
                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                    <span className="hidden sm:inline">Paid Out</span>
                                    <span className="sm:hidden">✓</span>
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
