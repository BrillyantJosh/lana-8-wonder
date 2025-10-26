import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, TrendingUp, Wallet, Coins } from "lucide-react";

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

const accountConfigs = [
  { name: "Initial Recovery", type: "linear" as const, color: "from-orange-400 to-orange-600", description: "Recover your initial €88 investment" },
  { name: "Growth Acceleration", type: "linear" as const, color: "from-orange-500 to-orange-700", description: "Double your returns with strategic growth" },
  { name: "Breakthrough Point", type: "compound" as const, color: "from-green-400 to-green-600", description: "€50,000+ compound growth strategy" },
  { name: "Expansion Phase", type: "compound" as const, color: "from-green-500 to-green-700", description: "€500,000+ wealth multiplication" },
  { name: "Wealth Creation", type: "compound" as const, color: "from-green-600 to-green-800", description: "€2,670,000+ substantial returns" },
  { name: "Passive Income", type: "passive" as const, color: "from-purple-400 to-purple-600", description: "€100,000+ per period income" },
  { name: "Legacy Portfolio", type: "passive" as const, color: "from-purple-500 to-purple-700", description: "€1,000,000+ per period income" },
  { name: "Ultimate Freedom", type: "passive" as const, color: "from-purple-600 to-purple-800", description: "€10,000,000+ per period income" },
];

function formatNumber(value: number): string {
  if (value >= 100) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else if (value >= 10) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } else {
    return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  }
}

function calculateSplit(price: number, level: number): { splitNumber: number; splitPrice: number } {
  // Find the next split price that is >= trigger price
  const splitPrice = Math.pow(2, Math.ceil(Math.log2(price / 0.001))) * 0.001;
  const splitNumber = level; // Sequential numbering: 1, 2, 3, 4...
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

    const { splitNumber, splitPrice } = calculateSplit(triggerPrice, i);

    levels.push({
      level: i,
      triggerPrice: triggerPrice.toFixed(5),
      splitNumber,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasOnSale.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat(remaining.toFixed(2)),
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

    const { splitNumber, splitPrice } = calculateSplit(triggerPrice, i);

    levels.push({
      level: i,
      triggerPrice: triggerPrice.toFixed(5),
      splitNumber,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasOnSale.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat(remaining.toFixed(2)),
    });
  }

  return levels;
}

function generatePassiveLevels(lanas: number, startPrice: number, extraBatches: number = 0): TradingLevel[] {
  const levels: TradingLevel[] = [];
  const totalPeriods = 8 + (extraBatches * 100);
  let remaining = lanas;
  let currentPrice = startPrice;

  for (let i = 1; i <= totalPeriods; i++) {
    const accountValue = remaining * currentPrice;
    const cashOutPoint = accountValue * 1.01;
    const cashOut = cashOutPoint - accountValue;
    const newCoinPrice = cashOutPoint / remaining;
    const lanasToSell = cashOut / newCoinPrice;
    
    const { splitNumber, splitPrice } = calculateSplit(newCoinPrice, i);
    
    levels.push({
      level: i,
      triggerPrice: newCoinPrice.toFixed(5),
      splitNumber,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasToSell.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat((remaining - lanasToSell).toFixed(2)),
    });

    remaining -= lanasToSell;
    currentPrice = newCoinPrice;
  }

  return levels;
}

export default function TradingPlanCalculator() {
  const [currentPrice, setCurrentPrice] = useState<string>("0.004");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());

  const calculatePlan = () => {
    const initialInvestment = 88;
    const price = parseFloat(currentPrice);
    const totalLanas = initialInvestment / price;
    const lanasPerAccount = totalLanas / 8;

    // Calculate account prices based on progression
    const accountPrices = [
      price,           // Account 1: starts at current price
      price * 10,      // Account 2: continues where Account 1 ends
      price * 100,     // Account 3: continues where Account 2 ends
      price * 1000,    // Account 4: continues where Account 3 ends
      price * 10000,   // Account 5: continues where Account 4 ends
      price * 100000,  // Account 6: continues where Account 5 ends
      price * 1000000, // Account 7: continues where Account 6 ends
      price * 10000000, // Account 8: continues where Account 7 ends
    ];

    const newAccounts: Account[] = accountConfigs.map((config, index) => {
      let levels: TradingLevel[];
      
      if (config.type === "linear") {
        levels = generateLinearLevels(lanasPerAccount, accountPrices[index]);
      } else if (config.type === "compound") {
        levels = generateCompoundLevels(lanasPerAccount, accountPrices[index]);
      } else {
        levels = generatePassiveLevels(lanasPerAccount, accountPrices[index], index === 7 ? 0 : 0);
      }

      const totalCashOut = levels.reduce((sum, level) => sum + parseFloat(level.cashOut), 0);

      return {
        number: index + 1,
        name: config.name,
        type: config.type,
        color: config.color,
        description: config.description,
        levels,
        totalCashOut,
      };
    });

    setAccounts(newAccounts);
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

  return (
    <div className="space-y-8">
      {/* Calculator Input */}
      <Card className="p-8 shadow-mystical bg-card border-border">
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <Coins className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Calculate Your Trading Plan</h2>
          </div>
          <p className="text-muted-foreground">
            Enter the current LANA price to generate your personalized 8-account trading strategy
          </p>
          
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2 text-foreground">
                Current LANA Price (€)
              </label>
              <Input
                type="number"
                step="0.000001"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                placeholder="0.004"
                className="text-lg"
              />
            </div>
            <Button 
              onClick={calculatePlan} 
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <TrendingUp className="w-5 h-5 mr-2" />
              Generate Plan
            </Button>
          </div>

          {accounts.length > 0 && (
            <div className="mt-6 p-6 rounded-lg bg-gradient-wealth border border-border">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm font-medium text-foreground/80">Initial Investment</p>
                  <p className="text-2xl font-bold text-foreground">€88.00</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/80">Total LANA Coins</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatNumber(88 / parseFloat(currentPrice))}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/80">Projected Total Value</p>
                  <p className="text-2xl font-bold text-secondary">
                    €{formatNumber(totalProjectedValue)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Trading Accounts */}
      {accounts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            Your 8 Trading Accounts
          </h3>
          
          {accounts.map((account) => (
            <Card key={account.number} className="overflow-hidden shadow-card hover:shadow-mystical transition-all duration-300">
              <div 
                className={`bg-gradient-to-r ${account.color} p-6 cursor-pointer`}
                onClick={() => toggleAccount(account.number)}
              >
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
                    <p className="text-sm text-white/80 mb-1">Total Cash Out</p>
                    <p className="text-2xl font-bold text-white">
                      €{formatNumber(account.totalCashOut)}
                    </p>
                    <div className="mt-2">
                      {expandedAccounts.has(account.number) ? (
                        <ChevronUp className="w-5 h-5 text-white" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-white" />
                      )}
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
                        {account.levels.slice(0, 10).map((level) => (
                          <tr key={level.level} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {account.levels.length > 10 && (
                    <p className="text-center text-sm text-muted-foreground mt-4">
                      Showing first 10 of {account.levels.length} levels
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
