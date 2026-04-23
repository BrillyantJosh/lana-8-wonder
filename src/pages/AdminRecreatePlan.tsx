import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Search, RefreshCw, Eye, Send, CheckCircle2, XCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { getDomainKey } from '@/integrations/api/client';
import { AdminMenu } from '@/components/AdminMenu';
import { useNostrLanaParams } from '@/hooks/useNostrLanaParams';

interface WalletInfo {
  wallet_address: string;
  wallet_type: string;
  coin: string;
  note: string;
}

interface WalletWithBalance extends WalletInfo {
  balance: number;
  balanceLoading: boolean;
}

interface PreviewAccount {
  account_id: number;
  wallet: string;
  balance: number;
  levels: Array<{
    row_id: string;
    level_no: number;
    trigger_price: number;
    coins_to_give: number;
    cash_out: number;
    remaining_lanas: number;
  }>;
}

type Step = 'input' | 'wallets' | 'preview' | 'publishing' | 'done';

const AdminRecreatePlan = () => {
  const navigate = useNavigate();
  const { params } = useNostrLanaParams();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('input');

  // Step 1: Input
  const [hexId, setHexId] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 2: Wallets
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [currency, setCurrency] = useState('EUR');
  const [customStartPrice, setCustomStartPrice] = useState('');

  // Step 3: Preview
  const [previewAccounts, setPreviewAccounts] = useState<PreviewAccount[]>([]);
  const [previewStartPrice, setPreviewStartPrice] = useState(0);

  // Step 4: Publishing
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<any>(null);

  // Admin check
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const sessionData = sessionStorage.getItem('lana_session');
        if (!sessionData) { navigate('/login'); return; }

        const session = JSON.parse(sessionData);
        const userHexId = session.nostrHexId;
        if (!userHexId) { navigate('/login'); return; }

        const res = await fetch('/api/check-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          },
          body: JSON.stringify({ nostr_hex_id: userHexId })
        });
        const json = await res.json();
        const admin = json.data?.isGlobalAdmin || false;
        if (!admin) { navigate('/dashboard'); return; }
        setIsAdmin(true);
      } catch { navigate('/dashboard'); }
    };
    checkAdmin();
  }, [navigate]);

  // Fetch KIND 30889 wallets
  const handleFetchWallets = async () => {
    if (!hexId.trim() || hexId.length !== 64) {
      toast.error('Please enter a valid 64-character hex ID');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/fetch-kind30889', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nostr_hex_id: hexId.trim() })
      });
      const json = await res.json();

      if (!json.found) {
        toast.error('No KIND 30889 registration found for this hex ID');
        return;
      }

      const l8wWallets: WalletInfo[] = json.l8w_wallets || [];

      if (l8wWallets.length !== 8) {
        toast.error(`Found ${l8wWallets.length} Lana8Wonder wallets (need exactly 8)`);
        return;
      }

      // Set wallets with loading state for balances
      const walletsWithBalance: WalletWithBalance[] = l8wWallets.map(w => ({
        ...w,
        balance: 0,
        balanceLoading: true
      }));
      setWallets(walletsWithBalance);
      setStep('wallets');

      // Set currency from domain config
      const domainKey = getDomainKey();
      if (domainKey) {
        try {
          const configRes = await fetch('/api/domain-config', {
            headers: { 'X-Domain-Key': domainKey }
          });
          const configJson = await configRes.json();
          if (configJson.data?.currency_default) {
            setCurrency(configJson.data.currency_default);
          }
        } catch { /* keep EUR */ }
      }

      // Fetch balances
      if (params?.electrum) {
        try {
          const addresses = l8wWallets.map(w => w.wallet_address);
          const electrumServers = params.electrum.map(e => ({
            host: e.host,
            port: parseInt(String(e.port))
          }));

          const balRes = await fetch('/api/check-wallet-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet_addresses: addresses,
              electrum_servers: electrumServers
            })
          });
          const balJson = await balRes.json();

          if (balJson.success && balJson.wallets) {
            const balanceMap: Record<string, number> = {};
            balJson.wallets.forEach((w: any) => {
              balanceMap[w.wallet_id] = w.balance || 0;
            });

            setWallets(prev => prev.map(w => ({
              ...w,
              balance: balanceMap[w.wallet_address] || 0,
              balanceLoading: false
            })));
          } else {
            setWallets(prev => prev.map(w => ({ ...w, balanceLoading: false })));
          }
        } catch (err) {
          console.error('Balance fetch error:', err);
          setWallets(prev => prev.map(w => ({ ...w, balanceLoading: false })));
          toast.error('Failed to fetch wallet balances');
        }
      } else {
        setWallets(prev => prev.map(w => ({ ...w, balanceLoading: false })));
      }

      toast.success(`Found 8 Lana8Wonder wallets for ${hexId.slice(0, 8)}...`);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to fetch wallet data');
    } finally {
      setLoading(false);
    }
  };

  // Generate preview
  const handlePreview = async () => {
    const startPrice = parseFloat(customStartPrice);
    if (!startPrice || startPrice <= 0) {
      toast.error('Please enter a valid start price');
      return;
    }

    setPreviewStartPrice(startPrice);

    // Generate plan client-side using the same logic as server
    const adjustedStartPrice = startPrice * 1.08; // 8% markup

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

    const targetValues = [null, null, null, null, null, 1000000, 10000000, 88000000];
    const accountTypes: Array<'linear' | 'compound' | 'passive'> = [
      'linear', 'linear', 'compound', 'compound', 'compound', 'passive', 'passive', 'passive'
    ];

    const accounts: PreviewAccount[] = wallets.map((w, index) => {
      const amountPerWallet = w.balance;
      const accountId = index + 1;

      let levels: any[] = [];

      if (accountTypes[index] === 'linear') {
        levels = generateLinearLevels(amountPerWallet, accountPrices[index]);
      } else if (accountTypes[index] === 'compound') {
        levels = generateCompoundLevels(amountPerWallet, accountPrices[index]);
      } else {
        levels = generatePassiveLevelsBySplit(amountPerWallet, accountPrices[index], targetValues[index]!);
      }

      return {
        account_id: accountId,
        wallet: w.wallet_address,
        balance: w.balance,
        levels: levels.map((level, li) => ({
          row_id: `a${accountId}-l${li + 1}`,
          level_no: level.level,
          trigger_price: parseFloat(level.triggerPrice),
          coins_to_give: level.lanasOnSale,
          cash_out: parseFloat(level.cashOut),
          remaining_lanas: level.remaining
        }))
      };
    });

    setPreviewAccounts(accounts);
    setStep('preview');
  };

  // Publish plan
  const handlePublish = async () => {
    setPublishing(true);
    setStep('publishing');

    try {
      const adjustedStartPrice = previewStartPrice * 1.08;
      const avgBalance = wallets.reduce((s, w) => s + w.balance, 0) / wallets.length;

      const res = await fetch('/api/publish-lana8wonder-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
        },
        body: JSON.stringify({
          subject_hex: hexId.trim(),
          wallets: wallets.map(w => w.wallet_address),
          amount_per_wallet: avgBalance,
          currency,
          exchange_rate: previewStartPrice,
          start_price: adjustedStartPrice
        })
      });

      const json = await res.json();

      if (json.success) {
        setPublishResult(json);
        setStep('done');
        toast.success('Annuity plan published successfully!');
      } else {
        toast.error(json.error?.message || 'Failed to publish plan');
        setStep('preview');
      }
    } catch (error) {
      console.error('Publish error:', error);
      toast.error('Failed to publish plan');
      setStep('preview');
    } finally {
      setPublishing(false);
    }
  };

  // Plan generation functions (matching server logic)
  function calculateSplit(price: number) {
    const splitPrice = Math.pow(2, Math.ceil(Math.log2(price / 0.001))) * 0.001;
    const splitNumber = Math.log2(splitPrice / 0.001) + 1;
    return { splitNumber, splitPrice };
  }

  function generateLinearLevels(lanas: number, startPrice: number) {
    const levels = [];
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

  function generateCompoundLevels(lanas: number, startPrice: number) {
    const sellPercentages = [0, 0.25, 0.20, 0.15, 0.12, 0.09, 0.07, 0.05, 0.04, 0.03];
    const levels = [];
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

  function generatePassiveLevelsBySplit(lanas: number, startPrice: number, targetValue: number) {
    const { splitNumber: startSplitNum } = calculateSplit(startPrice);
    const levels = [];
    let remaining = lanas;
    let previousRemaining = lanas;

    for (let splitNum = startSplitNum; splitNum <= 37 && levels.length < 10; splitNum++) {
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

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold">Recreate Annuity Plan</h1>
            </div>
          </div>
          <AdminMenu />
        </div>

        {/* Step 1: Hex ID Input */}
        <Card>
          <CardHeader>
            <CardTitle>1. User Identification</CardTitle>
            <CardDescription>Enter the Nostr hex ID to look up registered wallets via KIND 30889</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hexId">Nostr Hex ID</Label>
              <div className="flex gap-2">
                <Input
                  id="hexId"
                  value={hexId}
                  onChange={(e) => setHexId(e.target.value.trim())}
                  placeholder="64-character hex public key..."
                  className="font-mono text-sm"
                  disabled={step !== 'input'}
                />
                <Button
                  onClick={handleFetchWallets}
                  disabled={loading || hexId.length !== 64 || step !== 'input'}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2">{loading ? 'Searching...' : 'Find Wallets'}</span>
                </Button>
              </div>
            </div>
            {step !== 'input' && (
              <Button variant="outline" size="sm" onClick={() => { setStep('input'); setWallets([]); setPreviewAccounts([]); setPublishResult(null); }}>
                <RefreshCw className="h-3 w-3 mr-2" /> Start Over
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Wallets + Start Price */}
        {(step === 'wallets' || step === 'preview' || step === 'done') && wallets.length === 8 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                2. Registered Wallets ({currency})
              </CardTitle>
              <CardDescription>
                8 Lana8Wonder wallets found — Total: {totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                {wallets.map((w, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6">#{i + 1}</span>
                      <span className="font-mono text-xs break-all">{w.wallet_address}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {w.balanceLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : w.balance > 0 ? (
                        <span className="font-semibold text-green-600 text-xs">{w.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">0 LANA</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Custom start price */}
              <div className="border-t pt-4 space-y-2">
                <Label htmlFor="startPrice">Start Price ({currency}/LANA)</Label>
                <div className="flex gap-2">
                  <Input
                    id="startPrice"
                    type="number"
                    step="0.0001"
                    value={customStartPrice}
                    onChange={(e) => setCustomStartPrice(e.target.value)}
                    placeholder={`e.g. 0.008`}
                    className="font-mono max-w-[200px]"
                    disabled={step !== 'wallets'}
                  />
                  <Button
                    onClick={handlePreview}
                    disabled={!customStartPrice || parseFloat(customStartPrice) <= 0 || step !== 'wallets'}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Plan
                  </Button>
                </div>
                {params?.exchangeRates && (
                  <p className="text-xs text-muted-foreground">
                    Current KIND 38888 rate: {params.exchangeRates[currency as keyof typeof params.exchangeRates]} {currency}/LANA
                    (Split {params.split})
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Preview */}
        {(step === 'preview' || step === 'done') && previewAccounts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                3. Plan Preview
              </CardTitle>
              <CardDescription>
                Start price: {previewStartPrice} {currency}/LANA
                (adjusted: {(previewStartPrice * 1.08).toFixed(6)} with 8% buffer)
                — {previewAccounts.reduce((s, a) => s + a.levels.length, 0)} total levels
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewAccounts.map((account) => (
                <div key={account.account_id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm">
                      Account {account.account_id}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({['linear', 'linear', 'compound', 'compound', 'compound', 'passive', 'passive', 'passive'][account.account_id - 1]})
                      </span>
                    </span>
                    <span className="text-xs font-mono text-green-600">{account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} LANA</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left py-1 pr-2">Lvl</th>
                          <th className="text-right py-1 pr-2">Trigger</th>
                          <th className="text-right py-1 pr-2">Coins</th>
                          <th className="text-right py-1 pr-2">Cash Out</th>
                          <th className="text-right py-1">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {account.levels.map((level, li) => (
                          <tr key={li} className="border-b border-border/30">
                            <td className="py-1 pr-2">{level.level_no}</td>
                            <td className="text-right py-1 pr-2 font-mono">{level.trigger_price.toFixed(5)}</td>
                            <td className="text-right py-1 pr-2 font-mono">{level.coins_to_give.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="text-right py-1 pr-2 font-mono">{level.cash_out.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="text-right py-1 font-mono">{level.remaining_lanas.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {step === 'preview' && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button variant="outline" onClick={() => setStep('wallets')}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button onClick={handlePublish} disabled={publishing} className="flex-1">
                    {publishing ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Publishing...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" /> Publish Plan to Nostr</>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Done */}
        {step === 'done' && publishResult && (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="pt-6">
              <div className="text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
                <h3 className="text-xl font-bold text-green-700">Plan Published Successfully!</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Event ID: <span className="font-mono text-xs">{publishResult.event_id}</span></p>
                  <p>Published to {publishResult.publish_results?.filter((r: any) => r.success).length || 0} relay(s)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminRecreatePlan;
