import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, TrendingUp, Wallet, Coins, Loader2 } from "lucide-react";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
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
}
const accountConfigs = [{
  name: "Initial Recovery",
  type: "linear" as const,
  color: "from-orange-400 to-orange-600",
  description: "Recover your initial €88 investment"
}, {
  name: "Growth Acceleration",
  type: "linear" as const,
  color: "from-orange-500 to-orange-700",
  description: "Double your returns with strategic growth"
}, {
  name: "Breakthrough Point",
  type: "compound" as const,
  color: "from-green-400 to-green-600",
  description: "€50,000+ compound growth strategy"
}, {
  name: "Expansion Phase",
  type: "compound" as const,
  color: "from-green-500 to-green-700",
  description: "€500,000+ wealth multiplication"
}, {
  name: "Wealth Creation",
  type: "compound" as const,
  color: "from-green-600 to-green-800",
  description: "€2,670,000+ substantial returns"
}, {
  name: "Passive Income",
  type: "passive" as const,
  color: "from-purple-400 to-purple-600",
  description: "€100,000+ per period income"
}, {
  name: "Legacy Portfolio",
  type: "passive" as const,
  color: "from-purple-500 to-purple-700",
  description: "€1,000,000+ per period income"
}, {
  name: "Ultimate Freedom",
  type: "passive" as const,
  color: "from-purple-600 to-purple-800",
  description: "€10,000,000+ per period income"
}];
function formatNumber(value: number): string {
  if (value >= 100) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 0
    });
  } else if (value >= 10) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 2
    });
  } else {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 5
    });
  }
}
function calculateSplit(price: number): {
  splitNumber: number;
  splitPrice: number;
} {
  // Find the next split price that is >= trigger price
  const splitPrice = Math.pow(2, Math.ceil(Math.log2(price / 0.001))) * 0.001;
  // Split number is based on price, not level - same price = same split
  const splitNumber = Math.log2(splitPrice / 0.001) + 1;
  return {
    splitNumber,
    splitPrice
  };
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
    const {
      splitNumber,
      splitPrice
    } = calculateSplit(triggerPrice);
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
    const triggerPrice = startPrice * i; // Linear growth like accounts 1-2
    const lanasOnSale = lanas * sellPercentages[i - 1];
    const cashOut = triggerPrice * lanasOnSale;
    remaining -= lanasOnSale;
    const {
      splitNumber,
      splitPrice
    } = calculateSplit(triggerPrice);
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
function generatePassiveLevels(lanas: number, startPrice: number, maxLevels: number = 300): TradingLevel[] {
  const levels: TradingLevel[] = [];
  let remaining = lanas;
  let currentPrice = startPrice;
  for (let i = 1; i <= maxLevels; i++) {
    // Safety check: stop if account is depleted
    if (remaining <= 0) {
      console.warn(`Passive account depleted at level ${i}`);
      break;
    }
    
    const accountValue = remaining * currentPrice;
    const cashOutPoint = accountValue * 1.01;
    const cashOut = cashOutPoint - accountValue;
    const newCoinPrice = cashOutPoint / remaining;
    const lanasToSell = cashOut / newCoinPrice;
    
    // Safety check: validate lanasToSell
    if (lanasToSell <= 0 || lanasToSell > remaining) {
      console.warn(`Invalid lanasToSell at level ${i}: ${lanasToSell}, remaining: ${remaining}`);
      break;
    }
    
    const {
      splitNumber,
      splitPrice
    } = calculateSplit(newCoinPrice);
    levels.push({
      level: i,
      triggerPrice: newCoinPrice.toFixed(5),
      splitNumber,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasToSell.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat((remaining - lanasToSell).toFixed(2))
    });
    remaining -= lanasToSell;
    currentPrice = newCoinPrice;

    // Stop at split 37
    if (splitNumber >= 37) break;
  }
  return levels;
}
export default function TradingPlanCalculator() {
  const {
    params,
    loading,
    error
  } = useNostrLanaParams();
  const [currentPrice, setCurrentPrice] = useState<string>("");
  const [selectedCurrency, setSelectedCurrency] = useState<'EUR' | 'USD' | 'GBP'>('EUR');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());
  const [account8Batches, setAccount8Batches] = useState<number>(0);
  const [portfolioProjection, setPortfolioProjection] = useState<ProjectionData[]>([]);
  const [passiveAccountSplits, setPassiveAccountSplits] = useState<Set<number>>(new Set());

  // Set default price from NOSTR params when loaded
  useEffect(() => {
    if (params && !currentPrice) {
      const rate = params.exchangeRates[selectedCurrency];
      setCurrentPrice(rate.toString());
    }
  }, [params, selectedCurrency, currentPrice]);

  const buildRemainingLanaMap = (accounts: Account[], totalInitialLana: number): Map<number, number> => {
    const lanaMap = new Map<number, number>();
    
    // First, aggregate ALL sales per split (sum lanasOnSale for all levels with same splitNumber)
    const salesPerSplit = new Map<number, number>();
    
    accounts.forEach(account => {
      account.levels.forEach(level => {
        const currentSales = salesPerSplit.get(level.splitNumber) || 0;
        salesPerSplit.set(level.splitNumber, currentSales + level.lanasOnSale);
      });
    });
    
    // Get sorted list of splits that have sales
    const splitsWithSales = Array.from(salesPerSplit.keys()).sort((a, b) => a - b);
    
    // Calculate cumulative remaining LANA for each split (1 to 37)
    let remainingLana = totalInitialLana;
    let salesIndex = 0;
    
    for (let split = 1; split <= 37; split++) {
      // If this split has sales, subtract the aggregated amount
      if (salesIndex < splitsWithSales.length && splitsWithSales[salesIndex] === split) {
        const totalSalesAtThisSplit = salesPerSplit.get(split) || 0;
        remainingLana -= totalSalesAtThisSplit;
        salesIndex++;
      }
      
      // Store the remaining LANA at this split
      lanaMap.set(split, Math.max(0, remainingLana));
    }
    
    return lanaMap;
  };

  // Track which splits have passive account activity (accounts 6, 7, 8)
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

  const calculatePortfolioProjection = (startingPrice: number, remainingLanaMap: Map<number, number>): ProjectionData[] => {
    const projections: ProjectionData[] = [];
    // Increase starting price by 8% to skip the first split (Initial Recovery)
    const adjustedStartingPrice = startingPrice * 1.08;
    let startingSplit = calculateSplit(adjustedStartingPrice);
    const TARGET_VALUE = 100000000; // €100,000,000
    
    // Calculate portfolio value from starting split until €100M is reached
    for (let splitNum = startingSplit.splitNumber; splitNum <= 37; splitNum++) {
      const splitPrice = 0.001 * Math.pow(2, splitNum - 1);
      const remainingLana = remainingLanaMap.get(splitNum) || 0;
      const actualPortfolioValue = remainingLana * splitPrice;
      
      // Cap portfolio value at €100M
      const portfolioValue = Math.min(actualPortfolioValue, TARGET_VALUE);
      
      projections.push({
        splitNumber: splitNum,
        splitPrice: splitPrice,
        portfolioValue: portfolioValue,
        remainingLana: remainingLana
      });
      
      // Stop when €100M is reached
      if (actualPortfolioValue >= TARGET_VALUE) {
        break;
      }
    }
    
    return projections;
  };

  const calculatePlan = () => {
    const initialInvestment = 88;
    const price = parseFloat(currentPrice);
    const totalLanas = initialInvestment / price;
    const lanasPerAccount = totalLanas / 8;

    // Increase starting price by 8% to skip the first split (Initial Recovery)
    const adjustedStartingPrice = price * 1.08;

    // Calculate account prices based on progression
    const accountPrices = [adjustedStartingPrice,
    // Account 1: starts at adjusted price (+8%)
    adjustedStartingPrice * 10,
    // Account 2: continues where Account 1 ends
    adjustedStartingPrice * 100,
    // Account 3: continues where Account 2 ends
    adjustedStartingPrice * 1000,
    // Account 4: continues where Account 3 ends
    adjustedStartingPrice * 10000,
    // Account 5: continues where Account 4 ends
    adjustedStartingPrice * 100000,
    // Account 6: continues where Account 5 ends
    adjustedStartingPrice * 1000000,
    // Account 7: continues where Account 6 ends
    adjustedStartingPrice * 10000000 // Account 8: continues where Account 7 ends
    ];
    const newAccounts: Account[] = accountConfigs.map((config, index) => {
      let levels: TradingLevel[];
      if (config.type === "linear") {
        levels = generateLinearLevels(lanasPerAccount, accountPrices[index]);
      } else if (config.type === "compound") {
        levels = generateCompoundLevels(lanasPerAccount, accountPrices[index]);
      } else {
        // Passive accounts (6, 7, 8): Generate 300 levels by default, more for account 8 if requested
        levels = generatePassiveLevels(
          lanasPerAccount, 
          accountPrices[index], 
          index === 7 ? 300 + account8Batches * 100 : 300
        );
      }
      const totalCashOut = levels.reduce((sum, level) => sum + parseFloat(level.cashOut), 0);

      // For passive accounts (6, 7, 8), calculate portfolio value
      const portfolioValue = config.type === "passive" ? lanasPerAccount * accountPrices[index] : undefined;
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
    setAccount8Batches(0); // Reset batches when recalculating
    
    // Build remaining LANA map considering all sales across all accounts
    const lanaMap = buildRemainingLanaMap(newAccounts, totalLanas);
    
    // Track which splits have passive account activity
    const passiveSplits = getPassiveAccountSplits(newAccounts);
    setPassiveAccountSplits(passiveSplits);
    
    // Calculate portfolio projection with accurate remaining LANA
    const projection = calculatePortfolioProjection(price, lanaMap);
    setPortfolioProjection(projection);
  };
  const loadMoreAccount8Levels = () => {
    setAccount8Batches(prev => prev + 1);

    // Recalculate only account 8
    const price = parseFloat(currentPrice);
    const adjustedStartingPrice = price * 1.08;
    const initialInvestment = 88;
    const totalLanas = initialInvestment / price;
    const lanasPerAccount = totalLanas / 8;
    const account8Price = adjustedStartingPrice * 10000000;
    const newBatches = account8Batches + 1;
    const levels = generatePassiveLevels(lanasPerAccount, account8Price, 300 + newBatches * 100);
    const totalCashOut = levels.reduce((sum, level) => sum + parseFloat(level.cashOut), 0);
    const portfolioValue = lanasPerAccount * account8Price;
    const updatedAccounts = accounts.map(acc => acc.number === 8 ? {
      ...acc,
      levels,
      totalCashOut,
      portfolioValue
    } : acc);
    
    setAccounts(updatedAccounts);
    
    // Rebuild remaining LANA map with updated accounts
    const lanaMap = buildRemainingLanaMap(updatedAccounts, totalLanas);
    
    // Track which splits have passive account activity
    const passiveSplits = getPassiveAccountSplits(updatedAccounts);
    setPassiveAccountSplits(passiveSplits);
    
    // Recalculate portfolio projection with accurate remaining LANA
    const projection = calculatePortfolioProjection(parseFloat(currentPrice), lanaMap);
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
  const totalProjectedValue = accounts.reduce((sum, acc) => sum + acc.totalCashOut, 0);
  return <div className="space-y-8">
      {/* Calculator Input */}
      <Card className="p-8 shadow-mystical bg-card border-border">
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <Coins className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Let's see Your 8th Wonder Plan</h2>
          </div>
          <p className="text-muted-foreground">
            Current prices loaded from Nostr Network. Select your currency and generate your personalized 8-account trading strategy.
          </p>
          
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">
                Select Currency
              </label>
              <Select value={selectedCurrency} onValueChange={(value: 'EUR' | 'USD' | 'GBP') => {
              setSelectedCurrency(value);
              if (params) {
                setCurrentPrice(params.exchangeRates[value].toString());
              }
            }} disabled={loading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Current LANA Price ({selectedCurrency})
                </label>
                <Input type="number" step="0.000001" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="Price loaded from Nostr" className="text-lg" disabled={loading} />
              </div>
              <Button onClick={calculatePlan} size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading || !currentPrice}>
                <TrendingUp className="w-5 h-5 mr-2" />
                Generate Plan
              </Button>
            </div>
          </div>

          {accounts.length > 0 && <div className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Initial Investment</p>
                  <p className="text-3xl font-bold text-foreground">€88</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Total Lanas</p>
                  <p className="text-3xl font-bold text-foreground">
                    {formatNumber(88 / parseFloat(currentPrice))}
                  </p>
                </div>
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Lana8Wonder Donation</p>
                  <p className="text-3xl font-bold text-foreground">
                    {formatNumber(12 / parseFloat(currentPrice))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">LANA</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-6 text-center shadow-sm">
                  <p className="text-sm text-muted-foreground mb-2">Total LANA to step into Lana8Wonder</p>
                  <p className="text-3xl font-bold text-foreground">
                    {formatNumber((88 + 12) / parseFloat(currentPrice))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">LANA</p>
                </div>
              </div>
            </div>}
        </div>
      </Card>

      {/* Trading Accounts */}
      {accounts.length > 0 && <div className="space-y-4">
          <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            In current Split you can create next 8 Lana Wonder Accounts
          </h3>
          
          {accounts.map(account => <Card key={account.number} className="overflow-hidden shadow-card hover:shadow-mystical transition-all duration-300">
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
                    <p className="text-white/90 text-sm">{account.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white/80 mb-1">
                      {account.type === "passive" ? "Portfolio Value" : "Total Cash Out"}
                    </p>
                    <p className="text-2xl font-bold text-white">
                      €{formatNumber(account.type === "passive" && account.portfolioValue ? account.portfolioValue : account.totalCashOut)}
                    </p>
                    <div className="mt-2">
                      {expandedAccounts.has(account.number) ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                    </div>
                  </div>
                </div>
              </div>

              {expandedAccounts.has(account.number) && <div className="p-6 bg-card">
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
                        {(account.number === 8 ? account.levels : account.levels.slice(0, 10)).map(level => <tr key={level.level} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                            <td className="py-3 px-4 font-medium text-foreground">{level.level}</td>
                            <td className="text-right py-3 px-4 text-muted-foreground">€{formatNumber(parseFloat(level.triggerPrice))}</td>
                            <td className="text-right py-3 px-4 text-primary font-medium">
                              Split {level.splitNumber}. €{formatNumber(parseFloat(level.splitPrice))}
                            </td>
                            <td className="text-right py-3 px-4 text-muted-foreground">
                              {formatNumber(level.lanasOnSale)}
                            </td>
                            <td className="text-right py-3 px-4 font-semibold text-secondary">
                              €{formatNumber(parseFloat(level.cashOut))}
                            </td>
                            <td className="text-right py-3 px-4 text-muted-foreground">
                              {formatNumber(level.remaining)}
                            </td>
                          </tr>)}
                      </tbody>
                    </table>
                  </div>
                  {account.number !== 8 && account.levels.length > 10 && <p className="text-center text-sm text-muted-foreground mt-4">
                      Showing first 10 of {account.levels.length} levels
                    </p>}
                  
                  {/* Show "Load More" button for Account 8 */}
                  {account.number === 8 && account.levels.length > 0 && account.levels[account.levels.length - 1].splitNumber < 37 && <div className="text-center mt-6 pt-6 border-t border-border">
                      <Button onClick={loadMoreAccount8Levels} variant="outline" className="w-full max-w-md">
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Load Next 100 Records (Current: {account.levels.length} levels, Split {account.levels[account.levels.length - 1].splitNumber})
                      </Button>
                    </div>}
                </div>}
            </Card>)}
        </div>}

      {/* Portfolio Growth Projection */}
      {portfolioProjection.length > 0 && <Card className="overflow-hidden shadow-card border-border">
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
                  €{formatNumber(portfolioProjection[0].portfolioValue)}
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
                  €100,000,000
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
                return <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-2 border-green-500/30 rounded-lg p-6 text-center">
                    <p className="text-sm text-muted-foreground mb-2">🎯 Milestone Achievement</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                      €100,000,000
                    </p>
                    <p className="text-lg text-foreground">
                      Reached at <span className="font-bold text-primary">Split {milestone100M.splitNumber}</span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      LANA Price: €{formatNumber(milestone100M.splitPrice)}
                    </p>
                  </div>;
              }
              return <div className="bg-muted/20 border border-border rounded-lg p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-2">📊 Maximum Projection</p>
                  <p className="text-lg text-foreground">
                    €100M milestone not reached by Split 37
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Highest projected value: €{formatNumber(portfolioProjection[portfolioProjection.length - 1].portfolioValue)}
                  </p>
                </div>;
            })()}

            {/* Full Projection Table */}
            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4">Complete Split Projection</h4>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Split</th>
                      <th className="text-right py-3 px-4 font-semibold text-foreground">LANA Price</th>
                      <th className="text-right py-3 px-4 font-semibold text-foreground">Portfolio Value</th>
                      <th className="text-right py-3 px-4 font-semibold text-foreground">Remaining LANA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioProjection.map(projection => {
                    const isMillestone = projection.portfolioValue >= 100000000;
                    const isSplit27 = projection.splitNumber === 27;
                    return <tr key={projection.splitNumber} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${isMillestone ? 'bg-green-500/10 border-green-500/30' : isSplit27 ? 'bg-indigo-500/10 border-indigo-500/30' : ''}`}>
                          <td className="py-3 px-4 font-medium">
                            <span className={isSplit27 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-primary'}>
                              Split {projection.splitNumber}
                            </span>
                          </td>
                          <td className="text-right py-3 px-4 text-muted-foreground">
                            €{formatNumber(projection.splitPrice)}
                          </td>
                          <td className={`text-right py-3 px-4 font-semibold ${isMillestone ? 'text-green-600 dark:text-green-400' : isSplit27 ? 'text-indigo-600 dark:text-indigo-400' : 'text-foreground'}`}>
                            €{formatNumber(projection.portfolioValue)}
                          </td>
                          <td className="text-right py-3 px-4 text-muted-foreground">
                            {passiveAccountSplits.has(projection.splitNumber) && '≈ '}
                            {formatNumber(projection.remainingLana)}
                          </td>
                        </tr>;
                  })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>}
    </div>;
}