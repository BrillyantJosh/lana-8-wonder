import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, TrendingUp, Wallet, ChevronDown, ChevronUp, Coins, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { getCurrencySymbol } from "@/lib/utils";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { api as supabase } from "@/integrations/api/client";
import { fetchKind88888, Lana8WonderPlan } from "@/lib/nostrClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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

interface ProjectionData {
  splitNumber: number;
  splitPrice: number;
  portfolioValue: number;
  remainingLana: number;
  totalCashOut: number;
}

const getAccountConfigs = (currency: 'EUR' | 'USD' | 'GBP', t: (key: string, options?: Record<string, string>) => string) => {
  const symbol = getCurrencySymbol(currency);
  return [{
    name: t('walletAccounts.account1Name'),
    type: "linear" as const,
    color: "from-orange-400 to-orange-600",
    description: t('walletAccounts.account1Description', { currency: symbol })
  }, {
    name: t('walletAccounts.account2Name'),
    type: "linear" as const,
    color: "from-orange-500 to-orange-700",
    description: t('walletAccounts.account2Description')
  }, {
    name: t('walletAccounts.account3Name'),
    type: "compound" as const,
    color: "from-green-400 to-green-600",
    description: t('walletAccounts.account3Description', { currency: symbol })
  }, {
    name: t('walletAccounts.account4Name'),
    type: "compound" as const,
    color: "from-green-500 to-green-700",
    description: t('walletAccounts.account4Description', { currency: symbol })
  }, {
    name: t('walletAccounts.account5Name'),
    type: "compound" as const,
    color: "from-green-600 to-green-800",
    description: t('walletAccounts.account5Description', { currency: symbol })
  }, {
    name: t('walletAccounts.account6Name'),
    type: "passive" as const,
    color: "from-purple-400 to-purple-600",
    description: ""
  }, {
    name: t('walletAccounts.account7Name'),
    type: "passive" as const,
    color: "from-purple-500 to-purple-700",
    description: ""
  }, {
    name: t('walletAccounts.account8Name'),
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
  let hasReachedTarget = false;
  let previousRemaining = lanas;
  
  const startingSplit = calculateSplit(startPrice);
  
  for (let splitNum = startingSplit.splitNumber; splitNum <= 37; splitNum++) {
    const splitPrice = 0.001 * Math.pow(2, splitNum - 1);
    const actualPortfolioValue = remaining * splitPrice;
    
    let lanasOnSale: number;
    let cashOut: number;
    let newRemaining: number;
    
    if (!hasReachedTarget && actualPortfolioValue >= targetValue) {
      hasReachedTarget = true;
    }
    
    if (hasReachedTarget) {
      newRemaining = targetValue / splitPrice;
      lanasOnSale = previousRemaining - newRemaining;
      cashOut = lanasOnSale * splitPrice;
    } else {
      lanasOnSale = remaining * 0.01;
      cashOut = lanasOnSale * splitPrice;
      newRemaining = remaining - lanasOnSale;
    }
    
    levels.push({
      level: splitNum,
      triggerPrice: splitPrice.toFixed(5),
      splitNumber: splitNum,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasOnSale.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat(newRemaining.toFixed(2))
    });
    
    previousRemaining = newRemaining;
    remaining = newRemaining;
  }
  
  return levels;
}

const UpgradeSplitConfirm = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [splitSelection, setSplitSelection] = useState<{ splitNumber: number; price: number } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());
  const [portfolioProjection, setPortfolioProjection] = useState<ProjectionData[]>([]);
  const [passiveAccountSplits, setPassiveAccountSplits] = useState<Set<number>>(new Set());
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [existingPlan, setExistingPlan] = useState<Lana8WonderPlan | null>(null);
  const [planWalletBalances, setPlanWalletBalances] = useState<Record<string, number>>({});
  const [planBalancesLoading, setPlanBalancesLoading] = useState(false);
  const { params } = useNostrLanaParams();

  const selectedCurrency: 'EUR' | 'USD' | 'GBP' = 'EUR';
  const currencySymbol = getCurrencySymbol(selectedCurrency);

  // Update account names/descriptions when language changes
  useEffect(() => {
    if (accounts.length > 0) {
      const accountConfigs = getAccountConfigs(selectedCurrency, t);
      setAccounts(prevAccounts => 
        prevAccounts.map((account, index) => ({
          ...account,
          name: accountConfigs[index].name,
          description: accountConfigs[index].description
        }))
      );
    }
  }, [i18n.language, selectedCurrency, t]);

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

  // Load wallet balance
  useEffect(() => {
    const loadWalletBalance = async () => {
      if (!session?.walletId || !params?.electrum || params.electrum.length === 0) return;
      
      setBalanceLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('check-wallet-balance', {
          body: { 
            wallet_addresses: [session.walletId],
            electrum_servers: params.electrum
          },
        });

        if (error) throw error;

        if (data?.success && data?.wallets?.length > 0) {
          setWalletBalance(data.wallets[0].balance || 0);
        }
      } catch (error) {
        console.error("Error loading wallet balance:", error);
      } finally {
        setBalanceLoading(false);
      }
    };

    if (session && params?.electrum) {
      loadWalletBalance();
    }
  }, [session, params]);

  // Fetch existing plan and its wallet balances
  useEffect(() => {
    const loadExistingPlanAndBalances = async () => {
      if (!session?.nostrHexId || !params?.relays || params.relays.length === 0) return;
      
      try {
        // Fetch the existing plan from Nostr
        const plan = await fetchKind88888(session.nostrHexId, params.relays);
        
        if (plan) {
          setExistingPlan(plan);
          
          // Now fetch balances for all wallets in the plan
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

  useEffect(() => {
    if (splitSelection) {
      calculatePlan(splitSelection.price);
    }
  }, [splitSelection]);

  const buildRemainingLanaMap = (accounts: Account[], totalInitialLana: number): Map<number, number> => {
    const lanaMap = new Map<number, number>();
    const salesPerSplit = new Map<number, number>();
    
    accounts.forEach(account => {
      account.levels.forEach(level => {
        const currentSales = salesPerSplit.get(level.splitNumber) || 0;
        salesPerSplit.set(level.splitNumber, currentSales + level.lanasOnSale);
      });
    });
    
    const splitsWithSales = Array.from(salesPerSplit.keys()).sort((a, b) => a - b);
    let remainingLana = totalInitialLana;
    let salesIndex = 0;
    
    for (let split = 1; split <= 37; split++) {
      if (salesIndex < splitsWithSales.length && splitsWithSales[salesIndex] === split) {
        const totalSalesAtThisSplit = salesPerSplit.get(split) || 0;
        remainingLana -= totalSalesAtThisSplit;
        salesIndex++;
      }
      lanaMap.set(split, Math.max(0, remainingLana));
    }
    
    return lanaMap;
  };

  const getPassiveAccountSplits = (accounts: Account[]): Set<number> => {
    const passiveSplits = new Set<number>();
    accounts.forEach(account => {
      if (account.number >= 6 && account.number <= 8) {
        account.levels.forEach(level => {
          passiveSplits.add(level.splitNumber);
        });
      }
    });
    return passiveSplits;
  };

  const calculatePortfolioProjection = (startingPrice: number, remainingLanaMap: Map<number, number>, accounts: Account[]): ProjectionData[] => {
    const projections: ProjectionData[] = [];
    const adjustedStartingPrice = startingPrice * 1.08;
    let startingSplit = calculateSplit(adjustedStartingPrice);
    const TARGET_VALUE = 100000000;
    let hasReachedTarget = false;
    
    const cashOutPerSplit = new Map<number, number>();
    accounts.forEach(account => {
      account.levels.forEach(level => {
        const currentCashOut = cashOutPerSplit.get(level.splitNumber) || 0;
        cashOutPerSplit.set(level.splitNumber, currentCashOut + parseFloat(level.cashOut));
      });
    });
    
    for (let splitNum = startingSplit.splitNumber; splitNum <= 37; splitNum++) {
      const splitPrice = 0.001 * Math.pow(2, splitNum - 1);
      const remainingLana = remainingLanaMap.get(splitNum) || 0;
      const actualPortfolioValue = remainingLana * splitPrice;
      
      if (!hasReachedTarget && actualPortfolioValue >= TARGET_VALUE) {
        hasReachedTarget = true;
      }
      
      let portfolioValue: number;
      let adjustedRemainingLana: number;
      
      if (hasReachedTarget) {
        portfolioValue = TARGET_VALUE;
        adjustedRemainingLana = TARGET_VALUE / splitPrice;
      } else {
        portfolioValue = actualPortfolioValue;
        adjustedRemainingLana = remainingLana;
      }
      
      projections.push({
        splitNumber: splitNum,
        splitPrice: splitPrice,
        portfolioValue: portfolioValue,
        remainingLana: adjustedRemainingLana,
        totalCashOut: cashOutPerSplit.get(splitNum) || 0
      });
    }
    
    return projections;
  };

  const calculatePlan = (price: number) => {
    const initialInvestment = 88;
    const totalLanas = initialInvestment / price;
    const lanasPerAccount = totalLanas / 8;

    const adjustedStartingPrice = price * 1.08;

    const accountPrices = [
      adjustedStartingPrice,
      adjustedStartingPrice * 10,
      adjustedStartingPrice * 100,
      adjustedStartingPrice * 1000,
      adjustedStartingPrice * 10000,
      adjustedStartingPrice * 100000,
      adjustedStartingPrice * 1000000,
      adjustedStartingPrice * 10000000
    ];
    
    const accountConfigs = getAccountConfigs(selectedCurrency, t);
    
    const account6TargetValue = 1000000;
    const account7TargetValue = 10000000;
    const account8TargetValue = 88000000;
    
    const newAccounts: Account[] = accountConfigs.map((config, index) => {
      let levels: TradingLevel[];
      if (config.type === "linear") {
        levels = generateLinearLevels(lanasPerAccount, accountPrices[index]);
      } else if (config.type === "compound") {
        levels = generateCompoundLevels(lanasPerAccount, accountPrices[index]);
      } else {
        const targetValue = index === 5 ? account6TargetValue : 
                           index === 6 ? account7TargetValue : 
                           account8TargetValue;
        levels = generatePassiveLevelsBySplit(
          lanasPerAccount, 
          accountPrices[index],
          targetValue
        );
      }
      const totalCashOut = levels.reduce((sum, level) => sum + parseFloat(level.cashOut), 0);

      let portfolioValue: number | undefined;
      if (config.type === "passive") {
        portfolioValue = index === 5 ? account6TargetValue : 
                        index === 6 ? account7TargetValue : 
                        account8TargetValue;
      }
      return {
        number: index + 1,
        name: config.name,
        type: config.type,
        color: config.color,
        description: config.description,
        levels,
        totalCashOut,
        portfolioValue
      };
    });
    setAccounts(newAccounts);
    
    const lanaMap = buildRemainingLanaMap(newAccounts, totalLanas);
    const passiveSplits = getPassiveAccountSplits(newAccounts);
    setPassiveAccountSplits(passiveSplits);
    
    const projection = calculatePortfolioProjection(price, lanaMap, newAccounts);
    setPortfolioProjection(projection);
  };

  const toggleAccount = (accountNumber: number) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountNumber)) {
      newExpanded.delete(accountNumber);
    } else {
      newExpanded.add(accountNumber);
    }
    setExpandedAccounts(newExpanded);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("lana_session");
    navigate("/login");
  };

  const handleConfirmUpgrade = () => {
    // Calculate per-account expired LANA
    const expiredPerAccount: Record<number, number> = {};
    accounts.forEach(account => {
      let accountExpiredLana = 0;
      account.levels.forEach(level => {
        if (level.splitNumber <= currentSystemSplit) {
          accountExpiredLana += level.lanasOnSale;
        }
      });
      expiredPerAccount[account.number] = accountExpiredLana;
    });

    // Store the fee, expired splits info and per-account breakdown for the execute page
    sessionStorage.setItem("upgrade_expired_lana", JSON.stringify({
      totalExpiredLana: expiredLanaInfo.expiredLana,
      expiredSplits: expiredLanaInfo.expiredSplits,
      expiredPerAccount: expiredPerAccount
    }));
    
    // Store the complete accounts array so execute page uses identical data
    sessionStorage.setItem("upgrade_accounts", JSON.stringify(accounts));
    
    navigate("/upgrade-split-execute");
  };

  // Get current system split from Nostr params
  const currentSystemSplit = parseInt(params?.split || "5");

  // Calculate expired LANA from splits that are PAST (from 1 to currentSystemSplit INCLUSIVE)
  const expiredLanaInfo = useMemo(() => {
    let expiredLana = 0;
    let expiredSplits: number[] = [];
    
    accounts.forEach(account => {
      account.levels.forEach(level => {
        // Expired splits are those UP TO AND INCLUDING the current system split (already executed)
        if (level.splitNumber <= currentSystemSplit) {
          expiredLana += level.lanasOnSale;
          if (!expiredSplits.includes(level.splitNumber)) {
            expiredSplits.push(level.splitNumber);
          }
        }
      });
    });
    
    expiredSplits.sort((a, b) => a - b);
    return { expiredLana, expiredSplits };
  }, [accounts, currentSystemSplit]);

  if (!session || !splitSelection) return null;

  const totalLanas = 88 / splitSelection.price;
  const totalCurrentLana = (walletBalance || 0) + 
    Object.values(planWalletBalances).reduce((sum, b) => sum + b, 0);
  const requiredLanaForNewSplit = totalLanas;
  const fee = expiredLanaInfo.expiredLana;
  const reserve = 1;
  const youNeedToPay = requiredLanaForNewSplit - totalCurrentLana + reserve;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/upgrade-split")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Split Selection
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        <div className="space-y-8">
          {/* Main Wallet Balance Card */}
          <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Your Main Wallet
              </CardTitle>
              <CardDescription>
                This is your primary wallet derived from your login key
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Wallet Address</p>
                  <p className="font-mono text-sm break-all bg-muted/50 p-3 rounded-lg">{session.walletId}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
                    {balanceLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading balance...</span>
                      </div>
                    ) : walletBalance !== null ? (
                      <p className="text-3xl font-bold text-primary">
                        {formatNumber(walletBalance)} <span className="text-lg text-muted-foreground">LANA</span>
                      </p>
                    ) : (
                      <p className="text-muted-foreground">Unable to load balance</p>
                    )}
                  </div>
                  {walletBalance !== null && splitSelection && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground mb-1">Value at Split {splitSelection.splitNumber}</p>
                      <p className="text-2xl font-bold text-foreground">
                        {currencySymbol}{formatNumber(walletBalance * splitSelection.price)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Existing Plan Wallets Card */}
          {existingPlan && (
            <Card className="border-secondary/30 bg-gradient-to-r from-secondary/5 to-secondary/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-secondary" />
                  Your Current Lana8Wonder Wallets
                </CardTitle>
                <CardDescription>
                  All 8 account wallets from your existing plan ({existingPlan.currency})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {planBalancesLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    <span>Loading wallet balances...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {existingPlan.accounts.map((account) => {
                      const balance = planWalletBalances[account.wallet];
                      const hasBalance = balance !== undefined;
                      
                      return (
                        <div 
                          key={account.account_id} 
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-background/50 rounded-lg border border-border/50 gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center text-secondary font-bold">
                              {account.account_id}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">Account {account.account_id}</p>
                              <p className="font-mono text-xs text-muted-foreground break-all">{account.wallet}</p>
                            </div>
                          </div>
                          <div className="text-right sm:text-right pl-13 sm:pl-0">
                            {hasBalance ? (
                              <p className="font-bold text-lg text-foreground">
                                {formatNumber(balance)} <span className="text-sm text-muted-foreground">LANA</span>
                              </p>
                            ) : (
                              <p className="text-muted-foreground text-sm">No balance data</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Total Summary */}
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-muted-foreground">Total in Plan Wallets:</span>
                        <p className="text-2xl font-bold text-secondary">
                          {formatNumber(Object.values(planWalletBalances).reduce((sum, b) => sum + b, 0))} 
                          <span className="text-sm text-muted-foreground ml-1">LANA</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Upgrade Summary Box */}
          <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-orange-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-amber-500" />
                Upgrade Summary
              </CardTitle>
              <CardDescription>
                Breakdown of your upgrade from Split {currentSystemSplit} to Split {splitSelection.splitNumber}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current State */}
              <div className="bg-background/50 rounded-lg p-4 border border-border/50">
                <h4 className="font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Current State (What you have now)
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Main Wallet:</span>
                    <span className="font-medium text-foreground">
                      {walletBalance !== null ? formatNumber(walletBalance) : "..."} LANA
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plan Wallets (8 accounts):</span>
                    <span className="font-medium text-foreground">
                      {formatNumber(Object.values(planWalletBalances).reduce((sum, b) => sum + b, 0))} LANA
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border/50">
                    <span className="font-semibold text-foreground">TOTAL:</span>
                    <span className="font-bold text-lg text-primary">
                      {formatNumber(totalCurrentLana)} LANA
                    </span>
                  </div>
                </div>
              </div>

              {/* Required LANA */}
              <div className="bg-background/50 rounded-lg p-4 border border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Required LANA:</span>
                  <span className="font-bold text-lg text-foreground">
                    {formatNumber(requiredLanaForNewSplit)} LANA
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  (88 {currencySymbol} / {splitSelection.price.toFixed(4)} = {formatNumber(requiredLanaForNewSplit)} LANA)
                </div>
              </div>

              {/* Fee from Expired Splits */}
              {expiredLanaInfo.expiredSplits.length > 0 && (
                <div className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/30">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Fee (Expired Splits):</span>
                    <span className="font-bold text-lg text-amber-600 dark:text-amber-400">
                      {formatNumber(fee)} LANA
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    (Splits {expiredLanaInfo.expiredSplits.join(", ")} already past - system at Split {currentSystemSplit})
                  </div>
                </div>
              )}

              {/* You Need to PAY */}
              <div className={`rounded-lg p-4 border ${youNeedToPay > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-foreground">You need to PAY:</span>
                  {youNeedToPay > 0 ? (
                    <span className="font-bold text-xl text-red-600 dark:text-red-400">
                      {formatNumber(youNeedToPay)} LANA
                    </span>
                  ) : (
                    <span className="font-bold text-xl text-green-600 dark:text-green-400">
                      Sufficient funds on account
                    </span>
                  )}
                </div>
                {youNeedToPay > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    ({formatNumber(requiredLanaForNewSplit)} - {formatNumber(totalCurrentLana)} + {reserve} LANA reserve)
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Header Card */}
          <Card className="p-8 shadow-mystical bg-card border-border">
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <Coins className="w-6 h-6 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">Upgrade to Split {splitSelection.splitNumber}</h2>
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
                                  <td className={`text-right py-3 px-4 font-medium ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
                                    {level.splitNumber}
                                    {isExpiredSplit && <span className="ml-1 text-xs">(past)</span>}
                                  </td>
                                  <td className={`text-right py-3 px-4 ${isExpiredSplit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                    {formatNumber(level.lanasOnSale)}
                                  </td>
                                  <td className={`text-right py-3 px-4 font-semibold ${
                                    parseFloat(level.cashOut) === 0 
                                      ? 'text-muted-foreground italic' 
                                      : isExpiredSplit 
                                        ? 'text-amber-600 dark:text-amber-400' 
                                        : 'text-secondary'
                                  }`}>
                                    {parseFloat(level.cashOut) === 0 ? '-' : `${currencySymbol}${formatNumber(parseFloat(level.cashOut))}`}
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
                      {account.number < 6 && account.levels.length > 10 && (
                        <p className="text-center text-sm text-muted-foreground mt-4">
                          Showing first 10 of {account.levels.length} levels
                        </p>
                      )}
                      {account.number >= 6 && account.number <= 8 && (
                        <p className="text-center text-sm text-muted-foreground mt-4">
                          Showing all {account.levels.length} levels to Split 37
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Portfolio Growth Projection */}
          {portfolioProjection.length > 0 && (
            <Card className="overflow-hidden shadow-card border-border">
              <div className="bg-gradient-to-r from-indigo-500 to-indigo-700 p-6">
                <h3 className="text-2xl font-bold text-white mb-2">Portfolio Growth Projection</h3>
                <p className="text-white/90 text-sm">
                  Projected value of your remaining LANA from Account 8 at each Split milestone
                </p>
              </div>
              
              <div className="p-6 bg-card space-y-6">
                {/* Summary Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-muted/30 border border-border rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Starting Split</p>
                    <p className="text-2xl font-bold text-foreground">
                      Split {portfolioProjection[0].splitNumber}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {currencySymbol}{formatNumber(portfolioProjection[0].portfolioValue)}
                    </p>
                  </div>
                  
                  <div className="bg-muted/30 border border-border rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Remaining LANA</p>
                    <p className="text-2xl font-bold text-foreground">
                      {passiveAccountSplits.has(portfolioProjection[0].splitNumber) && '≈ '}
                      {formatNumber(portfolioProjection[0].remainingLana)}
                    </p>
                  </div>
                  
                  <div className="bg-muted/30 border border-border rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Target Milestone</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {currencySymbol}100,000,000
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Split {portfolioProjection[portfolioProjection.length - 1].splitNumber}
                    </p>
                  </div>
                </div>

                {/* Milestone Highlight */}
                {(() => {
                  const milestone100M = portfolioProjection.find(p => p.portfolioValue >= 100000000);
                  if (milestone100M) {
                    return (
                      <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-2 border-green-500/30 rounded-lg p-6 text-center">
                        <p className="text-sm text-muted-foreground mb-2">🎯 Milestone Achievement</p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                          {currencySymbol}100,000,000
                        </p>
                        <p className="text-lg text-foreground">
                          Reached at <span className="font-bold text-primary">Split {milestone100M.splitNumber}</span>
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          LANA Price: {currencySymbol}{formatNumber(milestone100M.splitPrice)}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-muted/20 border border-border rounded-lg p-6 text-center">
                      <p className="text-sm text-muted-foreground mb-2">📊 Maximum Projection</p>
                      <p className="text-lg text-foreground">
                        {currencySymbol}100M milestone not reached by Split 37
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Highest projected value: {currencySymbol}{formatNumber(portfolioProjection[portfolioProjection.length - 1].portfolioValue)}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </Card>
          )}

          {/* Confirm Button */}
          <div className="flex justify-center">
            <Button 
              onClick={handleConfirmUpgrade} 
              size="lg"
              disabled={youNeedToPay > 0}
              className="bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-lg px-12 py-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp className="mr-2 h-5 w-5" />
              Confirm Upgrade to Split {splitSelection.splitNumber}
            </Button>
          </div>
          {youNeedToPay > 0 && (
            <p className="text-center text-sm text-muted-foreground mt-2">
              You need to have sufficient funds to proceed with the upgrade
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpgradeSplitConfirm;
