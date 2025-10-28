import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { getCurrencySymbol } from "@/lib/utils";

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

const PreviewLana8Wonder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { params } = useNostrLanaParams();
  const [isPublishing, setIsPublishing] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [walletBalances, setWalletBalances] = useState<{ [address: string]: number }>({});
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [donationWalletId, setDonationWalletId] = useState<string>('');

  const {
    sourceWallet,
    sourceBalance,
    wallets,
    amountPerWallet,
    planCurrency,
    exchangeRate,
    minRequiredLana,
    phiDonation,
    totalTransferred,
    remainingBalance
  } = location.state || {};

  // Calculate start price (8% more than exchange rate)
  const startPrice = exchangeRate ? exchangeRate * 1.08 : 0;

  // Fetch donation wallet ID
  useEffect(() => {
    const fetchDonationWallet = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'donation_wallet_id')
        .single();
      
      if (data) {
        setDonationWalletId(data.setting_value);
      }
    };
    
    fetchDonationWallet();
  }, []);

  // Fetch current balances from Electrum
  useEffect(() => {
    const fetchBalances = async () => {
      if (!wallets || !params?.electrum) return;
      
      setLoadingBalances(true);
      try {
        const electrumServers = params.electrum.map(e => ({
          host: e.host,
          port: parseInt(e.port)
        }));
        
        const addresses = wallets.map((w: any) => w.address);
        
        const { data, error } = await supabase.functions.invoke('check-wallet-balance', {
          body: {
            wallet_addresses: addresses,
            electrum_servers: electrumServers
          }
        });
        
        if (error) throw error;
        
        // Create a map of address -> balance
        const balanceMap: { [address: string]: number } = {};
        if (data?.balances) {
          data.balances.forEach((item: any) => {
            balanceMap[item.address] = item.balance || 0;
          });
        }
        
        setWalletBalances(balanceMap);
      } catch (error) {
        console.error('Error fetching wallet balances:', error);
        toast.error('Failed to fetch wallet balances');
      } finally {
        setLoadingBalances(false);
      }
    };
    
    fetchBalances();
  }, [wallets, params]);

  useEffect(() => {
    if (!sourceWallet || !wallets) {
      toast.error("Missing plan data");
      navigate("/assign-lana8wonder");
    }
  }, [sourceWallet, wallets, navigate]);

  // Generate trading plan accounts
  useEffect(() => {
    if (!exchangeRate || !amountPerWallet) return;

    const adjustedStartingPrice = exchangeRate * 1.08;
    
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
    
    const accountConfigs = getAccountConfigs(planCurrency as 'EUR' | 'USD' | 'GBP');
    
    const account6TargetValue = 1000000;
    const account7TargetValue = 10000000;
    const account8TargetValue = 88000000;
    
    const newAccounts: Account[] = accountConfigs.map((config, index) => {
      let levels: TradingLevel[];
      if (config.type === "linear") {
        levels = generateLinearLevels(amountPerWallet, accountPrices[index]);
      } else if (config.type === "compound") {
        levels = generateCompoundLevels(amountPerWallet, accountPrices[index]);
      } else {
        const targetValue = index === 5 ? account6TargetValue : 
                           index === 6 ? account7TargetValue : 
                           account8TargetValue;
        levels = generatePassiveLevelsBySplit(
          amountPerWallet, 
          accountPrices[index],
          targetValue
        );
      }
      const totalCashOut = levels.reduce((sum, level) => sum + parseFloat(level.cashOut), 0);
      
      return {
        number: index + 1,
        name: config.name,
        type: config.type,
        color: config.color,
        description: config.description,
        levels,
        totalCashOut
      };
    });
    
    setAccounts(newAccounts);
  }, [exchangeRate, amountPerWallet, planCurrency]);

  const toggleAccount = (accountNumber: number) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountNumber)) {
      newExpanded.delete(accountNumber);
    } else {
      newExpanded.add(accountNumber);
    }
    setExpandedAccounts(newExpanded);
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    
    try {
      const sessionData = sessionStorage.getItem("nostrSession");
      if (!sessionData) {
        throw new Error("No session data found");
      }
      
      const session = JSON.parse(sessionData);
      const subjectHex = session.nostrHexId;
      
      const walletAddresses = wallets.map((w: any) => w.address);
      
      const relays = params?.relays || [
        'wss://relay.lanavault.space',
        'wss://relay.lanacoin-eternity.com'
      ];
      
      console.log('📝 Publishing Lana8Wonder plan...', {
        subject_hex: subjectHex,
        wallets: walletAddresses.length,
        currency: planCurrency,
        exchange_rate: exchangeRate
      });
      
      const { data, error } = await supabase.functions.invoke('publish-lana8wonder-plan', {
        body: {
          subject_hex: subjectHex,
          wallets: walletAddresses,
          amount_per_wallet: amountPerWallet,
          currency: planCurrency,
          exchange_rate: exchangeRate,
          start_price: startPrice,
          relays
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        const successCount = data.publish_results.filter((r: any) => r.success).length;
        toast.success(
          `✅ Plan published to ${successCount}/${data.publish_results.length} relays`,
          { duration: 5000 }
        );
        
        console.log('✅ Plan published:', {
          event_id: data.event_id,
          accounts: data.plan.accounts,
          total_levels: data.plan.total_levels,
          publish_results: data.publish_results
        });
        
        setTimeout(() => {
          navigate("/dashboard");
        }, 2000);
      } else {
        throw new Error('Failed to publish plan');
      }
      
    } catch (error) {
      console.error('❌ Error publishing plan:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish plan');
    } finally {
      setIsPublishing(false);
    }
  };

  const currencySymbol = getCurrencySymbol(planCurrency as 'EUR' | 'USD' | 'GBP');

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate("/assign-lana8wonder")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Review Lana 8 Wonder Plan</h2>
          <p className="text-muted-foreground">
            Review the plan details before publishing to Nostr
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Source Wallet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Wallet Address</p>
                <p className="font-mono text-sm break-all">{sourceWallet}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="font-semibold">{sourceBalance?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 }) || "0.00000000"} LANA</p>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm font-semibold mb-3">Transaction Breakdown</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Required Deposit ({currencySymbol}):</span>
                    <span className="font-mono">{minRequiredLana?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PHI Donation (Lana 8 Wonder):</span>
                    <span className="font-mono">{phiDonation?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  {donationWalletId && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Donation Wallet:</span>
                      <span className="font-mono text-muted-foreground">{donationWalletId}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total to 8 Wallets:</span>
                    <span className="font-mono">{(minRequiredLana - phiDonation)?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Per Wallet (8 accounts):</span>
                    <span className="font-mono">{amountPerWallet?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t font-semibold">
                    <span>Total to Transfer:</span>
                    <span className="font-mono">{totalTransferred?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Remaining in Wallet:</span>
                    <span className="font-mono">{remainingBalance?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Annuity Wallet Accounts</CardTitle>
            <CardDescription>
              8 empty wallets that will receive the annuity payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingBalances ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2 text-muted-foreground">Checking wallet balances...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {wallets?.map((wallet: any, index: number) => {
                  const currentBalance = walletBalances[wallet.address] || 0;
                  const afterBalance = amountPerWallet || 0;
                  
                  return (
                    <div key={index} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">Wallet {index + 1}</span>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <Badge variant="default" className="bg-green-600">Valid</Badge>
                        </div>
                      </div>
                      <p className="font-mono text-xs break-all text-muted-foreground mb-3">
                        {wallet.address}
                      </p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs mb-1">Current Balance:</p>
                          <p className="font-mono font-semibold">{currentBalance.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs mb-1">After Transaction:</p>
                          <p className="font-mono font-semibold text-green-600">{afterBalance.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6 border-primary">
          <CardHeader>
            <CardTitle>Plan Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currency:</span>
                <span className="font-semibold">{planCurrency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exchange Rate:</span>
                <span className="font-mono">{exchangeRate?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA/{currencySymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start Price:</span>
                <span className="font-mono">{startPrice.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} {currencySymbol}/LANA</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">Total Accounts:</span>
                <span className="font-semibold">8</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Distribution per Account:</span>
                <span className="font-mono">{amountPerWallet?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trading Plan Details - All 8 Accounts */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Trading Plan Breakdown</CardTitle>
            <CardDescription>
              All 8 accounts with detailed level information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {accounts.map((account) => (
              <div key={account.number} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleAccount(account.number)}
                  className={`w-full p-4 text-left bg-gradient-to-r ${account.color} hover:opacity-90 transition-opacity`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white text-lg">
                        Account {account.number}: {account.name}
                      </h3>
                      {account.description && (
                        <p className="text-white/90 text-sm mt-1">{account.description}</p>
                      )}
                      <p className="text-white/80 text-xs mt-2">
                        {account.levels.length} levels • Total Cash Out: {currencySymbol}{account.totalCashOut.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    {expandedAccounts.has(account.number) ? (
                      <ChevronUp className="h-5 w-5 text-white" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-white" />
                    )}
                  </div>
                </button>
                
                {expandedAccounts.has(account.number) && (
                  <div className="p-4 bg-card">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Level</TableHead>
                            <TableHead>Trigger Price</TableHead>
                            <TableHead>Split #</TableHead>
                            <TableHead>Split Price</TableHead>
                            <TableHead>LANAs on Sale</TableHead>
                            <TableHead>Cash Out ({currencySymbol})</TableHead>
                            <TableHead>Remaining</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {account.levels.map((level) => (
                            <TableRow key={level.level}>
                              <TableCell className="font-medium">{level.level}</TableCell>
                              <TableCell className="font-mono text-xs">{level.triggerPrice}</TableCell>
                              <TableCell>{level.splitNumber}</TableCell>
                              <TableCell className="font-mono text-xs">{level.splitPrice}</TableCell>
                              <TableCell>{level.lanasOnSale.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell>{parseFloat(level.cashOut).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell>{level.remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate("/assign-lana8wonder")}>
            Cancel
          </Button>
          <Button
            disabled={isPublishing}
            onClick={handlePublish}
            className="bg-primary hover:bg-primary/90"
          >
            {isPublishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing to Nostr...
              </>
            ) : (
              "Publish Plan"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PreviewLana8Wonder;
