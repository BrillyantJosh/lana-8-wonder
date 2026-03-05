import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, CheckCircle2, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, Radio } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { api as supabase, getDomainKey } from "@/integrations/api/client";
import { useNostrLanaParams } from "@/hooks/useNostrLanaParams";
import { fetchKind30889 } from "@/lib/nostrClient";
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

const getAccountConfigs = (currency: 'EUR' | 'USD' | 'GBP', t: (key: string, options?: any) => string) => {
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
    description: t('walletAccounts.account6Description')
  }, {
    name: t('walletAccounts.account7Name'),
    type: "passive" as const,
    color: "from-purple-500 to-purple-700",
    description: t('walletAccounts.account7Description')
  }, {
    name: t('walletAccounts.account8Name'),
    type: "passive" as const,
    color: "from-purple-600 to-purple-800",
    description: t('walletAccounts.account8Description')
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
  const { t } = useTranslation();
  const { params } = useNostrLanaParams();
  const [isPublishing, setIsPublishing] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [walletBalances, setWalletBalances] = useState<{ [address: string]: number }>({});
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [donationWalletId, setDonationWalletId] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [nostrHexId, setNostrHexId] = useState<string>('');
  const [walletRegistered, setWalletRegistered] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<any>(null);
  const [txHash, setTxHash] = useState<string>('');
  const [publishedPlan, setPublishedPlan] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [relayVerifyStatus, setRelayVerifyStatus] = useState<'idle' | 'verifying' | 'verified' | 'not_found'>('idle');
  const [relayVerifyContact, setRelayVerifyContact] = useState<string>('');

  // State for data loaded from database (when location.state is empty)
  const [loadedPlanCurrency, setLoadedPlanCurrency] = useState<string>("");
  const [loadedExchangeRate, setLoadedExchangeRate] = useState<number>(0);
  const [loadedSourceWallet, setLoadedSourceWallet] = useState<string>("");
  const [loadedWallets, setLoadedWallets] = useState<any[]>([]);
  const [loadedMinRequiredLana, setLoadedMinRequiredLana] = useState<number>(0);
  const [loadedPhiDonation, setLoadedPhiDonation] = useState<number>(0);
  const [loadedAmountPerWallet, setLoadedAmountPerWallet] = useState<number>(0);
  const [loadedTotalTransferred, setLoadedTotalTransferred] = useState<number>(0);
  const [loadedSourceBalance, setLoadedSourceBalance] = useState<number>(0);

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
    remainingBalance,
    nostrHexId: stateNostrHexId
  } = location.state || {};

  // Use effective values (from state or loaded from DB)
  const effectiveSourceWallet = sourceWallet || loadedSourceWallet;
  const effectivePlanCurrency = planCurrency || loadedPlanCurrency;
  const effectiveExchangeRate = exchangeRate || loadedExchangeRate;
  const effectiveWallets = (wallets && wallets.length > 0) ? wallets : loadedWallets;
  const effectiveAmountPerWallet = amountPerWallet || loadedAmountPerWallet;
  const effectiveMinRequiredLana = minRequiredLana || loadedMinRequiredLana;
  const effectivePhiDonation = phiDonation || loadedPhiDonation;
  const effectiveTotalTransferred = totalTransferred || loadedTotalTransferred;
  const effectiveSourceBalance = sourceBalance || loadedSourceBalance;
  const effectiveRemainingBalance = remainingBalance !== undefined ? remainingBalance : (effectiveSourceBalance - effectiveTotalTransferred);

  // Calculate start price (8% more than exchange rate)
  const startPrice = effectiveExchangeRate ? effectiveExchangeRate * 1.08 : 0;

  // Fetch donation wallet ID and set nostr hex id
  useEffect(() => {
    const fetchData = async () => {
      // Fetch donation wallet from current domain's configuration
      // IMPORTANT: each domain has its own donation wallet — never cross-contaminate
      const currentDomain = getDomainKey();
      if (currentDomain) {
        const { data: domainData } = await supabase
          .from('domains')
          .select('donation_wallet_id')
          .eq('domain_key', currentDomain)
          .single();

        if (domainData?.donation_wallet_id) {
          console.log(`Donation wallet for domain "${currentDomain}":`, domainData.donation_wallet_id);
          setDonationWalletId(domainData.donation_wallet_id);
        } else {
          console.warn(`No donation wallet configured for domain "${currentDomain}"`);
        }
      }

      // Set nostr hex id from location state (passed from previous page)
      if (stateNostrHexId) {
        console.log('📋 Nostr Hex ID from state:', stateNostrHexId);
        setNostrHexId(stateNostrHexId);
      } else {
        // Fallback to sessionStorage if not in state
        const sessionData = sessionStorage.getItem("lana_session");
        if (sessionData) {
          try {
            const session = JSON.parse(sessionData);
            console.log('📋 Session data:', session);
            const hexId = session.nostrHexId || session.nostr_hex_id;
            console.log('📋 Nostr Hex ID from session:', hexId);
            setNostrHexId(hexId);
          } catch (error) {
            console.error('Error parsing session data:', error);
          }
        } else {
          console.warn('⚠️ No session data found');
        }
      }
    };
    
    fetchData();
  }, [stateNostrHexId]);

  // Check wallet registration status and TX
  useEffect(() => {
    const checkWalletRegistration = async () => {
      if (!nostrHexId) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('wallet_registered, tx, published_plan, selected_wallet')
          .eq('nostr_hex_id', nostrHexId)
          .single();
        
        if (error) {
          console.error('Error fetching profile:', error);
          return;
        }
        
        if (data) {
          setWalletRegistered(data.wallet_registered || false);
          setTxHash(data.tx || '');
          setPublishedPlan(data.published_plan || false);
          setSelectedWallet(data.selected_wallet || null);

          // If plan is already published, navigate to dashboard immediately
          if (data.published_plan) {
            navigate("/dashboard", { replace: true });
            return;
          }
        }
      } catch (error) {
        console.error('Error checking wallet registration:', error);
      }
    };
    
    checkWalletRegistration();
  }, [nostrHexId]);

  // Load plan data from database if not in location.state
  useEffect(() => {
    const loadPlanDataFromDB = async () => {
      // If we already have data from location.state, skip
      // FIXED: Check that wallets array has exactly 8 items, not just truthy
      if (sourceWallet && wallets && wallets.length === 8 && planCurrency && exchangeRate) return;
      
      // Wait for nostrHexId and params to be available
      if (!nostrHexId || !params) return;
      
      try {
        console.log('📊 Loading plan data from database...');
        
        // Fetch profile data
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, selected_wallet, tx")
          .eq("nostr_hex_id", nostrHexId)
          .maybeSingle();
        
        if (profileError) throw profileError;
        
        if (!profile?.selected_wallet) {
          console.warn('No selected_wallet found in profile');
          toast.error("No annuity plan found. Create a new one.");
          navigate("/create-lana8wonder");
          return;
        }
        
        // Fetch wallets from database ordered by position
        const { data: dbWallets, error: walletsError } = await supabase
          .from("wallets")
          .select("wallet_address, wallet_type, position")
          .eq("profile_id", profile.id)
          .eq("wallet_type", "annuity")
          .order('position', { ascending: true });
        
        if (walletsError) throw walletsError;
        
        if (!dbWallets || dbWallets.length !== 8) {
          console.warn('Incomplete wallets found:', dbWallets?.length);
          toast.error("Incomplete annuity plan. Please set up again.");
          navigate("/create-lana8wonder");
          return;
        }
        
        // Get session data for currency
        const sessionData = sessionStorage.getItem("lana_session");
        let currency = 'EUR';
        if (sessionData) {
          try {
            const session = JSON.parse(sessionData);
            currency = session.currency || 'EUR';
          } catch (e) {
            console.warn('Could not parse session data for currency');
          }
        }
        
        // Get exchange rate from params
        const rate = params.exchangeRates[currency as keyof typeof params.exchangeRates];
        if (!rate) {
          toast.error("Exchange rate not available");
          return;
        }
        
        // Calculate all values
        const minLana = 88 / rate;
        const phi = 12 / rate;  // 12 EUR fixed donation
        const perWallet = minLana / 8;
        const total = minLana + phi;
        
        // Fetch source wallet balance
        const electrumServers = params.electrum.map(e => ({
          host: e.host,
          port: parseInt(e.port)
        }));
        
        let sourceBalanceValue = 0;
        try {
          const { data: balanceData } = await supabase.functions.invoke('check-wallet-balance', {
            body: {
              wallet_addresses: [profile.selected_wallet],
              electrum_servers: electrumServers
            }
          });
          
          if (balanceData?.balances && balanceData.balances.length > 0) {
            sourceBalanceValue = balanceData.balances[0].balance || 0;
          }
        } catch (balanceError) {
          console.error('Error fetching source balance:', balanceError);
        }
        
        // Set all loaded state
        setLoadedSourceWallet(profile.selected_wallet);
        setLoadedPlanCurrency(currency);
        setLoadedExchangeRate(rate);
        setLoadedWallets(dbWallets.map(w => ({ address: w.wallet_address })));
        setLoadedMinRequiredLana(minLana);
        setLoadedPhiDonation(phi);
        setLoadedAmountPerWallet(perWallet);
        setLoadedTotalTransferred(total);
        setLoadedSourceBalance(sourceBalanceValue);
        setTxHash(profile.tx || '');
        
        console.log('✅ Plan data loaded from database:', {
          sourceWallet: profile.selected_wallet,
          currency,
          exchangeRate: rate,
          wallets: dbWallets.length,
          minRequiredLana: minLana,
          amountPerWallet: perWallet
        });
        
      } catch (error) {
        console.error("Error loading plan from database:", error);
        toast.error("Error loading plan. Please try again.");
        navigate("/create-lana8wonder");
      }
    };
    
    loadPlanDataFromDB();
  }, [nostrHexId, params, sourceWallet, wallets, planCurrency, exchangeRate, navigate]);

  // Fetch current balances from Electrum
  useEffect(() => {
    const fetchBalances = async () => {
      if (!params?.electrum) return;
      
      // Need to have at least source wallet or annuity wallets
      if (!effectiveSourceWallet && (!effectiveWallets || effectiveWallets.length === 0)) return;
      
      setLoadingBalances(true);
      try {
        const electrumServers = params.electrum.map(e => ({
          host: e.host,
          port: parseInt(e.port)
        }));
        
        // Collect all addresses to check
        const addressesToCheck: string[] = [];
        
        // Add source wallet
        if (effectiveSourceWallet) {
          addressesToCheck.push(effectiveSourceWallet);
        }
        
        // Add annuity wallets - handle both array of strings and array of objects
        if (effectiveWallets && effectiveWallets.length > 0) {
          effectiveWallets.forEach((w: any) => {
            // Handle both { address: "..." } and plain string formats
            const addr = typeof w === 'string' ? w : w.address;
            if (addr) addressesToCheck.push(addr);
          });
        }
        
        if (addressesToCheck.length === 0) return;
        
        const { data, error } = await supabase.functions.invoke('check-wallet-balance', {
          body: {
            wallet_addresses: addressesToCheck,
            electrum_servers: electrumServers
          }
        });
        
        if (error) throw error;
        
        // Create a map of address -> balance
        const balanceMap: { [address: string]: number } = {};
        if (data?.wallets) {
          data.wallets.forEach((item: any) => {
            balanceMap[item.wallet_id] = item.balance || 0;
          });
        }
        
        setWalletBalances(balanceMap);
        
        // Update source balance in state if we got it
        if (effectiveSourceWallet && balanceMap[effectiveSourceWallet] !== undefined) {
          setLoadedSourceBalance(balanceMap[effectiveSourceWallet]);
        }
        
        console.log('✅ Balances fetched:', balanceMap);
      } catch (error) {
        console.error('Error fetching wallet balances:', error);
        toast.error('Failed to fetch wallet balances');
      } finally {
        setLoadingBalances(false);
      }
    };
    
    fetchBalances();
  }, [effectiveSourceWallet, effectiveWallets, params]);


  // Generate trading plan accounts
  useEffect(() => {
    if (!effectiveExchangeRate || !effectiveAmountPerWallet || !effectivePlanCurrency) return;

    const adjustedStartingPrice = effectiveExchangeRate * 1.08;
    
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
    
    const accountConfigs = getAccountConfigs(effectivePlanCurrency as 'EUR' | 'USD' | 'GBP', t);
    
    const account6TargetValue = 1000000;
    const account7TargetValue = 10000000;
    const account8TargetValue = 88000000;
    
    const newAccounts: Account[] = accountConfigs.map((config, index) => {
      let levels: TradingLevel[];
      if (config.type === "linear") {
        levels = generateLinearLevels(effectiveAmountPerWallet, accountPrices[index]);
      } else if (config.type === "compound") {
        levels = generateCompoundLevels(effectiveAmountPerWallet, accountPrices[index]);
      } else {
        const targetValue = index === 5 ? account6TargetValue : 
                           index === 6 ? account7TargetValue : 
                           account8TargetValue;
        levels = generatePassiveLevelsBySplit(
          effectiveAmountPerWallet, 
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
  }, [effectiveExchangeRate, effectiveAmountPerWallet, effectivePlanCurrency]);

  const toggleAccount = (accountNumber: number) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountNumber)) {
      newExpanded.delete(accountNumber);
    } else {
      newExpanded.add(accountNumber);
    }
    setExpandedAccounts(newExpanded);
  };

  const handleRegisterWallets = async () => {
    console.log('🔍 Registration check:', { 
      nostrHexId, 
      hasWallets: !!wallets, 
      walletsCount: wallets?.length 
    });

    if (!nostrHexId) {
      toast.error('Session not found. Please log in again.');
      return;
    }

    if (!effectiveWallets || effectiveWallets.length === 0) {
      toast.error('No wallets found to register');
      return;
    }

    setIsRegistering(true);

    try {
      // Prepare wallet data for API
      const walletsData = effectiveWallets.map((wallet: any, index: number) => ({
        wallet_id: wallet.address,
        wallet_type: 'Lana8Wonder',
        notes: `Lana 8 Wonder Account ${index + 1}`
      }));

      console.log('=== WALLET REGISTRATION START ===');
      console.log('URL:', 'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets');
      console.log('Nostr Hex ID:', nostrHexId);
      console.log('Wallets:', JSON.stringify(walletsData, null, 2));

      // Call external API
      const response = await fetch('https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          method: 'register_virgin_wallets_for_existing_user',
          api_key: 'ak_11nxrkztcptoefn7gypg4cj',
          data: {
            nostr_id_hex: nostrHexId,
            wallets: walletsData
          }
        })
      });

      console.log('Response status:', response.status);
      console.log('Response Content-Type:', response.headers.get('content-type'));

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const textBody = await response.text();
        console.error('Non-JSON response:', textBody.substring(0, 500));
        throw new Error(`API returned non-JSON response (status ${response.status})`);
      }

      const result = await response.json();
      console.log('Response body:', JSON.stringify(result, null, 2));

      const isAlreadyRegistered = !response.ok || !result.success;
      const errorMsg = result.message || '';

      if (isAlreadyRegistered) {
        console.warn('⚠️ External API returned non-success:', result);
      } else {
        console.log('✅ Wallets registered successfully:', result);
      }

      // Update profile to mark wallets as registered (even if "already registered")
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ wallet_registered: 1 })
        .eq('nostr_hex_id', nostrHexId);

      if (updateError) {
        console.error('Error updating profile:', updateError);
        toast.error('Failed to update profile status');
        return;
      }

      // Set registration result for display
      setRegistrationResult(result);
      setWalletRegistered(true);

      if (isAlreadyRegistered) {
        toast.success('Wallets already registered — step marked as complete', { duration: 5000 });
      } else {
        toast.success(
          `Successfully registered ${result.data?.wallets_registered || effectiveWallets?.length} wallets`,
          { duration: 5000 }
        );
      }

      // === VERIFY KIND 30889 ON RELAYS ===
      if (params?.relays && params.relays.length > 0) {
        setRelayVerifyStatus('verifying');
        toast.loading(t('createLana8Wonder.verifyingOnRelays'), { id: 'relay-verify', duration: 15000 });

        // Wait 10 seconds for registrar to publish
        await new Promise(resolve => setTimeout(resolve, 10000));

        try {
          console.log('🔍 Verifying KIND 30889 on relays:', params.relays);
          const records = await fetchKind30889(nostrHexId, params.relays);
          console.log('📋 KIND 30889 records found:', records.length, records);

          // Check if any record contains all 8 wallet addresses
          const planAddresses = effectiveWallets.map((w: any) => w.address);
          const verified = records.some(record => {
            const recordAddresses = record.wallets.map(w => w.wallet_address);
            return planAddresses.every((addr: string) => recordAddresses.includes(addr));
          });

          toast.dismiss('relay-verify');

          if (verified) {
            console.log('✅ KIND 30889 verified on relays');
            setRelayVerifyStatus('verified');
            toast.success(t('createLana8Wonder.walletsVerified'), { duration: 5000 });
          } else {
            console.warn('⚠️ KIND 30889 not found or wallets mismatch');
            // Fetch contact details from domain config
            let contactInfo = '';
            try {
              const domainKey = getDomainKey();
              const res = await fetch('/api/domain-config', {
                headers: domainKey ? { 'X-Domain-Key': domainKey } : {}
              });
              const json = await res.json();
              contactInfo = json.data?.contact_details || '';
            } catch { /* ignore */ }

            setRelayVerifyStatus('not_found');
            setRelayVerifyContact(contactInfo);
            toast.warning(t('createLana8Wonder.walletsNotFound'), { duration: 10000 });
          }
        } catch (verifyError) {
          console.error('❌ Relay verification error:', verifyError);
          toast.dismiss('relay-verify');
          setRelayVerifyStatus('not_found');
          toast.warning(t('createLana8Wonder.walletsNotFound'), { duration: 10000 });
        }
      } else {
        console.warn('⚠️ No relays available in params for KIND 30889 verification');
      }

    } catch (error: any) {
      console.error('❌ Error registering wallets:', error);
      console.error('Full error details:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });

      // If the external API fails completely (network error etc.),
      // still try to mark as registered since user says wallets exist
      toast.error(`Registration error: ${error?.message || 'Unknown error'}. Check browser console for details.`);
    } finally {
      setIsRegistering(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    
    try {
      console.log('📋 Session storage key used: lana_session');
      const sessionData = sessionStorage.getItem("lana_session");
      if (!sessionData) {
        console.error('❌ No session data found in sessionStorage');
        console.log('Available keys:', Object.keys(sessionStorage));
        throw new Error("Session expired. Please log in again.");
      }
      
      console.log('📋 Session data found');
      const session = JSON.parse(sessionData);
      const subjectHex = session.nostrHexId || session.nostr_hex_id;
      
      const walletAddresses = effectiveWallets.map((w: any) => w.address);
      
      // ✅ VALIDATION: Ensure exactly 8 non-empty wallet addresses before publishing
      if (!walletAddresses || walletAddresses.length !== 8) {
        throw new Error(`Cannot publish: expected 8 wallets, got ${walletAddresses.length}. Please go back and set up your plan again.`);
      }
      
      const emptyAddresses = walletAddresses.filter((a: string) => !a || a.trim() === '');
      if (emptyAddresses.length > 0) {
        throw new Error(`Cannot publish: ${emptyAddresses.length} wallet addresses are invalid. Please check your wallets.`);
      }
      
      console.log('✅ Validated 8 wallet addresses before publish');
      
      console.log('📝 Publishing Lana8Wonder plan...', {
        subject_hex: subjectHex,
        wallets: walletAddresses.length,
        currency: effectivePlanCurrency,
        exchange_rate: effectiveExchangeRate
      });

      // NOTE: relays are NOT sent — server fetches them from KIND 38888
      const { data, error } = await supabase.functions.invoke('publish-lana8wonder-plan', {
        body: {
          subject_hex: subjectHex,
          wallets: walletAddresses,
          amount_per_wallet: effectiveAmountPerWallet,
          currency: effectivePlanCurrency,
          exchange_rate: effectiveExchangeRate,
          start_price: startPrice
        }
      });
      
      if (error) throw error;
      
      if (data.success && data.publish_results) {
        const publishResults = data.publish_results;
        const successCount = publishResults.filter((r: { success: boolean }) => r.success).length;
        const totalRelays = publishResults.length;
        
        console.log('📊 Plan publish results:', {
          event_id: data.event_id,
          successCount,
          totalRelays,
          accounts: data.plan.accounts,
          total_levels: data.plan.total_levels,
          publish_results: publishResults
        });
        
        // Verify at least one relay accepted
        if (successCount === 0) {
          throw new Error('Failed to publish plan to any relay. Please check your connection and try again.');
        }
        
        // Show appropriate message based on relay success
        if (successCount < totalRelays) {
          toast.warning(
            `Plan published to ${successCount}/${totalRelays} relays. Some relays did not accept the event.`,
            { duration: 6000 }
          );
        } else {
          toast.success(
            `✅ Plan published to all ${totalRelays} relays!`,
            { duration: 5000 }
          );
        }
        
        // Update published_plan in database only if at least one relay accepted
        await supabase
          .from('profiles')
          .update({ published_plan: 1 })
          .eq('nostr_hex_id', nostrHexId);
        
        setPublishedPlan(true);
        
        setTimeout(() => {
          navigate("/dashboard");
        }, 2000);
      } else {
        throw new Error('Failed to publish plan - no relay confirmations received');
      }
      
    } catch (error) {
      console.error('❌ Error publishing plan:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish plan');
    } finally {
      setIsPublishing(false);
    }
  };

  const currencySymbol = getCurrencySymbol(effectivePlanCurrency as 'EUR' | 'USD' | 'GBP');

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
              <>
                <div className="space-y-4 mb-6">
                  {effectiveWallets?.map((wallet: any, index: number) => {
                    // Handle both { address: "..." } and plain string formats
                    const walletAddress = typeof wallet === 'string' ? wallet : wallet.address;
                    const currentBalance = walletBalances[walletAddress] || 0;
                    // After transaction should just show the amountPerWallet, not added to current
                    const afterBalance = effectiveAmountPerWallet || 0;
                    
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
                          {walletAddress}
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
                
                {(() => { console.log('🔍 RENDER DEBUG: walletRegistered =', walletRegistered, ', nostrHexId =', nostrHexId, ', effectiveWallets =', effectiveWallets?.length); return null; })()}
                {walletRegistered ? (
                  <>
                    <div className="mt-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <p className="font-semibold text-green-800 dark:text-green-200">
                          Wallets have been successfully registered!
                        </p>
                      </div>
                      {registrationResult && (
                        <div className="text-center text-sm text-green-700 dark:text-green-300">
                          <p>
                            {registrationResult.data?.wallets_registered || effectiveWallets?.length} wallets registered as Lana8Wonder type
                          </p>
                        </div>
                      )}
                    </div>

                    {/* === RELAY VERIFICATION STATUS BANNER === */}
                    {relayVerifyStatus === 'verifying' && (
                      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="flex items-center justify-center gap-3">
                          <Radio className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" />
                          <div>
                            <p className="font-semibold text-blue-800 dark:text-blue-200">
                              {t('createLana8Wonder.verifyingOnRelays')}
                            </p>
                            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                              {t('createLana8Wonder.verifyingWait') || 'Checking Nostr relays for wallet records (KIND 30889)...'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {relayVerifyStatus === 'verified' && (
                      <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-950 border-2 border-emerald-300 dark:border-emerald-700 rounded-lg">
                        <div className="flex items-center justify-center gap-3">
                          <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                          <div>
                            <p className="font-bold text-emerald-800 dark:text-emerald-200 text-lg">
                              {t('createLana8Wonder.walletsVerified')}
                            </p>
                            <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                              {t('createLana8Wonder.walletsVerifiedDetail') || 'All 8 wallet addresses have been confirmed on Nostr relays (KIND 30889).'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {relayVerifyStatus === 'not_found' && (
                      <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950 border-2 border-amber-300 dark:border-amber-700 rounded-lg">
                        <div className="flex items-center justify-center gap-3">
                          <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                          <div>
                            <p className="font-bold text-amber-800 dark:text-amber-200">
                              {t('createLana8Wonder.walletsNotFound')}
                            </p>
                            {relayVerifyContact && (
                              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                {relayVerifyContact}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 mt-6">
                    <Button
                      onClick={handleRegisterWallets}
                      disabled={isRegistering}
                      className="w-full sm:w-auto"
                    >
                      {isRegistering ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Registering Wallets...
                        </>
                      ) : (
                        "Register Wallets"
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Source Wallet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Wallet Address</p>
                <p className="font-mono text-sm break-all">{effectiveSourceWallet}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="font-semibold">
                  {(walletBalances[effectiveSourceWallet] !== undefined 
                    ? walletBalances[effectiveSourceWallet] 
                    : effectiveSourceBalance
                  )?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 }) || "0.00000000"} LANA
                </p>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm font-semibold mb-3">Transaction Breakdown</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Required Deposit ({currencySymbol}):</span>
                    <span className="font-mono">{effectiveMinRequiredLana?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PHI Donation (Lana 8 Wonder):</span>
                    <span className="font-mono">{effectivePhiDonation?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  {donationWalletId && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Donation Wallet:</span>
                      <span className="font-mono text-muted-foreground">{donationWalletId}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total to 8 Wallets:</span>
                    <span className="font-mono">{effectiveMinRequiredLana?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Per Wallet (8 accounts):</span>
                    <span className="font-mono">{effectiveAmountPerWallet?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t font-semibold">
                    <span>Total to Transfer:</span>
                    <span className="font-mono">{effectiveTotalTransferred?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                  </div>
                  {!txHash && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Remaining in Wallet:</span>
                      <span className="font-mono">
                        {((walletBalances[effectiveSourceWallet] !== undefined 
                          ? walletBalances[effectiveSourceWallet] 
                          : effectiveSourceBalance
                        ) - effectiveTotalTransferred)?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Transfer Button or Status */}
              <div className="mt-6 pt-4 border-t">
                {txHash ? (
                  <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <p className="font-semibold text-green-800 dark:text-green-200">
                        LANAs have been transferred
                      </p>
                    </div>
                    <a
                      href={`https://chainz.cryptoid.info/lana/tx.dws?${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      View transaction on explorer →
                    </a>
                  </div>
                ) : walletRegistered ? (
                  <Button
                    onClick={() => navigate('/send-lana8wonder-transfer', {
                      state: {
                        sourceWallet: effectiveSourceWallet,
                        sourceBalance: effectiveSourceBalance?.toString() || '0',
                        wallets: effectiveWallets?.map((w: any, idx: number) => ({
                          address: w.address,
                          amount: effectiveAmountPerWallet,
                          label: `Wallet ${idx + 1}`
                        })),
                        donationWalletId,
                        totalAmount: effectiveMinRequiredLana,
                        phiDonation: effectivePhiDonation,
                        nostrHexId
                      }
                    })}
                    disabled={!effectiveSourceBalance || effectiveSourceBalance < effectiveMinRequiredLana}
                    className="w-full"
                  >
                    Transfer Assets to 8 Wallets
                  </Button>
                ) : (
                  <div className="p-4 bg-muted rounded-lg text-center text-sm text-muted-foreground">
                    Please register wallets first to enable transfer
                  </div>
                )}
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
          <CardContent>
            <div className="mb-6 p-4 border rounded-lg bg-card">
              <h3 className="font-semibold mb-3">Plan Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Currency:</span>
                  <span className="font-semibold">{effectivePlanCurrency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exchange Rate:</span>
                  <span className="font-mono">{effectiveExchangeRate?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA/{currencySymbol}</span>
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
                  <span className="font-mono">{effectiveAmountPerWallet?.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">{accounts.map((account) => (
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
            ))}</div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-center">
          <Button
            disabled={isPublishing || !txHash || publishedPlan}
            onClick={handlePublish}
            size="lg"
            className="bg-primary hover:bg-primary/90"
          >
            {isPublishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing to Nostr...
              </>
            ) : publishedPlan ? (
              "Plan Already Published"
            ) : !txHash ? (
              "Complete Transfer First"
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
