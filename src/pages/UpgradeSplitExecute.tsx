import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, TrendingUp, Wallet, ChevronDown, ChevronUp, Coins, Loader2, ArrowRight, Send } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { getCurrencySymbol } from "@/lib/utils";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { supabase } from "@/integrations/supabase/client";
import { fetchKind88888, Lana8WonderPlan } from "@/lib/nostrClient";
import { toast } from "sonner";

interface TradingLevel {
  level: number;
  triggerPrice: string;
  splitNumber: number;
  splitPrice: string;
  lanasOnSale: number;
  cashOut: string;
  remaining: number;
}

interface Account {
  number: number;
  name: string;
  type: "linear" | "compound" | "passive";
  color: string;
  description: string;
  levels: TradingLevel[];
  totalCashOut: number;
  portfolioValue?: number;
}

interface SplitSelection {
  splitNumber: number;
  price: number;
}

const getAccountConfigs = (currency: 'EUR' | 'USD' | 'GBP') => {
  const symbol = getCurrencySymbol(currency);
  return [{
    name: "Initial Recovery",
    type: "linear" as const,
    color: "from-orange-400 to-orange-600",
    description: `Recover your initial ${symbol}88 investment`
  }, {
    name: "Growth Acceleration",
    type: "linear" as const,
    color: "from-orange-500 to-orange-700",
    description: "Double your returns with strategic growth"
  }, {
    name: "Breakthrough Point",
    type: "compound" as const,
    color: "from-green-400 to-green-600",
    description: `${symbol}50,000+ compound growth strategy`
  }, {
    name: "Expansion Phase",
    type: "compound" as const,
    color: "from-green-500 to-green-700",
    description: `${symbol}500,000+ wealth multiplication`
  }, {
    name: "Wealth Creation",
    type: "compound" as const,
    color: "from-green-600 to-green-800",
    description: `${symbol}2,670,000+ substantial returns`
  }, {
    name: "Passive Income",
    type: "passive" as const,
    color: "from-purple-400 to-purple-600",
    description: ""
  }, {
    name: "Legacy Portfolio",
    type: "passive" as const,
    color: "from-purple-500 to-purple-700",
    description: ""
  }, {
    name: "Ultimate Freedom",
    type: "passive" as const,
    color: "from-purple-600 to-purple-800",
    description: ""
  }];
};

function formatNumber(value: number): string {
  if (value >= 100) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else if (value >= 10) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } else {
    return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  }
}

function calculateSplit(price: number): { splitNumber: number; splitPrice: number } {
  const splitPrice = Math.pow(2, Math.ceil(Math.log2(price / 0.001))) * 0.001;
  const splitNumber = Math.log2(splitPrice / 0.001) + 1;
  return { splitNumber, splitPrice };
}

function generateLinearLevels(lanas: number, startPrice: number): TradingLevel[] {
  const levels: TradingLevel[] = [];
  const lanasPerLevel = lanas / 10;
  let remaining = lanas;
  for (let i = 1; i <= 10; i++) {
    const triggerPrice = startPrice * i;
    const lanasOnSale = lanasPerLevel;
    const cashOut = triggerPrice * lanasOnSale;
    remaining -= lanasPerLevel;
    const { splitNumber, splitPrice } = calculateSplit(triggerPrice);
    levels.push({
      level: i,
      triggerPrice: triggerPrice.toFixed(5),
      splitNumber,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasOnSale.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat(remaining.toFixed(2))
    });
  }
  return levels;
}

function generateCompoundLevels(lanas: number, startPrice: number): TradingLevel[] {
  const levels: TradingLevel[] = [];
  const sellPercentages = [0, 0.25, 0.20, 0.15, 0.12, 0.09, 0.07, 0.05, 0.04, 0.03];
  let remaining = lanas;
  for (let i = 1; i <= 10; i++) {
    const triggerPrice = startPrice * i;
    const lanasOnSale = lanas * sellPercentages[i - 1];
    const cashOut = triggerPrice * lanasOnSale;
    remaining -= lanasOnSale;
    const { splitNumber, splitPrice } = calculateSplit(triggerPrice);
    levels.push({
      level: i,
      triggerPrice: triggerPrice.toFixed(5),
      splitNumber,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasOnSale.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat(remaining.toFixed(2))
    });
  }
  return levels;
}

function generatePassiveLevelsBySplit(lanas: number, startPrice: number, targetValue: number): TradingLevel[] {
  const levels: TradingLevel[] = [];
  let remaining = lanas;
  const startSplit = calculateSplit(startPrice);
  let currentSplitNumber = startSplit.splitNumber;
  let currentSplitPrice = startSplit.splitPrice;
  let levelCount = 0;
  const maxLevels = 37;

  while (remaining > 0 && levelCount < maxLevels) {
    levelCount++;
    const portfolioValue = remaining * currentSplitPrice;
    const sellPercentage = Math.min(targetValue / portfolioValue, 1);
    const lanasOnSale = remaining * sellPercentage;
    const cashOut = lanasOnSale * currentSplitPrice;
    remaining -= lanasOnSale;

    levels.push({
      level: levelCount,
      triggerPrice: currentSplitPrice.toFixed(5),
      splitNumber: currentSplitNumber,
      splitPrice: currentSplitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasOnSale.toFixed(2)),
      cashOut: parseFloat(cashOut.toFixed(2)).toString(),
      remaining: parseFloat(remaining.toFixed(2))
    });

    if (remaining <= 0 || sellPercentage >= 1) break;
    
    currentSplitNumber++;
    currentSplitPrice = currentSplitPrice * 2;
  }
  return levels;
}

const UpgradeSplitExecute = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [splitSelection, setSplitSelection] = useState<SplitSelection | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());
  const [existingPlan, setExistingPlan] = useState<Lana8WonderPlan | null>(null);
  const [planWalletBalances, setPlanWalletBalances] = useState<Record<string, number>>({});
  const [planBalancesLoading, setPlanBalancesLoading] = useState(false);
  const [donationWalletId, setDonationWalletId] = useState<string | null>(null);
  const { params } = useNostrLanaParams();

  const selectedCurrency: 'EUR' | 'USD' | 'GBP' = 'EUR';
  const currencySymbol = getCurrencySymbol(selectedCurrency);

  // Get current system split from Nostr params
  const currentSystemSplit = parseInt(params?.split || "5");

  useEffect(() => {
    const sessionData = sessionStorage.getItem("lana_session");
    if (!sessionData) {
      navigate("/login");
      return;
    }
    const parsedSession = JSON.parse(sessionData);
    setSession(parsedSession);

    const selectionData = sessionStorage.getItem("upgrade_split_selection");
    if (!selectionData) {
      navigate("/upgrade-split");
      return;
    }
    setSplitSelection(JSON.parse(selectionData));
  }, [navigate]);

  // Fetch donation wallet from app_settings
  useEffect(() => {
    const fetchDonationWallet = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'donation_wallet_id')
          .single();

        if (error) throw error;
        if (data) {
          setDonationWalletId(data.setting_value);
        }
      } catch (error) {
        console.error("Error fetching donation wallet:", error);
      }
    };

    fetchDonationWallet();
  }, []);

  // Fetch existing plan and its wallet balances
  useEffect(() => {
    const loadExistingPlanAndBalances = async () => {
      if (!session?.nostrHexId || !params?.relays || params.relays.length === 0) return;
      
      try {
        const plan = await fetchKind88888(session.nostrHexId, params.relays);
        
        if (plan) {
          setExistingPlan(plan);
          
          if (params?.electrum && params.electrum.length > 0) {
            setPlanBalancesLoading(true);
            
            const walletAddresses = plan.accounts.map(acc => acc.wallet);
            
            const { data, error } = await supabase.functions.invoke('check-wallet-balance', {
              body: { 
                wallet_addresses: walletAddresses,
                electrum_servers: params.electrum
              },
            });

            if (error) throw error;

            if (data?.success && data?.wallets) {
              const balances: Record<string, number> = {};
              data.wallets.forEach((w: { wallet_id: string; balance: number }) => {
                balances[w.wallet_id] = w.balance || 0;
              });
              setPlanWalletBalances(balances);
            }
          }
        }
      } catch (error) {
        console.error("Error loading existing plan:", error);
        toast.error("Failed to load existing plan wallets");
      } finally {
        setPlanBalancesLoading(false);
      }
    };

    if (session && params?.relays) {
      loadExistingPlanAndBalances();
    }
  }, [session, params]);

  // Calculate accounts for the new plan
  useEffect(() => {
    if (splitSelection) {
      calculatePlan(splitSelection.price);
    }
  }, [splitSelection]);

  const calculatePlan = (entryPrice: number) => {
    const totalLanas = 88 / entryPrice;
    const lanasPerAccount = totalLanas / 8;
    const accountConfigs = getAccountConfigs(selectedCurrency);

    const passiveTargets = [
      44000,
      440000,
      4400000
    ];

    const calculatedAccounts: Account[] = accountConfigs.map((config, index) => {
      const accountNumber = index + 1;
      let levels: TradingLevel[];
      let totalCashOut = 0;
      let portfolioValue: number | undefined;

      if (config.type === "linear") {
        levels = generateLinearLevels(lanasPerAccount, entryPrice);
        totalCashOut = levels.reduce((sum, l) => sum + parseFloat(l.cashOut), 0);
      } else if (config.type === "compound") {
        levels = generateCompoundLevels(lanasPerAccount, entryPrice);
        totalCashOut = levels.reduce((sum, l) => sum + parseFloat(l.cashOut), 0);
      } else {
        const passiveIndex = accountNumber - 6;
        const targetValue = passiveTargets[passiveIndex];
        levels = generatePassiveLevelsBySplit(lanasPerAccount, entryPrice, targetValue);
        totalCashOut = levels.reduce((sum, l) => sum + parseFloat(l.cashOut), 0);
        
        if (levels.length > 0) {
          const lastLevel = levels[levels.length - 1];
          portfolioValue = lastLevel.remaining * parseFloat(lastLevel.splitPrice);
        }
      }

      return {
        number: accountNumber,
        name: config.name,
        type: config.type,
        color: config.color,
        description: config.description,
        levels,
        totalCashOut,
        portfolioValue
      };
    });

    setAccounts(calculatedAccounts);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("lana_session");
    sessionStorage.removeItem("upgrade_split_selection");
    navigate("/login");
  };

  const toggleAccount = (accountNumber: number) => {
    setExpandedAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountNumber)) {
        newSet.delete(accountNumber);
      } else {
        newSet.add(accountNumber);
      }
      return newSet;
    });
  };

  // Calculate expired LANA per account
  const expiredLanaPerAccount = useMemo(() => {
    const perAccount: Record<number, number> = {};
    
    accounts.forEach(account => {
      let accountExpiredLana = 0;
      account.levels.forEach(level => {
        if (level.splitNumber <= currentSystemSplit) {
          accountExpiredLana += level.lanasOnSale;
        }
      });
      perAccount[account.number] = accountExpiredLana;
    });
    
    return perAccount;
  }, [accounts, currentSystemSplit]);

  // Get stored fee from confirm page
  const storedExpiredLanaInfo = useMemo(() => {
    const stored = sessionStorage.getItem("upgrade_expired_lana");
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  }, []);

  // Calculate what needs to be added to each wallet
  const walletDistribution = useMemo(() => {
    if (!existingPlan || !splitSelection || accounts.length === 0) return [];

    const totalLanas = 88 / splitSelection.price;
    const lanasPerAccount = totalLanas / 8;

    return existingPlan.accounts.map((planAccount, index) => {
      const accountNumber = index + 1;
      const currentBalance = planWalletBalances[planAccount.wallet] || 0;
      const expiredForThisAccount = expiredLanaPerAccount[accountNumber] || 0;
      // Required balance is the initial allocation minus what's already been "sold" in expired splits
      const requiredBalance = lanasPerAccount - expiredForThisAccount;
      const toAdd = Math.max(0, requiredBalance - currentBalance);

      return {
        accountId: planAccount.account_id,
        wallet: planAccount.wallet,
        currentBalance,
        requiredBalance,
        toAdd
      };
    });
  }, [existingPlan, splitSelection, planWalletBalances, accounts, expiredLanaPerAccount]);

  if (!session || !splitSelection) return null;

  const totalLanas = 88 / splitSelection.price;
  // Use the fee from the confirm page (stored in sessionStorage)
  const fee = storedExpiredLanaInfo?.totalExpiredLana || 0;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/upgrade-split-confirm")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Confirmation
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        <div className="space-y-8">
          {/* BOX 1: Wallet Distribution */}
          <Card className="border-secondary/30 bg-gradient-to-r from-secondary/5 to-secondary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-secondary" />
                Your Current Lana8Wonder Wallets
              </CardTitle>
              <CardDescription>
                Distribution of LANA to each account according to the new annuity plan
              </CardDescription>
            </CardHeader>
            <CardContent>
              {planBalancesLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span>Loading wallet balances...</span>
                </div>
              ) : existingPlan ? (
                <div className="space-y-3">
                  {walletDistribution.map((wallet) => (
                    <div 
                      key={wallet.accountId} 
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-background/50 rounded-lg border border-border/50 gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center text-secondary font-bold">
                          {wallet.accountId}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">Account {wallet.accountId}</p>
                          <p className="font-mono text-xs text-muted-foreground break-all">{wallet.wallet}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:text-right pl-13 sm:pl-0">
                        <div>
                          <p className="text-xs text-muted-foreground">Current</p>
                          <p className="font-medium text-foreground">
                            {formatNumber(wallet.currentBalance)} LANA
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Required</p>
                          <p className="font-medium text-foreground">
                            {formatNumber(wallet.requiredBalance)} LANA
                          </p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-sm font-bold ${wallet.toAdd > 0 ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                          {wallet.toAdd > 0 ? `+${formatNumber(wallet.toAdd)}` : '✓'}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Fee Distribution */}
                  {fee > 0 && donationWalletId && (
                    <div className="mt-6 pt-4 border-t border-amber-500/30">
                      <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
                        <div className="flex items-center gap-2 mb-3">
                          <Send className="h-4 w-4 text-amber-500" />
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            Fee (Expired Splits) Payment
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amount:</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              {formatNumber(fee)} LANA
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                            <span className="text-muted-foreground">To Donation Wallet:</span>
                            <span className="font-mono text-xs text-foreground break-all">
                              {donationWalletId}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No existing plan found
                </div>
              )}
            </CardContent>
          </Card>

          {/* BOX 2: New Annuity Plan */}
          <Card className="p-8 shadow-mystical bg-card border-border">
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <Coins className="w-6 h-6 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">New Annuity Plan - Split {splitSelection.splitNumber}</h2>
              </div>
              <p className="text-muted-foreground">
                Your personalized 8-account trading strategy at Split {splitSelection.splitNumber} price of {splitSelection.price.toFixed(4)} {currencySymbol}/LANA.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Selected Split</p>
                  <p className="text-3xl font-bold text-primary">Split {splitSelection.splitNumber}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Entry Price</p>
                  <p className="text-3xl font-bold text-foreground">{currencySymbol}{splitSelection.price.toFixed(4)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Initial Investment</p>
                  <p className="text-3xl font-bold text-foreground">{currencySymbol}88</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Total Lanas</p>
                  <p className="text-3xl font-bold text-foreground">{formatNumber(totalLanas)}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Trading Accounts */}
          {accounts.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Wallet className="w-6 h-6 text-primary" />
                Your 8 Lana Wonder Accounts at Split {splitSelection.splitNumber}
              </h3>
              
              {accounts.map(account => (
                <Card key={account.number} className="overflow-hidden shadow-card hover:shadow-mystical transition-all duration-300">
                  <div className={`bg-gradient-to-r ${account.color} p-6 cursor-pointer`} onClick={() => toggleAccount(account.number)}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-semibold text-white">
                            Account {account.number}
                          </span>
                          <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-white uppercase">
                            {account.type}
                          </span>
                        </div>
                        <h4 className="text-2xl font-bold text-white mb-1">{account.name}</h4>
                        {account.description && <p className="text-white/90 text-sm">{account.description}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-white/80 mb-1">
                          {account.type === "passive" ? "Portfolio Value" : "Total Cash Out"}
                        </p>
                        <p className="text-2xl font-bold text-white">
                          {currencySymbol}{formatNumber(account.type === "passive" && account.portfolioValue ? account.portfolioValue : account.totalCashOut)}
                        </p>
                        <div className="mt-2">
                          {expandedAccounts.has(account.number) ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {expandedAccounts.has(account.number) && (
                    <div className="p-6 bg-card">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-3 px-4 font-semibold text-foreground">Level</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">Trigger Price</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">Split</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">LANA on Sale</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">Cash Out</th>
                              <th className="text-right py-3 px-4 font-semibold text-foreground">Remaining</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(account.number >= 6 && account.number <= 8 ? account.levels : account.levels.slice(0, 10)).map((level, index, array) => {
                              const isNewSplitGroup = account.number < 6 && index > 0 && level.splitNumber !== array[index - 1].splitNumber;
                              const splitGroupClass = account.number < 6 && isNewSplitGroup ? 'border-t-2 border-primary/40' : '';
                              const isExpiredSplit = level.splitNumber <= currentSystemSplit;
                              
                              return (
                                <tr 
                                  key={level.level} 
                                  className={`hover:bg-muted/50 transition-colors ${splitGroupClass} ${
                                    isExpiredSplit ? 'bg-amber-100/50 dark:bg-amber-900/20' : ''
                                  }`}
                                >
                                  <td className="py-3 px-4 font-medium text-foreground">
                                    {isExpiredSplit && (
                                      <span className="text-amber-600 dark:text-amber-400 mr-1">⚠️</span>
                                    )}
                                    {level.level}
                                  </td>
                                  <td className={`text-right py-3 px-4 ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                    {currencySymbol}{formatNumber(parseFloat(level.triggerPrice))}
                                  </td>
                                  <td className={`text-right py-3 px-4 ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}`}>
                                    Split {level.splitNumber}
                                  </td>
                                  <td className={`text-right py-3 px-4 ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                    {formatNumber(level.lanasOnSale)}
                                  </td>
                                  <td className={`text-right py-3 px-4 font-semibold ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                                    {currencySymbol}{formatNumber(parseFloat(level.cashOut))}
                                  </td>
                                  <td className={`text-right py-3 px-4 ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                    {formatNumber(level.remaining)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Execute Button */}
          <div className="flex justify-center">
            <Button 
              size="lg"
              className="bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-lg px-12 py-6"
            >
              <TrendingUp className="mr-2 h-5 w-5" />
              Execute Upgrade
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeSplitExecute;
