// Shared annuity-plan generation logic.
// Mirrors server/routes/publishPlan.ts EXACTLY — keep both in sync.

export interface TradingLevel {
  level: number;
  triggerPrice: string;
  splitNumber: number;
  splitPrice: string;
  lanasOnSale: number;
  cashOut: string;
  remaining: number;
}

export interface PlanAccountLevel {
  row_id: string;
  level_no: number;
  trigger_price: number;
  coins_to_give: number;
  cash_out: number;
  remaining_lanas: number;
}

export interface PlanAccount {
  account_id: number;
  type: 'linear' | 'compound' | 'passive';
  levels: PlanAccountLevel[];
}

export const ACCOUNT_TYPES: Array<'linear' | 'compound' | 'passive'> = [
  'linear', 'linear', 'compound', 'compound', 'compound', 'passive', 'passive', 'passive'
];

export const PASSIVE_TARGET_VALUES: Array<number | null> = [
  null, null, null, null, null, 1000000, 10000000, 88000000
];

export function calculateSplit(price: number): { splitNumber: number; splitPrice: number } {
  const splitPrice = Math.pow(2, Math.ceil(Math.log2(price / 0.001))) * 0.001;
  const splitNumber = Math.log2(splitPrice / 0.001) + 1;
  return { splitNumber, splitPrice };
}

export function generateLinearLevels(lanas: number, startPrice: number): TradingLevel[] {
  const levels: TradingLevel[] = [];
  const lanasPerLevel = lanas / 10;
  let remaining = lanas;
  for (let i = 1; i <= 10; i++) {
    const triggerPrice = startPrice * i;
    const cashOut = triggerPrice * lanasPerLevel;
    remaining -= lanasPerLevel;
    const { splitNumber, splitPrice } = calculateSplit(triggerPrice);
    levels.push({
      level: i,
      triggerPrice: triggerPrice.toFixed(5),
      splitNumber,
      splitPrice: splitPrice.toFixed(3),
      lanasOnSale: parseFloat(lanasPerLevel.toFixed(2)),
      cashOut: cashOut.toFixed(2),
      remaining: parseFloat(remaining.toFixed(2))
    });
  }
  return levels;
}

export function generateCompoundLevels(lanas: number, startPrice: number): TradingLevel[] {
  const sellPercentages = [0, 0.25, 0.20, 0.15, 0.12, 0.09, 0.07, 0.05, 0.04, 0.03];
  const levels: TradingLevel[] = [];
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

export function generatePassiveLevelsBySplit(lanas: number, startPrice: number, targetValue: number): TradingLevel[] {
  const { splitNumber: startSplitNum } = calculateSplit(startPrice);
  const levels: TradingLevel[] = [];
  let remaining = lanas;
  let previousRemaining = lanas;

  // NOTE: no level-count cap — server/routes/publishPlan.ts is uncapped and the
  // published KIND 88888 plan must match this model exactly.
  for (let splitNum = startSplitNum; splitNum <= 37; splitNum++) {
    const splitPrice = 0.001 * Math.pow(2, splitNum - 1);
    const portfolioValue = remaining * splitPrice;
    const hasReachedTarget = portfolioValue >= targetValue;

    let lanasOnSale: number;
    let cashOut: number;
    let newRemaining: number;

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

// Generate the full 8-account plan for a given per-wallet amount and
// adjusted start price (already includes the +8% buffer).
export function generateFullPlan(amountPerWallet: number, adjustedStartPrice: number): PlanAccount[] {
  const accountPrices = [
    adjustedStartPrice,
    adjustedStartPrice * 10,
    adjustedStartPrice * 100,
    adjustedStartPrice * 1000,
    adjustedStartPrice * 10000,
    adjustedStartPrice * 100000,
    adjustedStartPrice * 1000000,
    adjustedStartPrice * 10000000
  ];

  return ACCOUNT_TYPES.map((type, index) => {
    const accountId = index + 1;
    let tradingLevels: TradingLevel[];

    if (type === 'linear') {
      tradingLevels = generateLinearLevels(amountPerWallet, accountPrices[index]);
    } else if (type === 'compound') {
      tradingLevels = generateCompoundLevels(amountPerWallet, accountPrices[index]);
    } else {
      tradingLevels = generatePassiveLevelsBySplit(amountPerWallet, accountPrices[index], PASSIVE_TARGET_VALUES[index]!);
    }

    const levels: PlanAccountLevel[] = tradingLevels.map((level, li) => ({
      row_id: `a${accountId}-l${li + 1}`,
      level_no: level.level,
      trigger_price: parseFloat(level.triggerPrice),
      coins_to_give: level.lanasOnSale,
      cash_out: parseFloat(level.cashOut),
      remaining_lanas: level.remaining
    }));

    return { account_id: accountId, type, levels };
  });
}

// For each account, compute the funding amount that skips already-elapsed
// levels: the remaining_lanas after the LAST level whose trigger_price is
// at or below the current exchange rate. If no level has triggered, the
// account is funded with the full per-wallet amount.
export interface AccountFunding {
  account_id: number;
  type: 'linear' | 'compound' | 'passive';
  fullAmount: number;
  elapsedLevels: number;
  fundingAmount: number;
}

export function computeFundingWithElapsed(
  accounts: PlanAccount[],
  amountPerWallet: number,
  currentRate: number
): AccountFunding[] {
  return accounts.map((account) => {
    const triggered = account.levels.filter(l => currentRate > 0 && l.trigger_price <= currentRate);
    const elapsedLevels = triggered.length;
    const fundingAmount = elapsedLevels > 0
      ? triggered[triggered.length - 1].remaining_lanas
      : amountPerWallet;
    return {
      account_id: account.account_id,
      type: account.type,
      fullAmount: amountPerWallet,
      elapsedLevels,
      fundingAmount
    };
  });
}
