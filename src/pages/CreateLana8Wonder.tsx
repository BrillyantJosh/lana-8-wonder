import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogOut, Loader2, Wallet, AlertCircle } from "lucide-react";
import { LanaSession } from "@/lib/lanaKeys";
import { fetchKind30889, type WalletListRecord } from "@/lib/nostrClient";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCurrencySymbol } from "@/lib/utils";
import { LanguageSelector } from "@/components/LanguageSelector";

const CreateLana8Wonder = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [session, setSession] = useState<LanaSession | null>(null);
  const [walletRecords, setWalletRecords] = useState<WalletListRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("");
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<{ EUR: number; USD: number; GBP: number } | null>(null);
  const [planCurrency, setPlanCurrency] = useState<string>("EUR");
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
      
      // Set currency from profile (Kind 0)
      if (parsedSession.currency) {
        setPlanCurrency(parsedSession.currency);
      }
      
      // Set greeting with profile name
      const displayName = parsedSession.profileDisplayName || parsedSession.profileName || "User";
      setGreeting(displayName);

      if (!params?.relays || params.relays.length === 0) {
        toast.error("No relays available");
        setLoading(false);
        return;
      }

      // Set exchange rates from params
      if (params?.exchangeRates) {
        setExchangeRates(params.exchangeRates);
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
      loadWallets();
    }
  }, [navigate, params]);

  // Auto-redirect to preview if user already has a complete plan
  useEffect(() => {
    const checkExistingPlan = async () => {
      if (!session || loading) return;

      try {
        // Check if user has selected_wallet in profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, selected_wallet")
          .eq("nostr_hex_id", session.nostrHexId)
          .maybeSingle();
        
        if (!profile?.selected_wallet) return;
        
        // Check if there are 8 annuity wallets for this profile
        const { data: wallets } = await supabase
          .from("wallets")
          .select("id")
          .eq("profile_id", profile.id)
          .eq("wallet_type", "annuity");
        
        if (wallets && wallets.length === 8) {
          toast.success(t('createLana8Wonder.loadingExistingPlan'));
          navigate("/preview-lana8wonder");
        }
      } catch (error) {
        console.error("Error checking existing plan:", error);
      }
    };

    checkExistingPlan();
  }, [session, loading, navigate]);

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

  // Deduplikacija po wallet_address - varnostna mreža za client-side
  const uniqueWallets = allWallets.filter((wallet, index, self) =>
    index === self.findIndex(w => w.wallet_address === wallet.wallet_address)
  );
  // Backward-compatible alias
  const allWalletsDeduped = uniqueWallets;

  // Calculate minimum required LANA balance (100 currency units / exchange rate)
  const getMinimumRequiredBalance = (currency: string = "EUR"): number => {
    if (!exchangeRates) return 0;
    const rate = exchangeRates[currency as keyof typeof exchangeRates];
    if (!rate || rate === 0) return 0;
    return (100 / rate) + 0.5;
  };

  const minimumRequired = getMinimumRequiredBalance(planCurrency);
  const depositAmount = exchangeRates && exchangeRates[planCurrency as keyof typeof exchangeRates] 
    ? 100 / exchangeRates[planCurrency as keyof typeof exchangeRates] 
    : 0;
  const currencySymbol = getCurrencySymbol(planCurrency as 'EUR' | 'USD' | 'GBP');

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4">
      <div className="max-w-4xl mx-auto">
        {greeting && (
          <div className="mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{t('createLana8Wonder.greeting', { name: greeting })}</h1>
          </div>
        )}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">{t('createLana8Wonder.pageTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('createLana8Wonder.pageSubtitle')}</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <LanguageSelector />
            <Button variant="outline" onClick={handleLogout} className="flex-1 sm:flex-initial">
              <LogOut className="mr-2 h-4 w-4" />
              {t('createLana8Wonder.logout')}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">{t('createLana8Wonder.accountInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">{t('createLana8Wonder.walletId')}</p>
                <p className="font-mono text-xs sm:text-sm break-all">{session.walletId}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">{t('createLana8Wonder.nostrHexId')}</p>
                <p className="font-mono text-xs sm:text-sm break-all">{session.nostrHexId}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
                <CardTitle className="text-lg sm:text-xl">{t('createLana8Wonder.registeredWallets')}</CardTitle>
              </div>
              <CardDescription className="text-xs sm:text-sm">
                {t('createLana8Wonder.selectWalletsDescription')}
                {minimumRequired > 0 && (
                  <span className="block mt-1 text-foreground">
                    {t('createLana8Wonder.minimumBalance')} <strong>{minimumRequired.toFixed(4)} LANA</strong> (100 {currencySymbol} {t('createLana8Wonder.depositInfo', { amount: '', currency: '' }).replace('deposit', '').trim()})
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : allWalletsDeduped.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">{t('createLana8Wonder.noWalletsFound')}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('createLana8Wonder.contactRegistrar')}
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {allWalletsDeduped.map((wallet, idx) => {
                      const currentBalance = walletBalances[wallet.wallet_address] || 0;
                      const hasEnoughBalance = minimumRequired === 0 || currentBalance >= minimumRequired;
                      
                      return (
                        <Card key={idx} className="overflow-hidden">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground mb-1">{t('createLana8Wonder.walletAddress')}</p>
                                <p className="font-mono text-xs break-all">{wallet.wallet_address}</p>
                              </div>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary whitespace-nowrap shrink-0">
                                {wallet.wallet_type}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">{t('createLana8Wonder.balance')}</p>
                                <div className="text-sm font-semibold">
                                  {balancesLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : walletBalances[wallet.wallet_address] !== undefined ? (
                                    <span>{walletBalances[wallet.wallet_address].toFixed(8)}</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </div>
                              </div>
                              
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">{t('createLana8Wonder.note')}</p>
                                <p className="text-sm text-muted-foreground truncate">{wallet.note || "—"}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between gap-3 pt-2 border-t">
                              <div>
                                {!balancesLoading && minimumRequired > 0 && (
                                  hasEnoughBalance ? (
                                    <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white text-xs">
                                      ✓ {t('createLana8Wonder.sufficient')}
                                    </Badge>
                                  ) : (
                                    <div className="space-y-1">
                                      <Badge variant="destructive" className="flex items-center gap-1 text-xs w-fit">
                                        <AlertCircle className="h-3 w-3" />
                                        {t('createLana8Wonder.insufficient')}
                                      </Badge>
                                      <p className="text-xs text-muted-foreground">
                                        {t('createLana8Wonder.min')} {minimumRequired.toFixed(4)} LANA
                                      </p>
                                    </div>
                                  )
                                )}
                              </div>
                              
                              {!balancesLoading && hasEnoughBalance && minimumRequired > 0 && (
                                <Button 
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const { data: existingProfile } = await supabase
                                        .from("profiles")
                                        .select("id, selected_wallet")
                                        .eq("nostr_hex_id", session.nostrHexId)
                                        .maybeSingle();
                                      
                                      if (existingProfile?.selected_wallet) {
                                        const { data: existingWallets, error: walletsError } = await supabase
                                          .from("wallets")
                                          .select("wallet_address")
                                          .eq("profile_id", existingProfile.id)
                                          .eq("wallet_type", "annuity");
                                        
                                        if (walletsError) {
                                          console.error("Error checking wallets:", walletsError);
                                        }
                                        
                                        if (existingWallets && existingWallets.length === 8) {
                                          toast.success(t('createLana8Wonder.existingPlanFound'));
                                          navigate("/preview-lana8wonder");
                                          return;
                                        }
                                      }
                                      
                                      navigate('/assign-lana8wonder', { 
                                        state: { 
                                          sourceWallet: wallet.wallet_address,
                                          balance: currentBalance,
                                          minRequiredLana: depositAmount,
                                          planCurrency: planCurrency,
                                          exchangeRate: exchangeRates?.[planCurrency as keyof typeof exchangeRates] || 1
                                        } 
                                      });
                                    } catch (error) {
                                      console.error("Error checking existing wallets:", error);
                                      toast.error("Failed to check existing wallets");
                                    }
                                  }}
                                  className="text-xs shrink-0"
                                >
                                  {t('createLana8Wonder.assignToL8W')}
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold">{t('createLana8Wonder.walletAddress')}</TableHead>
                          <TableHead className="font-semibold">{t('createLana8Wonder.type')}</TableHead>
                          <TableHead className="font-semibold">{t('createLana8Wonder.balance')}</TableHead>
                          <TableHead className="font-semibold">{t('createLana8Wonder.note')}</TableHead>
                          <TableHead className="font-semibold">{t('createLana8Wonder.status')}</TableHead>
                          <TableHead className="font-semibold">{t('createLana8Wonder.action')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allWalletsDeduped.map((wallet, idx) => {
                          const currentBalance = walletBalances[wallet.wallet_address] || 0;
                          const hasEnoughBalance = minimumRequired === 0 || currentBalance >= minimumRequired;
                          
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-sm max-w-xs truncate">{wallet.wallet_address}</TableCell>
                              <TableCell>
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary whitespace-nowrap">
                                  {wallet.wallet_type}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm">
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
                              <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{wallet.note || "—"}</TableCell>
                              <TableCell>
                                {!balancesLoading && minimumRequired > 0 && (
                                  hasEnoughBalance ? (
                                    <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white text-xs whitespace-nowrap">
                                      ✓ {t('createLana8Wonder.sufficient')}
                                    </Badge>
                                  ) : (
                                    <div className="space-y-1">
                                      <Badge variant="destructive" className="flex items-center gap-1 text-xs w-fit whitespace-nowrap">
                                        <AlertCircle className="h-3 w-3" />
                                        {t('createLana8Wonder.insufficient')}
                                      </Badge>
                                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                                        {t('createLana8Wonder.min')} {minimumRequired.toFixed(4)} LANA
                                      </p>
                                    </div>
                                  )
                                )}
                              </TableCell>
                              <TableCell>
                                {!balancesLoading && hasEnoughBalance && minimumRequired > 0 && (
                                  <Button 
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        const { data: existingProfile } = await supabase
                                          .from("profiles")
                                          .select("id, selected_wallet")
                                          .eq("nostr_hex_id", session.nostrHexId)
                                          .maybeSingle();
                                        
                                        if (existingProfile?.selected_wallet) {
                                          const { data: existingWallets, error: walletsError } = await supabase
                                            .from("wallets")
                                            .select("wallet_address")
                                            .eq("profile_id", existingProfile.id)
                                            .eq("wallet_type", "annuity");
                                          
                                          if (walletsError) {
                                            console.error("Error checking wallets:", walletsError);
                                          }
                                          
                                        if (existingWallets && existingWallets.length === 8) {
                                          toast.success(t('createLana8Wonder.existingPlanFound'));
                                          navigate("/preview-lana8wonder");
                                          return;
                                        }
                                      }
                                        
                                        navigate('/assign-lana8wonder', { 
                                          state: { 
                                            sourceWallet: wallet.wallet_address,
                                            balance: currentBalance,
                                            minRequiredLana: depositAmount,
                                            planCurrency: planCurrency,
                                            exchangeRate: exchangeRates?.[planCurrency as keyof typeof exchangeRates] || 1
                                          } 
                                        });
                                      } catch (error) {
                                        console.error("Error checking existing wallets:", error);
                                        toast.error("Failed to check existing wallets");
                                      }
                                    }}
                                    className="text-xs whitespace-nowrap"
                                  >
                                    {t('createLana8Wonder.assignToL8W')}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CreateLana8Wonder;
